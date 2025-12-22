/**
 * Configuration Module
 * Loads and validates environment variables for the RAG backend.
 * 
 * TODO: Add schema validation using Joi or Zod for production
 * TODO: Add support for different environments (dev, staging, prod)
 */

require('dotenv').config();

// Simple validation for required environment variables
// TODO: Replace with proper validation library for production
const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'GROQ_API_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
    console.error('Please check your .env file or environment configuration');
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
}

const config = {
    // Server settings
    port: parseInt(process.env.PORT, 10) || 3005,

    // Supabase settings
    supabase: {
        url: process.env.SUPABASE_URL,
        anonKey: process.env.SUPABASE_ANON_KEY
    },

    // Embedding settings (local - using Transformers.js)
    // No API needed - runs completely locally
    embedding: {
        model: 'Xenova/all-MiniLM-L6-v2',  // 384 dimensions
        dimensions: 384
    },

    // Groq API settings (for LLM only)
    groq: {
        apiKey: process.env.GROQ_API_KEY,
        llmModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant'
    },

    // RAG settings
    rag: {
        chunkSize: parseInt(process.env.CHUNK_SIZE, 10) || 500,
        chunkOverlap: parseInt(process.env.CHUNK_OVERLAP, 10) || 50,
        topK: parseInt(process.env.TOP_K_RESULTS, 10) || 5
    }
};

module.exports = config;
