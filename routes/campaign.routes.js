/**
 * @module Routes/Campaigns
 * @description Routes for email campaign management
 */
const express = require("express");
const router = express.Router();
const campaignController = require("../controllers/campaign.controller");
const authenticate = require("../middleware/authenticate");
const { hasAllPermissions } = require("../middleware/authorize");
const { validateCampaign, validateUpdateCampaign, validateScheduleCampaign } = require("../dtos/campaign.dto");

// Campaign middleware groups based on subscription permissions
// We're reusing subscription permissions for campaigns since they're closely related
const campaignReadAccess = [authenticate, hasAllPermissions({ resource: "subscriptions", action: "read" })];
const campaignCreateAccess = [authenticate, hasAllPermissions({ resource: "subscriptions", action: "create" })];
const campaignUpdateAccess = [authenticate, hasAllPermissions({ resource: "subscriptions", action: "update" })];
const campaignDeleteAccess = [authenticate, hasAllPermissions({ resource: "subscriptions", action: "delete" })];

/**
 * List all campaigns with pagination and filtering
 *
 * @route GET /api/campaigns
 * @group Campaigns - Operations related to email campaigns
 * @security JWT
 * @param {integer} request.query.page - Page number for pagination - eg: 1
 * @param {integer} request.query.limit - Number of items per page - eg: 10
 * @param {string} request.query.search - Optional search term to filter campaigns - eg: Newsletter
 * @param {string} request.query.status - Optional status filter ('draft', 'scheduled', 'sent') - eg: draft
 * @param {string} request.query.sortBy - Field to sort by - eg: createdAt
 * @param {string} request.query.sortOrder - Sort direction ('asc' or 'desc') - eg: desc
 * @returns {object} 200 - List of campaigns with pagination metadata
 * @returns {object} 401 - Unauthorized - Invalid or missing token
 * @returns {object} 403 - Forbidden - User doesn't have required permissions
 * @returns {object} 500 - Server error
 * @example response - 200 - Example success response
 * {
 *   "data": [
 *     {
 *       "id": 1,
 *       "name": "Monthly Newsletter",
 *       "subject": "May Newsletter",
 *       "status": "draft",
 *       "mailingListId": 5,
 *       "templateId": 3,
 *       "scheduledFor": null,
 *       "createdAt": "2025-05-01T10:30:00Z",
 *       "updatedAt": "2025-05-01T10:30:00Z"
 *     }
 *   ],
 *   "pagination": {
 *     "total": 5,
 *     "totalPages": 1,
 *     "currentPage": 1,
 *     "limit": 10
 *   }
 * }
 */
router.get("/", ...campaignReadAccess, campaignController.listCampaigns);

/**
 * Get a specific campaign by ID
 *
 * @route GET /api/campaigns/{id}
 * @group Campaigns - Operations related to email campaigns
 * @security JWT
 * @param {integer} request.params.id.required - Campaign ID - eg: 1
 * @returns {object} 200 - Campaign details
 * @returns {object} 401 - Unauthorized - Invalid or missing token
 * @returns {object} 403 - Forbidden - User doesn't have required permissions
 * @returns {object} 404 - Campaign not found
 * @returns {object} 500 - Server error
 * @example response - 200 - Example success response
 * {
 *   "id": 1,
 *   "name": "Monthly Newsletter",
 *   "subject": "May Newsletter",
 *   "content": {
 *     "templateId": 3,
 *     "variables": {
 *       "headerImage": "https://example.com/image.jpg",
 *       "mainHeading": "May Newsletter"
 *     }
 *   },
 *   "status": "draft",
 *   "mailingListId": 5,
 *   "templateId": 3,
 *   "mailingList": {
 *     "id": 5,
 *     "name": "Active Subscribers",
 *     "recipientCount": 1250
 *   },
 *   "template": {
 *     "id": 3,
 *     "name": "Newsletter Template"
 *   },
 *   "scheduledFor": null,
 *   "sentAt": null,
 *   "statistics": {
 *     "sent": 0,
 *     "delivered": 0,
 *     "opened": 0,
 *     "clicked": 0
 *   },
 *   "createdBy": "123e4567-e89b-12d3-a456-426614174000",
 *   "updatedBy": "123e4567-e89b-12d3-a456-426614174000",
 *   "createdAt": "2025-05-01T10:30:00Z",
 *   "updatedAt": "2025-05-01T10:30:00Z"
 * }
 */
