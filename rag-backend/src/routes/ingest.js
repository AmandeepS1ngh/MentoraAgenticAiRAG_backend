/**
 * Ingest Route
 * Handles PDF upload, text extraction, chunking, embedding, and storage.
 * 
 * POST /ingest
 * - Accepts multipart/form-data with 'file' field (PDF)
 * - Returns: document ID, chunk count, processing time
 * 
 * TODO: Add support for multiple file uploads
 * TODO: Implement async processing with job queue
 * TODO: Add progress tracking for large files
 * TODO: Support other file formats (DOCX, TXT, HTML)
 */

const express = require('express');
const multer = require('multer');
const router = express.Router();

const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const { extractText, isValidPdf } = require('../services/pdfExtractor');
const { chunkText, preprocessText } = require('../services/chunker');
const { generateEmbeddings } = require('../services/embeddings');
const { createDocument, insertChunks } = require('../db/supabase');
const logger = require('../utils/logger');

// Configure multer for file uploads
// TODO: Add file size limits and validation
// TODO: Consider streaming upload for large files
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new AppError('Only PDF files are allowed', 400), false);
        }
    }
});

/**
 * POST /ingest
 * Upload and process a PDF document
 */
router.post('/', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const timings = {};

    logger.info('Received upload request', { userId: req.userId });

    // Validate file upload
    if (!req.file) {
        logger.error('No file uploaded');
        throw new AppError('No file uploaded. Please upload a PDF file.', 400);
    }

    const pdfBuffer = req.file.buffer;
    const fileName = req.file.originalname;

    logger.info('Starting document ingestion', {
        fileName,
        fileSize: pdfBuffer.length
    });

    try {
        // Validate PDF structure
        if (!isValidPdf(pdfBuffer)) {
            logger.error('Invalid PDF format');
            throw new AppError('Invalid PDF file format', 400);
        }

        // Step 1: Extract text from PDF
        logger.info('Step 1: Extracting text...');
        let extractStart = Date.now();
        const { text, pageCount, info } = await extractText(pdfBuffer);
        timings.extraction = Date.now() - extractStart;
        logger.info(`Text extracted: ${pageCount} pages, ${text.length} chars`);

        if (!text || text.trim().length === 0) {
            throw new AppError('Could not extract text from PDF. It may be scanned or image-based.', 422);
        }

        // Step 2: Preprocess and chunk text
        logger.info('Step 2: Chunking text...');
        let chunkStart = Date.now();
        const cleanedText = preprocessText(text);
        const chunks = chunkText(cleanedText);
        timings.chunking = Date.now() - chunkStart;
        logger.info(`Created ${chunks.length} chunks`);

        if (chunks.length === 0) {
            throw new AppError('No valid chunks could be created from the document', 422);
        }

        // Step 3: Generate embeddings for chunks
        logger.info('Step 3: Generating embeddings (this may take a while)...');
        let embedStart = Date.now();
        const chunkContents = chunks.map(c => c.content);
        // Add timeout/race if needed, but for now just await
        const embeddings = await generateEmbeddings(chunkContents);
        timings.embedding = Date.now() - embedStart;
        logger.info('Embeddings generated successfully');

        // Step 4: Store document and chunks in Supabase
        logger.info('Step 4: Storing in Supabase...');
        let storeStart = Date.now();

        // Create parent document record with user_id
        const document = await createDocument(fileName, req.userId);
        logger.info(`Document created with ID: ${document.id}`, { userId: req.userId });

        // Combine chunks with embeddings
        const chunksWithEmbeddings = chunks.map((chunk, index) => ({
            content: chunk.content,
            embedding: embeddings[index]
        }));

        // Insert chunks with embeddings and user_id
        await insertChunks(document.id, chunksWithEmbeddings, req.userId);
        timings.storage = Date.now() - storeStart;
        logger.info('Storage completed');

        const totalTime = Date.now() - startTime;

        logger.info('Document ingestion completed successfully', {
            documentId: document.id,
            fileName,
            totalTimeMs: totalTime
        });

        // Return success response
        res.status(201).json({
            success: true,
            data: {
                documentId: document.id,
                fileName,
                pageCount,
                chunkCount: chunks.length,
                documentInfo: info
            },
            metrics: {
                totalTimeMs: totalTime,
                timings: {
                    extractionMs: timings.extraction,
                    chunkingMs: timings.chunking,
                    embeddingMs: timings.embedding,
                    storageMs: timings.storage
                }
            }
        });
    } catch (error) {
        logger.error('Ingestion failed at specific step', {
            step: error.step || 'unknown',
            message: error.message,
            stack: error.stack
        });
        throw error; // Re-throw to be caught by global handler
    }
}));

module.exports = router;
