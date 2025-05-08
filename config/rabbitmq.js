/**
 * @module config/rabbitmq
 * @description RabbitMQ connection handling with retry mechanism and channel management
 */
const amqp = require("amqplib");
const config = require("./index");
const logger = require("../services/logger.service");

/**
 * Stored RabbitMQ connection instance
 * @type {amqp.Connection|null}
 */
let connection = null;

/**
 * Stored RabbitMQ channel instance
 * @type {amqp.Channel|null}
 */
let channel = null;

/**
 * Flag to prevent multiple simultaneous connection attempts
 * @type {boolean}
 */
let isConnecting = false;

/**
 * Timeout reference for connection retry
 * @type {NodeJS.Timeout|null}
 */
let connectRetryTimeout = null;

/**
 * Establishes a connection to RabbitMQ and creates a channel
 * @async
 * @function connectRabbitMQ
 * @returns {Promise<{connection: amqp.Connection, channel: amqp.Channel}>} Connection and channel objects
 * @throws {Error} If connection fails and isn't automatically recovered
 */
const connectRabbitMQ = async () => {
  if (isConnecting) {
    logger.info("RabbitMQ connection attempt already in progress.");
    // Optionally return a promise that resolves when connection is established or fails
    return new Promise((resolve) => setTimeout(() => resolve(getChannel()), 1000)); // Wait and retry getChannel
  }
  // If already connected, return existing channel/connection
  if (connection && channel && connection.connection?.stream?.writable) {
    // Basic check if connection seems usable
    return { connection, channel };
  }

  isConnecting = true;
  clearTimeout(connectRetryTimeout); // Clear any pending retry timeout

  try {
    logger.info(`Attempting to connect to RabbitMQ at ${config.rabbitmq.url}...`);
    connection = await amqp.connect(config.rabbitmq.url);
    channel = await connection.createChannel();
    logger.info("RabbitMQ connected and channel created");
    isConnecting = false;

    connection.on("error", (err) => {
      logger.error("RabbitMQ connection error:", err.message);
      connection = null; // Reset connection state
      channel = null;
      if (!isConnecting) {
        // Avoid scheduling retry if already trying to connect
        logger.info("Scheduling RabbitMQ reconnection attempt in 5s...");
        connectRetryTimeout = setTimeout(connectRabbitMQ, 5000); // Try reconnecting after 5s
      }
    });
    connection.on("close", (err) => {
      // Check if close was due to an error or intentional
      if (err) {
        logger.warn("RabbitMQ connection closed due to error:", err.message);
      } else {
        logger.warn("RabbitMQ connection closed.");
      }
      connection = null;
      channel = null;
      if (!isConnecting && !err) {
        // Don't retry immediately if closed due to error (handled by 'error' event)
        logger.info("Scheduling RabbitMQ reconnection attempt in 5s...");
        connectRetryTimeout = setTimeout(connectRabbitMQ, 5000);
      }
    });

    // Assert common queues on successful connection (makes them available early)
    await channel.assertQueue(config.rabbitmq.queue_email, { durable: true });
    logger.info(`Queue '${config.rabbitmq.queue_email}' asserted.`);
    // Assert other queues if needed

    return { connection, channel };
  } catch (error) {
    logger.error(`Failed to connect to RabbitMQ (${error.code}): ${error.message}`);
    isConnecting = false;
    connection = null; // Ensure state is reset on failure
    channel = null;
    // Schedule retry
    logger.info("Scheduling RabbitMQ reconnection attempt in 5s...");
    connectRetryTimeout = setTimeout(connectRabbitMQ, 5000);
    throw error; // Re-throw for initial connection failure handling if needed upstream
  }
};

/**
 * Gets an available RabbitMQ channel, establishing a connection if necessary
 * @async
 * @function getChannel
 * @returns {Promise<amqp.Channel>} A RabbitMQ channel for publishing/consuming messages
 * @throws {Error} If unable to establish a connection or create a channel
 */
const getChannel = async () => {
  if (!channel || !connection || !connection.connection?.stream?.writable) {
    // Added check if connection seems usable
    logger.info("RabbitMQ Channel or connection not available/usable, attempting to connect/reconnect...");
    await connectRabbitMQ(); // This might throw if initial connection fails repeatedly
  }
  // It's still possible connectRabbitMQ failed and didn't establish a channel
  if (!channel) {
    throw new Error("Failed to get RabbitMQ channel after connection attempt.");
  }
  return channel;
};

/**
 * Closes the RabbitMQ connection and channel gracefully
 * @async
 * @function closeConnection
 * @returns {Promise<void>}
 */
const closeConnection = async () => {
  clearTimeout(connectRetryTimeout); // Clear any pending reconnection attempts

  try {
    if (channel) {
      logger.info("Closing RabbitMQ channel...");
      await channel.close();
      channel = null;
      logger.info("RabbitMQ channel closed.");
    }

    if (connection) {
      logger.info("Closing RabbitMQ connection...");
      await connection.close();
      connection = null;
      logger.info("RabbitMQ connection closed.");
    }
  } catch (error) {
    logger.error("Error while closing RabbitMQ connection:", error.message);
    // Reset state even if close fails
    channel = null;
    connection = null;
  }
};

// Optional: Initiate connection attempt on load for faster availability, but don't block startup
// connectRabbitMQ().catch(err => logger.error("Initial background RabbitMQ connection failed:", err.message));

module.exports = { connectRabbitMQ, getChannel, disconnect: closeConnection };
