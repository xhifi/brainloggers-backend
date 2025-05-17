/**
 * @module controllers/subscriber.controller
 * @description Controller for handling subscriber-related operations
 */
const subscriberService = require("../services/subscriber.service");
const tagService = require("../services/tag.service");
const { createSubscriberSchema, updateSubscriberSchema, importSubscribersSchema } = require("../dtos/subscriber.dto");
const { assignTagsSchema, removeTagsSchema } = require("../dtos/subscriber.dto");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Get all subscribers with pagination and filters
 */
async function getAllSubscribers(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const filters = {
      email: req.query.email || null,
      isActive: req.query.isActive !== undefined ? req.query.isActive === "true" : undefined,
    };

    // Parse tag IDs if provided in the query
    if (req.query.tagIds) {
      filters.tagIds = req.query.tagIds.split(",").map((id) => parseInt(id));
    }

    // Use getSubscribersWithTags instead of getAllSubscribers to include tag data
    const result = await subscriberService.getSubscribersWithTags(filters, page, limit);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Get all subscribers with their tags
 */
async function getSubscribersWithTags(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const filters = {
      email: req.query.email || null,
      isActive: req.query.isActive !== undefined ? req.query.isActive === "true" : undefined,
    };

    if (req.query.tagIds) {
      filters.tagIds = req.query.tagIds.split(",").map((id) => parseInt(id));
    }

    const result = await subscriberService.getSubscribersWithTags(filters, page, limit);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Get a subscriber by ID
 */
async function getSubscriberById(req, res, next) {
  try {
    const subscriber = await subscriberService.getSubscriberById(parseInt(req.params.id));
    // Get tags for this subscriber
    const tags = await tagService.getTagsForSubscriber(subscriber.id);
    res.status(200).json({ ...subscriber, tags });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new subscriber
 */
async function createSubscriber(req, res, next) {
  try {
    const validationResult = createSubscriberSchema.body.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        message: "Invalid input",
        details: validationResult.error.errors.map((error) => ({
          path: error.path.join("."),
          message: error.message,
        })),
      });
    }

    const subscriber = await subscriberService.createSubscriber(validationResult.data);
    res.status(201).json(subscriber);
  } catch (error) {
    next(error);
  }
}

/**
 * Public subscribe endpoint that adds the form-subscriber tag
 */
async function subscribe(req, res, next) {
  try {
    const validationResult = createSubscriberSchema.body.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        message: "Invalid input",
        details: validationResult.error.errors.map((error) => ({
          path: error.path.join("."),
          message: error.message,
        })),
      });
    }

    // Add flag to apply form-subscriber tag
    const data = {
      ...validationResult.data,
      applyFormTag: true,
    };

    const subscriber = await subscriberService.createSubscriber(data);
    res.status(201).json({
      message: "Successfully subscribed",
      email: subscriber.email,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Public unsubscribe endpoint
 */
async function unsubscribe(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
      });
    }

    const result = await subscriberService.unsubscribeByEmail(email);
    res.status(200).json({
      message: "Successfully unsubscribed",
      email: result.email,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update a subscriber
 */
async function updateSubscriber(req, res, next) {
  try {
    const validationResult = updateSubscriberSchema.body.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        message: "Invalid input",
        details: validationResult.error.errors.map((error) => ({
          path: error.path.join("."),
          message: error.message,
        })),
      });
    }

    const updatedSubscriber = await subscriberService.updateSubscriber(parseInt(req.params.id), validationResult.data);
    res.status(200).json(updatedSubscriber);
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a subscriber
 */
async function deleteSubscriber(req, res, next) {
  try {
    await subscriberService.deleteSubscriber(parseInt(req.params.id));
    res.status(200).json({
      message: "Subscriber deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Import subscribers via CSV text content
 */
async function importCsvSubscribers(req, res, next) {
  console.log(req.body);
  try {
    // Extract CSV data from validated request
    const { csvData } = req.body;

    // Process the request synchronously
    const result = await subscriberService.importSubscribers(csvData);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Import subscribers via CSV file upload
 */
async function importCsvFile(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No CSV file uploaded",
      });
    }

    const csvData = req.file.buffer.toString("utf-8");

    // Process the request synchronously
    const result = await subscriberService.importSubscribers(csvData);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Export subscribers to CSV
 */
async function exportSubscribersCsv(req, res, next) {
  try {
    const filters = {
      isActive: req.query.isActive !== undefined ? req.query.isActive === "true" : undefined,
    };

    if (req.query.tagIds) {
      filters.tagIds = req.query.tagIds.split(",").map((id) => parseInt(id));
    }

    const csvData = await subscriberService.exportSubscribers(filters);

    // Set headers for CSV download
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=subscribers-${Date.now()}.csv`);
    res.status(200).send(csvData);
  } catch (error) {
    next(error);
  }
}

/**
 * Assign tags to a subscriber
 */
async function assignTagsToSubscriber(req, res, next) {
  try {
    const validationResult = assignTagsSchema.body.safeParse({
      subscriberId: parseInt(req.params.id),
      tagIds: req.body.tagIds,
    });

    if (!validationResult.success) {
      return res.status(400).json({
        message: "Invalid input",
        details: validationResult.error.errors.map((error) => ({
          path: error.path.join("."),
          message: error.message,
        })),
      });
    }

    await tagService.assignTagsToSubscriber(
      validationResult.data.subscriberId,
      validationResult.data.tagIds,
      req.user?.id // Optional user ID from auth middleware
    );

    res.status(200).json({
      message: "Tags assigned successfully",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Remove tags from a subscriber
 */
async function removeTagsFromSubscriber(req, res, next) {
  try {
    const validationResult = removeTagsSchema.body.safeParse({
      subscriberId: parseInt(req.params.id),
      tagIds: req.body.tagIds,
    });

    if (!validationResult.success) {
      return res.status(400).json({
        message: "Invalid input",
        details: validationResult.error.errors.map((error) => ({
          path: error.path.join("."),
          message: error.message,
        })),
      });
    }

    await tagService.removeTagsFromSubscriber(validationResult.data.subscriberId, validationResult.data.tagIds);

    res.status(200).json({
      message: "Tags removed successfully",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get tags for a subscriber
 */
async function getSubscriberTags(req, res, next) {
  try {
    const tags = await tagService.getTagsForSubscriber(parseInt(req.params.id));
    res.status(200).json(tags);
  } catch (error) {
    next(error);
  }
}

// Configure multer middleware for file upload
const uploadCsvMiddleware = upload.single("csvFile");

module.exports = {
  getAllSubscribers,
  getSubscribersWithTags,
  getSubscriberById,
  createSubscriber,
  subscribe,
  unsubscribe,
  updateSubscriber,
  deleteSubscriber,
  importCsvSubscribers,
  importCsvFile,
  exportSubscribersCsv,
  assignTagsToSubscriber,
  removeTagsFromSubscriber,
  getSubscriberTags,
  uploadCsvMiddleware,
};
