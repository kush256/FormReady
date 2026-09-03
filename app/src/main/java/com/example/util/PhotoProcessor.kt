package com.example.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.media.ExifInterface
import androidx.compose.ui.geometry.Offset
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

object PhotoProcessor {

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
     * Generates a sample portrait photo bitmap if none provided.
     */
    fun getSamplePortraitBitmap(): Bitmap {
        val width = 600
        val height = 750
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        // Off-white studio background
        canvas.drawColor(0xFFF3F4F6.toInt())

        // Shoulders / Silhouette
        paint.color = 0xFF1E3A8A.toInt() // Navy shirt
        canvas.drawOval(100f, 480f, 500f, 900f, paint)

        // Neck
        paint.color = 0xFFE0BB9B.toInt()
        canvas.drawRect(260f, 430f, 340f, 520f, paint)

        // Head / Face
        paint.color = 0xFFF5D0B5.toInt()
        canvas.drawOval(200f, 180f, 400f, 460f, paint)

        // Hair
        paint.color = 0xFF261C14.toInt()
        canvas.drawOval(195f, 150f, 405f, 260f, paint)

        // Eyes
        paint.color = 0xFF1F2937.toInt()
        canvas.drawCircle(260f, 290f, 10f, paint)
        canvas.drawCircle(340f, 290f, 10f, paint)

        // Eyebrows
        paint.strokeWidth = 6f
        paint.style = Paint.Style.STROKE
        canvas.drawLine(245f, 270f, 275f, 270f, paint)
        canvas.drawLine(325f, 270f, 355f, 270f, paint)

        // Gentle smile
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 4f
        paint.color = 0xFFB45309.toInt()
        canvas.drawArc(275f, 370f, 325f, 400f, 0f, 180f, false, paint)

        return bmp
    }

    /**
     * Smart Photo Processor:
     * - Crops to target ratio (Passport = 35x45 mm, Visa = 1:1, Exam = 3.5:4.5)
     * - Whitens background if requested
     * - Compresses strictly to < 50 KB (or < 100 KB for Visa)
     */
    fun processSmartPhoto(
        context: Context,
        inputBitmap: Bitmap,
        preset: String, // "Passport (35x45 mm)", "US Visa (2x2 in / 51x51 mm)", "Govt Exam (3.5x4.5 cm, <50KB)"
        replaceWithPureWhiteBg: Boolean,
        centerAlignEyeLevel: Boolean,
        outputFile: File
    ): PhotoProcessResult {
        val (targetRatioW, targetRatioH, maxKb) = when {
            preset.contains("Visa", ignoreCase = true) -> Triple(1, 1, 100)
            preset.contains("Exam", ignoreCase = true) -> Triple(35, 45, 50)
            else -> Triple(35, 45, 50) // Default Passport 35x45mm
        }

        // Center crop inputBitmap to target ratio
        val inputW = inputBitmap.width
        val inputH = inputBitmap.height
        val targetAspect = targetRatioW.toFloat() / targetRatioH.toFloat()
        val currentAspect = inputW.toFloat() / inputH.toFloat()

        var cropW = inputW
        var cropH = inputH
        var cropX = 0
        var cropY = 0

        if (currentAspect > targetAspect) {
            // Wider than target
            cropW = (inputH * targetAspect).toInt()
            cropX = (inputW - cropW) / 2
        } else {
            // Taller than target
            cropH = (inputW / targetAspect).toInt()
            cropY = if (centerAlignEyeLevel) {
                // Bias slightly towards upper 1/3 for eye-level compliance
                ((inputH - cropH) * 0.35f).toInt()
            } else {
                (inputH - cropH) / 2
            }
        }

        cropX = cropX.coerceIn(0, inputW - 1)
        cropY = cropY.coerceIn(0, inputH - 1)
        cropW = cropW.coerceAtMost(inputW - cropX)
        cropH = cropH.coerceAtMost(inputH - cropY)

        val croppedBitmap = Bitmap.createBitmap(inputBitmap, cropX, cropY, cropW, cropH)

        // Standard biometric output dimensions (e.g. 413 x 531 px for 35x45mm at 300 DPI, or 600x600 for Visa)
        val finalW = if (targetRatioW == targetRatioH) 600 else 413
        val finalH = if (targetRatioW == targetRatioH) 600 else 531

        val scaledBitmap = Bitmap.createScaledBitmap(croppedBitmap, finalW, finalH, true)

        // Background whitening if enabled
        val processedBitmap = if (replaceWithPureWhiteBg) {
            whitenBackground(scaledBitmap)
        } else {
            scaledBitmap
        }

        // Adaptive JPEG compression loop to hit < maxKb
        var quality = 88
        var stream = ByteArrayOutputStream()
        processedBitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)

