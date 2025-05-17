/**
 * @module controllers/tracking
 * @description Controller for tracking email campaign events
 */
const db = require("../config/db");
const logger = require("../services/logger.service");

/**
 * Track email opens via a transparent pixel
 * @async
 * @function trackOpen
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.trackOpen = async (req, res) => {
  try {
    // Get tracking parameters
    const campaignId = req.query.cid;
    const recipientId = req.query.rid;

    if (!campaignId || !recipientId) {
      logger.warn("Tracking open without required parameters", { campaignId, recipientId });

      // Return a transparent 1x1 pixel GIF regardless of success or failure
      res.set("Content-Type", "image/gif");
      res.send(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
      return;
    }

    // Track the open event in database
    await db.query(
      `INSERT INTO email_analytics 
       (campaign_id, recipient_id, event_type, ip_address, user_agent) 
       VALUES ($1, $2, $3, $4, $5)`,
      [campaignId, recipientId, "opened", req.ip, req.get("User-Agent")]
    );

    logger.info(`Tracked campaign open: Campaign ${campaignId}, Recipient ${recipientId}`);

    // Return a transparent 1x1 pixel GIF
    res.set("Content-Type", "image/gif");
    res.send(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
  } catch (error) {
    logger.error("Error tracking email open:", error);

    // Still return the pixel even if there's an error to avoid breaking email rendering
    res.set("Content-Type", "image/gif");
    res.send(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
  }
};

/**
 * Track link clicks in emails
 * @async
 * @function trackClick
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.trackClick = async (req, res) => {
  try {
    // Get tracking parameters
    const campaignId = req.query.cid;
    const recipientId = req.query.rid;
    const url = req.query.url;

    if (!campaignId || !recipientId || !url) {
      logger.warn("Tracking click without required parameters");
      return res.redirect(url || "/");
    }

    // Track the click event in database
    await db.query(
      `INSERT INTO email_analytics 
       (campaign_id, recipient_id, event_type, ip_address, user_agent, link_clicked) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [campaignId, recipientId, "clicked", req.ip, req.get("User-Agent"), url]
    );

    logger.info(`Tracked campaign click: Campaign ${campaignId}, Recipient ${recipientId}, URL ${url}`);

    // Redirect to the original URL
    res.redirect(url);
  } catch (error) {
    logger.error("Error tracking email click:", error);

    // Redirect to the URL even if there's an error to maintain user experience
    if (req.query.url) {
      res.redirect(req.query.url);
    } else {
      res.redirect("/");
    }
  }
};

/**
 * Track email delivery events from webhooks
 * @async
 * @function trackDeliveryEvent
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.trackDeliveryEvent = async (req, res) => {
  try {
    const event = req.body;

    // Validate event data
    if (!event || !event.type || !event.campaignId || !event.recipientId) {
      return res.status(400).json({
        success: false,
        message: "Invalid tracking event data",
      });
    }

    // Map incoming event type to our own types
    const eventTypeMap = {
      delivery: "delivered",
      bounce: "bounced",
      complaint: "complained",
      reject: "rejected",
    };

    const eventType = eventTypeMap[event.type] || event.type;

    // Record the event
    await db.query(
      `INSERT INTO email_analytics 
       (campaign_id, recipient_id, event_type, additional_data) 
       VALUES ($1, $2, $3, $4)`,
      [event.campaignId, event.recipientId, eventType, JSON.stringify(event.data || {})]
    );

    logger.info(`Tracked email ${eventType} event for campaign ${event.campaignId}, recipient ${event.recipientId}`);

    res.json({ success: true });
  } catch (error) {
    logger.error("Error tracking delivery event:", error);
    res.status(500).json({
      success: false,
      message: "Error processing tracking event",
    });
  }
};
