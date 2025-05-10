/**
 * @module dtos/campaign
 * @description Validation schemas for campaign endpoints
 */
const z = require("zod");

// Create campaign validation schema
const campaignSchema = z.object({
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
  templateVariables: z.object({}).passthrough().nullable().optional(),
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
});

// Update campaign validation schema (similar but with optional fields)
const updateCampaignSchema = z.object({
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
  templateVariables: z.object({}).passthrough().nullable().optional(),
  mailingListIds: z
    .array(
      z.number().int({ message: "Mailing list ID must be an integer" }).positive({ message: "Mailing list ID must be a positive number" })
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
});

// Schema for scheduling a campaign
const scheduleCampaignSchema = z.object({
  scheduledAt: z.preprocess(
    (val) => (val ? new Date(val) : null),
    z.date().refine((date) => date > new Date(), { message: "Scheduled date must be in the future" })
  ),
});

// Validation middleware functions
exports.validateCampaign = (req, res, next) => {
  try {
    campaignSchema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      return res.status(400).json({
        success: false,
        errors,
      });
    }
    next(error);
  }
};

exports.validateUpdateCampaign = (req, res, next) => {
  try {
    updateCampaignSchema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      return res.status(400).json({
        success: false,
        errors,
      });
    }
    next(error);
  }
};

exports.validateScheduleCampaign = (req, res, next) => {
  try {
    scheduleCampaignSchema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      return res.status(400).json({
        success: false,
        errors,
      });
    }
    next(error);
  }
};
