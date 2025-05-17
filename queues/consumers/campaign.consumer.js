/**
 * @module CampaignConsumer
 * @description Consumes campaign-related messages from RabbitMQ
 */
const logger = require("../../services/logger.service");
const campaignService = require("../../services/campaign.service");
const campaignSenderService = require("../../services/campaign-sender.service");
const { QUEUE_NAMES } = require("../../config");

/**
 * Start the campaign consumer to process campaign messages
 * @param {Object} channel - RabbitMQ channel
 * @returns {Promise<void>}
 */
async function start(channel) {
  if (!channel) {
    throw new Error("Campaign consumer requires a valid RabbitMQ channel");
  }

  const queueName = QUEUE_NAMES.campaign;

  // Ensure the queue exists
  await channel.assertQueue(queueName, {
    durable: true,
  });

  logger.info(`[Campaign Consumer] Waiting for messages in ${queueName}`);

  // Process messages
  channel.consume(queueName, async (msg) => {
    if (!msg) {
      logger.warn("[Campaign Consumer] Received null message, skipping");
      return;
    }

    try {
      const content = JSON.parse(msg.content.toString());
      logger.info(`[Campaign Consumer] Received message: ${JSON.stringify(content)}`); // Handle different campaign actions
      switch (content.action) {
        case "send":
          await campaignSenderService.processCampaign(content.campaignId);
          break;
        case "schedule":
          await campaignService.updateCampaign(content.campaignId, { scheduledAt: new Date(content.scheduledTime), status: "scheduled" });
          break;
        case "test":
          // Implement test sending logic or use existing service
          logger.info(`[Campaign Consumer] Test action requested for campaign ${content.campaignId}`);
          break;
        case "cancel":
          await campaignService.updateCampaign(content.campaignId, { status: "cancelled" });
          break;
        default:
          logger.warn(`[Campaign Consumer] Unknown action: ${content.action}`);
      }

      // Acknowledge the message
      channel.ack(msg);
      logger.info(`[Campaign Consumer] Successfully processed message: ${msg.content.toString()}`);
    } catch (error) {
      logger.error(`[Campaign Consumer] Error processing message: ${error.message}`);

      // Reject the message and requeue if it's a temporary failure
      // For permanent failures, dead-letter queue handling should be implemented
      if (error.isTemporary) {
        channel.nack(msg, false, true); // requeue
      } else {
        channel.nack(msg, false, false); // don't requeue
      }
    }
  });

  logger.info("[Campaign Consumer] Started successfully");
}

module.exports = { start };
