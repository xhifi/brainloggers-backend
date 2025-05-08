/**
 * @module routes/subscription
 * @description Routes for handling email subscription operations
 */
const express = require("express");
const subscriptionController = require("../controllers/subscription.controller");
const { validate } = require("../middleware/validate");
const {
  subscribeSchema,
  unsubscribeSchema,
  subscriberIdSchema,
  updateSubscriberSchema,
  importSubscribersSchema,
  getSubscribersSchema,
} = require("../dtos/subscription.dto");
const authenticate = require("../middleware/authenticate");
const { hasRoles } = require("../middleware/authorize");
const { upload, handleMulterError } = require("../middleware/upload");

const router = express.Router();

// Public routes for subscribing and unsubscribing
/**
 * @route POST /api/subscriptions/subscribe
 * @description Subscribe to the mailing list
 * @access Public
 */
router.post("/subscribe", validate(subscribeSchema), subscriptionController.subscribe);

/**
 * @route POST /api/subscriptions/unsubscribe
 * @description Unsubscribe from the mailing list
 * @access Public
 */
router.post("/unsubscribe", validate(unsubscribeSchema), subscriptionController.unsubscribe);

// Admin routes for managing subscribers - protected with authentication and authorization
/**
 * @route GET /api/subscriptions/
 * @description Get all subscribers with pagination and filtering
 * @access Private (Admin)
 */
router.get("/", authenticate, hasRoles("admin"), validate(getSubscribersSchema), subscriptionController.getSubscribers);

/**
 * @route GET /api/subscriptions/:id
 * @description Get a single subscriber by ID
 * @access Private (Admin)
 */
router.get("/:id", authenticate, hasRoles("admin"), validate(subscriberIdSchema), subscriptionController.getSubscriberById);

/**
 * @route PUT /api/subscriptions/:id
 * @description Update a subscriber
 * @access Private (Admin)
 */
router.put("/:id", authenticate, hasRoles("admin"), validate(updateSubscriberSchema), subscriptionController.updateSubscriber);

/**
 * @route DELETE /api/subscriptions/:id
 * @description Delete a subscriber
 * @access Private (Admin)
 */
router.delete("/:id", authenticate, hasRoles("admin"), validate(subscriberIdSchema), subscriptionController.deleteSubscriber);

/**
 * @route POST /api/subscriptions/import
 * @description Import subscribers from CSV content in request body
 * @access Private (Admin)
 */
router.post("/import", authenticate, hasRoles("admin"), validate(importSubscribersSchema), subscriptionController.importSubscribers);

/**
 * @route POST /api/subscriptions/import/file
 * @description Import subscribers from uploaded CSV file
 * @access Private (Admin)
 */
router.post(
  "/import/file",
  authenticate,
  hasRoles("admin"),
  upload.single("file"),
  handleMulterError,
  subscriptionController.importSubscribersFromFile
);

/**
 * @route GET /api/subscriptions/export/csv
 * @description Export subscribers to CSV
 * @access Private (Admin)
 */
router.get("/export/csv", authenticate, hasRoles("admin"), subscriptionController.exportSubscribers);

module.exports = router;
