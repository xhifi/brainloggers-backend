/**
 * @module services/token
 * @description Service for JWT token and refresh token management
 */
const redis = require("../config/redis");
const config = require("../config");
const { generateAccessToken, generateOpaqueRefreshToken, verifyToken, decodeToken } = require("../utils/tokens");
const bcrypt = require("bcrypt"); // For hashing refresh tokens in Redis
const jwt = require("jsonwebtoken"); // Import for specific error types
const logger = require("./logger.service");

const REFRESH_TOKEN_PREFIX = "refreshToken:";
const ACCESS_TOKEN_BLACKLIST_PREFIX = "bl_accessToken:"; // Example for blacklist

/**
 * Stores a hashed refresh token in Redis
 * @async
 * @function saveRefreshToken
 * @param {string} userId - User ID associated with the token
 * @param {string} token - The refresh token to store
 * @returns {Promise<void>}
 */
const saveRefreshToken = async (userId, token) => {
  if (!userId || !token) return;
  logger.info(`TOKEN TO BE HASHED`, { token });

  const key = `${REFRESH_TOKEN_PREFIX}${userId}`;
  // Hash the token before storing for extra security
  const saltRounds = 5; // Less than password, as it's already random
  try {
    const hashedToken = await bcrypt.hash(token, saltRounds);
    const expirySeconds = config.jwt.refreshExpirationDays * 24 * 60 * 60;
    await redis.set(key, hashedToken, expirySeconds);
    return { hashedToken, expirySeconds }; // Return the hashed token if needed
  } catch (error) {
    console.error(`Error saving refresh token for user ${userId}:`, error);
    // Handle error appropriately, maybe throw or log
  }
};

/**
 * Validates a refresh token against the stored hashed token
 * @async
 * @function validateRefreshToken
 * @param {string} userId - User ID associated with the token
 * @param {string} providedToken - The token to validate
 * @returns {Promise<boolean>} True if token is valid, false otherwise
 */
const validateRefreshToken = async (userId, providedToken) => {
  if (!userId || !providedToken) return false;
  const key = `${REFRESH_TOKEN_PREFIX}${userId}`;
  try {
    const hashedToken = await redis.get(key);
    if (!hashedToken) {
      return false;
    }
    return hashedToken === providedToken;
    return await bcrypt.compare(providedToken, hashedToken);
  } catch (error) {
    console.error(`Error validating refresh token for user ${userId}:`, error);
    return false; // Assume invalid on error
  }
};

/**
 * Removes a user's refresh token from Redis
 * @async
 * @function removeRefreshToken
 * @param {string} userId - User ID whose token should be removed
 * @returns {Promise<void>}
 */
const removeRefreshToken = async (userId) => {
  if (!userId) return;
  const key = `${REFRESH_TOKEN_PREFIX}${userId}`;
  try {
    await redis.del(key);
  } catch (error) {
    console.error(`Error removing refresh token for user ${userId}:`, error);
  }
};

/**
 * Blacklists an access token (e.g., on logout)
 * @async
 * @function blacklistAccessToken
 * @param {string} token - The JWT access token to blacklist
 * @returns {Promise<void>}
 */
const blacklistAccessToken = async (token) => {
  if (!token) return;
  try {
    const decoded = verifyToken(token); // Verify first to get expiry and jti (if used)
    // Use jti (JWT ID) if available for better uniqueness, otherwise use token signature part? Or full token?
    // Using full token might be okay if storage isn't a huge concern. Let's use full token for simplicity.
    const key = `${ACCESS_TOKEN_BLACKLIST_PREFIX}${token}`;
    const expirySeconds = decoded.exp - Math.floor(Date.now() / 1000);
    if (expirySeconds > 0) {
      await redis.set(key, "blacklisted", expirySeconds);
    }
  } catch (error) {
    // Ignore if token is already invalid/expired or other verification errors
    if (!(error instanceof jwt.TokenExpiredError) && !(error instanceof jwt.JsonWebTokenError)) {
      console.warn("Could not blacklist token:", error.message);
    }
  }
};

/**
 * Checks if an access token is blacklisted
 * @async
 * @function isAccessTokenBlacklisted
 * @param {string} token - The JWT access token to check
 * @returns {Promise<boolean>} True if token is blacklisted, false otherwise
 */
const isAccessTokenBlacklisted = async (token) => {
  if (!token) return false;
  const key = `${ACCESS_TOKEN_BLACKLIST_PREFIX}${token}`;
  try {
    const result = await redis.get(key);
    return result === "blacklisted";
  } catch (error) {
    console.error("Error checking token blacklist:", error);
    return false; // Assume not blacklisted on error
  }
};

module.exports = {
  generateAccessToken,
  generateOpaqueRefreshToken,
  saveRefreshToken,
  validateRefreshToken,
  removeRefreshToken,
  verifyToken, // Re-export verifyToken
  decodeToken, // Re-export decodeToken
  blacklistAccessToken, // Keep blacklist optional but available
  isAccessTokenBlacklisted,
};
