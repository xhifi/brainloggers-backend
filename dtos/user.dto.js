const { z } = require("zod");

const updateUserSchema = {
  body: z
    .object({
      firstName: z.string().trim().optional(),
      lastName: z.string().trim().optional(),
      bio: z.string().trim().optional(),
      // Add other user-updatable fields as needed
    })
    // At least one field must be provided
    .refine((data) => Object.values(data).some((val) => val !== undefined), {
      message: "At least one field to update must be provided",
    }),
};

const getUserByIdSchema = {
  params: z.object({
    id: z.coerce.number().int("User ID must be an integer").positive("User ID must be positive"),
  }),
};

const changeUserRoleSchema = {
  params: z.object({
    id: z.coerce.number().int("User ID must be an integer").positive("User ID must be positive"),
  }),
  body: z.object({
    roleId: z.coerce.number().int("Role ID must be an integer").positive("Role ID must be positive"),
  }),
};

const userIdSchema = {
  params: z.object({
    id: z.string().uuid("User ID must be a valid UUID"),
  }),
};

module.exports = {
  updateUserSchema,
  getUserByIdSchema,
  changeUserRoleSchema,
  userIdSchema,
};
