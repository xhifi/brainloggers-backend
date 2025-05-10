/**
 * @module Routes/Templates
 * @description Routes for email template management
 */
const express = require("express");
const router = express.Router();
const templateController = require("../controllers/template.controller");
const authenticate = require("../middleware/authenticate");
const { hasAllPermissions } = require("../middleware/authorize");
const { upload } = require("../middleware/upload");
const { validate } = require("../middleware/validate");
const { validateTemplate } = require("../dtos/template.dto");

// Template middleware groups
const templateReadAccess = [authenticate, hasAllPermissions({ resource: "template", action: "read" })];
const templateCreateAccess = [authenticate, hasAllPermissions({ resource: "template", action: "create" })];
const templateUpdateAccess = [authenticate, hasAllPermissions({ resource: "template", action: "update" })];
const templateDeleteAccess = [authenticate, hasAllPermissions({ resource: "template", action: "delete" })];
const templateEditAccess = [
  authenticate,
  hasAllPermissions([
    { resource: "template", action: "create" },
    { resource: "template", action: "update" },
  ]),
];

/**
 * @route   GET /api/templates
 * @desc    List all templates with pagination and filtering
 * @access  Private - Requires template:read permission
 */
router.get("/", ...templateReadAccess, templateController.listTemplates);

/**
 * @route   GET /api/templates/:id
 * @desc    Get a specific template by ID
 * @access  Private - Requires template:read permission
 */
router.get("/:id", ...templateReadAccess, templateController.getTemplateById);

/**
 * @route   POST /api/templates
 * @desc    Create a new template
 * @access  Private - Requires template:create permission
 */
router.post("/", ...templateCreateAccess, validate(validateTemplate), templateController.createTemplate);

/**
 * @route   PUT /api/templates/:id
 * @desc    Update an existing template
 * @access  Private - Requires template:update permission
 */
router.put("/:id", ...templateUpdateAccess, validate(validateTemplate), templateController.updateTemplate);

/**
 * @route   DELETE /api/templates/:id
 * @desc    Delete (soft delete) a template
 * @access  Private - Requires template:delete permission
 */
router.delete("/:id", ...templateDeleteAccess, templateController.deleteTemplate);

/**
 * @route   POST /api/templates/:templateId/upload-image
 * @desc    Upload an image to use in a specific template
 * @access  Private - Requires template:create or template:update permission
 */
router.post("/:templateId/upload-image", ...templateEditAccess, upload.single("image"), templateController.uploadTemplateImage);

/**
 * @route   POST /api/templates/:id/render
 * @desc    Render a template with variables
 * @access  Private - Requires template:read permission
 */
router.post("/:id/render", ...templateReadAccess, templateController.renderTemplate);

/**
 * @route   POST /api/templates/extract-variables
 * @desc    Extract variables from MJML content
 * @access  Private - Requires template:read permission
 */
router.post("/extract-variables", ...templateReadAccess, templateController.extractVariables);

module.exports = router;
