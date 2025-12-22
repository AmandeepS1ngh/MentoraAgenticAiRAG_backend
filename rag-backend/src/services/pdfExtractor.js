/**
 * PDF Text Extraction Service
 * Extracts plain text from PDF files for chunking and embedding.
 * 
 * TODO: Add OCR support for scanned PDFs (using Tesseract.js)
 * TODO: Implement async processing for large files
 * TODO: Add support for other document formats (DOCX, TXT, HTML)
 * TODO: Extract metadata (title, author, page numbers)
 * TODO: Preserve document structure (headings, paragraphs)
 */

const pdfParse = require('pdf-parse');
const logger = require('../utils/logger');

/**
 * Extract text from a PDF buffer
 * 
 * @param {Buffer} pdfBuffer - PDF file buffer
 * @returns {Promise<{text: string, pageCount: number, info: Object}>}
 * 
 * WARNING: This is synchronous and blocks the event loop for large files
 * TODO: Move to worker thread for CPU-intensive processing
 */
async function extractText(pdfBuffer) {
    const startTime = Date.now();

    if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('Empty or invalid PDF buffer');
    }

    logger.debug('Starting PDF extraction', { bufferSize: pdfBuffer.length });

    try {
        // pdf-parse options
        // TODO: Add custom render function for better text extraction
        const options = {
            // Max pages to process (0 = all)
            max: 0,
            // TODO: Add page range support
        };

        const data = await pdfParse(pdfBuffer, options);

        const result = {
            text: data.text,
            pageCount: data.numpages,
            info: {
                title: data.info?.Title || null,
                author: data.info?.Author || null,
                creator: data.info?.Creator || null
            }
        };

        const processingTime = Date.now() - startTime;

        logger.info('PDF extraction completed', {
            pageCount: result.pageCount,
            textLength: result.text.length,
            processingTimeMs: processingTime
        });

        // TODO: Add quality check - warn if text/page ratio is suspiciously low
        // (might indicate scanned PDF needing OCR)
        const avgCharsPerPage = result.text.length / result.pageCount;
        if (avgCharsPerPage < 100) {
            logger.warn('Low text density detected - PDF might be scanned/image-based', {
                avgCharsPerPage
            });
        }

        return result;

    } catch (error) {
        logger.error('PDF extraction failed', {
            error: error.message,
            bufferSize: pdfBuffer.length
        });
        throw new Error(`PDF extraction failed: ${error.message}`);
    }
}

/**
 * Validate that buffer is a valid PDF
 * @param {Buffer} buffer - File buffer to validate
 * @returns {boolean}
 */
function isValidPdf(buffer) {
    // Check PDF magic bytes: %PDF-
    if (buffer.length < 5) return false;

    const header = buffer.slice(0, 5).toString('ascii');
    return header === '%PDF-';
}

module.exports = {
    extractText,
    isValidPdf
};
