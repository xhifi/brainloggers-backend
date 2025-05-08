/**
 * @module utils/errors/MethodNotAllowedError
 * @description Custom error class for 405 Method Not Allowed HTTP responses
 * @extends Error
 */
class MethodNotAllowedError extends Error {
  /**
   * Creates a MethodNotAllowedError instance
   * @param {string} [message="Method Not Allowed"] - Error message
   */
  constructor(message = "Method Not Allowed") {
    super(message);
    this.name = "MethodNotAllowedError";
    this.statusCode = 405;
  }
}

module.exports = MethodNotAllowedError;
