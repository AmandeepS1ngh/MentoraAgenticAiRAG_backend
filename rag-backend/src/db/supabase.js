/**
 * Supabase Database Client
 * Handles vector storage and similarity search operations.
 * 
 * TODO: Add connection pooling for high-traffic scenarios
 * TODO: Implement batch insert for better performance
 * TODO: Add retry logic for transient failures
 * TODO: Consider using prepared statements
 * TODO: Add database health check endpoint
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const logger = require('../utils/logger');

// Initialize Supabase client
// TODO: Consider using service role key for server-side operations
const supabase = createClient(
    config.supabase.url,
    config.supabase.anonKey
);

/**
 * Create a new document record
 * @param {string} title - Document title/filename
 * @returns {Promise<Object>} Created document record
 */
async function createDocument(title) {
    const startTime = Date.now();

    const { data, error } = await supabase
        .from('documents')
        .insert({ title })
        .select()
        .single();

    if (error) {
        logger.error('Failed to create document', { error: error.message, title });
        throw new Error(`Database error: ${error.message}`);
    }

    logger.debug(`Created document in ${Date.now() - startTime}ms`, { documentId: data.id });
    return data;
}

/**
 * Insert chunks with embeddings for a document
 * WARNING: This is intentionally synchronous/sequential for simplicity
 * 
 * @param {string} documentId - Parent document ID
 * @param {Array<{content: string, embedding: number[]}>} chunks - Chunks with embeddings
 * @returns {Promise<Array>} Inserted chunk records
 * 
 * TODO: Implement batch insert using Supabase's bulk insert
 * TODO: Add transaction support for atomic operations
 * TODO: Consider using COPY for large batch inserts
 */
async function insertChunks(documentId, chunks) {
    const startTime = Date.now();
    const insertedChunks = [];

    // TODO: This is intentionally sequential - should be batched in production
    for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        const { data, error } = await supabase
            .from('document_chunks')
            .insert({
                document_id: documentId,
                content: chunk.content,
                embedding: chunk.embedding,
                metadata: {
                    chunkIndex: i,
                    charCount: chunk.content.length
                }
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to insert chunk', {
                error: error.message,
                documentId,
                chunkIndex: i
            });
            // TODO: Implement proper rollback on partial failure
            throw new Error(`Failed to insert chunk ${i}: ${error.message}`);
        }

        insertedChunks.push(data);
    }

    logger.info(`Inserted ${chunks.length} chunks in ${Date.now() - startTime}ms`, {
        documentId,
        chunkCount: chunks.length
    });

    return insertedChunks;
}

/**
 * Perform vector similarity search
 * Uses pgvector's cosine similarity for semantic search
 * 
 * @param {number[]} queryEmbedding - Query vector
 * @param {number} limit - Number of results to return
 * @returns {Promise<Array>} Top-K similar chunks with scores
 * 
 * TODO: Add filtering by document ID or metadata
 * TODO: Implement hybrid search (vector + keyword)
 * TODO: Add caching for frequent queries
 */
async function searchSimilar(queryEmbedding, limit = 5) {
    const startTime = Date.now();

    logger.debug('Searching with embedding', {
        embeddingLength: queryEmbedding.length
    });

    try {
        // Get all chunks with embeddings from database
        const { data: allChunks, error } = await supabase
            .from('document_chunks')
            .select('id, document_id, content, metadata, embedding')
            .not('embedding', 'is', null);
        
        if (error) {
            logger.error('Failed to fetch chunks', { error: error.message });
            throw error;
        }
        
        if (!allChunks || allChunks.length === 0) {
            logger.warn('No chunks found in database');
            return [];
        }
        
        logger.debug(`Found ${allChunks.length} chunks, computing similarities...`);
        
        // Compute cosine similarity for each chunk
        const results = allChunks.map(chunk => {
            // Parse embedding if it's a string
            let storedEmbedding = chunk.embedding;
            if (typeof storedEmbedding === 'string') {
                try {
                    storedEmbedding = JSON.parse(storedEmbedding.replace(/[\[\]]/g, m => m));
                } catch (e) {
                    storedEmbedding = storedEmbedding
                        .replace('[', '')
                        .replace(']', '')
                        .split(',')
                        .map(Number);
                }
            }
            
            const similarity = cosineSimilarity(queryEmbedding, storedEmbedding);
            return {
                id: chunk.id,
                document_id: chunk.document_id,
                content: chunk.content,
                metadata: chunk.metadata,
                similarity: similarity * 100  // Convert to percentage
            };
        });
        
        // Sort by similarity (descending) and take top K
        results.sort((a, b) => b.similarity - a.similarity);
        const topResults = results.slice(0, limit);
        
        logger.info(`Vector search completed in ${Date.now() - startTime}ms`, {
            totalChunks: allChunks.length,
            resultCount: topResults.length,
            topSimilarity: topResults[0]?.similarity.toFixed(2)
        });
        
        return topResults;
    } catch (err) {
        logger.error('Vector search failed', { error: err.message });
        throw err;
    }
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
    if (!a || !b) return 0;
    
    // Ensure both are arrays
    const arrA = Array.isArray(a) ? a : Object.values(a);
    const arrB = Array.isArray(b) ? b : Object.values(b);
    
    if (arrA.length !== arrB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < arrA.length; i++) {
        dotProduct += arrA[i] * arrB[i];
        normA += arrA[i] * arrA[i];
        normB += arrB[i] * arrB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Get document by ID
 * @param {string} documentId - Document UUID
 * @returns {Promise<Object|null>} Document record or null
 */
async function getDocument(documentId) {
    const { data, error } = await supabase
        .from('documents')
        .select('*, document_chunks(*)')
        .eq('id', documentId)
        .single();

    if (error) {
        logger.error('Failed to fetch document', { error: error.message, documentId });
        return null;
    }

    return data;
}

module.exports = {
    supabase,
    createDocument,
    insertChunks,
    searchSimilar,
    getDocument
};
