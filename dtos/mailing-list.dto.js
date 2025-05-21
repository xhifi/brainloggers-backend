/**
 * @module dtos/mailing-list.dto
 * @description Data Transfer Objects for mailing list operations using Zod for validation
 */
const { z } = require("zod");

/**
 * Schemas for filter operators by data type
 */
// Base value types
const stringValueSchema = z.string();
const numberValueSchema = z.number();
const booleanValueSchema = z.boolean();
const dateValueSchema = z.string().refine((val) => !isNaN(Date.parse(val)), { message: "Invalid date format" });
const arrayValueSchema = z.array(z.any());

// String operator schemas
const stringOperatorSchema = z.discriminatedUnion("operator", [
  z.object({ operator: z.literal("eq"), value: stringValueSchema }),
  z.object({ operator: z.literal("neq"), value: stringValueSchema }),
  z.object({ operator: z.literal("contains"), value: stringValueSchema }),
  z.object({ operator: z.literal("not_contains"), value: stringValueSchema }),
  z.object({ operator: z.literal("starts_with"), value: stringValueSchema }),
  z.object({ operator: z.literal("ends_with"), value: stringValueSchema }),
  z.object({ operator: z.literal("in"), value: z.array(stringValueSchema) }),
  z.object({ operator: z.literal("not_in"), value: z.array(stringValueSchema) }),
  z.object({ operator: z.literal("null") }),
  z.object({ operator: z.literal("not_null") }),
]);

// Number operator schemas
const numberOperatorSchema = z.discriminatedUnion("operator", [
  z.object({ operator: z.literal("eq"), value: numberValueSchema }),
  z.object({ operator: z.literal("neq"), value: numberValueSchema }),
  z.object({ operator: z.literal("gt"), value: numberValueSchema }),
  z.object({ operator: z.literal("gte"), value: numberValueSchema }),
  z.object({ operator: z.literal("lt"), value: numberValueSchema }),
  z.object({ operator: z.literal("lte"), value: numberValueSchema }),
  z.object({ operator: z.literal("between"), value: z.tuple([numberValueSchema, numberValueSchema]) }),
  z.object({ operator: z.literal("null") }),
  z.object({ operator: z.literal("not_null") }),
]);

// Date operator schemas
const dateOperatorSchema = z.discriminatedUnion("operator", [
  z.object({ operator: z.literal("eq"), value: dateValueSchema }),
  z.object({ operator: z.literal("neq"), value: dateValueSchema }),
  z.object({ operator: z.literal("gt"), value: dateValueSchema }),
  z.object({ operator: z.literal("gte"), value: dateValueSchema }),
  z.object({ operator: z.literal("lt"), value: dateValueSchema }),
  z.object({ operator: z.literal("lte"), value: dateValueSchema }),
  z.object({ operator: z.literal("between"), value: z.tuple([dateValueSchema, dateValueSchema]) }),
  z.object({ operator: z.literal("extract_day"), value: z.number().min(1).max(31) }),
  z.object({ operator: z.literal("extract_month"), value: z.number().min(1).max(12) }),
  z.object({ operator: z.literal("extract_year"), value: z.number() }),
  z.object({ operator: z.literal("null") }),
  z.object({ operator: z.literal("not_null") }),
]);

// Boolean operator schemas
const booleanOperatorSchema = z.discriminatedUnion("operator", [
  z.object({ operator: z.literal("eq"), value: booleanValueSchema }),
  z.object({ operator: z.literal("null") }),
  z.object({ operator: z.literal("not_null") }),
]);

// Array operator schemas
const arrayOperatorSchema = z.discriminatedUnion("operator", [
  z.object({ operator: z.literal("contains"), value: z.any() }),
  z.object({ operator: z.literal("not_contains"), value: z.any() }),
  z.object({ operator: z.literal("empty") }),
  z.object({ operator: z.literal("not_empty") }),
  z.object({ operator: z.literal("size_eq"), value: numberValueSchema }),
  z.object({ operator: z.literal("size_gt"), value: numberValueSchema }),
  z.object({ operator: z.literal("size_lt"), value: numberValueSchema }),
  z.object({ operator: z.literal("null") }),
  z.object({ operator: z.literal("not_null") }),
]);

