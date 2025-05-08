/**
 * @module utils/errors/NotAcceptableError
 * @description Custom error class for 406 Not Acceptable HTTP responses
 * @extends Error
 */
class NotAcceptableError extends Error {
  /**
   * Creates a NotAcceptableError instance
   * @param {string} [message="Not Acceptable"] - Error message
   */
  constructor(message = "Not Acceptable") {
    super(message);
    this.name = "NotAcceptableError";
    this.statusCode = 406;
  }
}

module.exports = NotAcceptableError;
