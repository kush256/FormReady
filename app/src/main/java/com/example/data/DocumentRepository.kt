package com.example.data

import kotlinx.coroutines.flow.Flow

class DocumentRepository(private val documentDao: DocumentDao) {
    val allDocuments: Flow<List<DocumentEntity>> = documentDao.getAllDocuments()

    suspend fun insert(document: DocumentEntity): Long {
        return documentDao.insertDocument(document)
    }

    suspend fun deleteById(id: Long) {
        documentDao.deleteDocument(id)
    }

    suspend fun clearAll() {
        documentDao.clearAll()
    }
}
