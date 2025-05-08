const logger = require("../services/logger.service");
const config = require("../config");
const shutdown = require("./shutdown");
const rabbitmq = require("../config/rabbitmq"); // Import RabbitMQ connection

const startServer = async (app) => {
  // --- Pre-Startup Checks ---
  if (!config.jwt.secret) {
    logger.error("FATAL ERROR: JWT_SECRET is not set");
    process.exit(1);
  }
  if (!config.db.user || !config.db.database) {
    logger.error("FATAL ERROR: Database configuration (DB_USER, DB_NAME) missing in .env file.");
    process.exit(1);
  }
  if (!config.aws.sesFromEmail) {
    // Allow missing SES in dev if console transport is okay
    logger.warn("Warning: SES_FROM_EMAIL is not set in .env file. Email functionality will be disabled or use fallback.");
  }

  try {
    // Optional: Attempt RabbitMQ connection on startup (publisher/consumer handle reconnections)
    // No need to await here, let it connect in the background
    rabbitmq.connectRabbitMQ().catch();

    // --- Start Listening ---
    const server = app.listen(config.port, () => {
      logger.info(`Server listening on http://localhost:${config.port} in ${config.env} mode`);
      logger.info(`CORS configured for origin: ${config.clientUrl || "requests without origin"}`);
    });

    // Graceful Shutdown Handling
    await shutdown(server);
  } catch (error) {
    logger.error("Failed to start server:", { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

module.exports = startServer;
