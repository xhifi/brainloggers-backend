/**
 * @module consumers/campaign-email
 * @description Consumer for processing campaign emails from the queue
 */
const { getChannel } = require("../../config/rabbitmq");
const emailService = require("../../services/email.service");
const db = require("../../config/db");
const logger = require("../../services/logger.service");
const emailTemplateService = require("../../services/email-template.service");
const subscriberVariablesService = require("../../services/subscriber-variables.service");

// Queue configuration
const EMAIL_QUEUE = "email_queue";
const CAMPAIGN_STATUS_QUEUE = "campaign_status_queue";

/**
 * Initialize the campaign email consumer
 */
async function initCampaignEmailConsumer() {
  try {
    const channel = await getChannel();

    if (!channel) {
      logger.error("Cannot initialize campaign email consumer: RabbitMQ channel not available");
      return;
    }

    // Ensure queues exist
    await channel.assertQueue(EMAIL_QUEUE, { durable: true });
    await channel.assertQueue(CAMPAIGN_STATUS_QUEUE, { durable: true });

    // Set prefetch to limit concurrent processing
    channel.prefetch(5);

    channel.consume(EMAIL_QUEUE, async (msg) => {
      if (!msg) return;

      try {
        // Parse message content
        const emailJob = JSON.parse(msg.content.toString());
        logger.info(`Processing campaign email to ${emailJob.recipient.email} for campaign ${emailJob.campaignId}`);

        // Process the email
        await processEmail(emailJob);

        // Acknowledge successful processing
        channel.ack(msg);

        // Send status update to campaign status queue
        await sendStatusUpdate(emailJob.campaignId, emailJob.recipient.id, "sent");
      } catch (error) {
        logger.error("Error processing campaign email:", error);

        // Check if the message has been retried too many times
        const retryCount = parseInt(msg.properties.headers?.["x-retry-count"] || "0");

        if (retryCount < 3) {
          // Requeue with retry count incremented
          channel.nack(msg, false, false);

          // Send back to queue with retry information
          const emailJob = JSON.parse(msg.content.toString());
          const retryMsg = {
            ...emailJob,
            retryCount: retryCount + 1,
            error: error.message,
          };

          setTimeout(() => {
            channel.sendToQueue(EMAIL_QUEUE, Buffer.from(JSON.stringify(retryMsg)), {
              persistent: true,
              headers: { "x-retry-count": retryCount + 1 },
            });
          }, 30000); // Delay retry by 30 seconds
        } else {
          // Acknowledge but record failure
          channel.ack(msg);

          // Send failure status update
          try {
            const emailJob = JSON.parse(msg.content.toString());
            await sendStatusUpdate(emailJob.campaignId, emailJob.recipient.id, "failed", { error: error.message });
          } catch (statusError) {
            logger.error("Error sending failure status update:", statusError);
          }
        }
      }
    });

    logger.info("Campaign email consumer initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize campaign email consumer:", error);
  }
}

/**
 * Process a single campaign email
 * @async
 * @function processEmail
 * @param {Object} emailJob - Email job from queue
 * @returns {Promise<void>}
 */
async function processEmail(emailJob) {
  const { recipient, sender, replyTo, subject, templateId, templateHtmlContent, templateMjmlContent, data } = emailJob;

  // Enhance data with subscriber variables if recipient ID is available and data is incomplete
  let enhancedData = data;
  if (recipient.id && (!data || Object.keys(data).length < 5)) {
    try {
      // Get additional subscriber variables if the data seems incomplete
      const subscriberVariables = await subscriberVariablesService.getSubscriberVariables(recipient.id);
      enhancedData = {
        ...data,
        ...subscriberVariables,
      };
      logger.debug(`Enhanced data for recipient ${recipient.id} with ${Object.keys(subscriberVariables).length} variables`);
    } catch (error) {
      logger.warn(`Failed to enhance data for recipient ${recipient.id}:`, error);
      enhancedData = data; // Use original data if enhancement fails
    }
  }

  // If HTML content is provided, use it directly
  if (templateHtmlContent) {
    // Render the template with the enhanced data
    const renderedContent = emailTemplateService.renderVariables(templateHtmlContent, enhancedData);
    const renderedSubject = emailTemplateService.renderVariables(subject, enhancedData);

    // Add tracking pixel for opens
    const trackingPixel = `<img src="${process.env.API_URL || ""}/track/open?cid=${emailJob.campaignId}&rid=${
      recipient.id
    }" width="1" height="1" alt="" style="display:none;">`;
    const contentWithTracking = renderedContent + trackingPixel;

    // Process tracked links if link tracking is enabled
    const campaignSenderService = require("../../services/campaign-sender.service");
    const finalContent = campaignSenderService.processTrackedLinks(contentWithTracking, emailJob.campaignId, recipient.id);

    // Send the email using email service
    await emailService.sendEmail({
      to: recipient.email,
      from: sender.email,
      fromName: sender.name,
      replyTo: replyTo,
      subject: renderedSubject,
      html: finalContent,
      campaignId: emailJob.campaignId,
      recipientId: recipient.id,
    });

    return;
  }
  // If MJML content is provided, render it
  if (templateMjmlContent) {
    // First interpolate variables in MJML
    const renderedMjml = emailTemplateService.renderVariables(templateMjmlContent, enhancedData);
    const renderedSubject = emailTemplateService.renderVariables(subject, enhancedData);

    // Convert MJML to HTML
    const { html } = require("mjml")(renderedMjml);

    // Send the email
    await emailService.sendEmail({
      to: recipient.email,
      from: sender.email,
      fromName: sender.name,
      replyTo: replyTo,
      subject: renderedSubject,
      html,
      campaignId: emailJob.campaignId,
      recipientId: recipient.id,
    });

    return;
  }
  // If neither is provided, fall back to template from DB
  const template = await emailTemplateService.getEmailTemplateById(templateId, true);

  // Use the new renderTemplate method with subscriber ID for automatic variable loading
  const rendered = await emailTemplateService.renderTemplate(template.mjmlContent, recipient.id, enhancedData);

  // Send the email
  await emailService.sendEmail({
    to: recipient.email,
    from: sender.email,
    fromName: sender.name,
    replyTo: replyTo,
    subject: rendered.subject,
    html: rendered.htmlContent,
    campaignId: emailJob.campaignId,
    recipientId: recipient.id,
  });
}

