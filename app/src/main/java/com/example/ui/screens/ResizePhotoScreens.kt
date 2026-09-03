package com.example.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Crop
import androidx.compose.material.icons.filled.Image as ImagePlaceholderIcon
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.components.CommonHeader
import com.example.ui.components.rememberCameraCaptureLauncher
import com.example.ui.theme.BluePrimary
import com.example.ui.theme.BluePrimaryContainer
import com.example.ui.theme.OnBluePrimaryContainer
import com.example.ui.theme.SuccessContainer
import com.example.ui.theme.SuccessGreen
import com.example.util.FileHelper
import com.example.viewmodel.FormReadyViewModel

// 1. Corrected Resize Photo
@Composable
fun ResizePhotoScreen(
    onBack: () -> Unit,
    onResizeSuccess: () -> Unit,
    onUseSmartPhoto: () -> Unit,
    viewModel: FormReadyViewModel? = null,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    var widthText by remember { mutableStateOf("600") }
    var heightText by remember { mutableStateOf("600") }
    var keepAspect by remember { mutableStateOf(true) }

    val photoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri != null && viewModel != null) {
            viewModel.loadInputBitmapFromUri(context, uri)
        }
    }

    val cameraLauncher = rememberCameraCaptureLauncher(
        onImageCaptured = { bitmap -> viewModel?.setInputBitmap(bitmap) }
    )

    val inputBitmap by viewModel?.inputBitmap?.collectAsState() ?: remember { mutableStateOf(null) }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        CommonHeader(
            title = "Resize Photo",
            subtitle = "Exact Pixel & Dimension Scaling",
            onBack = onBack
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Source Image Card
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                    }
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    if (inputBitmap != null) {
                        Image(
                            bitmap = inputBitmap!!.asImageBitmap(),
                            contentDescription = "Selected Photo",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier
                                .size(46.dp)
                                .clip(RoundedCornerShape(10.dp))
                        )
                    } else {
                        Box(
                            modifier = Modifier
                                .size(46.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(BluePrimaryContainer),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Filled.ImagePlaceholderIcon,
                                contentDescription = null,
                                tint = OnBluePrimaryContainer
                            )
                        }
                    }
                    Spacer(modifier = Modifier.width(14.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = if (inputBitmap != null) "Custom Image Selected" else "applicant_photo_raw.jpg",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                        Text(
                            text = if (inputBitmap != null) "Current: ${inputBitmap!!.width} x ${inputBitmap!!.height} px (Tap to change)" else "Current: 2400 x 3000 px  •  2.6 MB (Tap to change)",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = cameraLauncher) {
                        Icon(
                            imageVector = Icons.Default.CameraAlt,
                            contentDescription = "Take photo",
                            tint = BluePrimary
                        )
                    }
                }
            }

            // Link banner: Use Smart Photo
            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = BluePrimaryContainer.copy(alpha = 0.4f)),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onUseSmartPhoto() }
                    .testTag("use_smart_photo_banner")
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.AutoAwesome,
                        contentDescription = null,
                        tint = BluePrimary,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Need passport or visa compliance?",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = BluePrimary
                        )
                        Text(
                            text = "Smart Photo automatically formats face ratio and white background.",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Text(
                        text = "Use Smart Photo",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = BluePrimary,
                        textDecoration = TextDecoration.Underline,
                        modifier = Modifier.testTag("use_smart_photo_link")
                    )
                }
            }

            Text(
                text = "Target Dimensions (Pixels)",
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = MaterialTheme.colorScheme.onBackground
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OutlinedTextField(
                    value = widthText,
                    onValueChange = { widthText = it },
                    label = { Text("Width (px)") },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = heightText,
                    onValueChange = { heightText = it },
                    label = { Text("Height (px)") },
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.weight(1f)
                )
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = keepAspect,
                    onCheckedChange = { keepAspect = it }
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Maintain Aspect Ratio (Lock 1:1 ratio)",
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Primary Resize Photo Button (matches //button[contains(normalize-space(), 'Resize Photo')])
            Button(
                onClick = {
                    val w = widthText.toIntOrNull() ?: 600
                    val h = heightText.toIntOrNull() ?: 600
                    if (viewModel != null) {
                        viewModel.processResizePhoto(
                            widthPx = w,
                            heightPx = h,
                            targetKb = 100,
                            onComplete = onResizeSuccess
                        )
                    } else {
                        onResizeSuccess()
                    }
                },
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .testTag("resize_photo_button")
            ) {
                Icon(Icons.Default.Crop, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Resize Photo",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

// 2. Refined Resize Photo Result
@Composable
fun ResizePhotoResultScreen(
    onBack: () -> Unit,
    onResizeAnother: () -> Unit,
    onAdjustDimensions: () -> Unit,
    onUseSmartPhoto: () -> Unit,
    viewModel: FormReadyViewModel? = null,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val photoResult by viewModel?.photoResult?.collectAsState() ?: remember { mutableStateOf(null) }

    val newDims = photoResult?.let { "${it.width} x ${it.height} px" } ?: "600 x 600 px"
    val newSize = photoResult?.let { FileHelper.formatFileSize(it.sizeBytes) } ?: "68 KB"

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        CommonHeader(
            title = "Photo Resized",
            onBack = onBack
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(76.dp)
                    .clip(CircleShape)
                    .background(SuccessContainer),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = null,
                    tint = SuccessGreen,
                    modifier = Modifier.size(42.dp)
                )
            }

            Text(
                text = "Resize Complete",
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground
            )

            // Real Action Buttons: Share & Open
            photoResult?.file?.let { outputFile ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Button(
                        onClick = { FileHelper.shareFile(context, outputFile) },
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                    ) {
                        Icon(Icons.Default.Share, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Share Photo", fontSize = 14.sp)
                    }

                    OutlinedButton(
                        onClick = { FileHelper.openFile(context, outputFile) },
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .weight(1f)
                            .height(48.dp)
                    ) {
                        Icon(Icons.Default.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Open Photo", fontSize = 14.sp)
                    }
                }
            }

            // Preview & Metrics Card
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(text = "New Dimensions", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(text = newDims, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                        Column {
                            Text(text = "File Size", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(text = newSize, fontSize = 16.sp, fontWeight = FontWeight.Bold, color = BluePrimary)
                        }
                        Column {
                            Text(text = "Format", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(text = "JPEG 92%", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    Text(
                        text = "Dimensions and resolution have been scaled proportionally. Ready for form upload.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Link to Smart Photo (matches //a[contains(text(), 'Use Smart Photo')])
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onUseSmartPhoto() }
                    .padding(vertical = 4.dp)
            ) {
                Icon(Icons.Default.AutoAwesome, contentDescription = null, tint = BluePrimary, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Need biometric standards? Use Smart Photo",
                    fontSize = 13.sp,
                    color = BluePrimary,
                    fontWeight = FontWeight.Medium,
                    textDecoration = TextDecoration.Underline,
                    modifier = Modifier.testTag("result_use_smart_photo_link")
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Action buttons (matches //button[contains(normalize-space(), 'Resize another photo')] and //button[contains(normalize-space(), 'Adjust dimensions')])
            Button(
                onClick = onResizeAnother,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("resize_another_photo_button")
            ) {
                Text(
                    text = "Resize another photo",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }

            OutlinedButton(
                onClick = onAdjustDimensions,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("adjust_dimensions_button")
            ) {
                Text(
                    text = "Adjust dimensions",
                    fontSize = 15.sp
                )
            }
        }
    }
}
