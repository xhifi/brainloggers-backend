/**
 * @module services/campaign-sender
 * @description Service for processing and sending email campaigns
 */
const db = require("../config/db");
const logger = require("./logger.service");
const emailTemplateService = require("./email-template.service");
const mailingListService = require("./mailing-list.service");
const queueService = require("./queue.service");
const subscriberService = require("./subscriber.service");
const subscriberVariablesService = require("./subscriber-variables.service");
const { NotFound, BadGateway } = require("../utils/errors");

// Queue name for processing emails
const EMAIL_QUEUE = "email_queue";
// Batch size for processing recipients (to avoid memory issues)
const BATCH_SIZE = 100;

/**
 * Process a campaign for sending - either immediately or scheduled
 * @async
 * @function processCampaign
 * @param {number} campaignId - ID of campaign to process
 * @param {string} [userId] - ID of user triggering the send
 * @returns {Promise<Object>} Processing result with counts
 */
async function processCampaign(campaignId, userId) {
  logger.info(`Processing campaign ${campaignId} for sending`);

  // 1. Get campaign details
  const campaign = await getCampaignWithDetails(campaignId);

  // 2. Validate campaign can be sent
  if (!campaign) {
    throw new NotFound(`Campaign with ID ${campaignId} not found`);
  }

  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    throw new BadGateway(`Campaign ${campaignId} cannot be sent: status is ${campaign.status}`);
  }

  // 3. Get template
  const template = await emailTemplateService.getEmailTemplateById(campaign.template_id, true);

  // 4. Determine if this is an immediate send or a scheduled send
  const isScheduled = campaign.scheduled_at && new Date(campaign.scheduled_at) > new Date();
  const status = isScheduled ? "scheduled" : "processing";

  // 5. Update campaign status and set published information
  await updateCampaignStatus(campaignId, status, userId);

  // 6. If it's scheduled, we just update the status and let the scheduler handle it
  if (isScheduled) {
    logger.info(`Campaign ${campaignId} scheduled for ${campaign.scheduled_at}`);
    // Scheduled campaign will be picked up by the scheduler
    return {
      status: "scheduled",
      scheduledAt: campaign.scheduled_at,
      recipientCount: await getRecipientCount(campaignId),
    };
  }

  // 7. Otherwise, process for immediate sending
  return sendCampaignImmediately(campaignId, campaign, template);
}

/**
 * Send a campaign immediately
 * @async
 * @function sendCampaignImmediately
 * @param {number} campaignId - ID of campaign
 * @param {Object} campaign - Campaign data
 * @param {Object} template - Email template data with content
 * @returns {Promise<Object>} Sending result with counts
 */
async function sendCampaignImmediately(campaignId, campaign, template) {
  logger.info(`Sending campaign ${campaignId} immediately`);

  // Set campaign to processing status
  await updateCampaignStatus(campaignId, "processing");

  // Get all recipients from associated mailing lists
  const recipientCount = await queueCampaignRecipients(campaignId, campaign, template);

  // Update campaign to published status if we've started sending
  if (recipientCount > 0) {
    await updateCampaignStatus(campaignId, "sending");
  } else {
    await updateCampaignStatus(campaignId, "completed");
  }

  return {
    status: "sending",
    recipientCount,
    startedAt: new Date().toISOString(),
  };
}

/**
 * Queue recipients for a campaign in batches
 * @async
 * @function queueCampaignRecipients
 * @param {number} campaignId - Campaign ID
 * @param {Object} campaign - Campaign data
 * @param {Object} template - Email template with content
 * @returns {Promise<number>} Total recipients queued
 */
async function queueCampaignRecipients(campaignId, campaign, template) {
  // Get a count of all recipients first
  const totalRecipients = await getRecipientCount(campaignId);

  if (totalRecipients === 0) {
    logger.warn(`Campaign ${campaignId} has no recipients`);
    return 0;
  }

  // Process recipients in batches to avoid memory issues
  let processed = 0;
  let offset = 0;

  while (processed < totalRecipients) {
    // Get a batch of recipients
    const recipients = await getRecipientsForCampaign(campaignId, BATCH_SIZE, offset);

    if (recipients.length === 0) {
      break; // No more recipients
    }

    // Bulk load variables for all recipients in this batch
    const subscriberIds = recipients.map((r) => r.id);
    const subscriberVariablesMap = await subscriberVariablesService.getVariablesForSubscribers(subscriberIds);

    // Process each recipient in the batch
    for (const recipient of recipients) {
      // Get variables for this specific subscriber
      const subscriberVariables = subscriberVariablesMap[recipient.id] || {};

      await queueEmailForRecipient(recipient, campaign, template, subscriberVariables);
    }

    // Update counters
    processed += recipients.length;
    offset += BATCH_SIZE;

    // Log progress periodically
    if (processed % 1000 === 0 || processed === totalRecipients) {
      logger.info(`Campaign ${campaignId}: Queued ${processed}/${totalRecipients} emails`);
    }
  }

  return totalRecipients;
}

