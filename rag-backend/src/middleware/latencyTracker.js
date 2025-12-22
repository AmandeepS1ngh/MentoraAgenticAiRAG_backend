/**
 * Latency Tracking Middleware
 * Tracks and logs request latency for performance monitoring.
 * 
 * TODO: Integrate with APM tools (New Relic, Datadog, etc.)
 * TODO: Add histogram metrics for percentile calculations
 * TODO: Add slow request alerting threshold
 */

const logger = require('../utils/logger');

/**
 * Express middleware that tracks request latency
 * Logs the duration of each request on completion
 */
function latencyTracker(req, res, next) {
    const startTime = Date.now();
    const startHrTime = process.hrtime();

    // Store start time on request for access in route handlers
    req.startTime = startTime;

    // Override res.end to capture completion time
    const originalEnd = res.end;

    res.end = function (...args) {
        const diff = process.hrtime(startHrTime);
        const latencyMs = (diff[0] * 1000 + diff[1] / 1e6).toFixed(2);

        // Log request completion with latency
        logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${latencyMs}ms`, {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            latencyMs: parseFloat(latencyMs)
        });

        // TODO: Send metrics to monitoring service
        // metricsClient.histogram('http_request_duration_ms', latencyMs, { 
        //     method: req.method, 
        //     route: req.route?.path 
        // });

        return originalEnd.apply(this, args);
    };

    next();
}

module.exports = latencyTracker;
