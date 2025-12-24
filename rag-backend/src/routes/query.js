/**
 * Query Route
 * Handles semantic search and LLM-powered question answering.
 * 
 * POST /query
 * - Accepts JSON with 'question' field
 * - Returns: answer, source chunks, usage metrics
 * 
 * TODO: Add conversation history support
 * TODO: Implement streaming responses
 * TODO: Add query caching
 * TODO: Support filtering by document ID
 */

const express = require('express');
const router = express.Router();

const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const { generateEmbedding } = require('../services/embeddings');
const { searchSimilar } = require('../db/supabase');
const { generateAnswer } = require('../services/llm');
const cache = require('../services/cache');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * POST /query
 * Ask a question and get a grounded answer
 */
router.post('/', authenticate, asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const timings = {};

    // Validate request body
    const { question, history, topK } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
        throw new AppError('Question is required and must be a non-empty string', 400);
    }

    // Optional: limit on number of results
    const resultLimit = topK && Number.isInteger(topK) && topK > 0 && topK <= 20
        ? topK
        : config.rag.topK;

    logger.info('Processing query', {
        questionLength: question.length,
        topK: resultLimit
    });

    // Check Cache
    const cacheKey = cache.generateKey('query_v1', JSON.stringify({ question, history, topK: resultLimit }));
    const cachedResult = await cache.get(cacheKey);

    if (cachedResult) {
        logger.info('Cache Hit', { question });
        return res.json({
            ...cachedResult,
            metrics: {
                ...cachedResult.metrics,
                cached: true,
                totalTimeMs: Date.now() - startTime
            }
        });
    }

    // Step 1: Generate embedding for the question
    let embedStart = Date.now();
    const queryEmbedding = await generateEmbedding(question);
    timings.embedding = Date.now() - embedStart;

    // Step 2: Perform vector similarity search (filtered by user)
    let searchStart = Date.now();
    const similarChunks = await searchSimilar(queryEmbedding, resultLimit, req.userId);
    timings.search = Date.now() - searchStart;

    // Handle case where no relevant chunks found
    if (!similarChunks || similarChunks.length === 0) {
        logger.warn('No relevant chunks found for query', { question });

        return res.json({
            success: true,
            data: {
                answer: 'I could not find any relevant information in the knowledge base to answer your question.',
                sources: [],
                hasContext: false
            },
            metrics: {
                totalTimeMs: Date.now() - startTime,
                timings: {
                    embeddingMs: timings.embedding,
                    searchMs: timings.search
                }
            }
        });
    }

    // Step 3: Generate answer using LLM with context
    let llmStart = Date.now();
    const { answer, usage } = await generateAnswer(question, similarChunks, history);
    timings.llm = Date.now() - llmStart;

    const totalTime = Date.now() - startTime;

    logger.info('Query completed', {
        totalTimeMs: totalTime,
        chunksUsed: similarChunks.length,
        tokenUsage: usage
    });

    // Format source chunks for response
    // TODO: Include document title and page numbers
    const sources = similarChunks.map((chunk, index) => ({
        chunkId: chunk.id,
        documentId: chunk.document_id,
        content: chunk.content,
        similarity: parseFloat((chunk.similarity * 100).toFixed(2)),
        metadata: chunk.metadata
    }));

    const responsePayload = {
        success: true,
        data: {
            answer,
            sources,
            hasContext: true
        },
        metrics: {
            totalTimeMs: totalTime,
            timings: {
                embeddingMs: timings.embedding,
                searchMs: timings.search,
                llmMs: timings.llm
            },
            tokenUsage: usage
        }
    };

    // Store in cache (TTL 24 hours)
    await cache.set(cacheKey, responsePayload, 86400);

    // Return success response
    res.json(responsePayload);
}));

/**
 * GET /query/health
 * Health check for the query endpoint
 * TODO: Add actual health checks (Supabase connectivity, Groq API status)
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
