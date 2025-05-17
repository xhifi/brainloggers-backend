/**
 * @module routes/campaign
 * @description Routes for campaign management
 */
const express = require("express");
const router = express.Router();
const campaignController = require("../controllers/campaign.controller");
const authenticate = require("../middleware/authenticate");
const { hasAnyPermission } = require("../middleware/authorize");
const { validate } = require("../middleware/validate");
const { createCampaignSchema, updateCampaignSchema, scheduleCampaignSchema, getCampaignSchema } = require("../dtos/campaign.dto");

// Protected routes - require authentication and authorization
// Get all campaigns (with pagination and filters)
/**
 * @route GET /api/campaigns
 * @description Get all campaigns with optional filters
 * @access Private (requires campaign:read permission)
 */
router.get("/", authenticate, hasAnyPermission({ resource: "campaigns", action: "read" }), campaignController.listCampaigns);

/**
 * @route GET /api/campaigns/:id
 * @description Get a campaign by ID
 * @access Private (requires campaign:read permission)
 */
router.get(
  "/:id",
  authenticate,
  hasAnyPermission({ resource: "campaigns", action: "read" }),
  validate(getCampaignSchema),
  campaignController.getCampaignById
);

/**
 * @route POST /api/campaigns
 * @description Create a new campaign
 * @access Private (requires campaign:create permission)
 */
router.post(
  "/",
  authenticate,
  hasAnyPermission({ resource: "campaigns", action: "create" }),
  validate(createCampaignSchema),
  campaignController.createCampaign
);

/**
 * @route PUT /api/campaigns/:id
 * @description Update a campaign
 * @access Private (requires campaign:update permission)
 */
router.put(
  "/:id",
  authenticate,
  hasAnyPermission({ resource: "campaigns", action: "update" }),
  validate(updateCampaignSchema),
  campaignController.updateCampaign
);

/**
 * @route DELETE /api/campaigns/:id
 * @description Delete a campaign
 * @access Private (requires campaign:delete permission)
 */
router.delete(
  "/:id",
  authenticate,
  hasAnyPermission({ resource: "campaigns", action: "delete" }),
  validate(getCampaignSchema),
  campaignController.deleteCampaign
);

/**
 * @route POST /api/campaigns/:id/schedule
 * @description Schedule a campaign to be sent at a specific time
 * @access Private (requires campaign:send permission)
 */
router.post(
  "/:id/schedule",
  authenticate,
  hasAnyPermission({ resource: "campaigns", action: "send" }),
  validate(scheduleCampaignSchema),
  campaignController.scheduleCampaign
);

/**
 * @route POST /api/campaigns/:id/send
 * @description Send a campaign immediately
 * @access Private (requires campaign:send permission)
 */
router.post(
  "/:id/send",
  authenticate,
  hasAnyPermission({ resource: "campaigns", action: "send" }),
  validate(getCampaignSchema),
  campaignController.sendCampaign
);

/**
 * @route GET /api/campaigns/:id/stats
 * @description Get statistics for a campaign
 * @access Private (requires campaign:read permission)
 */
router.get(
  "/:id/stats",
  authenticate,
  hasAnyPermission({ resource: "campaigns", action: "read" }),
  validate(getCampaignSchema),
  campaignController.getCampaignStats
);

/**
 * @route POST /api/campaigns/:id/cancel
 * @description Cancel a scheduled campaign
 * @access Private (requires campaign:send permission)
 */
router.post(
  "/:id/cancel",
  authenticate,
  hasAnyPermission({ resource: "campaigns", action: "send" }),
  validate(getCampaignSchema),
  campaignController.cancelCampaign
);

module.exports = router;