/**
 * Queue an individual email for a recipient
 * @async
 * @function queueEmailForRecipient
 * @param {Object} recipient - Recipient data
 * @param {Object} campaign - Campaign data
 * @param {Object} template - Email template data
 * @param {Object} subscriberVariables - Pre-loaded subscriber variables from subscriber_variables table
 * @returns {Promise<void>}
 */
async function queueEmailForRecipient(recipient, campaign, template, subscriberVariables = {}) {
  try {
    // Prepare comprehensive data context using the new subscriber variables system
    const data = {
      // Standard subscriber fields
      id: recipient.id,
      email: recipient.email,
      name: recipient.name,
      first_name: recipient.first_name,
      last_name: recipient.last_name,
      phone: recipient.phone,
      created_at: recipient.created_at,
      updated_at: recipient.updated_at,
      is_active: recipient.is_active,

      // Pre-loaded variables from subscriber_variables table (includes metadata)
      ...subscriberVariables,

      // Campaign template variables (override subscriber variables if conflicts)
      ...campaign.template_variables,

      // Campaign-specific variables
      campaign_name: campaign.name,
      campaign_id: campaign.id,
      sent_date: new Date().toISOString(),
      unsubscribe_url: `${process.env.API_URL || ""}/unsubscribe?token=${Buffer.from(`${campaign.id}:${recipient.id}`).toString("base64")}`,
      company_name: process.env.COMPANY_NAME || "Our Company",

      // Deprecated: Keep for backward compatibility (prefer individual fields)
      metadata: recipient.metadata || {},
    };

    // Create email job
    const emailJob = {
      campaignId: campaign.id,
      recipient: {
        id: recipient.id,
        email: recipient.email,
        name: recipient.name || null,
      },
      sender: {
        email: campaign.from_email,
        name: campaign.name || null,
      },
      replyTo: campaign.reply_to || campaign.from_email,
      subject: campaign.subject,
      templateId: campaign.template_id,
      templateMjmlContent: template.mjmlContent,
      templateHtmlContent: template.htmlContent,
      data,
      timestamp: new Date().toISOString(),
    };

    // Queue the email
    await queueService.publishToQueue(EMAIL_QUEUE, emailJob);
  } catch (error) {
    logger.error(`Error queueing email for campaign ${campaign.id} to recipient ${recipient.email}:`, error);
    // Continue processing other recipients despite errors
  }
}

/**
 * Get campaign data with associated details
 * @async
 * @function getCampaignWithDetails
 * @param {number} campaignId - Campaign ID
 * @returns {Promise<Object|null>} Campaign data or null if not found
 */
async function getCampaignWithDetails(campaignId) {
  try {
    const { rows } = await db.query(`SELECT * FROM email_campaigns WHERE id = $1 AND is_deleted = FALSE`, [campaignId]);

    if (rows.length === 0) {
      return null;
    }

    // Get associated mailing lists
    const { rows: mailingListRows } = await db.query(
      `SELECT ml.* FROM mailing_lists ml
       JOIN campaign_mailing_lists cml ON ml.id = cml.mailing_list_id
       WHERE cml.campaign_id = $1`,
      [campaignId]
    );

    const campaign = rows[0];
    campaign.mailingLists = mailingListRows;

    return campaign;
  } catch (error) {
    logger.error(`Error getting campaign ${campaignId}:`, error);
    throw error;
  }
}

/**
 * Update a campaign's status
 * @async
 * @function updateCampaignStatus
 * @param {number} campaignId - Campaign ID
 * @param {string} status - New status
 * @param {string} [userId] - ID of user making the change
 * @returns {Promise<Object>} Updated campaign data
 */
async function updateCampaignStatus(campaignId, status, userId = null) {
  try {
    const updates = ["status = $2", "updated_at = CURRENT_TIMESTAMP"];
    const values = [campaignId, status];
    let paramIndex = 3;

    // Add specific timestamp fields based on status
    if (status === "sending" || status === "processing") {
      updates.push("published_at = CURRENT_TIMESTAMP");
    }

    if (status === "completed") {
      updates.push("completed_at = CURRENT_TIMESTAMP");
    }

    // Add published_by if userId provided
    if (userId && (status === "sending" || status === "processing")) {
      updates.push(`published_by = $${paramIndex}`);
      values.push(userId);
      paramIndex++;
    }

    // For all status changes with userId, update updated_by
    if (userId) {
      updates.push(`updated_by = $${paramIndex}`);
      values.push(userId);
    }

    const { rows } = await db.query(
      `UPDATE email_campaigns 
       SET ${updates.join(", ")}
       WHERE id = $1 AND is_deleted = FALSE
       RETURNING *`,
      values
    );

    if (rows.length === 0) {
      throw new NotFound(`Campaign with ID ${campaignId} not found`);
    }

    return rows[0];
  } catch (error) {
    logger.error(`Error updating campaign ${campaignId} status to ${status}:`, error);
    throw error;
  }
}

