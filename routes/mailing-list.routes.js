/**
 * @module Routes/MailingLists
 * @description Routes for mailing list management
 */
const express = require("express");
const router = express.Router();
const mailingListController = require("../controllers/mailing-list.controller");
const authenticate = require("../middleware/authenticate");
const { hasAllPermissions } = require("../middleware/authorize");
const { validate } = require("../middleware/validate");
const { validateMailingList, validateUpdateMailingList } = require("../dtos/mailing-list.dto");

// Mailing list middleware groups
const mailingListReadAccess = [authenticate, hasAllPermissions({ resource: "subscriptions", action: "read" })];
const mailingListCreateAccess = [authenticate, hasAllPermissions({ resource: "subscriptions", action: "create" })];
const mailingListUpdateAccess = [authenticate, hasAllPermissions({ resource: "subscriptions", action: "update" })];
const mailingListDeleteAccess = [authenticate, hasAllPermissions({ resource: "subscriptions", action: "delete" })];

/**
 * @route   GET /api/mailing-lists
 * @desc    List all mailing lists with pagination and filtering
 * @access  Private - Requires subscription:read permission
 */
router.get("/", ...mailingListReadAccess, mailingListController.listMailingLists);

/**
 * @route   GET /api/mailing-lists/:id
 * @desc    Get a specific mailing list by ID
 * @access  Private - Requires subscription:read permission
 */
router.get("/:id", ...mailingListReadAccess, mailingListController.getMailingListById);

/**
 * @route   POST /api/mailing-lists
 * @desc    Create a new mailing list
 * @access  Private - Requires subscription:create permission
 */
router.post("/", ...mailingListCreateAccess, validateMailingList, mailingListController.createMailingList);

/**
 * @route   PUT /api/mailing-lists/:id
 * @desc    Update an existing mailing list
 * @access  Private - Requires subscription:update permission
 */
router.put("/:id", ...mailingListUpdateAccess, validateUpdateMailingList, mailingListController.updateMailingList);

/**
 * @route   DELETE /api/mailing-lists/:id
 * @desc    Delete (soft delete) a mailing list
 * @access  Private - Requires subscription:delete permission
 */
router.delete("/:id", ...mailingListDeleteAccess, mailingListController.deleteMailingList);

/**
 * @route   GET /api/mailing-lists/:id/recipients
 * @desc    Get recipients of a mailing list
 * @access  Private - Requires subscription:read permission
 */
router.get("/:id/recipients", ...mailingListReadAccess, mailingListController.getMailingListRecipients);

/**
 * @route   GET /api/mailing-lists/:id/variables
 * @desc    Get variables available for a mailing list
 * @access  Private - Requires subscription:read permission
 */
router.get("/:id/variables", ...mailingListReadAccess, mailingListController.getMailingListVariables);

module.exports = router;
