/**
 * @module routes
 * @description Main router configuration for the application
 * Sets up routing for auth, user management, and system health endpoints
 */
const express = require("express");
const authRoutes = require("./auth.routes");
const userRoutes = require("./user.routes");
const s3Routes = require("./s3.routes");
const permissionRoutes = require("./permission.routes");
const subscriptionRoutes = require("./subscription.routes");
const tagRoutes = require("./tag.routes");
const mailingListRoutes = require("./mailing-list.routes");
const emailTemplateRoutes = require("./template.routes");
const emailTemplateV2Routes = require("./email-template.routes");
const campaignRoutes = require("./campaign.routes");
const trackingRoutes = require("./tracking.routes");
const blogRoutes = require("./blog.routes");

const router = express.Router();

router.use(`/auth`, authRoutes);
router.use(`/users`, userRoutes);
router.use(`/storage`, s3Routes);
router.use(`/permissions`, permissionRoutes);
router.use(`/subscriptions`, subscriptionRoutes);
router.use(`/tags`, tagRoutes);
router.use(`/mailing-lists`, mailingListRoutes);
router.use(`/email-templates`, emailTemplateRoutes);
router.use(`/email-templates/v2`, emailTemplateV2Routes);
router.use(`/campaigns`, campaignRoutes);
router.use(`/track`, trackingRoutes);
router.use(`/blog`, blogRoutes);

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
