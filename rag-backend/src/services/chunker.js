/**
 * Text Chunking Service
 * Splits text into fixed-size chunks for embedding.
 * 
 * TODO: Implement semantic chunking (respect sentence/paragraph boundaries)
 * TODO: Add recursive chunking based on content type
 * TODO: Support different chunking strategies (sliding window, hierarchical)
 * TODO: Add chunk deduplication
 * TODO: Consider using LangChain text splitters for better results
 */

const logger = require('../utils/logger');
const config = require('../config');

/**
 * Split text into fixed-size chunks with overlap
 * 
 * @param {string} text - Text to split
 * @param {Object} options - Chunking options
 * @param {number} options.chunkSize - Size of each chunk in characters
 * @param {number} options.overlap - Overlap between chunks in characters
 * @returns {Array<{content: string, index: number, startChar: number, endChar: number}>}
 * 
 * WARNING: This naive approach may split words and sentences mid-way
 * TODO: Implement sentence-aware splitting
 */
function chunkText(text, options = {}) {
    const startTime = Date.now();

    const chunkSize = options.chunkSize || config.rag.chunkSize;
    const overlap = options.overlap || config.rag.chunkOverlap;

    if (!text || text.trim().length === 0) {
        logger.warn('Empty text provided for chunking');
        return [];
    }

    // Normalize whitespace
    // TODO: Consider preserving formatting in some cases
    const normalizedText = text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const chunks = [];
    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < normalizedText.length) {
        let endIndex = Math.min(startIndex + chunkSize, normalizedText.length);

        // TODO: Try to end at sentence boundary
        // This is a naive approach that doesn't respect sentence boundaries
        // A better approach would be to find the nearest sentence end

        const chunkContent = normalizedText.slice(startIndex, endIndex);

        // Skip empty or whitespace-only chunks
        if (chunkContent.trim().length > 0) {
            chunks.push({
                content: chunkContent,
                index: chunkIndex,
                startChar: startIndex,
                endChar: endIndex
            });
            chunkIndex++;
        }

        // Move to next chunk position (subtract overlap)
        startIndex = endIndex - overlap;

        // Safety check to avoid infinite loop
        if (startIndex >= normalizedText.length || endIndex === normalizedText.length) {
            break;
        }
    }

    const processingTime = Date.now() - startTime;

    logger.info('Text chunking completed', {
        inputLength: text.length,
        chunkCount: chunks.length,
        chunkSize,
        overlap,
        processingTimeMs: processingTime
    });

    // TODO: Warn if chunks are too small or too large
    const avgChunkSize = chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length;
    if (avgChunkSize < 100) {
        logger.warn('Average chunk size is very small', { avgChunkSize });
    }

    return chunks;
}

/**
 * Clean and preprocess text before chunking
 * @param {string} text - Raw text
 * @returns {string} Cleaned text
 */
function preprocessText(text) {
    return text
        // Remove excessive whitespace
        .replace(/[ \t]+/g, ' ')
        // Normalize line endings
        .replace(/\r\n/g, '\n')
        // Remove null characters
        .replace(/\0/g, '')
        // Trim
        .trim();
}

module.exports = {
    chunkText,
    preprocessText
};
