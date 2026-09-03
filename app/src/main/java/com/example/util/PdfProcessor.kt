package com.example.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.multipdf.PDFMergerUtility
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import java.io.File
import java.io.FileOutputStream

object PdfProcessor {

    /**
     * Points-per-inch in the PDF coordinate system. [PdfRenderer.Page.getWidth]
     * and friends report page geometry in these units, not pixels, so rendering
     * into a bitmap of exactly that size yields a 72 DPI raster.
     */
    private const val PDF_POINTS_PER_INCH = 72f

    @Volatile
    private var initialized = false

    /** Initializes PDFBox's asset loader. Safe to call repeatedly. */
    fun init(context: Context) {
        if (initialized) return
        synchronized(this) {
            if (!initialized) {
                PDFBoxResourceLoader.init(context.applicationContext)
                initialized = true
            }
        }
    }

    data class PdfMetadata(
        val file: File,
        val fileName: String,
        val pageCount: Int,
        val sizeBytes: Long
    )

    data class CompressionResult(
        val outputFile: File,
        val originalSizeBytes: Long,
        val compressedSizeBytes: Long,
        val targetSizeBytes: Long,
        val reductionPercent: Int,
        val isTargetMet: Boolean
    )

    data class MergeResult(
        val outputFile: File,
        val totalFiles: Int,
        val totalPages: Int,
        val sizeBytes: Long
    )

    data class SplitResult(
        val outputFile: File,
        val originalPages: Int,
        val extractedPages: Int,
        val sizeBytes: Long,
        val pageRangeDescription: String
    )

    fun getMetadata(file: File): PdfMetadata {
        val pages = try {
            getMetadataOrThrow(file).pageCount
        } catch (_: Exception) {
            1
        }
        return PdfMetadata(file, file.name, pages, file.length())
    }

    /**
     * Like [getMetadata], but throws instead of silently defaulting when the file
     * cannot be opened as a PDF (corrupted, password-protected, or not a PDF at
     * all). Used wherever the caller needs to detect and report an invalid file.
     */
    fun getMetadataOrThrow(file: File): PdfMetadata {
        val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(pfd)
        try {
            return PdfMetadata(file, file.name, renderer.pageCount, file.length())
        } finally {
            renderer.close()
            pfd.close()
        }
    }

    /**
     * Merges PDFs without re-encoding them.
     *
     * Page content is copied across at the object level, so text stays selectable
     * and vector artwork stays sharp — merging is not a lossy operation and must
     * not degrade the input.
     */
    fun mergePdfs(sourceFiles: List<File>, outputFile: File): MergeResult {
        val merger = PDFMergerUtility()
        merger.destinationFileName = outputFile.absolutePath
        var usableFiles = 0
        for (file in sourceFiles) {
            if (file.exists() && file.length() > 0) {
                merger.addSource(file)
                usableFiles++
            }
        }
        require(usableFiles > 0) { "No readable PDF files to merge" }

        merger.mergeDocuments(MemoryUsageSetting.setupTempFileOnly())

        val totalPages = PDDocument.load(outputFile).use { it.numberOfPages }
        return MergeResult(
            outputFile = outputFile,
            totalFiles = usableFiles,
            totalPages = totalPages,
            sizeBytes = outputFile.length()
        )
    }

    /**
     * Extracts [pageRange] into a new document, copying pages rather than
     * re-rendering them so the extracted pages are byte-for-byte as sharp as the
     * source.
     */
    fun splitPdf(sourceFile: File, pageRange: String, outputFile: File): SplitResult {
        PDDocument.load(sourceFile).use { source ->
            val totalAvailablePages = source.numberOfPages
            val targetPageIndices = parsePageRange(pageRange, totalAvailablePages)
            require(targetPageIndices.isNotEmpty()) { "Page range selects no pages" }

            PDDocument().use { output ->
                for (pageIdx in targetPageIndices) {
                    // importPage copies the page's resources into the new
                    // document; addPage would share COS objects across documents
                    // and can yield a file that renders blank once the source is
                    // closed.
                    output.importPage(source.getPage(pageIdx))
                }
                output.save(outputFile)
            }

            return SplitResult(
                outputFile = outputFile,
                originalPages = totalAvailablePages,
                extractedPages = targetPageIndices.size,
                sizeBytes = outputFile.length(),
                pageRangeDescription = pageRange
            )
        }
    }

