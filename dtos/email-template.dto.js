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
 * @typedef {Object} RenderEmailTemplateSchema
 * @property {number} templateId - ID of the email template
 * @property {number} [subscriberId] - ID of the subscriber (optional)
 * @property {Object} [subscriberData] - Subscriber data for variable interpolation (optional)
 * @property {Object} [customData] - Custom data for variable interpolation (optional)
 */
const renderEmailTemplateSchema = {
  body: z.object({
    templateId: z.number().int().positive("Template ID must be a positive integer"),
    subscriberId: z.number().int().positive("Subscriber ID must be a positive integer").optional(),
    subscriberData: z.record(z.any()).optional(),
    customData: z.record(z.any()).optional(),
  }),
};

/**
 * @typedef {Object} ListTemplateVariablesSchema
 * @property {number} id - ID of the email template to get variables from (optional)
 */
const listTemplateVariablesSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10))
      .optional(),
  }),
};

module.exports = {
  createEmailTemplateSchema,
  updateEmailTemplateSchema,
  getEmailTemplateSchema,
  renderEmailTemplateSchema,
  listTemplateVariablesSchema,
};
