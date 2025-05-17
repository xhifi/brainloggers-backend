/**
 * @module dtos/mailing-list.dto
 * @description Data Transfer Objects for mailing list operations using Zod for validation
 */
const { z } = require("zod");

/**
 * Schema for filter operators
 */
const filterOperatorSchema = z
  .object({
    eq: z.union([z.string(), z.number(), z.boolean()]).optional(),
    neq: z.union([z.string(), z.number(), z.boolean()]).optional(),
    contains: z.union([z.string(), z.array(z.string())]).optional(),
    gte: z.union([z.string(), z.number()]).optional(),
    lte: z.union([z.string(), z.number()]).optional(),
    not_null: z.boolean().optional(),
    null: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // Ensure only one operator is used per field
      return Object.keys(data).length === 1;
    },
    {
      message: "Only one operator can be used per field",
    }
  );

/**
 * @typedef {Object} CreateMailingListSchema
 * @property {string} name - Name of the mailing list
 * @property {string} [description] - Description of the mailing list (optional)
 * @property {Object} [filterCriteria] - Criteria for filtering subscribers (optional)
 */
const createMailingListSchema = {
  body: z.object({
    name: z
      .string()
      .trim()
      .min(3, { message: "Name must be at least 3 characters" })
      .max(255, { message: "Name cannot exceed 255 characters" }),
    description: z.string().trim().optional(),
    filterCriteria: z
      .object({
        tags: z
          .object({
            contains: z.array(z.number().int().positive()).min(1),
          })
          .optional(),
        name: filterOperatorSchema.optional(),
        email: filterOperatorSchema.optional(),
        date_of_birth: filterOperatorSchema.optional(),
        is_active: filterOperatorSchema.optional(),
        subscribed_at: filterOperatorSchema.optional(),
        unsubscribed_at: filterOperatorSchema.optional(),
        created_at: filterOperatorSchema.optional(),
        updated_at: filterOperatorSchema.optional(),
        metadata: z
          .object({
            state: filterOperatorSchema.optional(),
            interests: z
              .object({
                contains: z.array(z.string()).min(1),
              })
              .optional(),
          })
          .optional(),
      })
      .optional(),
  }),
};

/**
 * @typedef {Object} UpdateMailingListSchema
 * @property {string} [name] - Name of the mailing list
 * @property {string} [description] - Description of the mailing list
 * @property {Object} [filterCriteria] - Criteria for filtering subscribers
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
      filterCriteria: z
        .object({
          tags: z
            .object({
              contains: z.array(z.number().int().positive()).min(1),
            })
            .optional(),
          name: filterOperatorSchema.optional(),
          email: filterOperatorSchema.optional(),
          date_of_birth: filterOperatorSchema.optional(),
          is_active: filterOperatorSchema.optional(),
          subscribed_at: filterOperatorSchema.optional(),
          unsubscribed_at: filterOperatorSchema.optional(),
          created_at: filterOperatorSchema.optional(),
          updated_at: filterOperatorSchema.optional(),
          metadata: z
            .object({
              state: filterOperatorSchema.optional(),
              interests: z
                .object({
                  contains: z.array(z.string()).min(1),
                })
                .optional(),
            })
            .optional(),
        })
        .optional(),
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
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    sortBy: z.enum(["id", "name", "created_at", "updated_at"]).default("created_at"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    search: z.string().trim().optional(),
    isActive: z.preprocess((val) => (val === "true" ? true : val === "false" ? false : undefined), z.boolean().optional()),
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

module.exports = {
  createMailingListSchema,
  updateMailingListSchema,
  getMailingListSchema,
  listMailingListsSchema,
  regenerateRecipientsSchema,
};