    /**
     * Compresses a PDF by rasterizing each page and re-embedding it as JPEG.
     *
     * Unlike merge/split this is inherently lossy, so the goal is to give up as
     * little as possible: pages are rendered at a real DPI (not the 72 DPI implied
     * by raw page points) and stepped down only while the result still exceeds the
     * requested size.
     */
    fun compressPdf(
        sourceFile: File,
        targetKb: Int,
        aggressiveness: String, // "Standard", "High", "Extreme"
        outputFile: File
    ): CompressionResult {
        val originalSize = sourceFile.length()
        val targetBytes = targetKb * 1024L

        var (quality, dpi) = when (aggressiveness) {
            "Extreme" -> Pair(0.55f, 110f)
            "High" -> Pair(0.7f, 140f)
            else -> Pair(0.82f, 180f)
        }

        var compressedSize: Long
        var attempts = 0
        while (true) {
            compressedSize = renderCompressedPdf(sourceFile, quality, dpi, outputFile)
            attempts++
            val hitFloor = quality <= 0.35f && dpi <= 72f
            if (compressedSize <= targetBytes || attempts >= 5 || hitFloor) break
            quality = (quality - 0.1f).coerceAtLeast(0.35f)
            dpi = (dpi - 20f).coerceAtLeast(72f)
        }

        val reduction = if (originalSize > 0) {
            (((originalSize - compressedSize).toDouble() / originalSize) * 100)
                .toInt().coerceIn(0, 99)
        } else 0

        return CompressionResult(
            outputFile = outputFile,
            originalSizeBytes = originalSize,
            compressedSizeBytes = compressedSize,
            targetSizeBytes = targetBytes,
            reductionPercent = reduction,
            isTargetMet = compressedSize <= targetBytes
        )
    }

