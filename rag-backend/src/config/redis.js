const { createClient } = require('redis');
const logger = require('../utils/logger');
require('dotenv').config();

let client = null;
let redisAvailable = false;

const initRedis = async () => {
    if (client) return client;

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    client = createClient({
        url: redisUrl,
        socket: {
            reconnectStrategy: false // Disable automatic reconnection
        }
    });

    client.on('error', () => {
        // Silently ignore errors after initial connection attempt
        // We already logged the failure in initRedis
    });

    client.on('connect', () => {
        logger.info('✅ Redis Client Connected');
        redisAvailable = true;
    });

    try {
        await client.connect();
        redisAvailable = true;
    } catch (err) {
        logger.warn('⚠️ Redis not available - caching disabled. Install Redis for better performance.');
        client = null;
        redisAvailable = false;
    }

    return client;
};

const getClient = () => client;
const isAvailable = () => redisAvailable;

module.exports = {
    initRedis,
    getClient,
    isAvailable
};
