package com.example.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.media.ExifInterface
import android.net.Uri
import java.io.File
import java.io.InputStream

/**
 * Loads bitmaps from user-picked files and content Uris.
 *
 * Decoding a modern phone photo at full resolution is not viable: a 12 MP image
 * costs ~48 MB as ARGB_8888, and a handful of them exhausts the heap. Every load
 * here is therefore downsampled to a bounded dimension before it reaches memory,
 * and EXIF rotation is applied so portrait photos do not arrive sideways.
 */
object BitmapLoader {

    /**
     * Upper bound on either dimension of a loaded bitmap. 2400 px keeps a full
     * A4 page legible at ~200 DPI while costing ~23 MB at worst.
     */
    const val DEFAULT_MAX_DIMENSION = 2400

    fun decodeFile(file: File, maxDimension: Int = DEFAULT_MAX_DIMENSION): Bitmap? {
        if (!file.exists() || file.length() == 0L) return null

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSizeFor(bounds.outWidth, bounds.outHeight, maxDimension)
        }
        val decoded = try {
            BitmapFactory.decodeFile(file.absolutePath, options)
        } catch (_: OutOfMemoryError) {
            null
        } ?: return null

        val rotation = try {
            rotationFor(ExifInterface(file.absolutePath))
        } catch (_: Exception) {
            0f
        }
        return applyRotation(decoded, rotation)
    }

    fun decodeUri(
        context: Context,
        uri: Uri,
        maxDimension: Int = DEFAULT_MAX_DIMENSION
    ): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        // decodeStream returns null under inJustDecodeBounds, so the stream — not
        // the decode result — is what decides whether the Uri is readable.
        val boundsStream = openStream(context, uri) ?: return null
        boundsStream.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null

        val options = BitmapFactory.Options().apply {
            inSampleSize = sampleSizeFor(bounds.outWidth, bounds.outHeight, maxDimension)
        }
        val decoded = try {
            openStream(context, uri)?.use { BitmapFactory.decodeStream(it, null, options) }
        } catch (_: OutOfMemoryError) {
            null
        } ?: return null

        val rotation = try {
            openStream(context, uri)?.use { rotationFor(ExifInterface(it)) } ?: 0f
        } catch (_: Exception) {
            0f
        }
        return applyRotation(decoded, rotation)
    }

    /**
     * Scales [src] to fit within [targetWidth] x [targetHeight].
     *
     * A single [Bitmap.createScaledBitmap] call drops most source pixels when the
     * reduction is large (a 3000 px photo down to a 413 px passport crop samples
     * roughly one pixel in seven), which is what makes heavily reduced output look
     * jagged. Halving repeatedly until the image is within 2x of the target keeps
     * every source pixel contributing to the result.
     */
    fun scaleHighQuality(src: Bitmap, targetWidth: Int, targetHeight: Int): Bitmap {
        val w = targetWidth.coerceAtLeast(1)
        val h = targetHeight.coerceAtLeast(1)
        if (src.width == w && src.height == h) return src

        var current = src
        var halvedAny = false
        while (current.width / 2 >= w && current.height / 2 >= h &&
            current.width / 2 > 0 && current.height / 2 > 0
        ) {
            val next = drawScaled(current, current.width / 2, current.height / 2)
            if (halvedAny) current.recycle()
            current = next
            halvedAny = true
        }

        val result = drawScaled(current, w, h)
        if (halvedAny) current.recycle()
        return result
    }

    private fun drawScaled(src: Bitmap, w: Int, h: Int): Bitmap {
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG).apply {
            isDither = true
        }
        canvas.drawBitmap(src, null, android.graphics.Rect(0, 0, w, h), paint)
        return out
    }

    private fun openStream(context: Context, uri: Uri): InputStream? = try {
        context.contentResolver.openInputStream(uri)
    } catch (_: Exception) {
        null
    }

    private fun sampleSizeFor(width: Int, height: Int, maxDimension: Int): Int {
        var sampleSize = 1
        while (width / sampleSize > maxDimension || height / sampleSize > maxDimension) {
            sampleSize *= 2
        }
        return sampleSize
    }

    private fun rotationFor(exif: ExifInterface): Float =
        when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }

    private fun applyRotation(bitmap: Bitmap, degrees: Float): Bitmap {
        if (degrees == 0f) return bitmap
        return try {
            val matrix = Matrix().apply { postRotate(degrees) }
            val rotated =
                Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            if (rotated != bitmap) bitmap.recycle()
            rotated
        } catch (_: OutOfMemoryError) {
            bitmap
        }
    }
}