// Generic field rule schema that can be string, number, date, boolean, or array operator
const fieldRuleSchema = z.object({
  field: z.string(),
  operator: z.string(),
  value: z.any().optional(),
});

// Forward declaration for recursive types
const filterGroupSchema = z.lazy(() => {
  return z.discriminatedUnion("condition", [
    z.object({
      condition: z.literal("and"),
      rules: z.array(z.union([filterGroupSchema, fieldRuleSchema])),
    }),
    z.object({
      condition: z.literal("or"),
      rules: z.array(z.union([filterGroupSchema, fieldRuleSchema])),
    }),
    z.object({
      condition: z.literal("not"),
      rule: z.union([filterGroupSchema, fieldRuleSchema]),
    }),
  ]);
});

// Schema for array of tag IDs
const tagsArraySchema = z.array(z.number().int().positive()).min(1);

/**
 * Complete filter criteria schema with support for complex nested conditions
 */
const filterCriteriaSchema = z.object({
  // Main filter rules
  filter: z.union([filterGroupSchema, fieldRuleSchema]).optional(),
  // Tags filter - an array of tag IDs that the subscriber must have ALL of
  tags: tagsArraySchema.optional(),
});

/**
 * @typedef {Object} CreateMailingListSchema
 * @property {string} name - Name of the mailing list
 * @property {string} [description] - Description of the mailing list (optional)
 * @property {Object} [filter_criteria] - Criteria for filtering subscribers (optional)
 */
const createMailingListSchema = {
  body: z.object({
    name: z
      .string()
      .trim()
      .min(3, { message: "Name must be at least 3 characters" })
      .max(255, { message: "Name cannot exceed 255 characters" }),
    description: z.string().trim().optional(),
    filter_criteria: filterCriteriaSchema.optional(),
  }),
};

/**
 * @typedef {Object} UpdateMailingListSchema
 * @property {string} [name] - Name of the mailing list
 * @property {string} [description] - Description of the mailing list
 * @property {Object} [filter_criteria] - Criteria for filtering subscribers
 * @property {boolean} [is_active] - Active status of the mailing list
 */
const updateMailingListSchema = {
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
        .min(3, { message: "Name must be at least 3 characters" })
        .max(255, { message: "Name cannot exceed 255 characters" })
        .optional(),
      description: z.string().trim().optional(),
      filter_criteria: filterCriteriaSchema.optional(),
      is_active: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
};

/**
 * @typedef {Object} GetMailingListSchema
 * @property {number} id - ID of the mailing list
 */
const getMailingListSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
};

/**
 * @typedef {Object} RegenerateRecipientsSchema
 * @property {number} id - ID of the mailing list to regenerate recipients for
 */
const regenerateRecipientsSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
};

/**
 * @typedef {Object} ListMailingListsSchema
 * @property {number} [page] - Page number for pagination
 * @property {number} [limit] - Number of items per page
 * @property {string} [sortBy] - Field to sort by
 * @property {string} [sortOrder] - Sort direction ('asc' or 'desc')
 * @property {string} [search] - Search term for filtering
 * @property {boolean} [isActive] - Filter by active status
 */
const listMailingListsSchema = {
  query: z.object({
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
    sortBy: z.enum(["id", "name", "created_at", "updated_at"]).optional(),
    sortOrder: z.enum(["asc", "desc"]).optional(),
    search: z.string().optional(),
    isActive: z
      .string()
      .optional()
      .transform((val) => {
        if (val === "true") return true;
        if (val === "false") return false;
        return undefined;
      }),
  }),
};

/**
 * @typedef {Object} PreviewFilterSchema
 * @property {Object} filter_criteria - Criteria for filtering subscribers
 */
const previewFilterSchema = {
  body: z.object({
    filter_criteria: filterCriteriaSchema.optional(),
  }),
  query: z
    .object({
      page: z.string().regex(/^\d+$/).transform(Number).optional(),
      limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    })
    .optional(),
};

module.exports = {
  createMailingListSchema,
  updateMailingListSchema,
  getMailingListSchema,
  listMailingListsSchema,
  regenerateRecipientsSchema,
  filterCriteriaSchema,
  previewFilterSchema,
};
