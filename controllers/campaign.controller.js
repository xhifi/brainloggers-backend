/**
 * @module controllers/campaign
 * @description Controller for email campaign endpoints
 */
const campaignService = require("../services/campaign.service");
const { BadRequest } = require("../utils/errors");
const logger = require("../services/logger.service");

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
    const { name, description, templateId, fromEmail, replyTo, subject, templateVariables, mailingListIds, scheduledAt } = req.body;

    const userId = req.user.id;

    // Validate required fields (some basic validation, more in DTO)
    if (!name) {
      throw new BadRequest("Campaign name is required");
    }
    if (!fromEmail) {
      throw new BadRequest("From email is required");
    }
    if (!subject) {
      throw new BadRequest("Subject is required");
    }
    if (!mailingListIds || !mailingListIds.length) {
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

    res.status(201).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
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

    const campaign = await campaignService.updateCampaign(id, req.body, userId);

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
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

    await campaignService.deleteCampaign(id);

    res.json({
      success: true,
      message: "Campaign deleted successfully",
    });
  } catch (error) {
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

    const campaign = await campaignService.getCampaignById(id);

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
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

    const options = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      status,
    };

    const result = await campaignService.listCampaigns(options);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
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

    if (!scheduledAt) {
      throw new BadRequest("Scheduled date and time is required");
    }

    // Update campaign with scheduled date
    const campaign = await campaignService.updateCampaign(
      id,
      {
        scheduledAt: new Date(scheduledAt),
        status: "scheduled",
      },
      req.user.id
    );

    res.json({
      success: true,
      data: campaign,
    });
  } catch (error) {
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

    const campaign = await campaignService.publishCampaign(id, userId);

    res.json({
      success: true,
      data: campaign,
      message: "Campaign published successfully and emails are being sent",
    });
  } catch (error) {
    next(error);
  }
};
