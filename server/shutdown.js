const db = require("../config/db");
const redis = require("../config/redis");
const rabbitmq = require("../config/rabbitmq");
const logger = require("../services/logger.service");

const shutdown = async (server, signals = { SIGINT: 2, SIGTERM: 15 }) => {
  Object.keys(signals).forEach((signal) => {
    process.on(signal, async () => {
      logger.info(`\nReceived ${signal}. Closing server gracefully...`);

      // Add a small delay to ensure this message is seen
      await new Promise((resolve) => setTimeout(resolve, 100));

      server.close(async () => {
        logger.info("HTTP server closed.");

        // Close database pool
        await db.disconnect();

        // Close Redis client
        redis.disconnect();

        // Close RabbitMQ connection (if connection exists)
        await rabbitmq.disconnect();

        // Add a small delay before exiting to ensure logs are flushed
        await new Promise((resolve) => setTimeout(resolve, 500));

        logger.info("Graceful shutdown complete. Exiting process.");
        process.exit(128 + signals[signal]); // Standard exit code
      });

      // Add a timeout in case server.close() hangs
      setTimeout(() => {
        logger.error("Could not close connections in time, forcefully shutting down");
        process.exit(1);
      }, 10000);
    });
  });
};

module.exports = shutdown;
