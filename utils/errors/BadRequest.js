/**
 * @module utils/errors/BadRequestError
 * @description Custom error class for 400 Bad Request HTTP responses
 * @extends Error
 */
class BadRequestError extends Error {
  /**
   * Creates a BadRequestError instance
   * @param {string} [message="Bad Request"] - Error message
   */
  constructor(message = "Bad Request") {
    super(message);
    this.name = "BadRequestError";
    this.statusCode = 400;
  }
}

module.exports = BadRequestError;
