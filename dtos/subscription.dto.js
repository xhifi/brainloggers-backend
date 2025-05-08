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

module.exports = {
  subscribeSchema,
  unsubscribeSchema,
  subscriberIdSchema,
  updateSubscriberSchema,
  importSubscribersSchema,
  csvFileSchema,
  getSubscribersSchema,
};
