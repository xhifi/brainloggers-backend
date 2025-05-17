/**
 * @module dtos/subscriber.dto
 * @description Data Transfer Objects for subscriber-related operations using Zod for validation
 */

const { z } = require("zod");

/**
 * @typedef {Object} CreateSubscriberSchema
 * @property {string} email - Email address of the subscriber
 * @property {string} [name] - Name of the subscriber (optional)
 * @property {Date} [dateOfBirth] - Date of birth of the subscriber (optional)
 * @property {Object} [metadata] - Additional metadata for the subscriber (optional)
 */
const createSubscriberSchema = {
  body: z.object({
    email: z.string().email("Invalid email address"),
    name: z.string().nullable().optional(),
    dateOfBirth: z.coerce.date().nullable().optional(),
    metadata: z.record(z.any()).nullable().optional(),
  }),
};

/**
 * @typedef {Object} UpdateSubscriberSchema
 * @property {string} [email] - Email address of the subscriber
 * @property {string} [name] - Name of the subscriber
 * @property {Date} [dateOfBirth] - Date of birth of the subscriber
 * @property {boolean} [isActive] - Active status of the subscriber
 * @property {Object} [metadata] - Additional metadata for the subscriber
 */
const updateSubscriberSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  body: z
    .object({
      email: z.string().email("Invalid email address").optional(),
      name: z.string().nullable().optional(),
      dateOfBirth: z.coerce.date().nullable().optional(),
      isActive: z.boolean().optional(),
      metadata: z.record(z.any()).nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
};

/**
 * @typedef {Object} ImportSubscribersSchema
 * @property {string} csvData - CSV data containing subscribers
 */
const importSubscribersSchema = {
  body: z.object({
    csvData: z.string().min(1, "CSV data is required"),
  }),
};

/**
 * @typedef {Object} AssignTagsSchema
 * @property {number[]} tagIds - IDs of tags to assign to the subscriber
 */
const assignTagsSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    tagIds: z.array(z.number().int().positive("Tag IDs must be positive integers")),
  }),
};

/**
 * @typedef {Object} RemoveTagsSchema
 * @property {number[]} tagIds - IDs of tags to remove from the subscriber
 */
const removeTagsSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    tagIds: z.array(z.number().int().positive("Tag IDs must be positive integers")),
  }),
};

/**
 * @typedef {Object} GetSubscriberSchema
 * @property {number} id - ID of the subscriber
 */
const getSubscriberSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
};

/**
 * @typedef {Object} UnsubscribeSchema
 * @property {string} email - Email address of the subscriber to unsubscribe
 */
const unsubscribeSchema = {
  body: z.object({
    email: z.string().email("Invalid email address"),
  }),
};

module.exports = {
  createSubscriberSchema,
  updateSubscriberSchema,
  importSubscribersSchema,
  assignTagsSchema,
  removeTagsSchema,
  getSubscriberSchema,
  unsubscribeSchema,
};
