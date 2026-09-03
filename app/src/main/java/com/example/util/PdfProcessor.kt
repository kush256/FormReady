package com.example.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

object PdfProcessor {

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

    /**
     * Ensures all sample PDFs exist in app storage so the app works 100% offline
     * out-of-the-box, in addition to user-imported files.
     */
    fun ensureSamplePdfs(context: Context): List<PdfMetadata> {
        val sampleDir = File(context.filesDir, "samples").apply { mkdirs() }

        val dossier = File(sampleDir, "Application_Dossier_2026.pdf")
        if (!dossier.exists() || dossier.length() == 0L) {
            generateMultiPagePdf(
                file = dossier,
                pageCount = 3,
                docTitle = "Application Dossier 2026",
                subtitle = "Official Registration & Verification Form",
                baseColor = 0xFF1565C0.toInt()
            )
        }

        val idCard = File(sampleDir, "National_ID_Front_Back.pdf")
        if (!idCard.exists() || idCard.length() == 0L) {
            generateMultiPagePdf(
                file = idCard,
                pageCount = 2,
                docTitle = "National Identity Card",
                subtitle = "Certified Front & Back Government ID",
                baseColor = 0xFF00897B.toInt()
            )
        }

        val utility = File(sampleDir, "Address_Proof_Utility.pdf")
        if (!utility.exists() || utility.length() == 0L) {
            generateMultiPagePdf(
                file = utility,
                pageCount = 1,
                docTitle = "Utility Bill Address Proof",
                subtitle = "Electricity & Municipal Verification",
                baseColor = 0xFFEF6C00.toInt()
            )
        }

        val splitDossier = File(sampleDir, "Comprehensive_Application_Dossier.pdf")
        if (!splitDossier.exists() || splitDossier.length() == 0L) {
            generateMultiPagePdf(
                file = splitDossier,
                pageCount = 12,
                docTitle = "Comprehensive Application Dossier",
                subtitle = "Full Candidate Verification Portfolio (12 Pages)",
                baseColor = 0xFF283593.toInt()
            )
        }

        return listOf(
            getMetadata(dossier),
            getMetadata(idCard),
            getMetadata(utility),
            getMetadata(splitDossier)
        )
    }

    fun getMetadata(file: File): PdfMetadata {
        var pages = 1
        try {
            val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
            val renderer = PdfRenderer(pfd)
            pages = renderer.pageCount
            renderer.close()
            pfd.close()
        } catch (_: Exception) {
            pages = 1
        }
        return PdfMetadata(
            file = file,
            fileName = file.name,
            pageCount = pages,
            sizeBytes = file.length()
        )
    }

    /**
     * Like [getMetadata], but throws instead of silently defaulting when the file
     * cannot be opened as a PDF (corrupted, password-protected, or not a PDF at
     * all). Used wherever the caller needs to detect and report an invalid file.
     */
    fun getMetadataOrThrow(file: File): PdfMetadata {
        val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(pfd)
        val pages = renderer.pageCount
        renderer.close()
        pfd.close()
        return PdfMetadata(
            file = file,
            fileName = file.name,
            pageCount = pages,
            sizeBytes = file.length()
        )
    }

