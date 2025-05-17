// Load environment variables first
require("dotenv").config();

// Now load config after dotenv has run
const config = require("./config");
const { connectRabbitMQ } = require("./config/rabbitmq");
const emailConsumer = require("./queues/consumers/email.consumer");
const campaignConsumer = require("./queues/consumers/campaign.consumer");
const campaignEmailConsumer = require("./queues/consumers/campaign-email.consumer");
const campaignScheduler = require("./queues/schedulers/campaign.scheduler");
const logger = require("./services/logger.service");

// Check if transporter is configured before starting (avoid starting if email is fundamentally broken)
const transporter = require("./config/aws");

let schedulerTask = null;

async function startWorker() {
  logger.info(`[Worker] Starting background worker process in ${config.env} mode...`);

  // --- Pre-Startup Checks for Worker ---
  if (!config.aws.sesFromEmail && config.env !== "development") {
    logger.error("FATAL ERROR (Worker): SES_FROM_EMAIL is not set in .env file. Worker cannot send emails effectively.");
    process.exit(1);
  }
  if (!config.rabbitmq.url) {
    logger.error("FATAL ERROR (Worker): RABBITMQ_URL is not set in .env file.");
    process.exit(1);
  }
  // Add other essential checks for the worker

  try {
    logger.info("[Worker] Attempting initial RabbitMQ connection...");
    // Wait for the initial connection here, as the worker depends on it.
    const { channel } = await connectRabbitMQ(); // Will throw if initial connection fails after retries
    logger.info("[Worker] RabbitMQ connection established.");

    // Start consumers and pass the channel
    await emailConsumer.start(channel);
    logger.info("[Worker] Email consumer started successfully.");

    // Start campaign consumer for campaign management actions
    await campaignConsumer.start(channel);
    logger.info("[Worker] Campaign consumer started successfully.");

    // Initialize campaign email consumer for sending campaign emails
    await campaignEmailConsumer.initCampaignEmailConsumer();
    logger.info("[Worker] Campaign email consumer initialized successfully.");

    // Start campaign scheduler (checks every 5 minutes by default)
    schedulerTask = campaignScheduler.start();
    logger.info("[Worker] Campaign scheduler started successfully.");

    logger.info("[Worker] Worker is running and waiting for tasks. To exit press CTRL+C");

    // Graceful Shutdown for Worker
    const signals = { SIGINT: 2, SIGTERM: 15 };
    Object.keys(signals).forEach((signal) => {
      process.on(signal, async () => {
        logger.info(`\n[Worker] Received ${signal}. Shutting down gracefully...`);

        // Stop the scheduler
        if (schedulerTask) {
          logger.info("[Worker] Stopping campaign scheduler...");
          campaignScheduler.stop(schedulerTask);
        }

        // Close RabbitMQ connection (needs implementation in config/rabbitmq.js)
        logger.info("[Worker] Closing RabbitMQ connection...");
        // await require('./config/rabbitmq').closeConnection(); // Hypothetical function
        logger.info("[Worker] Exiting.");
        process.exit(0); // Use 0 for graceful exit
      });
    });
  } catch (error) {
    logger.error("[Worker] Failed to start worker after connection attempt:", error.message);
    // Keep retrying connection in connectRabbitMQ, but log critical startup failure
    logger.error("[Worker] Exiting due to critical startup error.");
    process.exit(1); // Exit if initial setup fails critically
  }
}

if (!transporter && config.env !== "development") {
  logger.error("FATAL ERROR (Worker): Nodemailer transporter could not be configured. Check AWS SES settings in .env. Exiting.");
  process.exit(1);
} else if (!transporter && config.env === "development") {
  logger.warn("Warning (Worker): Email transporter not configured for SES, using fallback (console/stream transport).");
  startWorker();
} else {
  startWorker();
}
