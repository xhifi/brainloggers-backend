/**
 * @module routes/tracking
 * @description Routes for email tracking
 */
const express = require("express");
const trackingController = require("../controllers/tracking.controller");

const router = express.Router();

/**
 * @route GET /track/open
 * @description Track email opens via a transparent tracking pixel
 * @access Public
 */
router.get("/open", trackingController.trackOpen);

/**
 * @route GET /track/click
 * @description Track email link clicks and redirect
 * @access Public
 */
router.get("/click", trackingController.trackClick);

/**
 * @route POST /track/delivery
 * @description Track delivery events from webhooks (bounces, complaints, etc.)
 * @access Public (but should be secured with API keys or signatures in production)
 */
router.post("/delivery", trackingController.trackDeliveryEvent);

module.exports = router;
