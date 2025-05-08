/**
 * @module utils/errors/InsufficientStorageError
 * @description Custom error class for 507 Insufficient Storage HTTP responses
 * @extends Error
 */
class InsufficientStorageError extends Error {
  /**
   * Creates an InsufficientStorageError instance
   * @param {string} [message="Insufficient Storage"] - Error message
   */
  constructor(message = "Insufficient Storage") {
    super(message);
    this.name = "InsufficientStorageError";
    this.statusCode = 507;
  }
}

module.exports = InsufficientStorageError;
