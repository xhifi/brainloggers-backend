/**
 * @module config/redis
 * @description Redis client configuration with connection handling and retry logic
 */
const Redis = require("ioredis");
const config = require("./index");
const logger = require("../services/logger.service");

/**
 * Redis client instance for caching and token management
 * @type {Redis|null}
 */
let redisClient = null;

try {
  /**
   * Initialize the Redis client with connection options and retry strategy
   */
  redisClient = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3, // Example option
    enableReadyCheck: false, // Avoids startup issues if Redis isn't immediately ready
    // Add TLS options if connecting to a secured Redis instance
    // tls: config.env === 'production' ? {} : undefined,
    /**
     * Exponential backoff retry strategy for Redis connection
     * @param {number} times - Number of connection attempts made
     * @returns {number} Delay in milliseconds before next retry
     */
    retryStrategy(times) {
      // Exponential backoff retry strategy
      const delay = Math.min(times * 50, 2000); // Up to 2 seconds delay
      logger.warn(`Redis connection attempt ${times} failed. Retrying in ${delay}ms...`);
      return delay;
    },
  });

  redisClient.on("connect", () => {
    logger.info("Redis connected");
  });

  redisClient.on("ready", () => {
    logger.info("Redis client ready.");
  });

  redisClient.on("error", (err) => {
    logger.error("Redis client error:", err.message);
    // Don't necessarily exit, the retry strategy will handle reconnections.
    // Monitor these errors in production.
  });

  redisClient.on("close", () => {
    logger.info("Redis connection closed.");
  });

  redisClient.on("reconnecting", (delay) => {
    logger.info(`Redis client reconnecting in ${delay}ms...`);
  });
} catch (error) {
  logger.error("Failed to create Redis client instance:", error);
  // Application might not function correctly without Redis. Exit or handle gracefully.
  process.exit(1);
}

/**
 * Get a value from Redis by key
 * @async
 * @function get
 * @param {string} key - The key to retrieve
 * @returns {Promise<string|null>} The value stored in Redis, or null if not found
 * @throws {Error} If there's an error communicating with Redis
 */
const get = async (key) => {
  try {
    const value = await redisClient.get(key);
    return value;
  } catch (error) {
    logger.error(`Redis get error for key ${key}:`, error.message);
    throw error;
  }
};

/**
 * Set a value in Redis
 * @async
 * @function set
 * @param {string} key - The key to set
 * @param {string|number|Object} value - The value to store (objects will be stringified)
 * @param {number} [ttl=null] - Time to live in seconds, if specified
 * @returns {Promise<string>} "OK" if successful
 * @throws {Error} If there's an error communicating with Redis
 */
const set = async (key, value, ttl = null) => {
  try {
    // Handle objects by converting to JSON
    const valueToStore = typeof value === "object" ? JSON.stringify(value) : value;

    // If ttl is not provided, check if the key already exists and has a TTL
    if (ttl === null) {
      const remainingTtl = await redisClient.ttl(key);

      // If key exists and has a TTL (remainingTtl > 0), use that TTL
      if (remainingTtl > 0) {
        return await redisClient.set(key, valueToStore, "EX", remainingTtl);
      }
    }

    // Set with expiration if ttl is provided
    if (ttl) {
      return await redisClient.set(key, valueToStore, "EX", ttl);
    }

    // Set without expiration
    return await redisClient.set(key, valueToStore);
  } catch (error) {
    logger.error(`Redis set error for key ${key}:`, error.message);
    throw error;
  }
};

/**
 * Update a Redis object by merging new properties with existing object
 * @async
 * @function update
 * @param {string} key - The key to update
 * @param {Object} updateData - The object with properties to update
 * @returns {Promise<string>} "OK" if successful
 * @throws {Error} If there's an error communicating with Redis or if the stored value is not a valid JSON object
 */
const update = async (key, updateData) => {
  try {
    // Get the existing value
    const existingValue = await get(key);

    // If key doesn't exist, just set the new value
    if (!existingValue) {
      return await set(key, updateData);
    }

    let parsedValue;
    try {
      // Try to parse the existing value as JSON
      parsedValue = JSON.parse(existingValue);

      // Ensure the parsed value is an object that can be merged
      if (typeof parsedValue !== "object" || parsedValue === null || Array.isArray(parsedValue)) {
        logger.error(`Redis update error: Stored value for key ${key} is not an object that can be merged`);
        throw new Error("Stored value is not an object that can be merged");
      }
    } catch (parseError) {
      logger.error(`Redis update error: Failed to parse value for key ${key}:`, parseError.message);
      throw new Error("Failed to parse stored value as JSON");
    }

    // Merge the existing object with the update data
    const updatedValue = { ...parsedValue, ...updateData };

    // Get the remaining TTL for the key (in seconds)
    const remainingTtl = await redisClient.ttl(key);

    // Set the updated value with the same TTL if it exists
    if (remainingTtl > 0) {
      return await set(key, updatedValue, remainingTtl);
    } else {
      return await set(key, updatedValue);
    }
  } catch (error) {
    logger.error(`Redis update error for key ${key}:`, error.message);
    throw error;
  }
};

/**
 * Delete a key from Redis
 * @async
 * @function del
 * @param {string|string[]} key - The key or array of keys to delete
 * @returns {Promise<number>} The number of keys deleted
 * @throws {Error} If there's an error communicating with Redis
 */
const del = async (key) => {
  try {
    return await redisClient.del(key);
  } catch (error) {
    logger.error(`Redis delete error for key ${key}:`, error.message);
    throw error;
  }
};

/**
 * Disconnect the redis client if it exists
 * @description This function is called during server shutdown to ensure the Redis client is properly closed.
 * It checks if the redisClient is defined and if it has a disconnect method before calling it.
 * This prevents errors if the client is not initialized or if the disconnect method is not available.
 * It also logs the closure of the Redis client.
 * This function is not intended to be used in the application logic but rather as a cleanup step during server shutdown.
 * @async
 * @function closeClient
 * @returns {null} Resolves when the client is closed
 * @throws {Error} If there's an error communicating with Redis
 */
const closeClient = () => {
  try {
    if (redisClient && typeof redisClient.disconnect === "function") {
      redisClient.disconnect();
      logger.info("Redis client closed.");
    }
  } catch (redisErr) {
    logger.error("Error closing Redis client:", { error: redisErr.message, stack: redisErr.stack });
  }
};

module.exports = {
  client: redisClient,
  disconnect: closeClient,
  get,
  set,
  update,
  del,
};
