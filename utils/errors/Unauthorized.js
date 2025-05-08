/**
 * @module utils/errors/UnauthorizedError
 * @description Custom error class for 401 Unauthorized HTTP responses
 * @extends Error
 */
class UnauthorizedError extends Error {
  /**
   * Creates an UnauthorizedError instance
   * @param {string} [message="Unauthorized"] - Error message
   */
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
    this.statusCode = 401;
  }
}

module.exports = UnauthorizedError;
