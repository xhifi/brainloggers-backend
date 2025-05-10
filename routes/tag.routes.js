/**
 * @module Routes/Tags
 * @description Routes for tag management
 */
const express = require("express");
const router = express.Router();
const tagController = require("../controllers/tag.controller");
const { authenticate } = require("../middleware/authenticate");
const { authorize } = require("../middleware/authorize");
const { validate } = require("../middleware/validate");
const { createTagSchema, updateTagSchema, tagIdSchema, assignTagsSchema } = require("../dtos/tag.dto");

// Get all tags
router.get("/", authenticate, authorize("tags:read"), tagController.getAllTags);

// Create a new tag
router.post("/", authenticate, authorize("tags:create"), validate(createTagSchema), tagController.createTag);

// Get tag by ID
router.get("/:tagId", authenticate, authorize("tags:read"), validate(tagIdSchema, "params"), tagController.getTagById);

// Update tag
router.put(
  "/:tagId",
  authenticate,
  authorize("tags:update"),
  validate(tagIdSchema, "params"),
  validate(updateTagSchema),
  tagController.updateTag
);

// Delete tag
router.delete("/:tagId", authenticate, authorize("tags:delete"), validate(tagIdSchema, "params"), tagController.deleteTag);

// Assign tag to subscribers
router.post(
  "/:tagId/subscribers",
  authenticate,
  authorize("tags:assign"),
  validate(tagIdSchema, "params"),
  validate(assignTagsSchema),
  tagController.assignTagToSubscribers
);

// Remove tag from subscribers
router.delete(
  "/:tagId/subscribers",
  authenticate,
  authorize("tags:remove"),
  validate(tagIdSchema, "params"),
  validate(assignTagsSchema),
  tagController.removeTagFromSubscribers
);

// Get subscribers by tag
router.get("/:tagId/subscribers", authenticate, authorize("tags:read"), validate(tagIdSchema, "params"), tagController.getSubscribersByTag);

// Get tags by subscriber
router.get("/subscriber/:subscriberId", authenticate, authorize("tags:read"), tagController.getTagsBySubscriber);

module.exports = router;