router.get("/:id", ...campaignReadAccess, campaignController.getCampaignById);

/**
 * Create a new campaign
 *
 * @route POST /api/campaigns
 * @group Campaigns - Operations related to email campaigns
 * @security JWT
 * @param {object} request.body.required - Campaign data
 * @param {string} request.body.name.required - Campaign name - eg: Monthly Newsletter
 * @param {string} request.body.subject.required - Email subject line - eg: Your May Newsletter
 * @param {integer} request.body.mailingListId.required - ID of the mailing list to send to - eg: 5
 * @param {integer} request.body.templateId.required - ID of the email template to use - eg: 3
 * @param {object} request.body.content.required - Content with variables for the template
 * @param {object} request.body.content.variables - Template variables key-value pairs
 * @returns {object} 201 - Campaign created successfully
 * @returns {object} 400 - Validation error
 * @returns {object} 401 - Unauthorized - Invalid or missing token
 * @returns {object} 403 - Forbidden - User doesn't have required permissions
 * @returns {object} 500 - Server error
 * @example request - Example request payload
 * {
 *   "name": "Monthly Newsletter",
 *   "subject": "Your May Newsletter",
 *   "mailingListId": 5,
 *   "templateId": 3,
 *   "content": {
 *     "variables": {
 *       "headerImage": "https://example.com/image.jpg",
 *       "mainHeading": "May Newsletter",
 *       "introText": "Welcome to our monthly newsletter!"
 *     }
 *   }
 * }
 * @example response - 201 - Example success response
 * {
 *   "id": 1,
 *   "name": "Monthly Newsletter",
 *   "subject": "Your May Newsletter",
 *   "status": "draft",
 *   "mailingListId": 5,
 *   "templateId": 3,
 *   "createdAt": "2025-05-02T14:23:45Z",
 *   "updatedAt": "2025-05-02T14:23:45Z"
 * }
 */
router.post("/", ...campaignCreateAccess, validateCampaign, campaignController.createCampaign);

/**
 * Update an existing campaign
 *
 * @route PUT /api/campaigns/{id}
 * @group Campaigns - Operations related to email campaigns
 * @security JWT
 * @param {integer} request.params.id.required - Campaign ID - eg: 1
 * @param {object} request.body.required - Updated campaign data
 * @param {string} request.body.name - Campaign name - eg: Updated Newsletter
 * @param {string} request.body.subject - Email subject line - eg: Your Updated Newsletter
 * @param {integer} request.body.mailingListId - ID of the mailing list to send to - eg: 6
 * @param {integer} request.body.templateId - ID of the email template to use - eg: 4
 * @param {object} request.body.content - Content with variables for the template
 * @param {object} request.body.content.variables - Template variables key-value pairs
 * @returns {object} 200 - Campaign updated successfully
 * @returns {object} 400 - Validation error
 * @returns {object} 401 - Unauthorized - Invalid or missing token
 * @returns {object} 403 - Forbidden - User doesn't have required permissions
 * @returns {object} 404 - Campaign not found
 * @returns {object} 409 - Cannot update a sent campaign
 * @returns {object} 500 - Server error
 * @example request - Example request payload
 * {
 *   "name": "Updated Newsletter",
 *   "subject": "Your Updated Newsletter",
 *   "content": {
 *     "variables": {
 *       "headerImage": "https://example.com/updated-image.jpg",
 *       "mainHeading": "Updated Newsletter",
 *       "introText": "Welcome to our updated newsletter!"
 *     }
 *   }
 * }
 * @example response - 200 - Example success response
 * {
 *   "id": 1,
 *   "name": "Updated Newsletter",
 *   "subject": "Your Updated Newsletter",
 *   "status": "draft",
 *   "mailingListId": 5,
 *   "templateId": 3,
 *   "updatedAt": "2025-05-03T09:15:30Z"
 * }
 */
