/**
 * @module middleware/validate
 * @description Request validation middleware using Zod schema validation
 */
const { z } = require("zod");

/**
 * Creates a middleware function that validates request data using a Zod schema
 * @function validate
 * @param {Object} schema - Zod schema configuration object with request part schemas
 * @param {z.ZodSchema} [schema.body] - Schema for validating req.body
 * @param {z.ZodSchema} [schema.params] - Schema for validating req.params
 * @param {z.ZodSchema} [schema.query] - Schema for validating req.query
 * @returns {Function} Express middleware function
 * @throws {400} When validation fails with formatted error details
 *
 * @example
 * // Define validation schema for login
 * const loginSchema = {
 *   body: z.object({
 *     email: z.string().email("Invalid email format"),
 *     password: z.string().min(8, "Password must be at least 8 characters")
 *   })
 * };
 *
 * // Use in routes
 * router.post('/login', validate(loginSchema), authController.login);
 */
const validate = (schema) => {
  return async (req, res, next) => {
    try {
      // Initialize body if it doesn't exist (for GET requests)
      if (!req.body) {
        req.body = {};
      }

      // Validate each part of the request that has a schema
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }

      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }

      // If validation passes, proceed to the next middleware or controller
      next();
    } catch (error) {
      // If validation fails, format the Zod errors and return a 400 response
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        return res.status(400).json({
          message: "Validation failed",
          errors,
        });
      }

      // Pass other errors to the global error handler
      next(error);
    }
  };
};

module.exports = { validate, z }; // Export both validate middleware and z for schema creation
