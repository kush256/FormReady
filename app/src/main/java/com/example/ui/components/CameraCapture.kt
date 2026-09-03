package com.example.ui.components

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.example.util.FileHelper
import com.example.util.PhotoProcessor
import java.io.File

/**
 * Returns a launcher function that, when invoked, requests CAMERA permission
 * if needed and then opens the system camera app to capture a photo. The
 * captured photo is decoded (with EXIF rotation corrected and downsampled to
 * a safe size) and delivered via [onImageCaptured]. If the user denies the
 * permission, [onPermissionDenied] is invoked instead.
 */
@Composable
fun rememberCameraCaptureLauncher(
    onImageCaptured: (Bitmap) -> Unit,
    onPermissionDenied: () -> Unit = {}
): () -> Unit {
    val context = LocalContext.current
    val pendingFile = remember { mutableStateOf<File?>(null) }

    val takePictureLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicture()
    ) { success ->
        val file = pendingFile.value
        if (success && file != null && file.exists()) {
            PhotoProcessor.decodeCapturedBitmap(file)?.let(onImageCaptured)
        }
    }

    fun launchCamera() {
        val file = FileHelper.createImageCaptureFile(context)
        pendingFile.value = file
        val uri = FileHelper.getFileUri(context, file)
        takePictureLauncher.launch(uri)
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) launchCamera() else onPermissionDenied()
    }

    return {
        val hasPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED

        if (hasPermission) {
            launchCamera()
        } else {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }
}
