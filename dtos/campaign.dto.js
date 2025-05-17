/**
 * @module dtos/campaign.dto
 * @description Data Transfer Objects for campaign-related operations using Zod for validation
 */

const { z } = require("zod");

/**
 * @typedef {Object} CreateCampaignSchema
 * @property {string} name - Name of the campaign
 * @property {string} [description] - Description of the campaign
 * @property {number} [templateId] - ID of the email template to use
 * @property {string} fromEmail - Email address to send the campaign from
 * @property {string} [replyTo] - Reply-to email address
 * @property {string} subject - Email subject line
 * @property {Object} [templateVariables] - Variables to use in the email template
 * @property {number[]} mailingListIds - IDs of the mailing lists to send to
 * @property {Date} [scheduledAt] - When to send the campaign
 */
const createCampaignSchema = {
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, { message: "Campaign name is required" })
      .max(255, { message: "Campaign name cannot exceed 255 characters" }),
    description: z.string().trim().nullable().optional(),
    templateId: z
      .number()
      .int({ message: "Template ID must be an integer" })
      .positive({ message: "Template ID must be a positive number" })
      .nullable()
      .optional(),
    fromEmail: z.string().email({ message: "From email must be a valid email address" }),
    replyTo: z.string().email({ message: "Reply-to email must be a valid email address" }).nullable().optional(),
    subject: z.string().trim().min(1, { message: "Subject is required" }).max(255, { message: "Subject cannot exceed 255 characters" }),
    templateVariables: z.record(z.any()).nullable().optional(),
    mailingListIds: z
      .array(
        z.number().int({ message: "Mailing list ID must be an integer" }).positive({ message: "Mailing list ID must be a positive number" })
      )
      .min(1, { message: "At least one mailing list is required" }),
    scheduledAt: z.preprocess(
      (val) => (val ? new Date(val) : null),
      z
        .date()
        .refine((date) => date > new Date(), { message: "Scheduled date must be in the future" })
        .nullable()
        .optional()
    ),
    trackOpens: z.boolean().optional().default(true),
    trackClicks: z.boolean().optional().default(true),
  }),
};

/**
 * @typedef {Object} UpdateCampaignSchema
 * @property {number} id - ID of the campaign to update
 * @property {string} [name] - Updated name of the campaign
 * @property {string} [description] - Updated description
 * @property {number} [templateId] - Updated template ID
 * @property {string} [fromEmail] - Updated from email
 * @property {string} [replyTo] - Updated reply-to email
 * @property {string} [subject] - Updated subject line
 * @property {Object} [templateVariables] - Updated template variables
 * @property {number[]} [mailingListIds] - Updated mailing list IDs
 * @property {Date} [scheduledAt] - Updated scheduled time
 */
const updateCampaignSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, { message: "Campaign name cannot be empty" })
        .max(255, { message: "Campaign name cannot exceed 255 characters" })
        .optional(),
      description: z.string().trim().nullable().optional(),
      templateId: z
        .number()
        .int({ message: "Template ID must be an integer" })
        .positive({ message: "Template ID must be a positive number" })
        .optional(),
      fromEmail: z.string().email({ message: "From email must be a valid email address" }).optional(),
      replyTo: z.string().email({ message: "Reply-to email must be a valid email address" }).nullable().optional(),
      subject: z
        .string()
        .trim()
        .min(1, { message: "Subject cannot be empty" })
        .max(255, { message: "Subject cannot exceed 255 characters" })
        .optional(),
      templateVariables: z.record(z.any()).nullable().optional(),
      mailingListIds: z
        .array(
          z
            .number()
            .int({ message: "Mailing list ID must be an integer" })
            .positive({ message: "Mailing list ID must be a positive number" })
        )
        .min(1, { message: "At least one mailing list is required" })
        .optional(),
      scheduledAt: z.preprocess(
        (val) => (val ? new Date(val) : null),
        z
          .date()
          .refine((date) => date > new Date(), { message: "Scheduled date must be in the future" })
          .nullable()
          .optional()
      ),
      trackOpens: z.boolean().optional(),
      trackClicks: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
};

/**
 * @typedef {Object} ScheduleCampaignSchema
 * @property {number} id - ID of the campaign to schedule
 * @property {Date} scheduledAt - When to send the campaign
 */
const scheduleCampaignSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    scheduledAt: z.preprocess(
      (val) => (val ? new Date(val) : null),
      z.date().refine((date) => date > new Date(), { message: "Scheduled date must be in the future" })
    ),
  }),
};

/**
 * @typedef {Object} GetCampaignSchema
 * @property {number} id - ID of the campaign
 */
const getCampaignSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
};

module.exports = {
  createCampaignSchema,
  updateCampaignSchema,
  scheduleCampaignSchema,
  getCampaignSchema,
};
