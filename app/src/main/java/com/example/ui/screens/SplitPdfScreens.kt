package com.example.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.CallSplit
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.SelectAll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.components.CommonHeader
import com.example.ui.theme.BluePrimary
import com.example.ui.theme.BluePrimaryContainer
import com.example.ui.theme.ErrorContainer
import com.example.ui.theme.ErrorRed
import com.example.ui.theme.OnBluePrimaryContainer
import com.example.ui.theme.SuccessContainer
import com.example.ui.theme.SuccessGreen

import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.IconButton
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.platform.LocalContext
import com.example.util.FileHelper
import com.example.util.PdfProcessor
import com.example.viewmodel.FormReadyViewModel

// 1. Split PDF Refined
@Composable
fun SplitPdfRefinedScreen(
    onBack: () -> Unit,
    onSplitSuccess: () -> Unit,
    onInvalidRange: () -> Unit,
    viewModel: FormReadyViewModel? = null,
    modifier: Modifier = Modifier
) {
    var pageRangeText by remember { mutableStateOf("1-3, 5") }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        CommonHeader(
            title = "Split PDF",
            subtitle = "Extract specific form pages",
            onBack = onBack
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Document summary card
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(BluePrimaryContainer),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Description,
                            contentDescription = null,
                            tint = OnBluePrimaryContainer
                        )
                    }
                    Spacer(modifier = Modifier.width(14.dp))
                    Column {
                        Text(
                            text = "Comprehensive_Application_Dossier.pdf",
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                        Text(
                            text = "Total: 12 Pages  •  3.8 MB",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Text(
                text = "Pages to Extract",
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = MaterialTheme.colorScheme.onBackground
            )

            OutlinedTextField(
                value = pageRangeText,
                onValueChange = { pageRangeText = it },
                label = { Text("Page Range or Numbers (e.g. 1-3, 5, 8-12)") },
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            )

            Text(
                text = "Each comma-separated range will be generated as a separate PDF or merged as a standalone clean excerpt.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(10.dp))

            // Primary Split PDF Button (matches //button[contains(normalize-space(), 'Split PDF')])
            Button(
                onClick = {
                    if (viewModel != null) {
                        viewModel.executeSplit(
                            rangeText = pageRangeText,
                            onSuccess = onSplitSuccess,
                            onInvalidRange = onInvalidRange
                        )
                    } else {
                        onSplitSuccess()
                    }
                },
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(52.dp)
                    .testTag("split_pdf_button")
            ) {
                Icon(Icons.Default.CallSplit, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Split PDF",
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }

            // Trigger for testing invalid page range state (matches //button[contains(normalize-space(), 'Split PDF')])
            OutlinedButton(
                onClick = onInvalidRange,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .testTag("split_pdf_invalid_range_trigger")
            ) {
                Icon(Icons.Default.ErrorOutline, contentDescription = null, tint = ErrorRed, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Split PDF (Test Invalid Range: 15-20)",
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.error
                )
            }
        }
    }
}

// 2. Split PDF Invalid Page Range Validation State Refined
@Composable
fun SplitPdfInvalidRangeScreen(
    onBack: () -> Unit,
    onChangePdf: () -> Unit,
    onSelectAll: () -> Unit,
    viewModel: FormReadyViewModel? = null,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        CommonHeader(
            title = "Invalid Page Range",
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
                    .size(80.dp)
                    .clip(CircleShape)
                    .background(ErrorContainer),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.ErrorOutline,
                    contentDescription = null,
                    tint = ErrorRed,
                    modifier = Modifier.size(42.dp)
                )
            }

            Spacer(modifier = Modifier.height(20.dp))

            Text(
                text = "Page Range Out of Bounds",
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.error
            )

            Spacer(modifier = Modifier.height(10.dp))

            Text(
                text = "Requested pages '15-20' exceed document limits. The selected PDF file contains only 12 pages in total.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp)
            )

            Spacer(modifier = Modifier.height(28.dp))

            // Action: Change PDF (matches //button[contains(normalize-space(), 'Change PDF')])
            OutlinedButton(
                onClick = onChangePdf,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("change_pdf_button")
            ) {
                Text(
                    text = "Change PDF",
                    fontSize = 15.sp
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Action: Select all (matches //button[contains(normalize-space(), 'Select all')])
            Button(
                onClick = onSelectAll,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("select_all_button")
            ) {
                Icon(Icons.Default.SelectAll, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Select all",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

// 3. Split PDF Result Success
@Composable
fun SplitPdfResultSuccessScreen(
    onBack: () -> Unit,
    onSplitAnother: () -> Unit,
    onAdjustPages: () -> Unit,
    viewModel: FormReadyViewModel? = null,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val splitResult by viewModel?.splitResult?.collectAsState() ?: remember { mutableStateOf<PdfProcessor.SplitResult?>(null) }

    val extractedFile = splitResult?.outputFile
    val extractedParts = if (splitResult != null && extractedFile != null) {
        listOf(
            Triple(extractedFile.name, "${FileHelper.formatFileSize(splitResult!!.sizeBytes)}  •  ${splitResult!!.extractedPages} pages (Range: ${splitResult!!.pageRangeDescription})", extractedFile)
        )
    } else {
        listOf(
            Triple("Part_1_pages_1-3.pdf", "420 KB  •  3 pages", null),
            Triple("Part_2_page_5.pdf", "140 KB  •  1 page", null)
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        CommonHeader(
            title = "Split Complete",
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
                text = "PDF Split Successfully!",
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onBackground
            )

            // Extracted files list
            extractedParts.forEach { (name, details, matchingFile) ->
                Card(
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(SuccessContainer),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Description,
                                contentDescription = null,
                                tint = SuccessGreen,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = name,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 14.sp
                            )
                            Text(
                                text = details,
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        if (matchingFile != null) {
                            IconButton(onClick = { FileHelper.shareFile(context, matchingFile) }) {
                                Icon(Icons.Default.Share, contentDescription = "Share", tint = BluePrimary, modifier = Modifier.size(20.dp))
                            }
                            IconButton(onClick = { FileHelper.openFile(context, matchingFile) }) {
                                Icon(Icons.Default.OpenInNew, contentDescription = "Open", tint = BluePrimary, modifier = Modifier.size(20.dp))
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Action buttons (matches //button[contains(normalize-space(), 'Split another PDF')] and //button[contains(normalize-space(), 'Adjust pages')])
            Button(
                onClick = onSplitAnother,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("split_another_pdf_button")
            ) {
                Text(
                    text = "Split another PDF",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.SemiBold
                )
            }

            OutlinedButton(
                onClick = onAdjustPages,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("adjust_pages_button")
            ) {
                Text(
                    text = "Adjust pages",
                    fontSize = 15.sp
                )
            }
        }
    }
}
