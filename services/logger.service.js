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

// Add console transport for non-production environments
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize()),
    })
  );
}

module.exports = logger;
