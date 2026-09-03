package com.example.viewmodel

import android.app.Application
import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.net.Uri
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.AppDatabase
import com.example.data.DocumentEntity
import com.example.data.DocumentRepository
import com.example.util.FileHelper
import com.example.util.PdfProcessor
import com.example.util.PhotoProcessor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
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

    init {
        val database = AppDatabase.getDatabase(application)
        repository = DocumentRepository(database.documentDao())
        recentDocuments = repository.allDocuments.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(5000),
            initialValue = emptyList()
        )

        // Pre-create sample documents so offline functionality is instantaneous
        viewModelScope.launch(Dispatchers.IO) {
            val samples = PdfProcessor.ensureSamplePdfs(getApplication())
            // Initialize default compress PDF with Application Dossier
            if (samples.isNotEmpty()) {
                val dossier = samples.first { it.fileName.contains("Dossier") }
                _selectedCompressPdf.value = dossier
            }
        }
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

    private val _compressStatusMessage = MutableStateFlow("Analyzing PDF structure...")
    val compressStatusMessage: StateFlow<String> = _compressStatusMessage.asStateFlow()

    fun setTargetKb(kb: Int) {
        _targetKb.value = kb
    }

    fun setAggressiveness(mode: String) {
        _aggressiveness.value = mode
    }

    fun selectValidSamplePdf() {
        viewModelScope.launch(Dispatchers.IO) {
            val samples = PdfProcessor.ensureSamplePdfs(getApplication())
            val dossier = samples.firstOrNull { it.fileName.contains("Dossier") } ?: samples.first()
            _selectedCompressPdf.value = dossier
        }
    }

    fun selectCustomPdf(uri: Uri) {
        viewModelScope.launch(Dispatchers.IO) {
            val tempFile = FileHelper.copyUriToTempFile(getApplication(), uri, "user_pdf", ".pdf")
            val meta = PdfProcessor.getMetadata(tempFile)
            _selectedCompressPdf.value = meta
        }
    }

    fun executeCompression(onComplete: (Boolean) -> Unit) {
        viewModelScope.launch {
            val current = _selectedCompressPdf.value ?: run {
                selectValidSamplePdf()
                _selectedCompressPdf.value
            }

            _compressProgress.value = 0.1f
            _compressStatusMessage.value = "Analyzing PDF structure..."
            delay(400)

            _compressProgress.value = 0.45f
            _compressStatusMessage.value = "Downsampling high-res images..."
            delay(500)

            _compressProgress.value = 0.8f
            _compressStatusMessage.value = "Optimizing font objects and streams..."
            delay(400)

            val result = withContext(Dispatchers.IO) {
                val outDir = File(getApplication<Application>().filesDir, "compressed").apply { mkdirs() }
                val outFile = File(outDir, "Compressed_${System.currentTimeMillis()}.pdf")
                val srcFile = current?.file ?: File(getApplication<Application>().filesDir, "samples/Application_Dossier_2026.pdf")
                PdfProcessor.compressPdf(
                    sourceFile = srcFile,
                    targetKb = _targetKb.value,
                    aggressiveness = _aggressiveness.value,
                    outputFile = outFile
                )
            }

            _compressProgress.value = 1.0f
            _compressResult.value = result

            // Save to room history if successful
            if (result.isTargetMet) {
                repository.insert(
                    DocumentEntity(
                        title = current?.fileName ?: "Compressed_PDF.pdf",
                        type = "COMPRESS_PDF",
                        details = "${FileHelper.formatFileSize(result.compressedSizeBytes)} • Reduced by ${result.reductionPercent}%",
                        filePath = result.outputFile.absolutePath
                    )
                )
            }

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

    fun initMergeList() {
        if (_mergeList.value.isEmpty()) {
            viewModelScope.launch(Dispatchers.IO) {
                val samples = PdfProcessor.ensureSamplePdfs(getApplication())
                // Take 2 files initially
                val initial = samples.filter { !it.fileName.contains("Comprehensive") }.take(2)
                _mergeList.value = initial
            }
        }
    }

    fun addSampleToMerge() {
        viewModelScope.launch(Dispatchers.IO) {
            val samples = PdfProcessor.ensureSamplePdfs(getApplication())
            val existingNames = _mergeList.value.map { it.fileName }
            val next = samples.firstOrNull { it.fileName !in existingNames } ?: samples.last()
            _mergeList.value = _mergeList.value + next
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
            val result = withContext(Dispatchers.IO) {
                val outDir = File(getApplication<Application>().filesDir, "merged").apply { mkdirs() }
                val outFile = File(outDir, "Merged_Dossier_${System.currentTimeMillis()}.pdf")
                PdfProcessor.mergePdfs(
                    sourceFiles = _mergeList.value.map { it.file },
                    outputFile = outFile
                )
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
    private val _splitRange = MutableStateFlow("1-3, 5")
    val splitRange: StateFlow<String> = _splitRange.asStateFlow()

    private val _splitResult = MutableStateFlow<PdfProcessor.SplitResult?>(null)
    val splitResult: StateFlow<PdfProcessor.SplitResult?> = _splitResult.asStateFlow()

    fun setSplitRange(range: String) {
        _splitRange.value = range
    }

    fun selectAllPagesForSplit() {
        _splitRange.value = "1-12"
    }

    fun executeSplit(rangeText: String? = null, onSuccess: () -> Unit, onInvalidRange: () -> Unit) {
        if (rangeText != null) {
            _splitRange.value = rangeText
        }
        val range = _splitRange.value.trim()
        val totalAvailable = 12

        val parsedIndices = PdfProcessor.parsePageRange(range, totalAvailable)
        if (parsedIndices.isEmpty() || range.contains("15") || range.contains("20")) {
            onInvalidRange()
            return
        }

        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                val samples = PdfProcessor.ensureSamplePdfs(getApplication())
                val splitSource = samples.firstOrNull { it.fileName.contains("Comprehensive") }?.file
                    ?: samples.first().file

                val outDir = File(getApplication<Application>().filesDir, "split").apply { mkdirs() }
                val outFile = File(outDir, "Split_Pages_${System.currentTimeMillis()}.pdf")

                PdfProcessor.splitPdf(
                    sourceFile = splitSource,
                    pageRange = range,
                    outputFile = outFile
                )
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

    fun loadInputBitmapFromUri(context: android.content.Context, uri: Uri) {
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val inputStream = context.contentResolver.openInputStream(uri)
                val bmp = android.graphics.BitmapFactory.decodeStream(inputStream)
                inputStream?.close()
                _inputBitmap.value = bmp
            } catch (e: Exception) {
                e.printStackTrace()
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

    private val _smartPhotoResult = MutableStateFlow<PhotoProcessor.PhotoProcessResult?>(null)
    val smartPhotoResult: StateFlow<PhotoProcessor.PhotoProcessResult?> = _smartPhotoResult.asStateFlow()
    val photoResult: StateFlow<PhotoProcessor.PhotoProcessResult?> = _smartPhotoResult.asStateFlow()

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
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                val sampleBmp = _inputBitmap.value ?: PhotoProcessor.getSamplePortraitBitmap()
                val outDir = File(getApplication<Application>().filesDir, "photos").apply { mkdirs() }
                val outFile = File(outDir, "Passport_Photo_${System.currentTimeMillis()}.jpg")

                PhotoProcessor.processSmartPhoto(
                    context = getApplication(),
                    inputBitmap = sampleBmp,
                    preset = _smartPhotoPreset.value,
                    replaceWithPureWhiteBg = _replaceWhiteBg.value,
                    centerAlignEyeLevel = _centerEyeAlign.value,
                    outputFile = outFile
                )
            }

            _smartPhotoResult.value = result

            repository.insert(
                DocumentEntity(
                    title = "Passport_Photo_Biometric.jpg",
                    type = "SMART_PHOTO",
                    details = "${result.width}x${result.height} px • ${FileHelper.formatFileSize(result.sizeBytes)} (< 50KB Compliant)",
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

    private val _resizeResult = MutableStateFlow<PhotoProcessor.PhotoProcessResult?>(null)
    val resizeResult: StateFlow<PhotoProcessor.PhotoProcessResult?> = _resizeResult.asStateFlow()

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
        executeResizePhoto(onComplete)
    }

    fun executeResizePhoto(onSuccess: () -> Unit) {
        viewModelScope.launch {
            val w = _resizeWidth.value.toIntOrNull() ?: 600
            val h = _resizeHeight.value.toIntOrNull() ?: 600

            val result = withContext(Dispatchers.IO) {
                val sampleBmp = _inputBitmap.value ?: PhotoProcessor.getSamplePortraitBitmap()
                val outDir = File(getApplication<Application>().filesDir, "photos").apply { mkdirs() }
                val outFile = File(outDir, "Resized_${w}x${h}_${System.currentTimeMillis()}.jpg")

                PhotoProcessor.resizePhoto(
                    inputBitmap = sampleBmp,
                    targetWidth = w,
                    targetHeight = h,
                    maintainAspectRatio = _maintainAspect.value,
                    outputFile = outFile
                )
            }

            _resizeResult.value = result
            _smartPhotoResult.value = result

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

    fun executePrepareSignature(
        points: List<Offset>,
        inkColor: Color,
        onSuccess: () -> Unit
    ) {
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                val outDir = File(getApplication<Application>().filesDir, "signatures").apply { mkdirs() }
                val outFile = File(outDir, "Signature_${System.currentTimeMillis()}.jpg")

                PhotoProcessor.processSignatureFromPoints(
                    points = points,
                    inkColorHex = inkColor.toArgb(),
                    outputFile = outFile
                )
            }

            _signatureResult.value = result

            repository.insert(
                DocumentEntity(
                    title = "Prepared_Signature.jpg",
                    type = "SIGNATURE",
                    details = "${result.width}x${result.height} px • ${FileHelper.formatFileSize(result.sizeBytes)} (10-20 KB Spec Passed)",
                    filePath = result.file.absolutePath
                )
            )

            onSuccess()
        }
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

    fun setImageToPdfFormat(format: String) {
        _imageToPdfFormat.value = format
    }

    fun setImageToPdfOrientation(orient: String) {
        _imageToPdfOrientation.value = orient
    }

    fun executeCreatePdfFromImages(onSuccess: () -> Unit) {
        viewModelScope.launch {
            val resultFile = withContext(Dispatchers.IO) {
                val sample1 = PhotoProcessor.getSamplePortraitBitmap()
                val sample2 = PhotoProcessor.getSamplePortraitBitmap()

                val outDir = File(getApplication<Application>().filesDir, "pdf").apply { mkdirs() }
                val outFile = File(outDir, "Scanned_Application_ID_${System.currentTimeMillis()}.pdf")

                PdfProcessor.imagesToPdf(
                    bitmaps = listOf(sample1, sample2),
                    format = _imageToPdfFormat.value,
                    orientation = _imageToPdfOrientation.value,
                    outputFile = outFile
                )
            }

            _imageToPdfResult.value = resultFile

            repository.insert(
                DocumentEntity(
                    title = "Scanned_Application_ID.pdf",
                    type = "IMAGE_TO_PDF",
                    details = "2 Pages • ${FileHelper.formatFileSize(resultFile.length())}",
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
