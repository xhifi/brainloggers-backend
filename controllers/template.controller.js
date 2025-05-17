/**
 * @module controllers/email-template.controller
 * @description Controller for email template operations
 */
const emailTemplateService = require("../services/template.service");
const logger = require("../services/logger.service");

/**
 * Create a new email template
 * @async
 * @function createEmailTemplate
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body with template data
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function createEmailTemplate(req, res, next) {
  try {
    const templateData = {
      ...req.body,
      userId: req.user.id, // Pass the user ID from the authenticated request
    };
    const createdTemplate = await emailTemplateService.createEmailTemplate(templateData);

    res.status(201).json({
      success: true,
      message: "Email template created successfully",
      data: createdTemplate,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update an existing email template
 * @async
 * @function updateEmailTemplate
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.id - Template ID
 * @param {Object} req.body - Request body with template data to update
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function updateEmailTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const templateData = {
      ...req.body,
      userId: req.user.id, // Pass the user ID from the authenticated request
    };

    const updatedTemplate = await emailTemplateService.updateEmailTemplate(id, templateData);

    res.status(200).json({
      success: true,
      message: "Email template updated successfully",
      data: updatedTemplate,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get an email template by ID
 * @async
 * @function getEmailTemplateById
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.id - Template ID
 * @param {Object} req.query - Request query parameters
 * @param {boolean} req.query.includeContent - Whether to include template content
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function getEmailTemplateById(req, res, next) {
  try {
    const { id } = req.params;
    const includeContent = req.query.includeContent === "true";

    const template = await emailTemplateService.getEmailTemplateById(id, includeContent);

    res.status(200).json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete an email template
 * @async
 * @function deleteEmailTemplate
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} req.params.id - Template ID
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function deleteEmailTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const deleted = await emailTemplateService.deleteEmailTemplate(id, req.user.id);

    if (deleted) {
      res.status(200).json({
        success: true,
        message: "Email template deleted successfully",
      });
    } else {
      res.status(404).json({
        success: false,
        message: "Email template not found",
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Get all email templates with pagination and filtering
 * @async
 * @function getAllEmailTemplates
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {number} [req.query.page=1] - Page number
 * @param {number} [req.query.limit=20] - Items per page
 * @param {boolean} [req.query.isActive] - Filter by active status
 * @param {string} [req.query.category] - Filter by category
 * @param {string} [req.query.search] - Search in name and description
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function getAllEmailTemplates(req, res, next) {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 20);

    const filters = {
      isActive: req.query.isActive !== undefined ? req.query.isActive === "true" : undefined,
      category: req.query.category,
      search: req.query.search,
    };

    const result = await emailTemplateService.getAllEmailTemplates(page, limit, filters);

    res.status(200).json({
      success: true,
      data: result.templates,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Render an email template with variable data
 * @async
 * @function renderEmailTemplate
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {number} req.body.templateId - Template ID
 * @param {number} [req.body.subscriberId] - Subscriber ID for data
 * @param {Object} [req.body.subscriberData] - Custom subscriber data
 * @param {Object} [req.body.customData] - Additional custom data
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function renderEmailTemplate(req, res, next) {
  try {
    const { templateId, subscriberId, subscriberData, customData } = req.body;

    // Merge data sources with priority: customData > subscriberData > actual subscriber data
    const mergedData = {
      ...(subscriberData || {}),
      ...(customData || {}),
    };

    const rendered = await emailTemplateService.renderEmailTemplate(templateId, mergedData, subscriberId);

    res.status(200).json({
      success: true,
      data: rendered,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get available variables for templates
 * @async
 * @function getTemplateVariables
 * @param {Object} req - Express request object
 * @param {Object} req.params - Request parameters
 * @param {string} [req.params.id] - Optional template ID
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function getTemplateVariables(req, res, next) {
  try {
    const { id } = req.params;

    const variables = await emailTemplateService.getTemplateVariables(id);

    res.status(200).json({
      success: true,
      data: variables,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createEmailTemplate,
  updateEmailTemplate,
  getEmailTemplateById,
  deleteEmailTemplate,
  getAllEmailTemplates,
  renderEmailTemplate,
  getTemplateVariables,
};
