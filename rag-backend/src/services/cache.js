const crypto = require('crypto');
const { getClient, isAvailable } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Generate a consistent hash for a given key string
 * Useful for long keys like questions or text chunks
 */
const generateKey = (prefix, content) => {
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    return `${prefix}:${hash}`;
};

/**
 * Get value from cache
 */
const get = async (key) => {
    try {
        if (!isAvailable()) return null;

        const client = getClient();
        if (!client || !client.isOpen) return null;

        const value = await client.get(key);
        return value ? JSON.parse(value) : null;
    } catch (err) {
        logger.warn(`Cache GET error for key ${key}`, err);
        return null;
    }
};

/**
 * Set value in cache with TTL
 * @param {string} key 
 * @param {any} value 
 * @param {number} ttlSeconds - Time to live in seconds (default 1 hour)
 */
const set = async (key, value, ttlSeconds = 3600) => {
    try {
        if (!isAvailable()) return false;

        const client = getClient();
        if (!client || !client.isOpen) return false;

        await client.set(key, JSON.stringify(value), {
            EX: ttlSeconds
        });
        return true;
    } catch (err) {
        logger.warn(`Cache SET error for key ${key}`, err);
        return false;
    }
};

module.exports = {
    generateKey,
    get,
    set
};
