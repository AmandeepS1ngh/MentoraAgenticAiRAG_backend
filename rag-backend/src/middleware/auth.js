/**
 * Authentication Middleware for RAG Backend
 * Validates user identity for protected routes using Supabase Auth.
 */

const { createClient } = require('@supabase/supabase-js');
const { AppError } = require('./errorHandler');
const logger = require('../utils/logger');

// Initialize Supabase client for auth verification
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

/**
 * Middleware to extract and validate user identity via JWT
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
async function authenticate(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const legacyUserId = req.headers['x-user-id'];

        // Primary: JWT Authentication via Bearer token
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);

            // Verify token with Supabase
            const { data: { user }, error } = await supabase.auth.getUser(token);

            if (error || !user) {
                logger.warn('Invalid or expired JWT token', { error: error?.message });
                throw new AppError('Invalid or expired authentication token', 401);
            }

            req.userId = user.id;
            req.user = user;
            logger.debug('User authenticated via JWT', { userId: user.id });
            return next();
        }

        // Fallback: X-User-Id header (development mode only)
        if (process.env.NODE_ENV !== 'production' && legacyUserId) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(legacyUserId)) {
                throw new AppError('Invalid user ID format', 400);
            }

            req.userId = legacyUserId;
            logger.debug('User authenticated via X-User-Id header (dev mode)', { userId: legacyUserId });
            return next();
        }

        // No valid authentication found
        throw new AppError('Authentication required. Please sign in.', 401);

    } catch (error) {
        if (error instanceof AppError) {
            return next(error);
        }
        logger.error('Authentication error', { error: error.message });
        return next(new AppError('Authentication failed', 401));
    }
}

/**
 * Optional authentication - sets userId if provided but doesn't require it
 */
async function optionalAuth(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        const legacyUserId = req.headers['x-user-id'];

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const { data: { user } } = await supabase.auth.getUser(token);

            if (user) {
                req.userId = user.id;
                req.user = user;
            }
        } else if (process.env.NODE_ENV !== 'production' && legacyUserId) {
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (uuidRegex.test(legacyUserId)) {
                req.userId = legacyUserId;
            }
        }

        next();
    } catch (error) {
        logger.debug('Optional auth failed, continuing as anonymous');
        next();
    }
}

module.exports = {
    authenticate,
    optionalAuth
};
