/**
 * @module services/queue
 * @description Service for publishing messages to RabbitMQ queues
 */
const { getChannel } = require("../config/rabbitmq");
const config = require("../config");
const logger = require("./logger.service");

/**
 * Publishes a message to a RabbitMQ queue
 * @async
 * @function publishToQueue
 * @param {string} queueName - Name of the queue to publish to
 * @param {Object} message - Message object to be serialized and published
 * @returns {Promise<void>}
 */
const publishToQueue = async (queueName, message) => {
  try {
    const channel = await getChannel();
    if (!channel) {
      logger.error(`Cannot publish to queue ${queueName}: RabbitMQ channel not available.`);
      // Implement fallback or error handling logic here
      // For now, we just log and potentially lose the message
      return; // Exit if channel isn't ready
    }
    const messageBuffer = Buffer.from(JSON.stringify(message));
    // Ensure the queue exists before publishing (optional, can be done on startup or here)
    // await channel.assertQueue(queueName, { durable: true }); // Already asserted in connectRabbitMQ usually
    channel.sendToQueue(queueName, messageBuffer, { persistent: true }); // persistent ensures msg survives broker restart
    // logger.debug(` [x] Sent ${JSON.stringify(message)} to queue ${queueName}`);
  } catch (error) {
    logger.error(`Error publishing to queue ${queueName}:`, error.message);
    // Implement retry or error handling strategy (e.g., save to DB temporarily)
  }
};

module.exports = { publishToQueue };
