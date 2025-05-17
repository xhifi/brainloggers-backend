/**
 * @module dtos/tag.dto
 * @description Data Transfer Objects for tag-related operations using Zod for validation
 */

const { z } = require("zod");

/**
 * @typedef {Object} CreateTagSchema
 * @property {string} name - Name of the tag
 * @property {string} [description] - Description of the tag (optional)
 * @property {string} [color] - Color code for the tag (optional)
 */
const createTagSchema = {
  body: z.object({
    name: z.string().min(1, "Tag name is required").max(100, "Tag name must be at most 100 characters"),
    description: z.string().nullable().optional(),
    color: z.string().max(20, "Color code must be at most 20 characters").nullable().optional(),
  }),
};

/**
 * @typedef {Object} UpdateTagSchema
 * @property {string} [name] - Name of the tag
 * @property {string} [description] - Description of the tag
 * @property {string} [color] - Color code for the tag
 * @property {boolean} [isActive] - Active status of the tag
 */
const updateTagSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  body: z
    .object({
      name: z.string().min(1, "Tag name cannot be empty").max(100, "Tag name must be at most 100 characters").optional(),
      description: z.string().nullable().optional(),
      color: z.string().max(20, "Color code must be at most 20 characters").nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
};

/**
 * @typedef {Object} GetTagSchema
 * @property {number} id - ID of the tag
 */
const getTagSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
};

/**
 * @typedef {Object} DeleteTagSchema
 * @property {number} id - ID of the tag to delete
 */
const deleteTagSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
};

/**
 * @typedef {Object} GetTagSubscribersSchema
 * @property {number} id - ID of the tag
 * @property {number} [page] - Page number for pagination
 * @property {number} [limit] - Number of items per page
 */
const getTagSubscribersSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  query: z
    .object({
      page: z
        .string()
        .regex(/^\d+$/, "Page must be a number")
        .transform((val) => parseInt(val, 10))
        .optional(),
      limit: z
        .string()
        .regex(/^\d+$/, "Limit must be a number")
        .transform((val) => parseInt(val, 10))
        .optional(),
    })
    .optional(),
};

module.exports = {
  createTagSchema,
  updateTagSchema,
  getTagSchema,
  deleteTagSchema,
  getTagSubscribersSchema,
};
