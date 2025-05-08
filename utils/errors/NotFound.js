/**
 * @module utils/errors/NotFoundError
 * @description Custom error class for 404 Not Found HTTP responses
 * @extends Error
 */
class NotFoundError extends Error {
  /**
   * Creates a NotFoundError instance
   * @param {string} [message="Not Found"] - Error message
   */
  constructor(message = "Not Found") {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

module.exports = NotFoundError;
