package com.example.util

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import androidx.compose.ui.geometry.Offset
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

object PhotoProcessor {

    /** Output geometry for a portal signature upload. */
    private const val SIGNATURE_WIDTH = 300
    private const val SIGNATURE_HEIGHT = 120

    /**
     * Strokes are rasterized at this multiple of the final size and then reduced,
     * which antialiases the ink far better than drawing straight into a 300x120
     * bitmap.
     */
    private const val SIGNATURE_SUPERSAMPLE = 4

    data class PhotoProcessResult(
        val file: File,
        val bitmap: Bitmap,
        val width: Int,
        val height: Int,
        val sizeBytes: Long,
        val format: String,
        val isCompliant: Boolean
    )

    data class SignatureProcessResult(
        val file: File,
        val bitmap: Bitmap,
        val width: Int,
        val height: Int,
        val sizeBytes: Long,
        val isSizeCompliant: Boolean // within 10 - 20 KB
    )

    /**
     * Decodes a camera capture, downsampling and correcting EXIF rotation.
     * Retained as the entry point used by the camera launcher.
     */
    fun decodeCapturedBitmap(file: File, maxDimension: Int = BitmapLoader.DEFAULT_MAX_DIMENSION): Bitmap? =
        BitmapLoader.decodeFile(file, maxDimension)

    /**
     * Smart Photo Processor:
     * - Crops to target ratio (Passport = 35x45 mm, Visa = 1:1)
     * - Whitens background if requested
     * - Compresses to the preset's size ceiling
     */
    fun processSmartPhoto(
        inputBitmap: Bitmap,
        preset: String,
        replaceWithPureWhiteBg: Boolean,
        centerAlignEyeLevel: Boolean,
        outputFile: File
    ): PhotoProcessResult {
        val (targetRatioW, targetRatioH, maxKb) = when {
            preset.contains("Visa", ignoreCase = true) -> Triple(1, 1, 100)
            preset.contains("Exam", ignoreCase = true) -> Triple(35, 45, 50)
            else -> Triple(35, 45, 50) // Default Passport 35x45mm
        }

        val inputW = inputBitmap.width
        val inputH = inputBitmap.height
        val targetAspect = targetRatioW.toFloat() / targetRatioH.toFloat()
        val currentAspect = inputW.toFloat() / inputH.toFloat()

        var cropW = inputW
        var cropH = inputH
        var cropX = 0
        var cropY = 0

        if (currentAspect > targetAspect) {
            cropW = (inputH * targetAspect).toInt().coerceAtMost(inputW)
            cropX = (inputW - cropW) / 2
        } else {
            cropH = (inputW / targetAspect).toInt().coerceAtMost(inputH)
            cropY = if (centerAlignEyeLevel) {
                // Bias towards the upper third so the face sits at eye level.
                ((inputH - cropH) * 0.35f).toInt()
            } else {
                (inputH - cropH) / 2
            }
        }

        cropX = cropX.coerceIn(0, (inputW - cropW).coerceAtLeast(0))
        cropY = cropY.coerceIn(0, (inputH - cropH).coerceAtLeast(0))
        cropW = cropW.coerceIn(1, inputW - cropX)
        cropH = cropH.coerceIn(1, inputH - cropY)

        val croppedBitmap = Bitmap.createBitmap(inputBitmap, cropX, cropY, cropW, cropH)

        // 35x45 mm at 300 DPI is 413x531 px; a 1:1 visa photo is 600x600.
        val finalW = if (targetRatioW == targetRatioH) 600 else 413
        val finalH = if (targetRatioW == targetRatioH) 600 else 531

        val scaledBitmap = BitmapLoader.scaleHighQuality(croppedBitmap, finalW, finalH)
        if (croppedBitmap != inputBitmap && croppedBitmap != scaledBitmap) croppedBitmap.recycle()

        val processedBitmap = if (replaceWithPureWhiteBg) {
            whitenBackground(scaledBitmap)
        } else {
            scaledBitmap
        }

        val bytes = compressToBudget(
            bitmap = processedBitmap,
            maxBytes = maxKb * 1024L,
            startQuality = 92,
            minQuality = 55
        )
        FileOutputStream(outputFile).use { out -> out.write(bytes) }

        val finalBytes = outputFile.length()
        return PhotoProcessResult(
            file = outputFile,
            bitmap = processedBitmap,
            width = finalW,
            height = finalH,
            sizeBytes = finalBytes,
            format = "JPEG",
            isCompliant = finalBytes <= maxKb * 1024L
        )
    }