/**
 * Get count of recipients for a campaign
 * @async
 * @function getRecipientCount
 * @param {number} campaignId - Campaign ID
 * @returns {Promise<number>} Count of recipients
 */
async function getRecipientCount(campaignId) {
  try {
    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT mr.recipient_id) as total
       FROM campaign_mailing_lists cml
       JOIN mailing_list_recipients mr ON cml.mailing_list_id = mr.mailing_list_id
       WHERE cml.campaign_id = $1 AND mr.recipient_type = 'subscriber'`,
      [campaignId]
    );

    return parseInt(rows[0]?.total || "0");
  } catch (error) {
    logger.error(`Error counting recipients for campaign ${campaignId}:`, error);
    throw error;
  }
}

/**
 * Get a batch of recipients for a campaign
 * @async
 * @function getRecipientsForCampaign
 * @param {number} campaignId - Campaign ID
 * @param {number} limit - Maximum recipients to get
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array<Object>>} List of recipient data
 */
async function getRecipientsForCampaign(campaignId, limit, offset) {
  try {
    const { rows } = await db.query(
      `SELECT DISTINCT s.* 
       FROM subscribers s
       JOIN mailing_list_recipients mr ON s.id = mr.recipient_id
       JOIN campaign_mailing_lists cml ON mr.mailing_list_id = cml.mailing_list_id
       WHERE cml.campaign_id = $1 
       AND mr.recipient_type = 'subscriber'
       AND s.is_active = TRUE
       ORDER BY s.id
       LIMIT $2 OFFSET $3`,
      [campaignId, limit, offset]
    );

    return rows;
  } catch (error) {
    logger.error(`Error getting recipients for campaign ${campaignId}:`, error);
    throw error;
  }
}

/**
 * Process all campaigns that are scheduled to be sent now
 * @async
 * @function processScheduledCampaigns
 * @returns {Promise<Array>} Results from processing each due campaign
 */
async function processScheduledCampaigns() {
  logger.info("Running scheduled campaigns check");

  try {
    // Find scheduled campaigns that are due
    const { rows: dueCampaigns } = await db.query(
      `SELECT id FROM email_campaigns 
       WHERE status = 'scheduled' 
       AND scheduled_at <= CURRENT_TIMESTAMP
       AND is_deleted = FALSE`
    );

    logger.info(`Found ${dueCampaigns.length} scheduled campaigns ready to send`);

    // Process each due campaign
    const results = [];
    for (const campaign of dueCampaigns) {
      try {
        const result = await processCampaign(campaign.id);
        results.push({
          campaignId: campaign.id,
          status: "processed",
          result,
        });
      } catch (error) {
        logger.error(`Error processing scheduled campaign ${campaign.id}:`, error);
        results.push({
          campaignId: campaign.id,
          status: "error",
          error: error.message,
        });
      }
    }

    return results;
  } catch (error) {
    logger.error("Error processing scheduled campaigns:", error);
    throw error;
  }
}

/**
 * Process HTML content to track links for a campaign
 * @function processTrackedLinks
 * @param {string} htmlContent - Original HTML content
 * @param {number} campaignId - Campaign ID for tracking
 * @param {number} recipientId - Recipient ID for tracking
 * @returns {string} HTML with tracked links
 */
function processTrackedLinks(htmlContent, campaignId, recipientId) {
  if (!htmlContent || !campaignId) {
    return htmlContent;
  }

  try {
    // Simple regex to find all links in HTML
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/g;

    // Replace each link with a tracked version
    const trackedHtml = htmlContent.replace(linkRegex, (match, quote, url) => {
      // Skip tracking for anchor links or non-http links
      if (url.startsWith("#") || (!url.startsWith("http") && !url.startsWith("https"))) {
        return match;
      }

      // Create tracked URL
      const trackingParams = new URLSearchParams();
      trackingParams.append("cid", campaignId);
      trackingParams.append("rid", recipientId);

      // Encode the original URL to use as a parameter
      const encodedUrl = encodeURIComponent(url);

      // Create the tracking URL (assuming your tracking endpoint is /track/click)
      const trackedUrl = `/track/click?url=${encodedUrl}&${trackingParams.toString()}`;

      // Replace the original link
      return `<a href="${quote}${trackedUrl}${quote}`;
    });

    return trackedHtml;
  } catch (error) {
    logger.error(`Error processing tracked links for campaign ${campaignId}:`, error);
    return htmlContent; // Return original content on error
  }
}

module.exports = {
  processCampaign,
  sendCampaignImmediately,
  processScheduledCampaigns,
  updateCampaignStatus,
  processTrackedLinks,
};
