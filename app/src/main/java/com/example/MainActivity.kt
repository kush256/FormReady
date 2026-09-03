package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.navigation.Screen
import com.example.viewmodel.FormReadyViewModel
import com.example.ui.screens.AboutScreen
import com.example.ui.screens.CompressPdfEmptyScreen
import com.example.ui.screens.CompressPdfInvalidFileScreen
import com.example.ui.screens.CompressPdfProcessingScreen
import com.example.ui.screens.CompressPdfResultNotMatchedScreen
import com.example.ui.screens.CompressPdfResultSuccessScreen
import com.example.ui.screens.HomeScreen
import com.example.ui.screens.ImageToPdfResultScreen
import com.example.ui.screens.ImageToPdfScreen
import com.example.ui.screens.MergePdfOneFileScreen
import com.example.ui.screens.MergePdfRefinedScreen
import com.example.ui.screens.MergePdfResultSuccessScreen
import com.example.ui.screens.RefinedCompressPdfScreen
import com.example.ui.screens.ResizePhotoResultScreen
import com.example.ui.screens.ResizePhotoScreen
import com.example.ui.screens.SignatureCameraPermissionDeniedScreen
import com.example.ui.screens.SignatureMakerScreen
import com.example.ui.screens.SignatureResultScreen
import com.example.ui.screens.SmartPhotoRequirementsScreen
import com.example.ui.screens.SmartPhotoResultScreen
import com.example.ui.screens.SplitPdfInvalidRangeScreen
import com.example.ui.screens.SplitPdfRefinedScreen
import com.example.ui.screens.SplitPdfResultSuccessScreen
import com.example.ui.theme.MyApplicationTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent {
      MyApplicationTheme {
        FormReadyApp()
      }
    }
  }
}

