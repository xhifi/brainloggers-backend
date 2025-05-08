/**
 * @module utils/errors/BadGatewayError
 * @description Custom error class for 502 Bad Gateway HTTP responses
 * @extends Error
 */
class BadGatewayError extends Error {
  /**
   * Creates a BadGatewayError instance
   * @param {string} [message="Bad Gateway"] - Error message
   */
  constructor(message = "Bad Gateway") {
    super(message);
    this.name = "BadGatewayError";
    this.statusCode = 502;
  }
}

module.exports = BadGatewayError;
