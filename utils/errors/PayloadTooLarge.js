/**
 * @module utils/errors/PayloadTooLargeError
 * @description Custom error class for 413 Payload Too Large HTTP responses
 * @extends Error
 */
class PayloadTooLargeError extends Error {
  /**
   * Creates a PayloadTooLargeError instance
   * @param {string} [message="Payload Too Large"] - Error message
   */
  constructor(message = "Payload Too Large") {
    super(message);
    this.name = "PayloadTooLargeError";
    this.statusCode = 413;
  }
}

module.exports = PayloadTooLargeError;
