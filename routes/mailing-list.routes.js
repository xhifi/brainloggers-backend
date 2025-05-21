/**
 * @module Routes/MailingList
 * @description Routes for managing mailing lists
 */
const express = require("express");
const mailingListController = require("../controllers/mailing-list.controller");
const { validate } = require("../middleware/validate");
const {
  createMailingListSchema,
  updateMailingListSchema,
  listMailingListsSchema,
  getMailingListSchema,
  regenerateRecipientsSchema,
  previewFilterSchema,
} = require("../dtos/mailing-list.dto");
const authenticate = require("../middleware/authenticate");
const { hasAnyPermission } = require("../middleware/authorize");

const router = express.Router();

// Apply authentication to all mailing list routes
router.use(authenticate);

/**
 * @route POST /api/mailing-lists
 * @description Create a new mailing list
 * @access Private (requires mailing-lists:create permission)
 */
router.post(
  "/",
  hasAnyPermission({ resource: "mailing-lists", action: "create" }),
  validate(createMailingListSchema),
  mailingListController.createMailingList
);

/**
 * @route GET /api/mailing-lists/:id
 * @description Get a mailing list by ID
 * @access Private (requires mailing-lists:read permission)
 */
router.get(
  "/:id",
  hasAnyPermission({ resource: "mailing-lists", action: "read" }),
  validate(getMailingListSchema),
  mailingListController.getMailingListById
);

/**
 * @route GET /api/mailing-lists
 * @description List mailing lists with pagination and filtering
 * @access Private (requires mailing-lists:read permission)
 */
router.get(
  "/",
  hasAnyPermission({ resource: "mailing-lists", action: "read" }),
  validate(listMailingListsSchema),
  mailingListController.listMailingLists
);

/**
 * @route PUT /api/mailing-lists/:id
 * @description Update an existing mailing list
 * @access Private (requires mailing-lists:update permission)
 */
router.put(
  "/:id",
  hasAnyPermission({ resource: "mailing-lists", action: "update" }),
  validate(updateMailingListSchema),
  mailingListController.updateMailingList
);

/**
 * @route DELETE /api/mailing-lists/:id
 * @description Delete a mailing list (soft delete)
 * @access Private (requires mailing-lists:delete permission)
 */
router.delete(
  "/:id",
  hasAnyPermission({ resource: "mailing-lists", action: "delete" }),
  validate(getMailingListSchema),
  mailingListController.deleteMailingList
);

/**
 * @route GET /api/mailing-lists/:id/recipients
 * @description Get recipients of a mailing list with pagination
 * @access Private (requires mailing-lists:read permission)
 */
router.get(
  "/:id/recipients",
  hasAnyPermission({ resource: "mailing-lists", action: "read" }),
  validate(getMailingListSchema),
  mailingListController.getMailingListRecipients
);

/**
 * @route POST /api/mailing-lists/:id/regenerate
 * @description Regenerate recipients for a mailing list based on current filter criteria
 * @access Private (requires mailing-lists:update permission)
 */
router.post(
  "/:id/regenerate",
  hasAnyPermission({ resource: "mailing-lists", action: "update" }),
  validate(regenerateRecipientsSchema),
  mailingListController.regenerateRecipients
);

/**
 * @route POST /api/mailing-lists/preview
 * @description Preview subscribers matching filter criteria
 * @access Private (requires mailing-lists:read permission)
 */
router.post(
  "/preview",
  hasAnyPermission({ resource: "mailing-lists", action: "read" }),
  validate(previewFilterSchema),
  mailingListController.previewFilterResults
);

module.exports = router;
