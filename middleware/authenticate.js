/**
 * @module middleware/authenticate
 * @description Middleware for JWT authentication that validates tokens and attaches user data to requests
 */
const tokenService = require("../services/token.service");
const userService = require("../services/user.service"); // To potentially fetch fresh user data
const jwt = require("jsonwebtoken"); // Import jwt directly for specific error types
const logger = require("../services/logger.service");

/**
 * Express middleware that authenticates requests using JWT tokens
 * @async
 * @function authenticate
 * @param {Object} req - Express request object
 * @param {Object} req.headers - Request headers
 * @param {string} req.headers.authorization - Authorization header containing Bearer token
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 *
 * @throws {401} If no token is provided, token is invalid, or token is expired
 * @throws {403} If user account is not verified
 * @throws {500} If server error occurs during authentication
 *
 * @example
 * // Using in routes
 * router.get('/protected', authenticate, (req, res) => {
 *   // req.user is now available with authenticated user data
 *   res.json({ message: `Hello ${req.user.id}` });
 * });
 */
module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // Allow access to public routes if no token is provided,
    // but protected routes should fail later if req.user is not set.
    // For strictly protected routes, return 401 here.
    // Let's assume routes using this middleware require authentication.
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Check blacklist first if implemented
    if (await tokenService.isAccessTokenBlacklisted(token)) {
      return res.status(401).json({ message: "Unauthorized: Token revoked" });
    }

    const decoded = tokenService.verifyToken(token); // Verifies signature and expiration
    console.log(decoded);

    // Fetch fresh user data to ensure roles/status are up-to-date and user exists
    // Note: Fetching user on every request can add latency. Consider if roles in token are sufficient.
    // If roles change frequently, fetching fresh is safer.
    const freshUser = await userService.findUserById(decoded.userId);
    if (!freshUser) {
      // User might have been deleted since token was issued
      return res.status(401).json({ message: "Unauthorized: User not found" });
    }
    if (!freshUser.is_verified) {
      // If user becomes unverified after token issuance
      return res.status(403).json({ message: "Forbidden: User account is not verified" });
    }

    // Attach user info to request object
    req.user = {
      id: freshUser.id,
      roles: freshUser.roles || [], // Use fresh roles
      is_verified: freshUser.is_verified,
      // Optionally include email if frequently needed, but weigh PII exposure
      // email: freshUser.email,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      // Use instanceof for specific JWT errors
      return res.status(401).json({ message: "Unauthorized: Token expired" });
    }
    if (error instanceof jwt.JsonWebTokenError) {
      // Catches invalid signature, format errors etc.
      return res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
    // Handle other potential errors during verification or user fetching
    logger.error("Authentication error:", {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    return res.status(500).json({ message: "Internal server error during authentication" });
  }
};
