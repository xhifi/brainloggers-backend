/**
 * @module dtos/tag
 * @description Data Transfer Object schemas for tag operations
 */
const { z } = require("zod");

const createTagSchema = {
  body: z.object({
    name: z.string().trim().min(1).max(255, "Tag name cannot exceed 255 characters"),
    description: z.string().optional().nullable(),
  }),
};

const updateTagSchema = {
  body: z
    .object({
      name: z.string().trim().max(255, "Tag name cannot exceed 255 characters").optional(),
      description: z.string().optional().nullable(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
};

const tagIdSchema = {
  params: z.object({
    tagId: z
      .string()
      .trim()
      .refine((val) => !isNaN(parseInt(val)) && parseInt(val) > 0, {
        message: "Tag ID must be a positive number",
      }),
  }),
};

const assignTagsSchema = {
  body: z.object({
    subscriberIds: z
      .array(z.number().int().positive("Subscriber ID must be a positive integer"))
      .min(1, "At least one subscriber ID is required"),
  }),
};

module.exports = {
  createTagSchema,
  updateTagSchema,
  tagIdSchema,
  assignTagsSchema,
};
