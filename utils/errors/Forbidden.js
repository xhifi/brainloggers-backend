/**
 * @module utils/errors/ForbiddenError
 * @description Custom error class for 403 Forbidden HTTP responses
 * @extends Error
 */
class ForbiddenError extends Error {
  /**
   * Creates a ForbiddenError instance
   * @param {string} [message="Forbidden"] - Error message
   */
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
    this.statusCode = 403;
  }
}

module.exports = ForbiddenError;
