/**
 * @module dtos/mailing-list
 * @description Validation schemas for mailing list endpoints
 */
const z = require("zod");

// Create/update mailing list validation schema
const mailingListSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Mailing list name is required" })
    .max(255, { message: "Mailing list name cannot exceed 255 characters" }),
  description: z.string().trim().nullable().optional(),
  sourceType: z.enum(["subscribers", "users", "mixed"]).default("subscribers").optional().describe("Source type for the mailing list"),
  filterCriteria: z.object({}).passthrough().nullable().optional(),
  tagFilter: z
    .object({
      tagIds: z.array(z.number().int().positive()).min(1, { message: "At least one tag is required" }),
    })
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

// Update mailing list validation schema (similar but with optional fields)
const updateMailingListSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: "Mailing list name cannot be empty" })
    .max(255, { message: "Mailing list name cannot exceed 255 characters" })
    .optional(),
  description: z.string().trim().nullable().optional(),
  sourceType: z.enum(["subscribers", "users", "mixed"]).optional().describe("Source type for the mailing list"),
  filterCriteria: z.object({}).passthrough().nullable().optional(),
  tagFilter: z
    .object({
      tagIds: z.array(z.number().int().positive()).describe("Array of tag IDs"),
    })
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

// Validation middleware functions
exports.validateMailingList = (req, res, next) => {
  try {
    mailingListSchema.parse(req.body);
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

exports.validateUpdateMailingList = (req, res, next) => {
  try {
    updateMailingListSchema.parse(req.body);
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
