package com.example.viewmodel

import android.app.Application
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.AppDatabase
import com.example.data.DocumentEntity
import com.example.data.DocumentRepository
import com.example.util.BitmapLoader
import com.example.util.FileHelper
import com.example.util.PdfProcessor
import com.example.util.PhotoProcessor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

class FormReadyViewModel(application: Application) : AndroidViewModel(application) {

    private val repository: DocumentRepository

    val recentDocuments: StateFlow<List<DocumentEntity>>

    /**
     * Last user-facing failure. Operations report problems here instead of
     * silently substituting placeholder content for the user's own files.
     */
    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    fun clearError() {
        _errorMessage.value = null
    }

    init {
        val database = AppDatabase.getDatabase(application)
        repository = DocumentRepository(database.documentDao())
        recentDocuments = repository.allDocuments.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )
        PdfProcessor.init(application)
    }

    // -------------------------------------------------------------
    // Compress PDF State
    // -------------------------------------------------------------
    private val _selectedCompressPdf = MutableStateFlow<PdfProcessor.PdfMetadata?>(null)
    val selectedCompressPdf: StateFlow<PdfProcessor.PdfMetadata?> = _selectedCompressPdf.asStateFlow()

    private val _targetKb = MutableStateFlow(200)
    val targetKb: StateFlow<Int> = _targetKb.asStateFlow()

    private val _aggressiveness = MutableStateFlow("High")
    val aggressiveness: StateFlow<String> = _aggressiveness.asStateFlow()

    private val _compressResult = MutableStateFlow<PdfProcessor.CompressionResult?>(null)
    val compressResult: StateFlow<PdfProcessor.CompressionResult?> = _compressResult.asStateFlow()

    private val _compressProgress = MutableStateFlow(0f)
    val compressProgress: StateFlow<Float> = _compressProgress.asStateFlow()

    private val _compressStatusMessage = MutableStateFlow("Preparing...")
    val compressStatusMessage: StateFlow<String> = _compressStatusMessage.asStateFlow()

    fun setTargetKb(kb: Int) {
        _targetKb.value = kb
    }

    fun setAggressiveness(mode: String) {
        _aggressiveness.value = mode
    }

    /**
     * Writes a small demo PDF and selects it. Only reachable from the explicit
     * "try it with a sample" action — never used to stand in for a file the user
     * chose themselves.
     */
    fun selectValidSamplePdf() {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val dir = File(getApplication<Application>().filesDir, "samples").apply { mkdirs() }
                val sample = File(dir, "Sample_Application_Form.pdf")
                if (!sample.exists() || sample.length() == 0L) {
                    PdfProcessor.generatePlaceholderPdf(sample, 3, "Sample Application Form")
                }
                _selectedCompressPdf.value = PdfProcessor.getMetadata(sample)
            } catch (e: Exception) {
                _errorMessage.value = "Could not prepare the sample PDF."
            }
        }
    }

    /**
     * Imports a user-picked PDF. Invokes [onResult] with `true` once the file is
     * confirmed to be a readable PDF, or `false` if it is corrupted, password
     * protected, or otherwise not a valid PDF.
     */
    fun selectCustomPdf(uri: Uri, onResult: (Boolean) -> Unit = {}) {
        viewModelScope.launch {
            val meta = withContext(Dispatchers.IO) {
                try {
                    val tempFile = FileHelper.copyUriToTempFile(getApplication(), uri, "user_pdf", ".pdf")
                    PdfProcessor.getMetadataOrThrow(tempFile)
                } catch (e: Exception) {
                    null
                }
            }
            if (meta != null) _selectedCompressPdf.value = meta
            onResult(meta != null)
        }
    }

    fun executeCompression(forceExtreme: Boolean = false, onComplete: (Boolean) -> Unit) {
        val current = _selectedCompressPdf.value
        if (current == null) {
            _errorMessage.value = "Choose a PDF to compress first."
            onComplete(false)
            return
        }

        val effectiveAggressiveness = if (forceExtreme) "Extreme" else _aggressiveness.value
        if (forceExtreme) _aggressiveness.value = "Extreme"

        viewModelScope.launch {
            _compressProgress.value = 0.1f
            _compressStatusMessage.value = "Rendering pages..."

            val result = withContext(Dispatchers.IO) {
                try {
                    val outDir = File(getApplication<Application>().filesDir, "compressed").apply { mkdirs() }
                    val outFile = File(outDir, "Compressed_${System.currentTimeMillis()}.pdf")
                    PdfProcessor.compressPdf(
                        sourceFile = current.file,
                        targetKb = _targetKb.value,
                        aggressiveness = effectiveAggressiveness,
                        outputFile = outFile
                    )
                } catch (e: Exception) {
                    null
                }
            }

            _compressProgress.value = 1.0f
            if (result == null) {
                _compressStatusMessage.value = "Compression failed."
                _errorMessage.value = "Could not compress this PDF. It may be corrupted or protected."
                onComplete(false)
                return@launch
            }

            _compressStatusMessage.value = "Done"
            _compressResult.value = result

            repository.insert(
                DocumentEntity(
                    title = current.fileName,
                    type = "COMPRESS_PDF",
                    details = "${FileHelper.formatFileSize(result.compressedSizeBytes)} • Reduced by ${result.reductionPercent}%",
                    filePath = result.outputFile.absolutePath
                )
            )

            onComplete(result.isTargetMet)
        }
    }

    // -------------------------------------------------------------
    // Merge PDF State
    // -------------------------------------------------------------
    private val _mergeList = MutableStateFlow<List<PdfProcessor.PdfMetadata>>(emptyList())
    val mergeList: StateFlow<List<PdfProcessor.PdfMetadata>> = _mergeList.asStateFlow()

    private val _mergeResult = MutableStateFlow<PdfProcessor.MergeResult?>(null)
    val mergeResult: StateFlow<PdfProcessor.MergeResult?> = _mergeResult.asStateFlow()

    /**
     * The merge list starts empty so that a merge only ever contains documents the
     * user actually chose.
     */
    fun initMergeList() = Unit

    /**
     * Imports one or more user-picked PDFs into the merge list, reporting any
     * that turn out to be corrupted or unreadable.
     */
    fun addPdfsToMerge(uris: List<Uri>) {
        if (uris.isEmpty()) return
        viewModelScope.launch {
            val imported = withContext(Dispatchers.IO) {
                uris.mapNotNull { uri ->
                    try {
                        val tempFile = FileHelper.copyUriToTempFile(getApplication(), uri, "merge_pdf", ".pdf")
                        PdfProcessor.getMetadataOrThrow(tempFile)
                    } catch (e: Exception) {
                        null
                    }
                }
            }
            if (imported.isNotEmpty()) {
                _mergeList.value = _mergeList.value + imported
            }
            val skipped = uris.size - imported.size
            if (skipped > 0) {
                _errorMessage.value =
                    "$skipped file${if (skipped == 1) "" else "s"} could not be read as a PDF."
            }
        }
    }

    fun removeMergeItem(index: Int) {
        val current = _mergeList.value.toMutableList()
        if (index in current.indices) {
            current.removeAt(index)
            _mergeList.value = current
        }
    }

    fun executeMerge(onSuccess: () -> Unit, onOneFileError: () -> Unit) {
        if (_mergeList.value.size < 2) {
            onOneFileError()
            return
        }

        viewModelScope.launch {
            val sources = _mergeList.value.map { it.file }
            val result = withContext(Dispatchers.IO) {
                try {
                    val outDir = File(getApplication<Application>().filesDir, "merged").apply { mkdirs() }
                    val outFile = File(outDir, "Merged_Dossier_${System.currentTimeMillis()}.pdf")
                    PdfProcessor.mergePdfs(sourceFiles = sources, outputFile = outFile)
                } catch (e: Exception) {
                    null
                }
            }

            if (result == null) {
                _errorMessage.value = "Could not merge these PDFs."
                return@launch
            }

            _mergeResult.value = result

            repository.insert(
                DocumentEntity(
                    title = "Merged_Document_${result.totalFiles}_Files.pdf",
                    type = "MERGE_PDF",
                    details = "${result.totalPages} Pages • ${FileHelper.formatFileSize(result.sizeBytes)}",
                    filePath = result.outputFile.absolutePath
                )
            )

            onSuccess()
        }
    }

    // -------------------------------------------------------------
    // Split PDF State
    // -------------------------------------------------------------
    private val _splitRange = MutableStateFlow("1-3")
    val splitRange: StateFlow<String> = _splitRange.asStateFlow()

    private val _selectedSplitPdf = MutableStateFlow<PdfProcessor.PdfMetadata?>(null)
    val selectedSplitPdf: StateFlow<PdfProcessor.PdfMetadata?> = _selectedSplitPdf.asStateFlow()

    private val _splitResult = MutableStateFlow<PdfProcessor.SplitResult?>(null)
    val splitResult: StateFlow<PdfProcessor.SplitResult?> = _splitResult.asStateFlow()

    // (requested range text, total pages available) for the invalid-range screen
    private val _splitInvalidInfo = MutableStateFlow<Pair<String, Int>?>(null)
    val splitInvalidInfo: StateFlow<Pair<String, Int>?> = _splitInvalidInfo.asStateFlow()

    /** The split source is whatever the user picks; nothing is preloaded. */
    fun initSplitPdf() = Unit

    /** Imports a user-picked PDF as the split source. */
    fun selectSplitPdf(uri: Uri, onResult: (Boolean) -> Unit = {}) {
        viewModelScope.launch {
            val meta = withContext(Dispatchers.IO) {
                try {
                    val tempFile = FileHelper.copyUriToTempFile(getApplication(), uri, "split_source", ".pdf")
                    PdfProcessor.getMetadataOrThrow(tempFile)
                } catch (e: Exception) {
                    null
                }
            }
            if (meta != null) {
                _selectedSplitPdf.value = meta
                _splitRange.value = if (meta.pageCount >= 3) "1-3" else "1"
            }
            onResult(meta != null)
        }
    }

    fun setSplitRange(range: String) {
        _splitRange.value = range
    }

    fun selectAllPagesForSplit() {
        val total = _selectedSplitPdf.value?.pageCount ?: 0
        _splitRange.value = if (total > 0) "1-$total" else "1"
    }

    fun executeSplit(rangeText: String? = null, onSuccess: () -> Unit, onInvalidRange: () -> Unit) {
        if (rangeText != null) {
            _splitRange.value = rangeText
        }
        val range = _splitRange.value.trim()

        val sourceMeta = _selectedSplitPdf.value
        if (sourceMeta == null) {
            _errorMessage.value = "Choose a PDF to split first."
            onInvalidRange()
            return
        }

        val totalAvailable = sourceMeta.pageCount
        val parsedIndices = PdfProcessor.parsePageRange(range, totalAvailable)
        if (range.isBlank() || parsedIndices.isEmpty()) {
            _splitInvalidInfo.value = range to totalAvailable
            onInvalidRange()
            return
        }

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                try {
                    val outDir = File(getApplication<Application>().filesDir, "split").apply { mkdirs() }
                    val outFile = File(outDir, "Split_Pages_${System.currentTimeMillis()}.pdf")
                    PdfProcessor.splitPdf(
                        sourceFile = sourceMeta.file,
                        pageRange = range,
                        outputFile = outFile
                    )
                } catch (e: Exception) {
                    null
                }
            }

            if (result == null) {
                _errorMessage.value = "Could not extract those pages."
                return@launch
            }

            _splitResult.value = result

            repository.insert(
                DocumentEntity(
                    title = "Split_Pages_${result.extractedPages}p.pdf",
                    type = "SPLIT_PDF",
                    details = "${result.extractedPages} Pages (from $range) • ${FileHelper.formatFileSize(result.sizeBytes)}",
                    filePath = result.outputFile.absolutePath
                )
            )

            onSuccess()
        }
    }

    // -------------------------------------------------------------
    // Photo & Bitmap Selection State
    // -------------------------------------------------------------
    private val _inputBitmap = MutableStateFlow<Bitmap?>(null)
    val inputBitmap: StateFlow<Bitmap?> = _inputBitmap.asStateFlow()

    fun setInputBitmap(bitmap: Bitmap?) {
        _inputBitmap.value = bitmap
    }

    fun loadInputBitmapFromUri(context: Context, uri: Uri) {
        viewModelScope.launch {
            val bmp = withContext(Dispatchers.IO) { BitmapLoader.decodeUri(context, uri) }
            if (bmp != null) {
                _inputBitmap.value = bmp
            } else {
                _errorMessage.value = "Could not open that image."
            }
        }
    }

    // -------------------------------------------------------------
    // Smart Photo State
    // -------------------------------------------------------------
    private val _smartPhotoPreset = MutableStateFlow("Passport (35x45 mm)")
    val smartPhotoPreset: StateFlow<String> = _smartPhotoPreset.asStateFlow()

    private val _replaceWhiteBg = MutableStateFlow(true)
    val replaceWhiteBg: StateFlow<Boolean> = _replaceWhiteBg.asStateFlow()

    private val _centerEyeAlign = MutableStateFlow(true)
    val centerEyeAlign: StateFlow<Boolean> = _centerEyeAlign.asStateFlow()

    /** Shared by the Smart Photo and Resize result screens. */
    private val _photoResult = MutableStateFlow<PhotoProcessor.PhotoProcessResult?>(null)
    val photoResult: StateFlow<PhotoProcessor.PhotoProcessResult?> = _photoResult.asStateFlow()
    val smartPhotoResult: StateFlow<PhotoProcessor.PhotoProcessResult?> = _photoResult.asStateFlow()
    val resizeResult: StateFlow<PhotoProcessor.PhotoProcessResult?> = _photoResult.asStateFlow()

    fun setSmartPhotoPreset(preset: String) {
        _smartPhotoPreset.value = preset
    }

    fun setReplaceWhiteBg(enabled: Boolean) {
        _replaceWhiteBg.value = enabled
    }

    fun setCenterEyeAlign(enabled: Boolean) {
        _centerEyeAlign.value = enabled
    }

    fun processSmartPhoto(
        preset: String,
        whiteBackground: Boolean,
        eyeLevel: Boolean,
        onComplete: () -> Unit
    ) {
        _smartPhotoPreset.value = preset
        _replaceWhiteBg.value = whiteBackground
        _centerEyeAlign.value = eyeLevel
        executeSmartPhoto(onComplete)
    }

    fun executeSmartPhoto(onSuccess: () -> Unit) {
        val source = _inputBitmap.value
        if (source == null) {
            _errorMessage.value = "Select or capture a photo first."
            return
        }

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                try {
                    val outDir = File(getApplication<Application>().filesDir, "photos").apply { mkdirs() }
                    val outFile = File(outDir, "Passport_Photo_${System.currentTimeMillis()}.jpg")
                    PhotoProcessor.processSmartPhoto(
                        inputBitmap = source,
                        preset = _smartPhotoPreset.value,
                        replaceWithPureWhiteBg = _replaceWhiteBg.value,
                        centerAlignEyeLevel = _centerEyeAlign.value,
                        outputFile = outFile
                    )
                } catch (e: Exception) {
                    null
                }
            }

            if (result == null) {
                _errorMessage.value = "Could not process this photo."
                return@launch
            }

            _photoResult.value = result

            repository.insert(
                DocumentEntity(
                    title = "Passport_Photo_Biometric.jpg",
                    type = "SMART_PHOTO",
                    details = "${result.width}x${result.height} px • ${FileHelper.formatFileSize(result.sizeBytes)}",
                    filePath = result.file.absolutePath
                )
            )

            onSuccess()
        }
    }

    // -------------------------------------------------------------
    // Resize Photo State
    // -------------------------------------------------------------
    private val _resizeWidth = MutableStateFlow("600")
    val resizeWidth: StateFlow<String> = _resizeWidth.asStateFlow()

    private val _resizeHeight = MutableStateFlow("600")
    val resizeHeight: StateFlow<String> = _resizeHeight.asStateFlow()

    private val _maintainAspect = MutableStateFlow(true)
    val maintainAspect: StateFlow<Boolean> = _maintainAspect.asStateFlow()

    fun setResizeDimensions(w: String, h: String) {
        _resizeWidth.value = w
        _resizeHeight.value = h
    }

    fun setMaintainAspect(maintain: Boolean) {
        _maintainAspect.value = maintain
    }

    fun processResizePhoto(
        widthPx: Int,
        heightPx: Int,
        targetKb: Int,
        onComplete: () -> Unit
    ) {
        _resizeWidth.value = widthPx.toString()
        _resizeHeight.value = heightPx.toString()
        executeResizePhoto(targetKb, onComplete)
    }

    fun executeResizePhoto(targetKb: Int = 0, onSuccess: () -> Unit) {
        val source = _inputBitmap.value
        if (source == null) {
            _errorMessage.value = "Select or capture a photo first."
            return
        }

        viewModelScope.launch {
            val w = _resizeWidth.value.toIntOrNull() ?: 600
            val h = _resizeHeight.value.toIntOrNull() ?: 600

            val result = withContext(Dispatchers.IO) {
                try {
                    val outDir = File(getApplication<Application>().filesDir, "photos").apply { mkdirs() }
                    val outFile = File(outDir, "Resized_${w}x${h}_${System.currentTimeMillis()}.jpg")
                    PhotoProcessor.resizePhoto(
                        inputBitmap = source,
                        targetWidth = w,
                        targetHeight = h,
                        maintainAspectRatio = _maintainAspect.value,
                        targetKb = targetKb,
                        outputFile = outFile
                    )
                } catch (e: Exception) {
                    null
                }
            }

            if (result == null) {
                _errorMessage.value = "Could not resize this photo."
                return@launch
            }

            _photoResult.value = result

            repository.insert(
                DocumentEntity(
                    title = "Photo_${result.width}x${result.height}.jpg",
                    type = "RESIZE_PHOTO",
                    details = "${result.width} x ${result.height} px • ${FileHelper.formatFileSize(result.sizeBytes)}",
                    filePath = result.file.absolutePath
                )
            )

            onSuccess()
        }
    }

    // -------------------------------------------------------------
    // Signature Maker State
    // -------------------------------------------------------------
    private val _signatureResult = MutableStateFlow<PhotoProcessor.SignatureProcessResult?>(null)
    val signatureResult: StateFlow<PhotoProcessor.SignatureProcessResult?> = _signatureResult.asStateFlow()

    /**
     * Renders drawn strokes. [padWidth]/[padHeight] describe the on-screen pad the
     * strokes were captured in, which is what lets them be mapped into the much
     * smaller output image instead of overflowing it.
     */
    fun executePrepareSignature(
        strokes: List<List<Offset>>,
        padWidth: Float,
        padHeight: Float,
        inkColor: Color,
        onSuccess: () -> Unit
    ) {
        if (strokes.none { it.isNotEmpty() } || padWidth <= 0f || padHeight <= 0f) {
            _errorMessage.value = "Draw your signature first."
            return
        }

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                try {
                    val outDir = File(getApplication<Application>().filesDir, "signatures").apply { mkdirs() }
                    val outFile = File(outDir, "Signature_${System.currentTimeMillis()}.jpg")
                    PhotoProcessor.processSignatureFromStrokes(
                        strokes = strokes,
                        sourceWidth = padWidth,
                        sourceHeight = padHeight,
                        inkColorHex = inkColor.toArgb(),
                        outputFile = outFile
                    )
                } catch (e: Exception) {
                    null
                }
            }
            finishSignature(result, onSuccess)
        }
    }

    /** Prepares a signature from a photographed pen-and-paper signature. */
    fun executePrepareSignatureFromPhoto(
        photoBitmap: Bitmap,
        onSuccess: () -> Unit
    ) {
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                try {
                    PhotoProcessor.processSignatureFromPhoto(
                        photoBitmap = photoBitmap,
                        outputFile = newSignatureFile()
                    )
                } catch (e: Exception) {
                    null
                }
            }
            finishSignature(result, onSuccess)
        }
    }

    /** Prepares a signature from a gallery-picked photo of a pen-and-paper signature. */
    fun executePrepareSignatureFromGalleryUri(
        context: Context,
        uri: Uri,
        onSuccess: () -> Unit
    ) {
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                val bitmap = BitmapLoader.decodeUri(context, uri)
                if (bitmap == null) {
                    null
                } else {
                    try {
                        PhotoProcessor.processSignatureFromPhoto(
                            photoBitmap = bitmap,
                            outputFile = newSignatureFile()
                        )
                    } catch (e: Exception) {
                        null
                    }
                }
            }
            finishSignature(result, onSuccess)
        }
    }

    private fun newSignatureFile(): File {
        val outDir = File(getApplication<Application>().filesDir, "signatures").apply { mkdirs() }
        return File(outDir, "Signature_${System.currentTimeMillis()}.jpg")
    }

    private suspend fun finishSignature(
        result: PhotoProcessor.SignatureProcessResult?,
        onSuccess: () -> Unit
    ) {
        if (result == null) {
            _errorMessage.value = "Could not prepare the signature."
            return
        }

        _signatureResult.value = result

        repository.insert(
            DocumentEntity(
                title = "Prepared_Signature.jpg",
                type = "SIGNATURE",
                details = "${result.width}x${result.height} px • ${FileHelper.formatFileSize(result.sizeBytes)}",
                filePath = result.file.absolutePath
            )
        )

        onSuccess()
    }

    // -------------------------------------------------------------
    // Image to PDF State
    // -------------------------------------------------------------
    private val _imageToPdfFormat = MutableStateFlow("A4 Standard")
    val imageToPdfFormat: StateFlow<String> = _imageToPdfFormat.asStateFlow()

    private val _imageToPdfOrientation = MutableStateFlow("Portrait")
    val imageToPdfOrientation: StateFlow<String> = _imageToPdfOrientation.asStateFlow()

    private val _imageToPdfResult = MutableStateFlow<File?>(null)
    val imageToPdfResult: StateFlow<File?> = _imageToPdfResult.asStateFlow()

    private val _imageToPdfPages = MutableStateFlow<List<Bitmap>>(emptyList())
    val imageToPdfPages: StateFlow<List<Bitmap>> = _imageToPdfPages.asStateFlow()

    fun setImageToPdfFormat(format: String) {
        _imageToPdfFormat.value = format
    }

    fun setImageToPdfOrientation(orient: String) {
        _imageToPdfOrientation.value = orient
    }

    /** Adds one or more gallery-picked images as pages for the Image to PDF flow. */
    fun addImageToPdfPagesFromUris(context: Context, uris: List<Uri>) {
        if (uris.isEmpty()) return
        viewModelScope.launch {
            val bitmaps = withContext(Dispatchers.IO) {
                uris.mapNotNull { BitmapLoader.decodeUri(context, it) }
            }
            if (bitmaps.isNotEmpty()) {
                _imageToPdfPages.value = _imageToPdfPages.value + bitmaps
            }
            val skipped = uris.size - bitmaps.size
            if (skipped > 0) {
                _errorMessage.value =
                    "$skipped image${if (skipped == 1) "" else "s"} could not be opened."
            }
        }
    }

    /** Adds a single camera-captured page for the Image to PDF flow. */
    fun addImageToPdfPage(bitmap: Bitmap) {
        _imageToPdfPages.value = _imageToPdfPages.value + bitmap
    }

    fun removeImageToPdfPage(index: Int) {
        val current = _imageToPdfPages.value.toMutableList()
        if (index in current.indices) {
            current.removeAt(index)
            _imageToPdfPages.value = current
        }
    }

    fun clearImageToPdfPages() {
        _imageToPdfPages.value = emptyList()
    }

    fun executeCreatePdfFromImages(onSuccess: () -> Unit) {
        val pages = _imageToPdfPages.value
        if (pages.isEmpty()) {
            _errorMessage.value = "Add at least one image first."
            return
        }

        viewModelScope.launch {
            val resultFile = withContext(Dispatchers.IO) {
                try {
                    val outDir = File(getApplication<Application>().filesDir, "pdf").apply { mkdirs() }
                    val outFile = File(outDir, "Scanned_Application_ID_${System.currentTimeMillis()}.pdf")
                    PdfProcessor.imagesToPdf(
                        bitmaps = pages,
                        format = _imageToPdfFormat.value,
                        orientation = _imageToPdfOrientation.value,
                        outputFile = outFile
                    )
                } catch (e: Exception) {
                    null
                }
            }

            if (resultFile == null) {
                _errorMessage.value = "Could not create the PDF."
                return@launch
            }

            _imageToPdfResult.value = resultFile

            repository.insert(
                DocumentEntity(
                    title = "Scanned_Application_ID.pdf",
                    type = "IMAGE_TO_PDF",
                    details = "${pages.size} Pages • ${FileHelper.formatFileSize(resultFile.length())}",
                    filePath = resultFile.absolutePath
                )
            )

            onSuccess()
        }
    }

    fun clearRecentDocuments() {
        viewModelScope.launch(Dispatchers.IO) {
            repository.clearAll()
        }
    }

    companion object {
        val Factory: androidx.lifecycle.ViewModelProvider.Factory = object : androidx.lifecycle.ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : androidx.lifecycle.ViewModel> create(
                modelClass: Class<T>,
                extras: androidx.lifecycle.viewmodel.CreationExtras
            ): T {
                val application = checkNotNull(extras[androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY] as Application)
                return FormReadyViewModel(application) as T
            }
        }
    }
}
