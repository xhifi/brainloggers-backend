/**
 * @module dtos/subscription
 * @description Data Transfer Object schemas for subscription operations
 */
const { z } = require("zod");
const path = require("path");

// Schema for subscribing
const subscribeSchema = {
  body: z.object({
    email: z
      .string()
      .trim()
      .email("Valid email is required")
      .transform((val) => val.toLowerCase()), // Normalize email
    name: z.string().max(255, { message: "Name can be maximum 255 characters long" }).optional(),
    dateOfBirth: z
      .string()
      .optional()
      .refine((val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), { message: "Date of birth must be in YYYY-MM-DD format" }),
    metadata: z.record(z.string(), z.any()).optional(),
  }),
};

// Schema for unsubscribing
const unsubscribeSchema = {
  body: z.object({
    email: z
      .string()
      .trim()
      .email("Valid email is required")
      .transform((val) => val.toLowerCase()), // Normalize email
  }),
};

// Schema for single subscriber management (get, update, delete)
const subscriberIdSchema = {
  params: z.object({
    id: z
      .string()
      .trim()
      .refine((val) => !isNaN(parseInt(val)), {
        message: "Subscriber ID must be a number",
      }),
  }),
};

// Schema for updating subscriber
const updateSubscriberSchema = {
  params: z.object({
    id: z
      .string()
      .trim()
      .refine((val) => !isNaN(parseInt(val)), {
        message: "Subscriber ID must be a number",
      }),
  }),
  body: z.object({
    email: z
      .string()
      .trim()
      .email("Valid email is required")
      .transform((val) => val.toLowerCase())
      .optional(), // Normalize email
    name: z.string().max(255, { message: "Name can be maximum 255 characters long" }).optional(),
    dateOfBirth: z
      .string()
      .optional()
      .refine((val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), { message: "Date of birth must be in YYYY-MM-DD format" }),
    isActive: z.boolean().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  }),
};

// Schema for batch import subscribers (CSV content in request body)
const importSubscribersSchema = {
  body: z.object({
    subscribers: z.array(
      z.object({
        email: z
          .string()
          .trim()
          .email("Valid email is required")
          .transform((val) => val.toLowerCase()),
        name: z.string().max(255).optional(),
        dateOfBirth: z
          .string()
          .optional()
          .refine((val) => !val || /^\d{4}-\d{2}-\d{2}$/.test(val), { message: "Date of birth must be in YYYY-MM-DD format" }),
        metadata: z.record(z.string(), z.any()).optional(),
      })
    ),
  }),
};

// Schema for CSV file upload
const csvFileSchema = {
  file: z.any().refine(
    (file) => {
      return file && file.originalname && path.extname(file.originalname).toLowerCase() === ".csv";
    },
    {
      message: "Only CSV files are allowed",
    }
  ),
};

// Schema for getting subscribers with search and pagination
const getSubscribersSchema = {
  query: z.object({
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 10)),
    search: z.string().optional(),
    isActive: z
      .string()
      .optional()
      .transform((val) => {
        if (val === "true") return true;
        if (val === "false") return false;
        return undefined;
      }),
    sortBy: z.string().optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
  }),
};

/**
 * Tags validation schemas using Zod
 */

/**
 * Add tags to subscriber schema
 */
const addTagsSchema = {
  body: z.object({
    tags: z.array(z.string().trim().min(1).max(50)).min(1, "At least one tag is required"),
  }),
};

/**
 * Remove tags from subscriber schema
 */
const removeTagsSchema = {
  body: z.object({
    tags: z.array(z.string().trim().min(1).max(50)).min(1, "At least one tag is required"),
  }),
};

/**
 * Get subscribers by tags schema
 */
const getByTagsSchema = {
  query: z.object({
    tags: z.array(z.string().trim().min(1).max(50)).min(1, "At least one tag is required"),
    matchType: z.enum(["any", "all"]).default("any"),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(10),
    isActive: z.boolean().optional(),
  }),
};

/**
 * Get all tags schema
 */
const getAllTagsSchema = {
  query: z.object({
    search: z.string().min(1).max(50).optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(50),
  }),
};

module.exports = {
  subscribeSchema,
  unsubscribeSchema,
  subscriberIdSchema,
  updateSubscriberSchema,
  importSubscribersSchema,
  csvFileSchema,
  getSubscribersSchema,
  // Tag-related schemas
  addTagsSchema,
  removeTagsSchema,
  getByTagsSchema,
  getAllTagsSchema,
};
