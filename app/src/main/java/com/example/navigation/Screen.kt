package com.example.navigation

enum class Screen(val title: String) {
    FORM_READY_HOME("FormReady Home Refined"),
    COMPRESS_PDF_EMPTY("Compress PDF Empty State"),
    COMPRESS_PDF_CONFIG("Refined Compress PDF"),
    COMPRESS_PDF_PROCESSING("Compress PDF Processing State Refined"),
    COMPRESS_PDF_SUCCESS("Compress PDF Result Success"),
    COMPRESS_PDF_NOT_MATCHED("Compress PDF Result Not Matched"),
    COMPRESS_PDF_INVALID_FILE("Compress PDF Invalid File Error State"),
    MERGE_PDF("Merge PDF Refined"),
    MERGE_PDF_ONE_FILE("Merge PDF One File Validation State"),
    MERGE_PDF_SUCCESS("Merge PDF Result Success Fresh"),
    SPLIT_PDF("Split PDF Refined"),
    SPLIT_PDF_INVALID_RANGE("Split PDF Invalid Page Range Validation State Refined"),
    SPLIT_PDF_SUCCESS("Split PDF Result Success"),
    SMART_PHOTO_REQUIREMENTS("Refined Smart Photo Requirements"),
    SMART_PHOTO_RESULT("Refined Smart Photo Result"),
    RESIZE_PHOTO("Corrected Resize Photo"),
    RESIZE_PHOTO_RESULT("Refined Resize Photo Result"),
    SIGNATURE_MAKER("Refined Signature Maker"),
    SIGNATURE_CAMERA_PERMISSION_DENIED("Signature Maker Camera Permission Denied"),
    SIGNATURE_RESULT("Refined Signature Result"),
    IMAGE_TO_PDF("Refined Image to PDF"),
    IMAGE_TO_PDF_RESULT("Image to PDF Result")
}
