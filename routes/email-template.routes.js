/**
 * @module Routes/EmailTemplate
 * @description Routes for managing email templates
 */
const express = require("express");
const emailTemplateController = require("../controllers/email-template.controller");
const { validate } = require("../middleware/validate");
const {
  createEmailTemplateSchema,
  updateEmailTemplateSchema,
  getEmailTemplateSchema,
  listEmailTemplatesSchema,
  renderTemplateSchema,
  previewTemplateSchema,
  extractVariablesSchema,
} = require("../dtos/email-template.dto");
const authenticate = require("../middleware/authenticate");
const { hasAnyPermission } = require("../middleware/authorize");

const router = express.Router();

// Apply authentication to all template routes
router.use(authenticate);

/**
 * @route POST /api/email-templates
 * @description Create a new email template
 * @access Private (requires templates:create permission)
 */
router.post(
  "/",
  hasAnyPermission({ resource: "templates", action: "create" }),
  validate(createEmailTemplateSchema),
  emailTemplateController.createEmailTemplate
);

/**
 * @route GET /api/email-templates/:id
 * @description Get an email template by ID
 * @access Private (requires templates:read permission)
 */
router.get(
  "/:id",
  hasAnyPermission({ resource: "templates", action: "read" }),
  validate(getEmailTemplateSchema),
  emailTemplateController.getEmailTemplateById
);

/**
 * @route GET /api/email-templates
 * @description List email templates with pagination and filtering
 * @access Private (requires templates:read permission)
 */
router.get(
  "/",
  hasAnyPermission({ resource: "templates", action: "read" }),
  validate(listEmailTemplatesSchema),
  emailTemplateController.listEmailTemplates
);

/**
 * @route PUT /api/email-templates/:id
 * @description Update an existing email template
 * @access Private (requires templates:update permission)
 */
router.put(
  "/:id",
  hasAnyPermission({ resource: "templates", action: "update" }),
  validate(updateEmailTemplateSchema),
  emailTemplateController.updateEmailTemplate
);

/**
 * @route DELETE /api/email-templates/:id
 * @description Delete an email template (soft delete)
 * @access Private (requires templates:delete permission)
 */
router.delete(
  "/:id",
  hasAnyPermission({ resource: "templates", action: "delete" }),
  validate(getEmailTemplateSchema),
  emailTemplateController.deleteEmailTemplate
);

/**
 * @route GET /api/email-templates/:id/variables
 * @description Get variables used in an email template
 * @access Private (requires templates:read permission)
 */
router.get(
  "/:id/variables",
  hasAnyPermission({ resource: "templates", action: "read" }),
  validate(getEmailTemplateSchema),
  emailTemplateController.getTemplateVariables
);

/**
 * @route POST /api/email-templates/render
 * @description Render MJML content with provided context
 * @access Private (requires templates:preview permission)
 */
router.post(
  "/render",
  hasAnyPermission({ resource: "templates", action: "preview" }),
  validate(renderTemplateSchema),
  emailTemplateController.renderTemplate
);

/**
 * @route POST /api/email-templates/:id/preview
 * @description Preview an email template with sample data
 * @access Private (requires templates:preview permission)
 */
router.post(
  "/:id/preview",
  hasAnyPermission({ resource: "templates", action: "preview" }),
  validate(previewTemplateSchema),
  emailTemplateController.previewTemplate
);

/**
 * @route POST /api/email-templates/preview-raw
 * @description Preview raw MJML content with sample data
 * @access Private (requires templates:preview permission)
 */
router.post(
  "/preview-raw",
  hasAnyPermission({ resource: "templates", action: "preview" }),
  validate(renderTemplateSchema),
  emailTemplateController.previewRawTemplate
);

/**
 * @route POST /api/email-templates/extract-variables
 * @description Extract variables from raw MJML content
 * @access Private (requires templates:preview permission)
 */
router.post(
  "/extract-variables",
  hasAnyPermission({ resource: "templates", action: "preview" }),
  validate(extractVariablesSchema),
  emailTemplateController.extractVariables
);

/**
 * @route GET /api/email-templates/variables/available
 * @description Get all available template variables with usage statistics
 * @access Private (requires templates:read permission)
 */
router.get(
  "/variables/available",
  hasAnyPermission({ resource: "templates", action: "read" }),
  emailTemplateController.getAvailableVariables
);

/**
 * @route POST /api/email-templates/variables/analyze
 * @description Analyze template variable availability for specific subscribers
 * @access Private (requires templates:preview permission)
 */
router.post(
  "/variables/analyze",
  hasAnyPermission({ resource: "templates", action: "preview" }),
  emailTemplateController.analyzeTemplateVariables
);

module.exports = router;