    /**
     * Resizes a photo to explicit dimensions, honouring [targetKb] as a size
     * ceiling when one is given.
     */
    fun resizePhoto(
        inputBitmap: Bitmap,
        targetWidth: Int,
        targetHeight: Int,
        maintainAspectRatio: Boolean,
        targetKb: Int,
        outputFile: File
    ): PhotoProcessResult {
        val boxW = targetWidth.coerceIn(16, 8000)
        val boxH = targetHeight.coerceIn(16, 8000)

        var w = boxW
        var h = boxH
        if (maintainAspectRatio && inputBitmap.width > 0 && inputBitmap.height > 0) {
            // Fit inside the requested box rather than deriving height from width
            // alone, so neither dimension ever exceeds what the user asked for.
            val scale = minOf(
                boxW.toFloat() / inputBitmap.width,
                boxH.toFloat() / inputBitmap.height
            )
            w = (inputBitmap.width * scale).toInt().coerceAtLeast(1)
            h = (inputBitmap.height * scale).toInt().coerceAtLeast(1)
        }

        val resized = BitmapLoader.scaleHighQuality(inputBitmap, w, h)

        val bytes = if (targetKb > 0) {
            compressToBudget(resized, targetKb * 1024L, startQuality = 92, minQuality = 55)
        } else {
            ByteArrayOutputStream().also {
                resized.compress(Bitmap.CompressFormat.JPEG, 92, it)
            }.toByteArray()
        }
        FileOutputStream(outputFile).use { out -> out.write(bytes) }

        return PhotoProcessResult(
            file = outputFile,
            bitmap = resized,
            width = w,
            height = h,
            sizeBytes = outputFile.length(),
            format = "JPEG",
            isCompliant = targetKb <= 0 || outputFile.length() <= targetKb * 1024L
        )
    }

    /**
     * Renders drawn signature strokes into a portal-ready image.
     *
     * Stroke coordinates arrive in the on-screen pad's pixel space, which is far
     * larger than the 300x120 output on a tablet, so they are mapped through the
     * ink's bounding box instead of being drawn at their raw values — drawing them
     * directly would push most of the signature outside the bitmap.
     */
    fun processSignatureFromStrokes(
        strokes: List<List<Offset>>,
        sourceWidth: Float,
        sourceHeight: Float,
        inkColorHex: Int,
        outputFile: File
    ): SignatureProcessResult {
        val inkStrokes = strokes.filter { it.isNotEmpty() }
        require(inkStrokes.isNotEmpty()) { "No signature strokes to render" }
        require(sourceWidth > 0f && sourceHeight > 0f) { "Invalid signature pad size" }

        val renderW = SIGNATURE_WIDTH * SIGNATURE_SUPERSAMPLE
        val renderH = SIGNATURE_HEIGHT * SIGNATURE_SUPERSAMPLE

        // Tighten onto the ink so the signature fills the frame, the way a
        // scanned signature would.
        var minX = Float.MAX_VALUE
        var minY = Float.MAX_VALUE
        var maxX = -Float.MAX_VALUE
        var maxY = -Float.MAX_VALUE
        for (stroke in inkStrokes) {
            for (p in stroke) {
                if (p.x < minX) minX = p.x
                if (p.y < minY) minY = p.y
                if (p.x > maxX) maxX = p.x
                if (p.y > maxY) maxY = p.y
            }
        }

        val padding = (maxOf(maxX - minX, maxY - minY) * 0.06f).coerceAtLeast(4f)
        minX -= padding; minY -= padding; maxX += padding; maxY += padding
        val inkW = (maxX - minX).coerceAtLeast(1f)
        val inkH = (maxY - minY).coerceAtLeast(1f)

        val scale = minOf(renderW / inkW, renderH / inkH)
        val offsetX = (renderW - inkW * scale) / 2f
        val offsetY = (renderH - inkH * scale) / 2f

        val bmp = Bitmap.createBitmap(renderW, renderH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.WHITE)

        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = inkColorHex
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            strokeWidth = (5f * scale).coerceIn(3f, renderH / 8f)
        }

        for (stroke in inkStrokes) {
            val path = Path()
            val first = stroke.first()
            path.moveTo(
                offsetX + (first.x - minX) * scale,
                offsetY + (first.y - minY) * scale
            )
            if (stroke.size == 1) {
                // A single tap has no length to stroke; emit a dot instead.
                path.lineTo(
                    offsetX + (first.x - minX) * scale + 0.1f,
                    offsetY + (first.y - minY) * scale
                )
            } else {
                for (i in 1 until stroke.size) {
                    path.lineTo(
                        offsetX + (stroke[i].x - minX) * scale,
                        offsetY + (stroke[i].y - minY) * scale
                    )
                }
            }
            canvas.drawPath(path, paint)
        }

