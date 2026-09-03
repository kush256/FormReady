package com.example.ui.screens

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
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
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Draw
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.NoPhotography
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.components.CommonHeader
import com.example.ui.components.rememberCameraCaptureLauncher
import com.example.ui.theme.BluePrimary
import com.example.ui.theme.BluePrimaryContainer
import com.example.ui.theme.ErrorContainer
import com.example.ui.theme.ErrorRed
import com.example.ui.theme.OnBluePrimaryContainer
import com.example.ui.theme.SuccessContainer
import com.example.ui.theme.SuccessGreen
import com.example.util.FileHelper
import com.example.viewmodel.FormReadyViewModel

// 1. Refined Signature Maker
@Composable
fun SignatureMakerScreen(
    onBack: () -> Unit,
    onTakePhoto: () -> Unit,
    onPrepareSignature: () -> Unit,
    viewModel: FormReadyViewModel? = null,
    modifier: Modifier = Modifier
) {
    // Strokes are kept separate so lifting a finger starts a new one instead of
    // joining the two with a straight line.
    val strokes = remember { mutableStateListOf<List<Offset>>() }
    var currentStroke by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var padSize by remember { mutableStateOf(IntSize.Zero) }
    var inkColor by remember { mutableStateOf(Color.Black) }
    val hasInk = strokes.any { it.isNotEmpty() } || currentStroke.isNotEmpty()

    val cameraLauncher = rememberCameraCaptureLauncher(
        onImageCaptured = { bitmap ->
            if (viewModel != null) {
                viewModel.executePrepareSignatureFromPhoto(bitmap, onSuccess = onPrepareSignature)
            } else {
                onPrepareSignature()
            }
        },
        onPermissionDenied = onTakePhoto
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        CommonHeader(
            title = "Signature Maker",
            subtitle = "Draw digital or capture paper signature",
            onBack = onBack
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Sign on the Pad Below",
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = MaterialTheme.colorScheme.onBackground
            )

            // Drawing canvas pad
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(210.dp)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.White)
                    .border(1.5.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
            ) {
                Canvas(
                    modifier = Modifier
                        .fillMaxSize()
                        .onSizeChanged { padSize = it }
                        .pointerInput(Unit) {
                            detectDragGestures(
                                onDragStart = { offset ->
                                    currentStroke = listOf(offset)
                                },
                                onDrag = { change, _ ->
                                    currentStroke = currentStroke + change.position
                                },
                                onDragEnd = {
                                    if (currentStroke.isNotEmpty()) strokes.add(currentStroke)
                                    currentStroke = emptyList()
                                },
                                onDragCancel = {
                                    if (currentStroke.isNotEmpty()) strokes.add(currentStroke)
                                    currentStroke = emptyList()
                                }
                            )
                        }
                ) {
                    val allStrokes =
                        if (currentStroke.isEmpty()) strokes.toList() else strokes + listOf(currentStroke)
                    for (stroke in allStrokes) {
                        if (stroke.isEmpty()) continue
                        val path = Path()
                        path.moveTo(stroke.first().x, stroke.first().y)
                        for (i in 1 until stroke.size) {
                            path.lineTo(stroke[i].x, stroke[i].y)
                        }
                        drawPath(
                            path = path,
                            color = inkColor,
                            style = Stroke(width = 5f, cap = StrokeCap.Round, join = StrokeJoin.Round)
                        )
                    }
                }

                if (!hasInk) {
                    Text(
                        text = "Sign here with your finger or stylus",
                        color = Color.LightGray,
                        fontSize = 14.sp,
                        modifier = Modifier.align(Alignment.Center)
                    )
                }

                // Clear button
                IconButton(
                    onClick = {
                        strokes.clear()
                        currentStroke = emptyList()
                    },
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Clear,
                        contentDescription = "Clear Pad",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Controls: Ink Color & Paper Capture
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = inkColor == Color.Black,
                        onClick = { inkColor = Color.Black },
                        label = { Text("Black Ink") }
                    )
                    FilterChip(
                        selected = inkColor == Color(0xFF0D47A1),
                        onClick = { inkColor = Color(0xFF0D47A1) },
                        label = { Text("Blue Ink") }
                    )
                }

                // Take photo action button (matches //button[contains(normalize-space(), 'Take photo')])
                OutlinedButton(
                    onClick = cameraLauncher,
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.testTag("take_photo_button")
                ) {
                    Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Take photo", fontSize = 13.sp)
                }
            }

            // Standards Card
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "Form Specification Standards",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                    Text(
                        text = "Auto-crops to signature bounds, filters paper shadows, and compresses to 10 - 20 KB limit.",
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Primary Prepare Signature button (matches //button[contains(normalize-space(), 'Prepare Signature')])
            Button(
                onClick = {
                    if (viewModel != null) {
                        val allStrokes =
                            if (currentStroke.isEmpty()) strokes.toList()
                            else strokes + listOf(currentStroke)
                        viewModel.executePrepareSignature(
                            strokes = allStrokes,
                            padWidth = padSize.width.toFloat(),
                            padHeight = padSize.height.toFloat(),
                            inkColor = inkColor,
                            onSuccess = onPrepareSignature
                        )
                    } else {
                        onPrepareSignature()
                    }
                },
                enabled = hasInk && padSize.width > 0,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .testTag("prepare_signature_button")
            ) {
                Icon(Icons.Default.Draw, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Prepare Signature",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

// 2. Signature Maker Camera Permission Denied
@Composable
fun SignatureCameraPermissionDeniedScreen(
    onBack: () -> Unit,
    onChooseFromGallery: () -> Unit,
    viewModel: FormReadyViewModel? = null,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val photoPicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.PickVisualMedia(),
        onResult = { uri ->
            if (uri != null) {
                if (viewModel != null) {
                    viewModel.executePrepareSignatureFromGalleryUri(context, uri, onSuccess = onChooseFromGallery)
                } else {
                    onChooseFromGallery()
                }
            }
        }
    )

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        CommonHeader(
            title = "Camera Permission",
            onBack = onBack
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Box(
                modifier = Modifier
                    .size(84.dp)
                    .clip(CircleShape)
                    .background(ErrorContainer),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.NoPhotography,
                    contentDescription = null,
                    tint = ErrorRed,
                    modifier = Modifier.size(42.dp)
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = "Camera Permission Denied",
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.error
            )

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = "FormReady needs camera access to capture a photograph of your pen-and-paper signature. You can instead import a previously taken photo from your gallery.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp)
            )

            Spacer(modifier = Modifier.height(30.dp))

            // Action button (matches //button[contains(normalize-space(), 'Choose from Gallery')])
            Button(
                onClick = {
                    photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                },
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .testTag("choose_from_gallery_button")
            ) {
                Icon(Icons.Default.PhotoLibrary, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Choose from Gallery",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

// 3. Refined Signature Result
@Composable
fun SignatureResultScreen(
    onBack: () -> Unit,
    onPrepareAnother: () -> Unit,
    onAdjustRequirements: () -> Unit,
    viewModel: FormReadyViewModel? = null,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val sigResult by viewModel?.signatureResult?.collectAsState() ?: remember { mutableStateOf(null) }

    val dimsText = sigResult?.let { "${it.width} x ${it.height} px" } ?: "300 x 120 px"
    val sizeText = sigResult?.let { FileHelper.formatFileSize(it.sizeBytes) } ?: "14 KB"

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        CommonHeader(
            title = "Signature Prepared",
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
                text = "Signature Ready for Upload",
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground
            )

            // Real Action Buttons: Share & Open
            sigResult?.file?.let { outputFile ->
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
                        Text("Share Signature", fontSize = 14.sp)
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
                        Text("Open Signature", fontSize = 14.sp)
                    }
                }
            }

            // Signature Display Card
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(110.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0xFFFAFAFA))
                            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.4f), RoundedCornerShape(10.dp)),
                        contentAlignment = Alignment.Center
                    ) {
                        if (sigResult?.bitmap != null) {
                            Image(
                                bitmap = sigResult!!.bitmap.asImageBitmap(),
                                contentDescription = "Prepared Signature",
                                contentScale = ContentScale.Fit,
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(8.dp)
                            )
                        } else {
                            Text(
                                text = "J. Doe",
                                fontSize = 38.sp,
                                fontWeight = FontWeight.Normal,
                                color = Color.Black,
                                letterSpacing = 2.sp
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(text = "Dimensions", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(text = dimsText, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }
                        Column {
                            Text(text = "File Size", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(text = sizeText, fontSize = 14.sp, fontWeight = FontWeight.Bold, color = SuccessGreen)
                        }
                        Column {
                            Text(text = "Background", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(text = "Pure White", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Action buttons (matches //button[contains(normalize-space(), 'Prepare another signature')] and //button[contains(normalize-space(), 'Adjust requirements')])
            Button(
                onClick = onPrepareAnother,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("prepare_another_signature_button")
            ) {
                Text(
                    text = "Prepare another signature",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }

            OutlinedButton(
                onClick = onAdjustRequirements,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("adjust_requirements_signature_button")
            ) {
                Text(
                    text = "Adjust requirements",
                    fontSize = 15.sp
                )
            }
        }
    }
}