router.put("/:id", ...campaignUpdateAccess, validateUpdateCampaign, campaignController.updateCampaign);

/**
 * Delete (soft delete) a campaign
 *
 * @route DELETE /api/campaigns/{id}
 * @group Campaigns - Operations related to email campaigns
 * @security JWT
 * @param {integer} request.params.id.required - Campaign ID - eg: 1
 * @returns {object} 200 - Campaign deleted successfully
 * @returns {object} 401 - Unauthorized - Invalid or missing token
 * @returns {object} 403 - Forbidden - User doesn't have required permissions
 * @returns {object} 404 - Campaign not found
 * @returns {object} 409 - Cannot delete a sent campaign
 * @returns {object} 500 - Server error
 * @example response - 200 - Example success response
 * {
 *   "success": true,
 *   "message": "Campaign deleted successfully"
 * }
 */
router.delete("/:id", ...campaignDeleteAccess, campaignController.deleteCampaign);

/**
 * Schedule a campaign to be sent at a specific time
 *
 * @route POST /api/campaigns/{id}/schedule
 * @group Campaigns - Operations related to email campaigns
 * @security JWT
 * @param {integer} request.params.id.required - Campaign ID - eg: 1
 * @param {object} request.body.required - Schedule information
 * @param {string} request.body.scheduledFor.required - ISO datetime when to send the campaign - eg: 2025-05-15T08:00:00Z
 * @returns {object} 200 - Campaign scheduled successfully
 * @returns {object} 400 - Validation error or date in the past
 * @returns {object} 401 - Unauthorized - Invalid or missing token
 * @returns {object} 403 - Forbidden - User doesn't have required permissions
 * @returns {object} 404 - Campaign not found
 * @returns {object} 409 - Campaign already sent or scheduled
 * @returns {object} 500 - Server error
 * @example request - Example request payload
 * {
 *   "scheduledFor": "2025-05-15T08:00:00Z"
 * }
 * @example response - 200 - Example success response
 * {
 *   "id": 1,
 *   "name": "Monthly Newsletter",
 *   "status": "scheduled",
 *   "scheduledFor": "2025-05-15T08:00:00Z",
 *   "updatedAt": "2025-05-03T10:25:12Z"
 * }
 */
router.post("/:id/schedule", ...campaignUpdateAccess, validateScheduleCampaign, campaignController.scheduleCampaign);

/**
 * Publish a campaign immediately
 *
 * @route POST /api/campaigns/{id}/publish
 * @group Campaigns - Operations related to email campaigns
 * @security JWT
 * @param {integer} request.params.id.required - Campaign ID - eg: 1
 * @returns {object} 200 - Campaign published successfully
 * @returns {object} 401 - Unauthorized - Invalid or missing token
 * @returns {object} 403 - Forbidden - User doesn't have required permissions
 * @returns {object} 404 - Campaign not found
 * @returns {object} 409 - Campaign already sent
 * @returns {object} 500 - Server error
 * @example response - 200 - Example success response
 * {
 *   "id": 1,
 *   "name": "Monthly Newsletter",
 *   "status": "sent",
 *   "sentAt": "2025-05-03T11:42:18Z",
 *   "updatedAt": "2025-05-03T11:42:18Z"
 * }
 */
router.post("/:id/publish", ...campaignUpdateAccess, campaignController.publishCampaign);

module.exports = router;
