/**
 * @module controllers/subscription
 * @description Controller for handling email subscription operations
 */
const subscriptionService = require("../services/subscription.service");
const logger = require("../services/logger.service");
const { NotFoundError, ConflictResourceError, PayloadTooLargeError } = require("../utils/errors");

/**
 * Subscribe a user to the mailing list
 * @async
 * @function subscribe
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response
 */
const subscribe = async (req, res, next) => {
  try {
    const { email, name, dateOfBirth, metadata } = req.body;

    const subscriber = await subscriptionService.subscribe({
      email,
      name,
      dateOfBirth,
      metadata,
    });

    return res.status(201).json({
      message: "Successfully subscribed to the mailing list",
      subscriber,
    });
  } catch (error) {
    if (error.message === "Email is already subscribed") {
      return next(new ConflictResourceError(error.message));
    }
    logger.error("Error in subscribe controller:", { error });
    return next(error);
  }
};

/**
 * Unsubscribe a user from the mailing list
 * @async
 * @function unsubscribe
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response
 */
const unsubscribe = async (req, res, next) => {
  try {
    const { email } = req.body;

    const result = await subscriptionService.unsubscribe(email);

    if (!result) {
      throw new NotFoundError("Email not found or already unsubscribed");
    }

    return res.status(200).json({
      message: "Successfully unsubscribed from the mailing list",
      subscriber: result,
    });
  } catch (error) {
    logger.error("Error in unsubscribe controller:", { error });
    return next(error);
  }
};

/**
 * Get all subscribers (admin only) with pagination and filtering
 * @async
 * @function getSubscribers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response with paginated subscribers
 */
const getSubscribers = async (req, res, next) => {
  try {
    const { page, limit, search, isActive, sortBy, sortOrder } = req.query;

    const result = await subscriptionService.getSubscribers({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
      search,
      isActive,
      sortBy,
      sortOrder,
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error("Error in getSubscribers controller:", { error });
    return next(error);
  }
};

/**
 * Get a single subscriber by ID (admin only)
 * @async
 * @function getSubscriberById
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response with subscriber data
 */
const getSubscriberById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const subscriber = await subscriptionService.getSubscriberById(id);

    if (!subscriber) {
      throw new NotFoundError("Subscriber not found");
    }

    return res.status(200).json({ subscriber });
  } catch (error) {
    logger.error("Error in getSubscriberById controller:", { error });
    return next(error);
  }
};

/**
 * Update a subscriber (admin only)
 * @async
 * @function updateSubscriber
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response with updated subscriber
 */
const updateSubscriber = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updatedSubscriber = await subscriptionService.updateSubscriber(id, updateData);

    if (!updatedSubscriber) {
      throw new NotFoundError("Subscriber not found");
    }

    return res.status(200).json({
      message: "Subscriber updated successfully",
      subscriber: updatedSubscriber,
    });
  } catch (error) {
    if (error.message === "Email is already in use by another subscriber") {
      return next(new ConflictResourceError(error.message));
    }
    logger.error("Error in updateSubscriber controller:", { error });
    return next(error);
  }
};

/**
 * Delete a subscriber (admin only)
 * @async
 * @function deleteSubscriber
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response
 */
const deleteSubscriber = async (req, res, next) => {
  try {
    const { id } = req.params;

    const deleted = await subscriptionService.deleteSubscriber(id);

    if (!deleted) {
      throw new NotFoundError("Subscriber not found");
    }

    return res.status(200).json({ message: "Subscriber deleted successfully" });
  } catch (error) {
    logger.error("Error in deleteSubscriber controller:", { error });
    return next(error);
  }
};

/**
 * Import subscribers from CSV content in request body (admin only)
 * @async
 * @function importSubscribers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response with import results
 */
const importSubscribers = async (req, res, next) => {
  try {
    const { csvContent } = req.body;

    const results = await subscriptionService.importSubscribersFromCSV(csvContent);

    return res.status(200).json({
      message: "Subscribers import completed",
      results,
    });
  } catch (error) {
    logger.error("Error in importSubscribers controller:", { error });
    return next(error);
  }
};

/**
 * Import subscribers from uploaded CSV file (admin only)
 * @async
 * @function importSubscribersFromFile
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response with import results
 */
const importSubscribersFromFile = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new NotFoundError("No CSV file uploaded");
    }

    // Since we're using memory storage, file data is in req.file.buffer
    const csvContent = req.file.buffer.toString("utf8");

    // Process the CSV content
    const results = await subscriptionService.importSubscribersFromCSV(csvContent);

    return res.status(200).json({
      message: "Subscribers import completed",
      results,
    });
  } catch (error) {
    logger.error("Error in importSubscribersFromFile controller:", { error });
    return next(error);
  }
};

/**
 * Export subscribers to CSV (admin only)
 * @async
 * @function exportSubscribers
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} CSV file download
 */
const exportSubscribers = async (req, res, next) => {
  try {
    const { search, isActive } = req.query;

    const csvContent = await subscriptionService.exportSubscribersToCSV({
      search,
      isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
    });

    // Set headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=subscribers_${Date.now()}.csv`);

    return res.send(csvContent);
  } catch (error) {
    logger.error("Error in exportSubscribers controller:", { error });
    return next(error);
  }
};

module.exports = {
  subscribe,
  unsubscribe,
  getSubscribers,
  getSubscriberById,
  updateSubscriber,
  deleteSubscriber,
  importSubscribers,
  importSubscribersFromFile,
  exportSubscribers,
};
