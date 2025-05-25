/**
 * @module Controllers/EmailTemplateController
 * @description Controller for email template operations
 */
const emailTemplateService = require("../services/email-template.service");
const logger = require("../services/logger.service");
const { BadRequestError } = require("../utils/errors");

/**
 * Create a new email template
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function createEmailTemplate(req, res, next) {
  try {
    const userId = req.user.id;
    const templateData = req.body;

    const result = await emailTemplateService.createEmailTemplate(templateData, userId);

    res.status(201).json({
      success: true,
      message: "Email template created successfully",
      data: result,
    });
  } catch (error) {
    logger.error("Error in createEmailTemplate controller:", error);
    next(error);
  }
}

/**
 * Get email template by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getEmailTemplateById(req, res, next) {
  try {
    const { id } = req.params;
    const includeContent = req.query.includeContent === "true";

    const template = await emailTemplateService.getEmailTemplateById(parseInt(id), includeContent);

    res.status(200).json({
      success: true,
      data: template,
    });
  } catch (error) {
    logger.error("Error in getEmailTemplateById controller:", error);
    next(error);
  }
}

/**
 * List email templates with pagination and filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function listEmailTemplates(req, res, next) {
  try {
    const result = await emailTemplateService.listEmailTemplates(req.query);

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error("Error in listEmailTemplates controller:", error);
    next(error);
  }
}

/**
 * Update an email template
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function updateEmailTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const updateData = req.body;

    const updatedTemplate = await emailTemplateService.updateEmailTemplate(parseInt(id), updateData, userId);

    res.status(200).json({
      success: true,
      message: "Email template updated successfully",
      data: updatedTemplate,
    });
  } catch (error) {
    logger.error("Error in updateEmailTemplate controller:", error);
    next(error);
  }
}

/**
 * Delete an email template (soft delete)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function deleteEmailTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    await emailTemplateService.deleteEmailTemplate(parseInt(id), userId);

    res.status(200).json({
      success: true,
      message: "Email template deleted successfully",
    });
  } catch (error) {
    logger.error("Error in deleteEmailTemplate controller:", error);
    next(error);
  }
}

/**
 * Get variables used in a template
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getTemplateVariables(req, res, next) {
  try {
    const { id } = req.params;

    const variables = await emailTemplateService.getTemplateVariables(parseInt(id));

    res.status(200).json({
      success: true,
      data: variables,
    });
  } catch (error) {
    logger.error("Error in getTemplateVariables controller:", error);
    next(error);
  }
}

/**
 * Render MJML content with preview data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function renderTemplate(req, res, next) {
  try {
    const { mjmlContent, context } = req.body;

    if (!mjmlContent) {
      throw new BadRequestError("MJML content is required");
    }

    const rendered = await emailTemplateService.renderTemplate(mjmlContent, context || {});

    res.status(200).json({
      success: true,
      data: rendered,
    });
  } catch (error) {
    logger.error("Error in renderTemplate controller:", error);
    next(error);
  }
}

/**
 * Preview an email template with sample data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function previewTemplate(req, res, next) {
  try {
    const { id } = req.params;
    const sampleData = req.body || {};

    const preview = await emailTemplateService.previewTemplate(parseInt(id), sampleData);

    res.status(200).json({
      success: true,
      data: preview,
    });
  } catch (error) {
    logger.error("Error in previewTemplate controller:", error);
    next(error);
  }
}

/**
 * Preview raw MJML content with sample data
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function previewRawTemplate(req, res, next) {
  try {
    const { mjmlContent, context } = req.body;

    if (!mjmlContent) {
      throw new BadRequestError("MJML content is required");
    }

    const preview = await emailTemplateService.previewTemplate(
      mjmlContent,
      context || {},
      true // isRawContent = true
    );

    res.status(200).json({
      success: true,
      data: preview,
    });
  } catch (error) {
    logger.error("Error in previewRawTemplate controller:", error);
    next(error);
  }
}

/**
 * Extract variables from raw MJML content
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function extractVariables(req, res, next) {
  try {
    const { mjmlContent } = req.body;

    if (!mjmlContent) {
      throw new BadRequestError("MJML content is required");
    }

    const variables = emailTemplateService.extractTemplateVariables(mjmlContent);
    const categorized = await emailTemplateService.categorizeTemplateVariables(variables);

    res.status(200).json({
      success: true,
      data: categorized,
    });
  } catch (error) {
    logger.error("Error in extractVariables controller:", error);
    next(error);
  }
}

/**
 * Get all available template variables with usage statistics
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getAvailableVariables(req, res, next) {
  try {
    const variables = await emailTemplateService.getStandardTemplateVariables();

    res.status(200).json({
      success: true,
      data: variables,
    });
  } catch (error) {
    logger.error("Error in getAvailableVariables controller:", error);
    next(error);
  }
}

/**
 * Analyze template variable availability
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function analyzeTemplateVariables(req, res, next) {
  try {
    const { templateId, subscriberIds } = req.body;

    if (!templateId) {
      throw new BadRequestError("Template ID is required");
    }

    const subscriberVariablesService = require("../services/subscriber-variables.service");
    const analysis = await subscriberVariablesService.analyzeTemplateVariableAvailability(templateId, subscriberIds);

    res.status(200).json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    logger.error("Error in analyzeTemplateVariables controller:", error);
    next(error);
  }
}

module.exports = {
  createEmailTemplate,
  getEmailTemplateById,
  listEmailTemplates,
  updateEmailTemplate,
  deleteEmailTemplate,
  getTemplateVariables,
  renderTemplate,
  previewTemplate,
  previewRawTemplate,
  extractVariables,
  getAvailableVariables,
  analyzeTemplateVariables,
};
