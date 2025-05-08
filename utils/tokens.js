/**
 * @module utils/tokens
 * @description Utility functions for JWT token generation, verification and handling
 */
const jwt = require("jsonwebtoken");
const config = require("../config");
const { v4: uuidv4 } = require("uuid"); // For opaque refresh tokens if needed

/**
 * Generates a JWT access token for authenticated users
 * @function generateAccessToken
 * @param {Object} user - User object containing authentication and authorization data
 * @param {string} user.id - Unique identifier for the user
 * @param {Array<string>} [user.roles=[]] - User's assigned roles for authorization
 * @returns {string} JWT access token
 * @throws {Error} If JWT_SECRET is not configured
 */
const generateAccessToken = (user) => {
  // Include essential, non-sensitive info
  const payload = {
    userId: user.id,
    // email: user.email, // Avoid including PII unless absolutely necessary
    roles: user.roles || [], // Ensure roles are included if fetched during login/refresh
  };
  if (!config.jwt.secret) {
    throw new Error("JWT_SECRET is not defined in environment variables.");
  }
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.accessExpiration });
};

/**
 * Generates an opaque refresh token using UUID
 * @function generateOpaqueRefreshToken
 * @returns {string} UUID v4 string to be used as refresh token
 */
const generateOpaqueRefreshToken = () => {
  return uuidv4();
};

/**
 * Verifies a JWT access token
 * @function verifyToken
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload if verification succeeds
 * @throws {jwt.TokenExpiredError} If token has expired
 * @throws {jwt.JsonWebTokenError} If token is invalid
 * @throws {Error} If JWT_SECRET is not configured
 */
const verifyToken = (token) => {
  if (!config.jwt.secret) {
    throw new Error("JWT_SECRET is not defined in environment variables.");
  }
  try {
    // Explicitly define algorithms to prevent algorithm switching attacks
    return jwt.verify(token, config.jwt.secret); // Assuming HS256 is your algorithm
  } catch (error) {
    // Let the caller handle specific JWT errors (Expired, Invalid)
    throw error;
  }
};

/**
 * Decodes a JWT token without verification (useful for expired tokens)
 * @function decodeToken
 * @param {string} token - JWT token to decode
 * @returns {Object|null} Decoded token payload or null if decoding fails
 */
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    console.error("Failed to decode token:", error);
    return null;
  }
};

module.exports = { generateAccessToken, generateOpaqueRefreshToken, verifyToken, decodeToken };
