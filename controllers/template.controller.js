// filepath: c:\Users\shifa.newversion\Desktop\auth-app-plain-sql-rbac-v2\controllers\template.controller.js
const templateService = require("../services/template.service");
const { BadRequest } = require("../utils/errors");
const logger = require("../services/logger.service");

/**
 * Create a new email template
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createTemplate = async (req, res, next) => {
  try {
    const { name, description, category, mjmlSource, templateVariables } = req.body;

    if (!name || !mjmlSource) {
      throw new BadRequest("Template name and MJML source are required");
    }

    const userId = req.user.id;

    const template = await templateService.createTemplate(
      {
        name,
        description,
        category,
        mjmlSource,
        templateVariables,
      },
      userId
    );

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing email template
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const template = await templateService.updateTemplate(id, req.body, userId);

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a template (soft delete)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.deleteTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;

    await templateService.deleteTemplate(id);

    res.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get template by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getTemplateById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const template = await templateService.getTemplateById(id);

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List templates with pagination and filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.listTemplates = async (req, res, next) => {
  try {
    const { page, limit, category, search, isActive } = req.query;

    const options = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      category,
      search,
      isActive: isActive !== undefined ? isActive === "true" : undefined,
    };

    const result = await templateService.listTemplates(options);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload a template image
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.uploadTemplateImage = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new BadRequest("No file provided");
    }

    const userId = req.user.id;
    const result = await templateService.uploadTemplateImage(req.file, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Render template with variable substitution
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.renderTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { variables } = req.body;

    if (!variables || typeof variables !== "object") {
      throw new BadRequest("Template variables must be provided as an object");
    }

    const html = await templateService.renderTemplate(id, variables);

    res.json({
      success: true,
      data: {
        html,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Extract variables from template MJML
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.extractVariables = async (req, res, next) => {
  try {
    const { mjmlSource } = req.body;

    if (!mjmlSource) {
      throw new BadRequest("MJML source is required");
    }

    const variables = templateService.extractTemplateVariables(mjmlSource);

    res.json({
      success: true,
      data: {
        variables,
      },
    });
  } catch (error) {
    next(error);
  }
};
