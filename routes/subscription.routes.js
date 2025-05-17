/**
 * @module routes/subscription.routes
 * @description Routes for subscriber management
 */
const express = require("express");
const router = express.Router();
const subscriberController = require("../controllers/subscriber.controller");
const authenticate = require("../middleware/authenticate");
const { hasAnyPermission } = require("../middleware/authorize");
const { validate } = require("../middleware/validate");
const {
  createSubscriberSchema,
  updateSubscriberSchema,
  importSubscribersSchema,
  assignTagsSchema,
  removeTagsSchema,
  getSubscriberSchema,
  unsubscribeSchema,
} = require("../dtos/subscriber.dto");

// Public routes - no auth required
router.post("/subscribe", validate(createSubscriberSchema), subscriberController.subscribe);
router.post("/unsubscribe", validate(unsubscribeSchema), subscriberController.unsubscribe);

// Protected routes - require authentication and authorization
// Get all subscribers (with pagination and filters)
router.get("/", authenticate, hasAnyPermission({ resource: "subscriptions", action: "read" }), subscriberController.getAllSubscribers);

// Get subscribers with tags
router.get(
  "/with-tags",
  authenticate,
  hasAnyPermission({ resource: "subscriptions", action: "read" }),
  subscriberController.getSubscribersWithTags
);

// Get a single subscriber by ID
router.get(
  "/:id",
  authenticate,
  hasAnyPermission({ resource: "subscriptions", action: "read" }),
  validate(getSubscriberSchema),
  subscriberController.getSubscriberById
);

// Create a new subscriber
router.post(
  "/",
  authenticate,
  hasAnyPermission({ resource: "subscriptions", action: "create" }),
  validate(createSubscriberSchema),
  subscriberController.createSubscriber
);

// Update a subscriber
router.put(
  "/:id",
  authenticate,
  hasAnyPermission({ resource: "subscriptions", action: "update" }),
  validate(updateSubscriberSchema),
  subscriberController.updateSubscriber
);

// Delete a subscriber
router.delete(
  "/:id",
  authenticate,
  hasAnyPermission({ resource: "subscriptions", action: "delete" }),
  validate(getSubscriberSchema),
  subscriberController.deleteSubscriber
);

// Import subscribers via CSV content
router.post(
  "/import/csv",
  authenticate,
  hasAnyPermission({ resource: "subscriptions", action: "import" }),
  validate(importSubscribersSchema),
  subscriberController.importCsvSubscribers
);

// Import subscribers via CSV file upload
router.post(
  "/import/csv/file",
  authenticate,
  hasAnyPermission({ resource: "subscriptions", action: "import" }),
  subscriberController.uploadCsvMiddleware, // Apply multer middleware for file upload
  subscriberController.importCsvFile
);

// Export subscribers to CSV
router.get(
  "/export/csv",
  authenticate,
  hasAnyPermission({ resource: "subscriptions", action: "export" }),
  subscriberController.exportSubscribersCsv
);

// Tag management for subscribers
// Get tags for a subscriber
router.get(
  "/:id/tags",
  authenticate,
  hasAnyPermission({ resource: "subscriptions", action: "read" }),
  validate(getSubscriberSchema),
  subscriberController.getSubscriberTags
);

// Assign tags to a subscriber
router.post(
  "/:id/tags",
  authenticate,
  hasAnyPermission({ resource: "tags", action: "assign" }),
  validate(assignTagsSchema),
  subscriberController.assignTagsToSubscriber
);

// Remove tags from a subscriber
router.delete(
  "/:id/tags",
  authenticate,
  hasAnyPermission({ resource: "tags", action: "unassign" }),
  validate(removeTagsSchema),
  subscriberController.removeTagsFromSubscriber
);

module.exports = router;
