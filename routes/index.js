/**
 * @module routes
 * @description Main router configuration for the application
 * Sets up routing for auth, user management, and system health endpoints
 */
const express = require("express");
const authRoutes = require("./auth.routes");
const userRoutes = require("./user.routes");
const s3Routes = require("./s3.routes");
const subscriptionRoutes = require("./subscription.routes");
const permissionRoutes = require("./permission.routes");
const templateRoutes = require("./template.routes");

const router = express.Router();

router.use(`/auth`, authRoutes);
router.use(`/users`, userRoutes);
router.use(`/storage`, s3Routes);
router.use(`/subscriptions`, subscriptionRoutes);
router.use(`/permissions`, permissionRoutes);
router.use(`/templates`, templateRoutes);

/**
 * @route GET /api/health
 * @description Health check endpoint for monitoring and deployment verification
 * @access Public
 */
router.get(`/health`, (req, res) => {
  res.status(200).json({
    status: "UP",
    timestamp: new Date().toISOString(),
    message: "Auth API is healthy",
  });
});

module.exports = router;