@Composable
fun FormReadyApp() {
  val formReadyViewModel: FormReadyViewModel = viewModel(factory = FormReadyViewModel.Factory)
  val backstack = remember { mutableStateListOf(Screen.FORM_READY_HOME) }
  val currentScreen = backstack.lastOrNull() ?: Screen.FORM_READY_HOME

  fun navigateTo(screen: Screen) {
    backstack.add(screen)
  }

  fun navigateBackTo(targetScreen: Screen) {
    val index = backstack.lastIndexOf(targetScreen)
    if (index >= 0) {
      while (backstack.size > index + 1) {
        backstack.removeAt(backstack.lastIndex)
      }
    } else {
      if (backstack.size > 1) {
        backstack.removeAt(backstack.lastIndex)
      }
      backstack.add(targetScreen)
    }
  }

  fun navigateDirect(targetScreen: Screen) {
    if (backstack.isNotEmpty()) {
      backstack[backstack.lastIndex] = targetScreen
    } else {
      backstack.add(targetScreen)
    }
  }

  BackHandler(enabled = backstack.size > 1) {
    backstack.removeAt(backstack.lastIndex)
  }

  Scaffold(
    modifier = Modifier
      .fillMaxSize()
      .safeDrawingPadding()
  ) { innerPadding ->
    Surface(
      modifier = Modifier
        .fillMaxSize()
        .padding(innerPadding),
      color = MaterialTheme.colorScheme.background
    ) {
      AnimatedContent(
        targetState = currentScreen,
        transitionSpec = {
          (slideInHorizontally { width -> width / 3 } + fadeIn())
            .togetherWith(slideOutHorizontally { width -> -width / 3 } + fadeOut())
        },
        label = "ScreenTransition"
      ) { screen ->
        when (screen) {
          Screen.FORM_READY_HOME -> HomeScreen(
            onNavigate = { target -> navigateTo(target) },
            onAboutClick = { navigateTo(Screen.ABOUT) },
            viewModel = formReadyViewModel
          )

          Screen.ABOUT -> AboutScreen(
            onBack = { navigateBackTo(Screen.FORM_READY_HOME) }
          )

          // Compress PDF flow
          Screen.COMPRESS_PDF_EMPTY -> CompressPdfEmptyScreen(
            onBack = { navigateBackTo(Screen.FORM_READY_HOME) },
            onChooseValidPdf = { navigateTo(Screen.COMPRESS_PDF_CONFIG) },
            onChooseInvalidPdf = { navigateTo(Screen.COMPRESS_PDF_INVALID_FILE) },
            viewModel = formReadyViewModel
          )

          Screen.COMPRESS_PDF_INVALID_FILE -> CompressPdfInvalidFileScreen(
            onBack = { navigateBackTo(Screen.COMPRESS_PDF_EMPTY) },
            onChooseAnother = { navigateBackTo(Screen.COMPRESS_PDF_EMPTY) },
            viewModel = formReadyViewModel
          )

          Screen.COMPRESS_PDF_CONFIG -> RefinedCompressPdfScreen(
            onBack = { navigateBackTo(Screen.COMPRESS_PDF_EMPTY) },
            onStartCompression = { navigateTo(Screen.COMPRESS_PDF_PROCESSING) },
            viewModel = formReadyViewModel
          )

          Screen.COMPRESS_PDF_PROCESSING -> CompressPdfProcessingScreen(
            onBack = { navigateBackTo(Screen.COMPRESS_PDF_CONFIG) },
            onSuccess = { navigateTo(Screen.COMPRESS_PDF_SUCCESS) },
            onNotMatched = { navigateTo(Screen.COMPRESS_PDF_NOT_MATCHED) },
            viewModel = formReadyViewModel
          )

          Screen.COMPRESS_PDF_SUCCESS -> CompressPdfResultSuccessScreen(
            onBack = { navigateBackTo(Screen.COMPRESS_PDF_CONFIG) },
            onCompressAnother = { navigateBackTo(Screen.COMPRESS_PDF_CONFIG) },
            onAdjustRequirement = { navigateBackTo(Screen.COMPRESS_PDF_CONFIG) },
            viewModel = formReadyViewModel
          )

          Screen.COMPRESS_PDF_NOT_MATCHED -> CompressPdfResultNotMatchedScreen(
            onBack = { navigateBackTo(Screen.COMPRESS_PDF_CONFIG) },
            onTryStronger = { navigateTo(Screen.COMPRESS_PDF_SUCCESS) },
            onChangeRequirement = { navigateBackTo(Screen.COMPRESS_PDF_CONFIG) },
            viewModel = formReadyViewModel
          )

          // Merge PDF flow
          Screen.MERGE_PDF -> MergePdfRefinedScreen(
            onBack = { navigateBackTo(Screen.FORM_READY_HOME) },
            onMergeSuccess = { navigateTo(Screen.MERGE_PDF_SUCCESS) },
            onOneFileError = { navigateTo(Screen.MERGE_PDF_ONE_FILE) },
            viewModel = formReadyViewModel
          )

          Screen.MERGE_PDF_ONE_FILE -> MergePdfOneFileScreen(
            onBack = { navigateBackTo(Screen.FORM_READY_HOME) },
            onAddAnotherPdf = { navigateBackTo(Screen.MERGE_PDF) },
            viewModel = formReadyViewModel
          )

          Screen.MERGE_PDF_SUCCESS -> MergePdfResultSuccessScreen(
            onBack = { navigateBackTo(Screen.MERGE_PDF) },
            onMergeAnother = { navigateBackTo(Screen.MERGE_PDF) },
            onAdjustPdfs = { navigateBackTo(Screen.MERGE_PDF) },
            viewModel = formReadyViewModel
          )

          // Split PDF flow
          Screen.SPLIT_PDF -> SplitPdfRefinedScreen(
            onBack = { navigateBackTo(Screen.FORM_READY_HOME) },
            onSplitSuccess = { navigateTo(Screen.SPLIT_PDF_SUCCESS) },
            onInvalidRange = { navigateDirect(Screen.SPLIT_PDF_INVALID_RANGE) },
            viewModel = formReadyViewModel
          )

          Screen.SPLIT_PDF_INVALID_RANGE -> SplitPdfInvalidRangeScreen(
            onBack = { navigateBackTo(Screen.SPLIT_PDF) },
            onChangePdf = { navigateBackTo(Screen.SPLIT_PDF) },
            onSelectAll = { navigateDirect(Screen.SPLIT_PDF) },
            viewModel = formReadyViewModel
          )

          Screen.SPLIT_PDF_SUCCESS -> SplitPdfResultSuccessScreen(
            onBack = { navigateBackTo(Screen.SPLIT_PDF) },
            onSplitAnother = { navigateBackTo(Screen.SPLIT_PDF) },
            onAdjustPages = { navigateBackTo(Screen.SPLIT_PDF) },
            viewModel = formReadyViewModel
          )

          // Smart Photo flow
          Screen.SMART_PHOTO_REQUIREMENTS -> SmartPhotoRequirementsScreen(
            onBack = { navigateBackTo(Screen.FORM_READY_HOME) },
            onMakeItFit = { navigateTo(Screen.SMART_PHOTO_RESULT) },
            viewModel = formReadyViewModel
          )

          Screen.SMART_PHOTO_RESULT -> SmartPhotoResultScreen(
            onBack = { navigateBackTo(Screen.SMART_PHOTO_REQUIREMENTS) },
            onPrepareAnother = { navigateBackTo(Screen.SMART_PHOTO_REQUIREMENTS) },
            onAdjustRequirements = { navigateBackTo(Screen.SMART_PHOTO_REQUIREMENTS) },
            viewModel = formReadyViewModel
          )

          // Resize Photo flow
          Screen.RESIZE_PHOTO -> ResizePhotoScreen(
            onBack = { navigateBackTo(Screen.FORM_READY_HOME) },
            onResizeSuccess = { navigateTo(Screen.RESIZE_PHOTO_RESULT) },
            onUseSmartPhoto = { navigateTo(Screen.SMART_PHOTO_REQUIREMENTS) },
            viewModel = formReadyViewModel
          )

          Screen.RESIZE_PHOTO_RESULT -> ResizePhotoResultScreen(
            onBack = { navigateBackTo(Screen.RESIZE_PHOTO) },
            onResizeAnother = { navigateBackTo(Screen.RESIZE_PHOTO) },
            onAdjustDimensions = { navigateBackTo(Screen.RESIZE_PHOTO) },
            onUseSmartPhoto = { navigateTo(Screen.SMART_PHOTO_REQUIREMENTS) },
            viewModel = formReadyViewModel
          )

          // Signature flow
          Screen.SIGNATURE_MAKER -> SignatureMakerScreen(
            onBack = { navigateBackTo(Screen.FORM_READY_HOME) },
            onTakePhoto = { navigateTo(Screen.SIGNATURE_CAMERA_PERMISSION_DENIED) },
            onPrepareSignature = { navigateTo(Screen.SIGNATURE_RESULT) },
            viewModel = formReadyViewModel
          )

          Screen.SIGNATURE_CAMERA_PERMISSION_DENIED -> SignatureCameraPermissionDeniedScreen(
            onBack = { navigateBackTo(Screen.SIGNATURE_MAKER) },
            onChooseFromGallery = { navigateTo(Screen.SIGNATURE_RESULT) },
            viewModel = formReadyViewModel
          )

          Screen.SIGNATURE_RESULT -> SignatureResultScreen(
            onBack = { navigateBackTo(Screen.SIGNATURE_MAKER) },
            onPrepareAnother = { navigateBackTo(Screen.SIGNATURE_MAKER) },
            onAdjustRequirements = { navigateBackTo(Screen.SIGNATURE_MAKER) },
            viewModel = formReadyViewModel
          )

          // Image to PDF flow
          Screen.IMAGE_TO_PDF -> ImageToPdfScreen(
            onBack = { navigateBackTo(Screen.FORM_READY_HOME) },
            onCreatePdf = { navigateTo(Screen.IMAGE_TO_PDF_RESULT) },
            viewModel = formReadyViewModel
          )

          Screen.IMAGE_TO_PDF_RESULT -> ImageToPdfResultScreen(
            onBack = { navigateBackTo(Screen.IMAGE_TO_PDF) },
            onCreateAnotherPdf = { navigateBackTo(Screen.IMAGE_TO_PDF) },
            onAdjustPdf = { navigateBackTo(Screen.IMAGE_TO_PDF) },
            viewModel = formReadyViewModel
          )
        }
      }
    }
  }
}

@Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
  androidx.compose.material3.Text(text = "Hello $name!", modifier = modifier)
}