/**
 * Send status update for campaign tracking
 * @async
 * @function sendStatusUpdate
 * @param {number} campaignId - Campaign ID
 * @param {number} recipientId - Recipient ID
 * @param {string} status - Status (sent, failed, opened, clicked, etc.)
 * @param {Object} [additionalData={}] - Additional data to store
 * @returns {Promise<void>}
 */
async function sendStatusUpdate(campaignId, recipientId, status, additionalData = {}) {
  try {
    // Directly store in database
    await db.query(
      `INSERT INTO email_analytics (campaign_id, recipient_id, event_type, additional_data) 
       VALUES ($1, $2, $3, $4)`,
      [campaignId, recipientId, status, JSON.stringify(additionalData)]
    );

    // If this is the last email to send, update campaign status
    if (status === "sent" || status === "failed") {
      const remainingCount = await getRemainingEmailCount(campaignId);

      if (remainingCount <= 0) {
        await updateCampaignToCompleted(campaignId);
      }
    }
  } catch (error) {
    logger.error(`Error recording ${status} status for campaign ${campaignId}, recipient ${recipientId}:`, error);
  }
}

/**
 * Get remaining email count for a campaign
 * @async
 * @function getRemainingEmailCount
 * @param {number} campaignId - Campaign ID
 * @returns {Promise<number>} Count of emails left to send
 */
async function getRemainingEmailCount(campaignId) {
  try {
    const { rows } = await db.query(
      `SELECT
          (SELECT COUNT(DISTINCT mr.recipient_id) 
           FROM campaign_mailing_lists cml
           JOIN mailing_list_recipients mr ON cml.mailing_list_id = mr.mailing_list_id
           WHERE cml.campaign_id = $1 AND mr.recipient_type = 'subscriber') AS total_recipients,
           
          (SELECT COUNT(DISTINCT recipient_id)
           FROM email_analytics
           WHERE campaign_id = $1 
           AND (event_type = 'sent' OR event_type = 'failed')) AS processed_recipients`,
      [campaignId]
    );

    if (rows.length === 0) {
      return 0;
    }

    const total = parseInt(rows[0].total_recipients || "0");
    const processed = parseInt(rows[0].processed_recipients || "0");

    return total - processed;
  } catch (error) {
    logger.error(`Error calculating remaining emails for campaign ${campaignId}:`, error);
    return 0;
  }
}

/**
 * Update campaign status to completed
 * @async
 * @function updateCampaignToCompleted
 * @param {number} campaignId - Campaign ID
 * @returns {Promise<void>}
 */
async function updateCampaignToCompleted(campaignId) {
  try {
    // Check if campaign is already completed
    const { rows } = await db.query(`SELECT status FROM email_campaigns WHERE id = $1`, [campaignId]);

    if (rows.length === 0 || rows[0].status === "completed") {
      return;
    }

    // Update campaign to completed status
    await db.query(
      `UPDATE email_campaigns 
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [campaignId]
    );

    logger.info(`Campaign ${campaignId} marked as completed`);
  } catch (error) {
    logger.error(`Error updating campaign ${campaignId} to completed:`, error);
  }
}

module.exports = { initCampaignEmailConsumer };
