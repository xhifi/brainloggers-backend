const logger = require("../../services/logger.service");

/**
 * @module utils/errors/ResourceConflictError
 * @description Custom error class for 409 Conflict HTTP responses
 * @extends Error
 */
class ConflictResourceError extends Error {
  /**
   * Creates a ForbiddenError instance
   * @param {string} [message="Resource conflict"] - Error message
   */
  constructor(message = "Resource conflict") {
    super(message);
    this.name = "ConflictResourceError";
    this.statusCode = 409;
  }
}

module.exports = ConflictResourceError;
