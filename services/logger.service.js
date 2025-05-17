/**
 * @module services/logger
 * @description Winston-based logging service that provides structured logging functionality
 * throughout the application with different log levels and transports
 */
const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Custom log format configuration combining timestamp, error stacks, and JSON formatting
 * @constant {winston.Logform.Format}
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

/**
 * Human-readable console format with colors and better error formatting
 */
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ level, message, timestamp, stack, ...metadata }) => {
    // Basic output with timestamp and message
    let output = `${timestamp} ${level}: ${message}`;

    // Add stack trace if available
    if (stack) {
      output += `\n${stack}`;
    }

    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
      // Filter out service from metadata as we'll include it separately
      const { service, ...rest } = metadata;
      const serviceStr = service ? `[${service}] ` : "";

      if (Object.keys(rest).length > 0) {
        // Pretty format the rest of metadata with 2-space indentation
        output = `${serviceStr}${output}\n${JSON.stringify(rest, null, 2)}`;
      } else {
        output = `${serviceStr}${output}`;
      }
    }

    return output;
  })
);

/**
 * Logger instance configured with multiple transports and levels
 * @constant {winston.Logger}
 * @property {string} level - Log level threshold based on environment (debug in development, info in production)
 * @property {Object} defaultMeta - Default metadata added to all log entries
 */
const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: logFormat,
  defaultMeta: { service: "auth-app" },
  transports: [
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
    }),
    // Write all logs with level 'info' and below to combined.log
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
    }),
    // Write login events to login.log
    new winston.transports.File({
      filename: path.join(logsDir, "login.log"),
      level: "info",
    }),
  ],
});

// Add console transport for non-production environments with human-readable format
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

module.exports = logger;