        val finalSignature =
            BitmapLoader.scaleHighQuality(bmp, SIGNATURE_WIDTH, SIGNATURE_HEIGHT)
        bmp.recycle()

        return writeSignature(finalSignature, outputFile)
    }

    /**
     * Processes a photographed pen-and-paper signature: boosts contrast so ink
     * reads as solid against a clean white background.
     */
    fun processSignatureFromPhoto(
        photoBitmap: Bitmap,
        outputFile: File
    ): SignatureProcessResult {
        val targetAspect = SIGNATURE_WIDTH.toFloat() / SIGNATURE_HEIGHT.toFloat()
        val srcAspect = photoBitmap.width.toFloat() / photoBitmap.height.toFloat()

        val cropped = if (srcAspect > targetAspect) {
            val cropW = (photoBitmap.height * targetAspect).toInt()
                .coerceIn(1, photoBitmap.width)
            Bitmap.createBitmap(photoBitmap, (photoBitmap.width - cropW) / 2, 0, cropW, photoBitmap.height)
        } else {
            val cropH = (photoBitmap.width / targetAspect).toInt()
                .coerceIn(1, photoBitmap.height)
            Bitmap.createBitmap(photoBitmap, 0, (photoBitmap.height - cropH) / 2, photoBitmap.width, cropH)
        }

        val scaled = BitmapLoader.scaleHighQuality(cropped, SIGNATURE_WIDTH, SIGNATURE_HEIGHT)
        if (cropped != photoBitmap && cropped != scaled) cropped.recycle()

        val enhanced = if (scaled.isMutable) scaled else scaled.copy(Bitmap.Config.ARGB_8888, true)
        val w = enhanced.width
        val h = enhanced.height
        val pixels = IntArray(w * h)
        enhanced.getPixels(pixels, 0, w, 0, 0, w, h)
        for (i in pixels.indices) {
            val c = pixels[i]
            val r = Color.red(c)
            val g = Color.green(c)
            val b = Color.blue(c)
            pixels[i] = if ((r + g + b) / 3 > 140) {
                Color.WHITE
            } else {
                val contrast = 1.6f
                Color.rgb(
                    (((r - 128) * contrast) + 128).toInt().coerceIn(0, 255),
                    (((g - 128) * contrast) + 128).toInt().coerceIn(0, 255),
                    (((b - 128) * contrast) + 128).toInt().coerceIn(0, 255)
                )
            }
        }
        enhanced.setPixels(pixels, 0, w, 0, 0, w, h)

        return writeSignature(enhanced, outputFile)
    }

    private fun writeSignature(bitmap: Bitmap, outputFile: File): SignatureProcessResult {
        val bytes = compressToBudget(
            bitmap = bitmap,
            maxBytes = 20_000L,
            startQuality = 90,
            minQuality = 45
        )
        FileOutputStream(outputFile).use { out -> out.write(bytes) }

        val size = outputFile.length()
        return SignatureProcessResult(
            file = outputFile,
            bitmap = bitmap,
            width = bitmap.width,
            height = bitmap.height,
            sizeBytes = size,
            isSizeCompliant = size in 5_000L..25_000L
        )
    }

    /**
     * Encodes [bitmap] as JPEG at the highest quality that fits within
     * [maxBytes], never dropping below [minQuality] — an unreadable photo that
     * meets a size limit is not a useful result.
     */
    private fun compressToBudget(
        bitmap: Bitmap,
        maxBytes: Long,
        startQuality: Int,
        minQuality: Int
    ): ByteArray {
        var quality = startQuality
        var stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)

        while (stream.size() > maxBytes && quality > minQuality) {
            quality = (quality - 6).coerceAtLeast(minQuality)
            stream = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        }
        return stream.toByteArray()
    }

    /**
     * Whitens light/neutral backdrop pixels to pure white for biometric standards.
     */
    private fun whitenBackground(src: Bitmap): Bitmap {
        val out = if (src.isMutable) src else src.copy(Bitmap.Config.ARGB_8888, true)
        val w = out.width
        val h = out.height
        val pixels = IntArray(w * h)
        out.getPixels(pixels, 0, w, 0, 0, w, h)

        for (i in pixels.indices) {
            val color = pixels[i]
            val r = Color.red(color)
            val g = Color.green(color)
            val b = Color.blue(color)
            val brightness = (r + g + b) / 3
            val isNeutral = Math.abs(r - g) < 25 && Math.abs(g - b) < 25 && Math.abs(r - b) < 25
            if (brightness > 190 && isNeutral) {
                pixels[i] = Color.WHITE
            }
        }

        out.setPixels(pixels, 0, w, 0, 0, w, h)
        return out
    }
}
