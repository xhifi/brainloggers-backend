/**
 * @module routes/tag.routes
 * @description Routes for tag management
 */
const express = require("express");
const router = express.Router();
const tagController = require("../controllers/tag.controller");
const authenticate = require("../middleware/authenticate");
const { hasAnyPermission } = require("../middleware/authorize");
const { validate } = require("../middleware/validate");
const { createTagSchema, updateTagSchema, getTagSchema, deleteTagSchema, getTagSubscribersSchema } = require("../dtos/tag.dto");

// Get all tags
router.get("/", authenticate, hasAnyPermission({ resource: "tags", action: "read" }), tagController.getAllTags);

// Get a single tag by ID
router.get("/:id", authenticate, hasAnyPermission({ resource: "tags", action: "read" }), validate(getTagSchema), tagController.getTagById);

// Create a new tag
router.post(
  "/",
  authenticate,
  hasAnyPermission({ resource: "tags", action: "create" }),
  validate(createTagSchema),
  tagController.createTag
);

// Update a tag
router.put(
  "/:id",
  authenticate,
  hasAnyPermission({ resource: "tags", action: "update" }),
  validate(updateTagSchema),
  tagController.updateTag
);

// Delete a tag
router.delete(
  "/:id",
  authenticate,
  hasAnyPermission({ resource: "tags", action: "delete" }),
  validate(deleteTagSchema),
  tagController.deleteTag
);

// Get subscribers with a specific tag
router.get(
  "/:id/subscribers",
  authenticate,
  hasAnyPermission({ resource: "tags", action: "read" }),
  validate(getTagSubscribersSchema),
  tagController.getSubscribersByTag
);

module.exports = router;
