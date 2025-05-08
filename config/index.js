/**
 * @module config
 * @description Central configuration module that loads environment variables and exports a structured config object
 */
require("dotenv").config();

/**
 * Application configuration derived from environment variables with defaults
 * @typedef {Object} AppConfig
 * @property {string} env - Application environment (development, production, etc.)
 * @property {number} port - HTTP server port
 * @property {string} clientUrl - Frontend application URL
 * @property {string} apiUrl - Backend API URL
 * @property {Object} db - PostgreSQL database configuration
 * @property {Object} redis - Redis configuration
 * @property {Object} rabbitmq - RabbitMQ configuration
 * @property {Object} jwt - JWT authentication settings
 * @property {Object} aws - AWS service configuration
 */

/**
 * Application configuration object
 * @type {AppConfig}
 */
module.exports = {
  env: process.env.NODE_ENV || "development",
  port: process.env.PORT || 3000,
  clientUrl: process.env.CLIENT_URL,
  apiUrl: process.env.API_URL,
  db: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false, // Basic SSL example
    // Add pool options if needed: e.g., max: 10, idleTimeoutMillis: 30000
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL,
    queue_email: "email_queue",
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION,
    refreshExpirationDays: parseInt(process.env.JWT_REFRESH_EXPIRATION_DAYS || "7", 10),
    refreshCookieName: process.env.JWT_REFRESH_COOKIE_NAME || "jid",
  },
  aws: {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Leave undefined if using IAM roles
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // Leave undefined if using IAM roles
    sesFromEmail: process.env.AWS_SES_FROM_EMAIL,
    s3BucketName: process.env.AWS_S3_BUCKET_NAME,
  },
};
