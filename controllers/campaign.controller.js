/**
 * @module controllers/campaign
 * @description Controller for email campaign endpoints
 */
const campaignService = require("../services/campaign.service");
const campaignSenderService = require("../services/campaign-sender.service");
const { BadRequest, NotFound } = require("../utils/errors");
const logger = require("../services/logger.service");
const db = require("../config/db");

/**
 * Create a new campaign
 * @async
 * @function createCampaign
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createCampaign = async (req, res, next) => {
  try {
    logger.info("Creating new campaign", { userId: req.user.id, campaignName: req.body.name });

    const { name, description, templateId, fromEmail, replyTo, subject, templateVariables, mailingListIds, scheduledAt } = req.body;

    const userId = req.user.id;

    // Validate required fields (some basic validation, more in DTO)
    if (!name) {
      logger.warn("Campaign creation failed: Missing name field", { userId });
      throw new BadRequest("Campaign name is required");
    }
    if (!fromEmail) {
      logger.warn("Campaign creation failed: Missing fromEmail field", { userId });
      throw new BadRequest("From email is required");
    }
    if (!subject) {
      logger.warn("Campaign creation failed: Missing subject field", { userId });
      throw new BadRequest("Subject is required");
    }
    if (!mailingListIds || !mailingListIds.length) {
      logger.warn("Campaign creation failed: No mailing lists selected", { userId });
      throw new BadRequest("At least one mailing list is required");
    }

    const campaign = await campaignService.createCampaign(
      {
        name,
        description,
        templateId,
        fromEmail,
        replyTo,
        subject,
        templateVariables,
        mailingListIds,
        scheduledAt,
      },
      userId
    );

    logger.info("Campaign created successfully", {
      userId,
      campaignId: campaign.id,
      campaignName: campaign.name,
    });

    res.status(201).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error("Failed to create campaign", {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * Update an existing campaign
 * @async
 * @function updateCampaign
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info("Updating campaign", { userId, campaignId: id });

    const campaign = await campaignService.updateCampaign(id, req.body, userId);

    logger.info("Campaign updated successfully", { userId, campaignId: id });

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error("Failed to update campaign", {
      userId: req.user?.id,
      campaignId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * Delete a campaign
 * @async
 * @function deleteCampaign
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.deleteCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info("Deleting campaign", { userId, campaignId: id });

    await campaignService.deleteCampaign(id);

    logger.info("Campaign deleted successfully", { userId, campaignId: id });

    res.json({
      success: true,
      message: "Campaign deleted successfully",
    });
  } catch (error) {
    logger.error("Failed to delete campaign", {
      userId: req.user?.id,
      campaignId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * Get a campaign by ID
 * @async
 * @function getCampaignById
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getCampaignById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.debug("Fetching campaign by ID", { userId, campaignId: id });

    const campaign = await campaignService.getCampaignById(id);

    logger.debug("Campaign fetched successfully", { userId, campaignId: id });

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error("Failed to fetch campaign by ID", {
      userId: req.user?.id,
      campaignId: req.params.id,
      error: error.message,
    });
    next(error);
  }
};

/**
 * List campaigns with pagination and filtering
 * @async
 * @function listCampaigns
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.listCampaigns = async (req, res, next) => {
  try {
    const { page, limit, search, status } = req.query;
    const userId = req.user.id;

    logger.debug("Listing campaigns", {
      userId,
      filters: { page, limit, search, status },
    });

    const options = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      status,
    };

    const result = await campaignService.listCampaigns(options);

    logger.debug("Campaigns listed successfully", {
      userId,
      count: result.data?.length || 0,
      totalCount: result.totalCount || 0,
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error("Failed to list campaigns", {
      userId: req.user?.id,
      error: error.message,
    });
    next(error);
  }
};

/**
 * Schedule a campaign to be sent at a specific time
 * @async
 * @function scheduleCampaign
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.scheduleCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { scheduledAt } = req.body;
    const userId = req.user.id;

    logger.info("Scheduling campaign", { userId, campaignId: id, scheduledAt });

    if (!scheduledAt) {
      logger.warn("Campaign scheduling failed: No schedule time provided", { userId, campaignId: id });
      throw new BadRequest("Scheduled date and time is required");
    }

    // Update campaign with scheduled date
    const campaign = await campaignService.updateCampaign(
      id,
      {
        scheduledAt: new Date(scheduledAt),
        status: "scheduled",
      },
      userId
    );

    logger.info("Campaign scheduled successfully", {
      userId,
      campaignId: id,
      scheduledAt: campaign.scheduledAt,
    });

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error("Failed to schedule campaign", {
      userId: req.user?.id,
      campaignId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * Send a campaign immediately
 * @async
 * @function sendCampaign
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.sendCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info("Sending campaign immediately", { userId, campaignId: id });

    // Process the campaign using the campaign sender service
    const result = await campaignSenderService.processCampaign(id, userId);

    logger.info("Campaign send process initiated successfully", {
      userId,
      campaignId: id,
      status: result.status,
      recipientCount: result.recipientCount,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error("Failed to send campaign", {
      userId: req.user?.id,
      campaignId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * Publish a campaign immediately
 * @async
 * @function publishCampaign
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.publishCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info("Publishing campaign immediately", { userId, campaignId: id });

    const campaign = await campaignService.publishCampaign(id, userId);

    logger.info("Campaign published successfully", {
      userId,
      campaignId: id,
      status: campaign.status,
    });

    res.json({
      success: true,
      data: campaign,
      message: "Campaign published successfully and emails are being sent",
    });
  } catch (error) {
    logger.error("Failed to publish campaign", {
      userId: req.user?.id,
      campaignId: req.params.id,
      error: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

/**
 * Get statistics for a campaign
 * @async
 * @function getCampaignStats
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getCampaignStats = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info("Getting campaign statistics", { userId, campaignId: id });

    // Get campaign statistics from database
    const { rows } = await db.query(
      `SELECT 
         c.id AS campaign_id, 
         c.name AS campaign_name,
         c.status,
         c.created_at,
         c.scheduled_at,
         c.published_at,
         c.completed_at,
         COUNT(DISTINCT ea.id) FILTER (WHERE ea.event_type = 'sent') AS sent_count,
         COUNT(DISTINCT ea.id) FILTER (WHERE ea.event_type = 'delivered') AS delivered_count,
         COUNT(DISTINCT ea.id) FILTER (WHERE ea.event_type = 'opened') AS opened_count,
         COUNT(DISTINCT ea.id) FILTER (WHERE ea.event_type = 'clicked') AS clicked_count,
         COUNT(DISTINCT ea.id) FILTER (WHERE ea.event_type = 'failed') AS failed_count
       FROM email_campaigns c
       LEFT JOIN email_analytics ea ON c.id = ea.campaign_id
       WHERE c.id = $1 AND c.is_deleted = FALSE
       GROUP BY c.id`,
      [id]
    );

    if (rows.length === 0) {
      throw new NotFound(`Campaign with ID ${id} not found`);
    }

    const stats = rows[0];

    // Add open rate and click rate
    const totalSent = parseInt(stats.sent_count || 0);
    if (totalSent > 0) {
      stats.open_rate = ((parseInt(stats.opened_count || 0) / totalSent) * 100).toFixed(2);
      stats.click_rate = ((parseInt(stats.clicked_count || 0) / totalSent) * 100).toFixed(2);
    } else {
      stats.open_rate = "0.00";
      stats.click_rate = "0.00";
    }

    logger.info("Campaign statistics retrieved successfully", {
      userId,
      campaignId: id,
      stats: {
        sent: stats.sent_count,
        opened: stats.opened_count,
        clicked: stats.clicked_count,
      },
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error("Failed to get campaign statistics", {
      userId: req.user?.id,
      campaignId: req.params.id,
      error: error.message,
    });
    next(error);
  }
};

/**
 * Cancel a scheduled campaign
 * @async
 * @function cancelCampaign
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.cancelCampaign = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    logger.info("Cancelling campaign", { userId, campaignId: id });

    // Check if campaign is in a state that can be cancelled
    const { rows } = await db.query(`SELECT status FROM email_campaigns WHERE id = $1 AND is_deleted = FALSE`, [id]);

    if (rows.length === 0) {
      throw new NotFound(`Campaign with ID ${id} not found`);
    }

    const status = rows[0].status;
    if (status !== "scheduled" && status !== "draft") {
      throw new BadRequest(`Campaign cannot be cancelled: status is ${status}`);
    }

    // Update campaign status to cancelled
    const campaign = await campaignService.updateCampaign(
      id,
      {
        status: "cancelled",
      },
      userId
    );

    logger.info("Campaign cancelled successfully", {
      userId,
      campaignId: id,
    });

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error("Failed to cancel campaign", {
      userId: req.user?.id,
      campaignId: req.params.id,
      error: error.message,
    });
    next(error);
  }
};
