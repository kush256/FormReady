package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "prepared_documents")
data class DocumentEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val title: String,
    val type: String, // "COMPRESS_PDF", "MERGE_PDF", "SPLIT_PDF", "SMART_PHOTO", "RESIZE_PHOTO", "SIGNATURE", "IMAGE_TO_PDF"
    val details: String,
    val filePath: String,
    val timestamp: Long = System.currentTimeMillis()
)
