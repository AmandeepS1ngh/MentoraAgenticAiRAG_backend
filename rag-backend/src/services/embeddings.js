/**
 * Embedding Service
 * Generates vector embeddings using Transformers.js (local, no API needed).
 * 
 * Uses all-MiniLM-L6-v2 model which produces 384-dimensional embeddings.
 * Model is downloaded on first use (~23MB) and cached locally.
 * 
 * Benefits:
 * - No API rate limits
 * - Completely free
 * - Works offline
 * - Data stays local
 */

const logger = require('../utils/logger');

// Lazy load the pipeline to avoid blocking startup
let embeddingPipeline = null;
let pipelinePromise = null;

/**
 * Initialize the embedding pipeline (lazy loaded)
 * Uses dynamic import for ES module compatibility
 */
async function getEmbeddingPipeline() {
    if (embeddingPipeline) {
        return embeddingPipeline;
    }

    if (pipelinePromise) {
        return pipelinePromise;
    }

    pipelinePromise = (async () => {
        logger.info('Loading embedding model (first time may take 10-30 seconds)...');
        const startTime = Date.now();

        // Dynamic import for ES module
        const { pipeline } = await import('@xenova/transformers');

        // Load the feature extraction pipeline
        // all-MiniLM-L6-v2 is excellent for semantic search
        embeddingPipeline = await pipeline(
            'feature-extraction',
            'Xenova/all-MiniLM-L6-v2'
        );

        logger.info(`Embedding model loaded in ${Date.now() - startTime}ms`);
        return embeddingPipeline;
    })();

    return pipelinePromise;
}

/**
 * Generate embedding for a single text
 * 
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} Embedding vector (384 dimensions)
 */
async function generateEmbedding(text) {
    const startTime = Date.now();

    if (!text || text.trim().length === 0) {
        throw new Error('Cannot generate embedding for empty text');
    }

    try {
        const extractor = await getEmbeddingPipeline();

        // Truncate text if too long (model max is ~512 tokens)
        const truncatedText = text.slice(0, 2000);

        // Generate embedding
        const output = await extractor(truncatedText, {
            pooling: 'mean',
            normalize: true
        });

        // Convert to regular array
        const embedding = Array.from(output.data);

        logger.debug('Generated embedding', {
            inputLength: text.length,
            embeddingDimension: embedding.length,
            latencyMs: Date.now() - startTime
        });

        return embedding;

    } catch (error) {
        logger.error('Embedding generation failed', {
            error: error.message,
            inputLength: text.length
        });
        throw new Error(`Embedding failed: ${error.message}`);
    }
}

/**
 * Generate embeddings for multiple texts
 * Processes sequentially for simplicity
 * 
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function generateEmbeddings(texts) {
    const startTime = Date.now();
    const embeddings = [];

    logger.info(`Starting batch embedding for ${texts.length} chunks (local model)`);

    // Ensure model is loaded before processing
    await getEmbeddingPipeline();

    for (let i = 0; i < texts.length; i++) {
        const embedding = await generateEmbedding(texts[i]);
        embeddings.push(embedding);

        // Log progress every 10 chunks
        if ((i + 1) % 10 === 0) {
            logger.debug(`Processed ${i + 1}/${texts.length} chunks`);
        }
    }

    const totalTime = Date.now() - startTime;
    logger.info('Batch embedding completed', {
        chunkCount: texts.length,
        totalTimeMs: totalTime,
        avgTimePerChunkMs: (totalTime / texts.length).toFixed(2)
    });

    return embeddings;
}

module.exports = {
    generateEmbedding,
    generateEmbeddings,
    getEmbeddingPipeline  // Export for pre-warming
};
