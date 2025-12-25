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

// Enable CORS - More flexible configuration
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : [
        'https://mentora-agentic-ai-frontend.vercel.app',
        'http://localhost:3000',
        'http://localhost:3001'
    ];

/**
 * Check if an origin is allowed for CORS
 * @param {string} origin - The origin to check
 * @returns {boolean} - Whether the origin is allowed
 */
const isOriginAllowed = (origin) => {
    // No origin means same-origin or non-browser request
    if (!origin) return true;

    // Check explicit allowed origins
    if (allowedOrigins.includes(origin)) return true;
    if (allowedOrigins.includes('*')) return true;

    // Allow ALL Vercel deployments (production, preview, and branch deploys)
    // This covers patterns like:
    // - mentora-agentic-ai-frontend.vercel.app (production)
    // - mentora-agentic-ai-frontend-*.vercel.app (preview)
    // - mentora-agentic-ai-frontend-git-*.vercel.app (branch)
    if (origin.endsWith('.vercel.app')) {
        // Extract subdomain and check if it starts with our project name
        const url = new URL(origin);
        const subdomain = url.hostname.replace('.vercel.app', '');
        if (subdomain.startsWith('mentora-agentic-ai-frontend') ||
            subdomain.includes('mentora')) {
            logger.info(`CORS: Allowed Vercel deployment origin: ${origin}`);
            return true;
        }
    }

    // Allow localhost with any port for development
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        return true;
    }

    return false;
};

// CORS configuration with robust origin handling
const corsOptions = {
    origin: function (origin, callback) {
        try {
            if (isOriginAllowed(origin)) {
                callback(null, true);
            } else {
                logger.warn(`CORS: Blocked origin`, {
                    origin,
                    allowedOrigins,
                    nodeEnv: process.env.NODE_ENV
                });
                // Return false instead of an error to avoid crashing preflight requests
                // This allows the browser to receive proper CORS headers but denies access
                callback(null, false);
            }
        } catch (error) {
            logger.error(`CORS: Error checking origin`, { origin, error: error.message });
            // On error, deny access but don't crash
            callback(null, false);
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'X-User-Id',
        'Origin',
        'Cache-Control'
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    credentials: true,
    maxAge: 86400, // Cache preflight response for 24 hours
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
