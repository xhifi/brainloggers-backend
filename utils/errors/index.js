/**
 * @module utils/errors
 * @description Custom error classes for HTTP error responses
 */

// Network Errors
const BadRequestError = require("./BadRequest"); //400
const UnauthorizedError = require("./Unauthorized"); //401
const ForbiddenError = require("./Forbidden"); //403
const NotFoundError = require("./NotFound"); //404
const MethodNotAllowedError = require("./MethodNotAllowed"); //405
const NotAcceptableError = require("./NotAcceptable"); //406
const PayloadTooLargeError = require("./PayloadTooLarge"); //413
const ConflictResourceError = require("./ConfictResource"); //409
// Server Errors
const BadGatewayError = require("./BadGateway"); //502
const InsufficientStorageError = require("./InsufficientStorage"); //507

module.exports = {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  MethodNotAllowedError,
  NotAcceptableError,
  PayloadTooLargeError,
  ConflictResourceError,

  BadGatewayError,
  InsufficientStorageError,
};
