/**
 * @module middleware/errorHandler
 * @description Global error handling middleware for consistent error responses
 */
const config = require("../config");
const logger = require("../services/logger.service");

/**
 * Express error handling middleware that processes errors and returns appropriate responses
 * @function errorHandler
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function (not used but required for error middleware)
 * @returns {void}
 *
 * @property {number} [err.statusCode] - HTTP status code to use in response
 * @property {boolean} [err.expose] - Whether the error message is safe to expose to clients
 * @property {string} [err.code] - Error code (e.g., PostgreSQL error code)
 *
 * @example
 * // In your Express app setup:
 * app.use(errorHandler);
 *
 * // In a route handler or middleware:
 * if (!user) {
 *   const error = new Error('User not found');
 *   error.statusCode = 404;
 *   error.expose = true;
 *   throw error;
 * }
 */
// Global error handling middleware - must have 4 arguments (err, req, res, next)
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Log the full error for debugging (consider more structured logging in production)
  logger.error(`[Error Handler] Path: ${req.path}, Method: ${req.method}`, {
    error: err.message,
    stack: err.stack,
    statusCode: err.statusCode,
    code: err.code,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
  });

  // Default error status code and message
  let statusCode = typeof err.statusCode === "number" && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500; // Default to 500 if statusCode is invalid or missing

  let message = err.expose // Check if error message is safe to expose (custom error property)
    ? err.message
    : "Internal Server Error"; // Default message

  // Handle specific error types if needed (e.g., database constraint errors)
  if (err.code === "23505") {
    // Example: PostgreSQL unique violation
    statusCode = 409; // Conflict
    // Extract field name if possible (more complex parsing needed usually)
    message = "Resource already exists or violates a unique constraint.";
  }
  // Add more specific error handling here (e.g., for custom error classes)
  // if (err instanceof AuthorizationError) { statusCode = 403; message = err.message; }
  // if (err instanceof NotFoundError) { statusCode = 404; message = err.message; }

  // Prevent sending overly generic 500 messages if a more specific one was intended but status code was missing
  if (statusCode === 500 && err.message && err.expose) {
    message = err.message;
  }

  res.status(statusCode).json({
    message: message,
    // Only include stack trace in development for debugging
    stack: config.env === "development" ? err.stack : undefined,
    // You might want to include an error code for frontend handling
    // code: err.code || 'INTERNAL_ERROR'
  });
};

module.exports = errorHandler;