    /**
     * Renders every page of [sourceFile] at [dpi] and writes them into [outputFile]
     * as JPEGs at [quality]. Returns the resulting file size in bytes.
     */
    private fun renderCompressedPdf(
        sourceFile: File,
        quality: Float,
        dpi: Float,
        outputFile: File
    ): Long {
        val scale = dpi / PDF_POINTS_PER_INCH
        val pfd = ParcelFileDescriptor.open(sourceFile, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(pfd)
        try {
            PDDocument().use { outDoc ->
                for (i in 0 until renderer.pageCount) {
                    val page = renderer.openPage(i)
                    val pointWidth = page.width
                    val pointHeight = page.height
                    val bitmap = Bitmap.createBitmap(
                        (pointWidth * scale).toInt().coerceAtLeast(1),
                        (pointHeight * scale).toInt().coerceAtLeast(1),
                        Bitmap.Config.ARGB_8888
                    )
                    try {
                        bitmap.eraseColor(Color.WHITE)
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                    } finally {
                        page.close()
                    }

                    // JPEG has no alpha channel; flatten onto white so any
                    // transparent regions do not come out black.
                    val flattened = flattenOntoWhite(bitmap)
                    val image = JPEGFactory.createFromImage(outDoc, flattened, quality)
                    if (flattened != bitmap) flattened.recycle()
                    bitmap.recycle()

                    val pdPage = PDPage(PDRectangle(pointWidth.toFloat(), pointHeight.toFloat()))
                    outDoc.addPage(pdPage)
                    PDPageContentStream(outDoc, pdPage).use { stream ->
                        stream.drawImage(
                            image,
                            0f,
                            0f,
                            pointWidth.toFloat(),
                            pointHeight.toFloat()
                        )
                    }
                }
                outDoc.save(outputFile)
            }
        } finally {
            renderer.close()
            pfd.close()
        }
        return outputFile.length()
    }

    /**
     * Parses a page range string like "1-3, 5" into 0-indexed list of page indices.
     */
    fun parsePageRange(rangeStr: String, maxPages: Int): List<Int> {
        val result = mutableSetOf<Int>()
        for (part in rangeStr.split(",")) {
            val clean = part.trim()
            if (clean.contains("-")) {
                val range = clean.split("-")
                val start = range.getOrNull(0)?.trim()?.toIntOrNull() ?: continue
                val end = range.getOrNull(1)?.trim()?.toIntOrNull() ?: start
                for (p in start..end) {
                    if (p in 1..maxPages) result.add(p - 1)
                }
            } else {
                val p = clean.toIntOrNull()
                if (p != null && p in 1..maxPages) result.add(p - 1)
            }
        }
        return result.sorted()
    }

    /**
     * Converts images into a PDF.
     *
     * Each image is embedded at its own resolution and merely *placed* on the page
     * by a transform, so a 3000 px scan stays a 3000 px scan instead of being
     * resampled down to the ~550 pt width of an A4 page.
     */
    fun imagesToPdf(
        bitmaps: List<Bitmap>,
        format: String, // "A4 Standard", "US Letter", "Fit to Image"
        orientation: String, // "Portrait", "Landscape", "Auto-Detect"
        outputFile: File
    ): File {
        require(bitmaps.isNotEmpty()) { "No images to convert" }

        PDDocument().use { doc ->
            for (bmp in bitmaps) {
                val isLandscape = when (orientation) {
                    "Landscape" -> true
                    "Portrait" -> false
                    else -> bmp.width > bmp.height
                }

                val fitToImage = format == "Fit to Image"
                val pageSize: PDRectangle =
                    if (format == "US Letter") PDRectangle.LETTER else PDRectangle.A4

                // "Fit to Image" sizes the page to the image at 72 DPI so the
                // picture fills it edge to edge with no margin or letterboxing.
                val pageWidth: Float
                val pageHeight: Float
                if (fitToImage) {
                    pageWidth = bmp.width.toFloat()
                    pageHeight = bmp.height.toFloat()
                } else if (isLandscape) {
                    pageWidth = pageSize.height
                    pageHeight = pageSize.width
                } else {
                    pageWidth = pageSize.width
                    pageHeight = pageSize.height
                }

                val page = PDPage(PDRectangle(pageWidth, pageHeight))
                doc.addPage(page)

                val flattened = flattenOntoWhite(bmp)
                val image = JPEGFactory.createFromImage(doc, flattened, 0.9f)
                if (flattened != bmp) flattened.recycle()

                val margin = if (fitToImage) 0f else 24f
                val availW = pageWidth - margin * 2
                val availH = pageHeight - margin * 2
                val scale = minOf(availW / bmp.width, availH / bmp.height)
                val drawW = bmp.width * scale
                val drawH = bmp.height * scale
                val left = margin + (availW - drawW) / 2
                // PDF coordinates start at the bottom-left corner.
                val bottom = margin + (availH - drawH) / 2

                PDPageContentStream(doc, page).use { stream ->
                    stream.drawImage(image, left, bottom, drawW, drawH)
                }
            }
            doc.save(outputFile)
        }
        return outputFile
    }

    /**
     * Returns an opaque copy of [src] composited over white. JPEG cannot store an
     * alpha channel, so transparent pixels would otherwise encode as black.
     */
    private fun flattenOntoWhite(src: Bitmap): Bitmap {
        if (!src.hasAlpha()) return src
        val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(out)
        canvas.drawColor(Color.WHITE)
        canvas.drawBitmap(src, 0f, 0f, Paint(Paint.FILTER_BITMAP_FLAG))
        return out
    }

    /**
     * Writes a small placeholder PDF. Used only where the app needs a document to
     * demonstrate a flow; user-selected files are never substituted with this.
     */
    fun generatePlaceholderPdf(file: File, pageCount: Int, docTitle: String) {
        val pdfDoc = PdfDocument()
        val pageWidth = 595
        val pageHeight = 842
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        for (i in 1..pageCount) {
            val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, i).create()
            val page = pdfDoc.startPage(pageInfo)
            val canvas = page.canvas
            canvas.drawColor(Color.WHITE)

            paint.color = Color.DKGRAY
            paint.textSize = 20f
            paint.isFakeBoldText = true
            canvas.drawText(docTitle, 40f, 80f, paint)

            paint.textSize = 12f
            paint.isFakeBoldText = false
            paint.color = Color.GRAY
            canvas.drawText("Page $i of $pageCount", 40f, 110f, paint)

            pdfDoc.finishPage(page)
        }

        FileOutputStream(file).use { out -> pdfDoc.writeTo(out) }
        pdfDoc.close()
    }
}