    /**
     * Compresses a PDF file by rendering pages to compressed bitmaps and assembling into target PDF.
     * Uses targetKb and mode ("Standard", "High", "Extreme") to calibrate the starting quality, then
     * iteratively steps quality/scale down further while the result still exceeds the target size.
     */
    fun compressPdf(
        sourceFile: File,
        targetKb: Int,
        aggressiveness: String, // "Standard", "High", "Extreme"
        outputFile: File
    ): CompressionResult {
        val originalSize = sourceFile.length()
        val targetBytes = targetKb * 1024L

        var (quality, scale) = when (aggressiveness) {
            "Extreme" -> Pair(45, 0.7f)
            "High" -> Pair(65, 0.85f)
            else -> Pair(80, 1.0f)
        }

        var compressedSize = Long.MAX_VALUE
        var attempts = 0
        while (true) {
            compressedSize = renderCompressedPdf(sourceFile, quality, scale, outputFile)
            attempts++
            val hitFloor = quality <= 20 && scale <= 0.35f
            if (compressedSize <= targetBytes || attempts >= 6 || hitFloor) break
            quality = (quality - 12).coerceAtLeast(20)
            scale = (scale - 0.12f).coerceAtLeast(0.35f)
        }

        val reduction = if (originalSize > 0) {
            (((originalSize - compressedSize).toDouble() / originalSize.toDouble()) * 100).toInt().coerceIn(0, 99)
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
     * Renders every page of [sourceFile] to a JPEG at the given [quality]/[scale] and
     * writes the resulting PDF to [outputFile]. Returns the resulting file size in bytes.
     */
    private fun renderCompressedPdf(sourceFile: File, quality: Int, scale: Float, outputFile: File): Long {
        val pfd = ParcelFileDescriptor.open(sourceFile, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(pfd)
        val pageCount = renderer.pageCount

        val pdfDoc = PdfDocument()

        for (i in 0 until pageCount) {
            val page = renderer.openPage(i)
            val renderWidth = (page.width * scale).toInt().coerceAtLeast(100)
            val renderHeight = (page.height * scale).toInt().coerceAtLeast(100)

            val bitmap = Bitmap.createBitmap(renderWidth, renderHeight, Bitmap.Config.ARGB_8888)
            bitmap.eraseColor(Color.WHITE)
            page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            page.close()

            // Compress bitmap into JPEG stream
            val stream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
            val compressedBytes = stream.toByteArray()
            val compressedBitmap = android.graphics.BitmapFactory.decodeByteArray(compressedBytes, 0, compressedBytes.size)

            val pageInfo = PdfDocument.PageInfo.Builder(page.width, page.height, i + 1).create()
            val docPage = pdfDoc.startPage(pageInfo)
            val canvas = docPage.canvas
            val destRect = Rect(0, 0, page.width, page.height)
            canvas.drawBitmap(compressedBitmap ?: bitmap, null, destRect, null)
            pdfDoc.finishPage(docPage)

            bitmap.recycle()
            compressedBitmap?.recycle()
        }

        renderer.close()
        pfd.close()

        FileOutputStream(outputFile).use { out ->
            pdfDoc.writeTo(out)
        }
        pdfDoc.close()

        return outputFile.length()
    }

    /**
     * Merges multiple PDF files into one.
     */
    fun mergePdfs(sourceFiles: List<File>, outputFile: File): MergeResult {
        val pdfDoc = PdfDocument()
        var totalPages = 0

        for (file in sourceFiles) {
            try {
                val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
                val renderer = PdfRenderer(pfd)
                for (i in 0 until renderer.pageCount) {
                    totalPages++
                    val page = renderer.openPage(i)
                    val bitmap = Bitmap.createBitmap(page.width, page.height, Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(Color.WHITE)
                    page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    page.close()

                    val pageInfo = PdfDocument.PageInfo.Builder(page.width, page.height, totalPages).create()
                    val docPage = pdfDoc.startPage(pageInfo)
                    docPage.canvas.drawBitmap(bitmap, null, Rect(0, 0, page.width, page.height), null)
                    pdfDoc.finishPage(docPage)
                    bitmap.recycle()
                }
                renderer.close()
                pfd.close()
            } catch (e: Exception) {
                // If a file fails, skip gracefully
            }
        }

        FileOutputStream(outputFile).use { out ->
            pdfDoc.writeTo(out)
        }
        pdfDoc.close()

        return MergeResult(
            outputFile = outputFile,
            totalFiles = sourceFiles.size,
            totalPages = totalPages,
            sizeBytes = outputFile.length()
        )
    }

    /**
     * Splits a PDF according to page range string (e.g. "1-2, 4" or "1-3").
     */
    fun splitPdf(sourceFile: File, pageRange: String, outputFile: File): SplitResult {
        val pfd = ParcelFileDescriptor.open(sourceFile, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(pfd)
        val totalAvailablePages = renderer.pageCount

        val targetPageIndices = parsePageRange(pageRange, totalAvailablePages)
        val pdfDoc = PdfDocument()

        var writtenCount = 0
        for (pageIdx in targetPageIndices) {
            if (pageIdx in 0 until totalAvailablePages) {
                writtenCount++
                val page = renderer.openPage(pageIdx)
                val bitmap = Bitmap.createBitmap(page.width, page.height, Bitmap.Config.ARGB_8888)
                bitmap.eraseColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                page.close()

                val pageInfo = PdfDocument.PageInfo.Builder(page.width, page.height, writtenCount).create()
                val docPage = pdfDoc.startPage(pageInfo)
                docPage.canvas.drawBitmap(bitmap, null, Rect(0, 0, page.width, page.height), null)
                pdfDoc.finishPage(docPage)
                bitmap.recycle()
            }
        }

        renderer.close()
        pfd.close()

        FileOutputStream(outputFile).use { out ->
            pdfDoc.writeTo(out)
        }
        pdfDoc.close()

        return SplitResult(
            outputFile = outputFile,
            originalPages = totalAvailablePages,
            extractedPages = writtenCount,
            sizeBytes = outputFile.length(),
            pageRangeDescription = pageRange
        )
    }

    /**
     * Parses a page range string like "1-3, 5" into 0-indexed list of page indices.
     */
    fun parsePageRange(rangeStr: String, maxPages: Int): List<Int> {
        val result = mutableSetOf<Int>()
        val parts = rangeStr.split(",")
        for (part in parts) {
            val clean = part.trim()
            if (clean.contains("-")) {
                val range = clean.split("-")
                val start = range.getOrNull(0)?.trim()?.toIntOrNull() ?: 1
                val end = range.getOrNull(1)?.trim()?.toIntOrNull() ?: start
                for (p in start..end) {
                    if (p in 1..maxPages) {
                        result.add(p - 1)
                    }
                }
            } else {
                val p = clean.toIntOrNull()
                if (p != null && p in 1..maxPages) {
                    result.add(p - 1)
                }
            }
        }
        return result.sorted()
    }

    /**
     * Converts a list of Bitmaps into a standardized PDF.
     */
    fun imagesToPdf(
        bitmaps: List<Bitmap>,
        format: String, // "A4 Standard", "US Letter", "Fit to Image"
        orientation: String, // "Portrait", "Landscape", "Auto-Detect"
        outputFile: File
    ): File {
        val pdfDoc = PdfDocument()

        for ((index, bmp) in bitmaps.withIndex()) {
            val isLandscape = when (orientation) {
                "Landscape" -> true
                "Portrait" -> false
                else -> bmp.width > bmp.height
            }

            val (pageWidth, pageHeight) = when (format) {
                "US Letter" -> if (isLandscape) Pair(792, 612) else Pair(612, 792)
                "Fit to Image" -> Pair(bmp.width.coerceAtLeast(300), bmp.height.coerceAtLeast(400))
                else -> if (isLandscape) Pair(842, 595) else Pair(595, 842) // A4
            }

            val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, index + 1).create()
            val docPage = pdfDoc.startPage(pageInfo)
            val canvas = docPage.canvas

            // Fill page background white
            canvas.drawColor(Color.WHITE)

            // Scale image to fit within page margins (margin = 24pt)
            val margin = 24
            val availW = pageWidth - margin * 2
            val availH = pageHeight - margin * 2

            val scale = minOf(availW.toFloat() / bmp.width.toFloat(), availH.toFloat() / bmp.height.toFloat())
            val drawW = (bmp.width * scale).toInt()
            val drawH = (bmp.height * scale).toInt()
            val left = margin + (availW - drawW) / 2
            val top = margin + (availH - drawH) / 2

            canvas.drawBitmap(bmp, null, Rect(left, top, left + drawW, top + drawH), null)
            pdfDoc.finishPage(docPage)
        }

        FileOutputStream(outputFile).use { out ->
            pdfDoc.writeTo(out)
        }
        pdfDoc.close()
        return outputFile
    }

    /**
     * Helper to generate a multi-page PDF with authentic document elements.
     */
    private fun generateMultiPagePdf(
        file: File,
        pageCount: Int,
        docTitle: String,
        subtitle: String,
        baseColor: Int
    ) {
        val pdfDoc = PdfDocument()
        val pageWidth = 595 // A4 standard pt
        val pageHeight = 842

        val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        for (i in 1..pageCount) {
            val pageInfo = PdfDocument.PageInfo.Builder(pageWidth, pageHeight, i).create()
            val page = pdfDoc.startPage(pageInfo)
            val canvas = page.canvas

            // Pure white background
            canvas.drawColor(Color.WHITE)

            // Top Header Banner
            paint.color = baseColor
            canvas.drawRect(0f, 0f, pageWidth.toFloat(), 70f, paint)

            paint.color = Color.WHITE
            paint.textSize = 18f
            paint.isFakeBoldText = true
            canvas.drawText("FORMREADY CERTIFIED DOCUMENT", 30f, 42f, paint)

            paint.textSize = 10f
            paint.isFakeBoldText = false
            canvas.drawText("VERIFIED APPLICATION DOSSIER • SECURE ARCHIVE", 30f, 58f, paint)

            // Document Content
            paint.color = Color.DKGRAY
            paint.textSize = 20f
            paint.isFakeBoldText = true
            canvas.drawText(docTitle, 30f, 110f, paint)

            paint.textSize = 12f
            paint.color = Color.GRAY
            paint.isFakeBoldText = false
            canvas.drawText(subtitle, 30f, 130f, paint)

            // Decorative Rule
            paint.color = 0xFFE0E0E0.toInt()
            paint.strokeWidth = 2f
            canvas.drawLine(30f, 145f, (pageWidth - 30).toFloat(), 145f, paint)

            // Form Fields Mockup
            paint.color = 0xFFF5F5F5.toInt()
            canvas.drawRoundRect(30f, 165f, (pageWidth - 30).toFloat(), 340f, 8f, 8f, paint)

            paint.color = Color.BLACK
            paint.textSize = 11f
            paint.isFakeBoldText = true
            canvas.drawText("SECTION 1: APPLICANT BIOMETRIC VERIFICATION", 45f, 190f, paint)

            paint.isFakeBoldText = false
            paint.textSize = 10f
            paint.color = Color.DKGRAY
            canvas.drawText("Candidate ID: FR-2026-9812401", 45f, 215f, paint)
            canvas.drawText("Page: $i of $pageCount", 45f, 235f, paint)
            canvas.drawText("Validation Status: Compliant with Portal Specs (Size & DPI Checked)", 45f, 255f, paint)
            canvas.drawText("Issuing Authority: Directorate of Examination & Portal Compliance", 45f, 275f, paint)
            canvas.drawText("Digital Seal: SHA-256 Verified Embedded Checksum", 45f, 295f, paint)

            // Simulated content table
            paint.color = 0xFFEEEEEE.toInt()
            canvas.drawRect(30f, 360f, (pageWidth - 30).toFloat(), 560f, paint)

            paint.color = baseColor
            canvas.drawRect(30f, 360f, (pageWidth - 30).toFloat(), 385f, paint)

            paint.color = Color.WHITE
            paint.textSize = 10f
            paint.isFakeBoldText = true
            canvas.drawText("Document Item Details (Page $i Content)", 45f, 377f, paint)

            paint.color = Color.DKGRAY
            paint.isFakeBoldText = false
            var rowY = 410f
            for (r in 1..4) {
                canvas.drawText("Verification Record $r.$i: Certified Attachment and Supporting Evidence", 45f, rowY, paint)
                rowY += 30f
            }

            // Footer
            paint.color = Color.LTGRAY
            paint.textSize = 9f
            canvas.drawText("Generated for FormReady application workflow • Strict standards enforced", 30f, (pageHeight - 30).toFloat(), paint)
            canvas.drawText("Page $i of $pageCount", (pageWidth - 80).toFloat(), (pageHeight - 30).toFloat(), paint)

            pdfDoc.finishPage(page)
        }

        FileOutputStream(file).use { out ->
            pdfDoc.writeTo(out)
        }
        pdfDoc.close()
    }
}
