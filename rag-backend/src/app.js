/**
 * Express Application Entry Point
 * Initializes and configures the RAG backend server.
 * 
 * TODO: Add graceful shutdown handling
 * TODO: Add health check endpoint with dependency checks
 * TODO: Implement request ID middleware for tracing
 * TODO: Add API rate limiting
 * TODO: Add request body size limits
 */

const express = require('express');
const cors = require('cors');

const config = require('./config');
const logger = require('./utils/logger');
const latencyTracker = require('./middleware/latencyTracker');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Import routes
const ingestRouter = require('./routes/ingest');
const queryRouter = require('./routes/query');

const { initRedis } = require('./config/redis');

// Initialize Express app
const app = express();

// Initialize Redis
initRedis().catch(err => logger.error('Failed to initialize Redis', err));

// =============================================================================
// Middleware Stack
// =============================================================================

// Enable CORS
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : [
        'https://mentora-agentic-ai-frontend-7imf62s7u.vercel.app',
        'https://mentora-agentic-ai-frontend.vercel.app',
        'http://localhost:3000',
        'http://localhost:3001'
    ];

// CORS configuration with proper origin handling
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) {
            return callback(null, true);
        }

        // Check if the origin is allowed
        // In development, allow all origins
        if (process.env.NODE_ENV !== 'production') {
            return callback(null, true);
        }

        // In production, check against allowed origins
        // Also allow any Vercel preview deployment URLs
        const isAllowed = allowedOrigins.some(allowed => {
            if (allowed === '*') return true;
            if (origin === allowed) return true;
            // Allow any Vercel preview URLs for this project
            if (origin.includes('mentora-agentic-ai-frontend') && origin.includes('vercel.app')) {
                return true;
            }
            return false;
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            logger.warn(`CORS: Blocked origin ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly for all routes
app.options('*', cors(corsOptions));

// Parse JSON bodies
// TODO: Add request body size limit
app.use(express.json({
    limit: '1mb'
}));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Latency tracking for all requests
app.use(latencyTracker);

// =============================================================================
// Routes
// =============================================================================

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'RAG Backend API',
        version: '1.0.0',
        endpoints: {
            ingest: 'POST /ingest - Upload and process a PDF document',
            query: 'POST /query - Ask a question and get a grounded answer'
        },
        status: 'running'
    });
});

// Health check endpoint
// TODO: Add actual health checks (DB connection, API keys validity)
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Mount API routes
app.use('/ingest', ingestRouter);
app.use('/query', queryRouter);

// =============================================================================
// Error Handling
// =============================================================================

// 404 handler - must be after all routes
app.use(notFoundHandler);

// Global error handler - must be last
app.use(errorHandler);

// =============================================================================
// Server Startup
// =============================================================================

const PORT = config.port;

const server = app.listen(PORT, () => {
    logger.info(`🚀 RAG Backend server started`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString()
    });

    logger.info('Available endpoints:', {
        root: `http://localhost:${PORT}/`,
        health: `http://localhost:${PORT}/health`,
        ingest: `http://localhost:${PORT}/ingest`,
        query: `http://localhost:${PORT}/query`
    });
});

// Graceful shutdown
const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });

    // Force exit if graceful shutdown takes too long
    setTimeout(() => {
        logger.warn('Forcing exit after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Export app for testing
module.exports = app;
