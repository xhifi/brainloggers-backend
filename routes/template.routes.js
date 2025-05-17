/**
 * @module routes/email-template.routes
 * @description Routes for email template management
 */
const express = require("express");
const router = express.Router();
const emailTemplateController = require("../controllers/template.controller");
const authenticate = require("../middleware/authenticate");
const { hasAnyPermission } = require("../middleware/authorize");
const { validate } = require("../middleware/validate");
const {
  createEmailTemplateSchema,
  updateEmailTemplateSchema,
  getEmailTemplateSchema,
  renderEmailTemplateSchema,
  listTemplateVariablesSchema,
} = require("../dtos/email-template.dto");

// All email template routes need authentication

// Get all templates (with pagination)
router.get("/", authenticate, hasAnyPermission({ resource: "templates", action: "read" }), emailTemplateController.getAllEmailTemplates);

// Get a single template
router.get(
  "/:id",
  authenticate,
  hasAnyPermission({ resource: "templates", action: "read" }),
  validate(getEmailTemplateSchema),
  emailTemplateController.getEmailTemplateById
);

// Create a template
router.post(
  "/",
  authenticate,
  hasAnyPermission({ resource: "templates", action: "create" }),
  validate(createEmailTemplateSchema),
  emailTemplateController.createEmailTemplate
);

// Update a template
router.put(
  "/:id",
  authenticate,
  hasAnyPermission({ resource: "templates", action: "update" }),
  validate(updateEmailTemplateSchema),
  emailTemplateController.updateEmailTemplate
);

// Delete a template
router.delete(
  "/:id",
  authenticate,
  hasAnyPermission({ resource: "templates", action: "delete" }),
  validate(getEmailTemplateSchema),
  emailTemplateController.deleteEmailTemplate
);

// Render a template with data
router.post(
  "/render",
  authenticate,
  hasAnyPermission({ resource: "templates", action: "preview" }),
  validate(renderEmailTemplateSchema),
  emailTemplateController.renderEmailTemplate
);

// Get all available variables for templates
router.get(
  "/variables",
  authenticate,
  hasAnyPermission({ resource: "templates", action: "read" }),
  emailTemplateController.getTemplateVariables
);

// Get variables for a specific template
router.get(
  "/:id/variables",
  authenticate,
  hasAnyPermission({ resource: "templates", action: "read" }),
  validate(getEmailTemplateSchema),
  emailTemplateController.getTemplateVariables
);

module.exports = router;
