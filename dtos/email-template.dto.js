/**
 * @module dtos/email-template.dto
 * @description Data Transfer Objects for email template-related operations using Zod for validation
 */

const { z } = require("zod");

/**
 * @typedef {Object} CreateEmailTemplateSchema
 * @property {string} name - Name of the email template
 * @property {string} subject - Subject line of the email template
 * @property {string} mjmlContent - MJML content of the template with variable placeholders
 * @property {string} [description] - Description of the template (optional)
 * @property {string} [category] - Category of the template (e.g., 'Transactional', 'Marketing')
 * @property {boolean} [hasAttachments=false] - Whether the template has attachments
 * @property {Object} [metadata] - Additional metadata for the template (optional)
 */
const createEmailTemplateSchema = {
  body: z.object({
    name: z.string().min(1, "Template name is required"),
    subject: z.string().min(1, "Subject is required"),
    mjmlContent: z.string().min(1, "MJML content is required"),
    description: z.string().nullable().optional(),
    category: z.string().default("General").optional(),
    hasAttachments: z.boolean().default(false).optional(),
    metadata: z.record(z.any()).nullable().optional(),
  }),
};

/**
 * @typedef {Object} UpdateEmailTemplateSchema
 * @property {string} [name] - Name of the email template
 * @property {string} [subject] - Subject line of the email template
 * @property {string} [mjmlContent] - MJML content of the template with variable placeholders
 * @property {string} [description] - Description of the template
 * @property {string} [category] - Category of the template
 * @property {boolean} [hasAttachments] - Whether the template has attachments
 * @property {Object} [metadata] - Additional metadata for the template
 */
const updateEmailTemplateSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  body: z
    .object({
      name: z.string().min(1).optional(),
      subject: z.string().min(1).optional(),
      mjmlContent: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      category: z.string().optional(),
      hasAttachments: z.boolean().optional(),
      metadata: z.record(z.any()).nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
};

/**
 * @typedef {Object} GetEmailTemplateSchema
 * @property {number} id - ID of the email template
 */
const getEmailTemplateSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
};

/**
 * @typedef {Object} ListEmailTemplatesSchema
 * @property {number} [page] - Page number for pagination
 * @property {number} [limit] - Number of items per page
 * @property {string} [search] - Search term for filtering templates
 * @property {string} [category] - Category of templates to filter
 * @property {boolean} [isActive] - Filter by active status
 * @property {string} [sortBy] - Field to sort by
 * @property {string} [sortOrder] - Sort order (asc or desc)
 */
const listEmailTemplatesSchema = {
  query: z
    .object({
      page: z.string().regex(/^\d+$/).transform(Number).optional(),
      limit: z.string().regex(/^\d+$/).transform(Number).optional(),
      search: z.string().optional(),
      category: z.string().optional(),
      isActive: z
        .enum(["true", "false"])
        .transform((val) => val === "true")
        .optional(),
      sortBy: z.enum(["id", "name", "category", "created_at", "updated_at"]).optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    })
    .optional(),
};

/**
 * @typedef {Object} RenderTemplateSchema
 * @property {string} mjmlContent - Raw MJML content with Liquid variables
 * @property {Object} [context] - Context object with variable values for rendering
 */
const renderTemplateSchema = {
  body: z.object({
    mjmlContent: z.string().min(1, "MJML content is required"),
    context: z.record(z.any()).optional(),
  }),
};

/**
 * @typedef {Object} PreviewTemplateSchema
 * @property {number} id - ID of the template to preview
 * @property {Object} [sampleData] - Sample data for variable interpolation
 */
const previewTemplateSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  body: z.record(z.any()).optional(),
};

/**
 * @typedef {Object} ExtractVariablesSchema
 * @property {string} mjmlContent - Raw MJML content to extract variables from
 */
const extractVariablesSchema = {
  body: z.object({
    mjmlContent: z.string().min(1, "MJML content is required"),
  }),
};

module.exports = {
  createEmailTemplateSchema,
  updateEmailTemplateSchema,
  getEmailTemplateSchema,
  listEmailTemplatesSchema,
  renderTemplateSchema,
  previewTemplateSchema,
  extractVariablesSchema,
};