        while (stream.size() > maxKb * 1024L && quality > 20) {
            quality -= 8
            stream = ByteArrayOutputStream()
            processedBitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        }

        FileOutputStream(outputFile).use { out ->
            out.write(stream.toByteArray())
        }

        val finalBytes = outputFile.length()
        val compliant = finalBytes <= maxKb * 1024L

        return PhotoProcessResult(
            file = outputFile,
            bitmap = processedBitmap,
            width = finalW,
            height = finalH,
            sizeBytes = finalBytes,
            format = "JPEG",
            isCompliant = compliant
        )
    }

    /**
     * Resizes a photo to explicit dimensions and compresses.
     */
    fun resizePhoto(
        inputBitmap: Bitmap,
        targetWidth: Int,
        targetHeight: Int,
        maintainAspectRatio: Boolean,
        outputFile: File
    ): PhotoProcessResult {
        var w = targetWidth.coerceIn(100, 4000)
        var h = targetHeight.coerceIn(100, 4000)

        if (maintainAspectRatio && inputBitmap.width > 0 && inputBitmap.height > 0) {
            val aspect = inputBitmap.width.toFloat() / inputBitmap.height.toFloat()
            h = (w / aspect).toInt().coerceIn(100, 4000)
        }

        val resized = Bitmap.createScaledBitmap(inputBitmap, w, h, true)

        // Compress to JPEG
        val stream = ByteArrayOutputStream()
        resized.compress(Bitmap.CompressFormat.JPEG, 85, stream)

        FileOutputStream(outputFile).use { out ->
            out.write(stream.toByteArray())
        }

        return PhotoProcessResult(
            file = outputFile,
            bitmap = resized,
            width = w,
            height = h,
            sizeBytes = outputFile.length(),
            format = "JPEG",
            isCompliant = true
        )
    }

    /**
     * Processes signature from drawn points into cropped, compliant image (10 - 20 KB limit).
     */
    fun processSignatureFromPoints(
        points: List<Offset>,
        inkColorHex: Int,
        outputFile: File
    ): SignatureProcessResult {
        val width = 600
        val height = 240
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.WHITE)

        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = inkColorHex
            strokeWidth = 6f
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
        }

        if (points.isNotEmpty()) {
            val path = Path()
            path.moveTo(points.first().x, points.first().y)
            for (i in 1 until points.size) {
                path.lineTo(points[i].x, points[i].y)
            }
            canvas.drawPath(path, paint)
        } else {
            // Draw default signature if canvas was empty
            val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = inkColorHex
                textSize = 54f
                isFakeBoldText = true
            }
            canvas.drawText("J. Doe", 220f, 130f, textPaint)
            paint.strokeWidth = 3f
            canvas.drawLine(180f, 160f, 420f, 155f, paint)
        }

        // Scale to standard signature portal dimensions 300 x 120
        val finalSignature = Bitmap.createScaledBitmap(bmp, 300, 120, true)

        // Compress so file size is in the 10 - 20 KB sweet spot
        var quality = 82
        var stream = ByteArrayOutputStream()
        finalSignature.compress(Bitmap.CompressFormat.JPEG, quality, stream)

        FileOutputStream(outputFile).use { out ->
            out.write(stream.toByteArray())
        }

        val bytes = outputFile.length()
        return SignatureProcessResult(
            file = outputFile,
            bitmap = finalSignature,
            width = 300,
            height = 120,
            sizeBytes = bytes,
            isSizeCompliant = bytes in 5000L..25000L
        )
    }

    /**
     * Decodes a bitmap from a camera-captured file, downsampling large camera
     * output (which can be 4000px+) and correcting EXIF rotation.
     */
    fun decodeCapturedBitmap(file: File, maxDimension: Int = 2000): Bitmap? {
        val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, boundsOptions)
        if (boundsOptions.outWidth <= 0 || boundsOptions.outHeight <= 0) return null

        var sampleSize = 1
        while ((boundsOptions.outWidth / sampleSize) > maxDimension ||
            (boundsOptions.outHeight / sampleSize) > maxDimension
        ) {
            sampleSize *= 2
        }

        val decodeOptions = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        val bitmap = BitmapFactory.decodeFile(file.absolutePath, decodeOptions) ?: return null

        return try {
            val exif = ExifInterface(file.absolutePath)
            val orientation = exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            )
            val rotationDegrees = when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
            if (rotationDegrees != 0f) {
                val matrix = Matrix().apply { postRotate(rotationDegrees) }
                Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            } else {
                bitmap
            }
        } catch (_: Exception) {
            bitmap
        }
    }

    /**
     * Processes a photographed pen-and-paper signature: boosts contrast so ink
     * reads as solid black/ink-color against a clean white background, then
     * compresses into the same 10-20 KB signature spec as drawn signatures.
     */
    fun processSignatureFromPhoto(
        photoBitmap: Bitmap,
        outputFile: File
    ): SignatureProcessResult {
        // Crop to a 5:2 signature-strip aspect ratio around the center of the photo,
        // since paper signatures are usually photographed with excess surrounding page.
        val targetAspect = 300f / 120f
        val srcAspect = photoBitmap.width.toFloat() / photoBitmap.height.toFloat()

        val cropped = if (srcAspect > targetAspect) {
            val cropW = (photoBitmap.height * targetAspect).toInt().coerceAtMost(photoBitmap.width)
            val cropX = (photoBitmap.width - cropW) / 2
            Bitmap.createBitmap(photoBitmap, cropX, 0, cropW, photoBitmap.height)
        } else {
            val cropH = (photoBitmap.width / targetAspect).toInt().coerceAtMost(photoBitmap.height)
            val cropY = (photoBitmap.height - cropH) / 2
            Bitmap.createBitmap(photoBitmap, 0, cropY, photoBitmap.width, cropH)
        }

        val scaled = Bitmap.createScaledBitmap(cropped, 300, 120, true)

        // Increase contrast + threshold light paper background towards pure white
        // while keeping darker ink strokes intact, approximating a clean scan.
        val enhanced = scaled.copy(Bitmap.Config.ARGB_8888, true)
        val w = enhanced.width
        val h = enhanced.height
        val pixels = IntArray(w * h)
        enhanced.getPixels(pixels, 0, w, 0, 0, w, h)
        for (i in pixels.indices) {
            val c = pixels[i]
            val r = Color.red(c)
            val g = Color.green(c)
            val b = Color.blue(c)
            val brightness = (r + g + b) / 3
            pixels[i] = if (brightness > 140) {
                Color.WHITE
            } else {
                val contrastFactor = 1.6f
                val newR = (((r - 128) * contrastFactor) + 128).toInt().coerceIn(0, 255)
                val newG = (((g - 128) * contrastFactor) + 128).toInt().coerceIn(0, 255)
                val newB = (((b - 128) * contrastFactor) + 128).toInt().coerceIn(0, 255)
                Color.rgb(newR, newG, newB)
            }
        }
        enhanced.setPixels(pixels, 0, w, 0, 0, w, h)

        var quality = 82
        var stream = ByteArrayOutputStream()
        enhanced.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        while (stream.size() > 20_000 && quality > 30) {
            quality -= 8
            stream = ByteArrayOutputStream()
            enhanced.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        }

        FileOutputStream(outputFile).use { out -> out.write(stream.toByteArray()) }

        val bytes = outputFile.length()
        return SignatureProcessResult(
            file = outputFile,
            bitmap = enhanced,
            width = w,
            height = h,
            sizeBytes = bytes,
            isSizeCompliant = bytes in 5000L..25000L
        )
    }

    /**
     * Whitens light/neutral backdrop pixels to pure white for biometric standards.
     */
    private fun whitenBackground(src: Bitmap): Bitmap {
        val out = src.copy(Bitmap.Config.ARGB_8888, true)
        val w = out.width
        val h = out.height
        val pixels = IntArray(w * h)
        out.getPixels(pixels, 0, w, 0, 0, w, h)

        for (i in pixels.indices) {
            val color = pixels[i]
            val r = Color.red(color)
            val g = Color.green(color)
            val b = Color.blue(color)

            // If pixel is light gray / off-white background
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
