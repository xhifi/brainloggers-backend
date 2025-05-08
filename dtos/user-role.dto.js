/**
 * @module dtos/user-role
 * @description Data Transfer Object schemas for user-role operations
 */
const { z } = require("zod");

// Schema for getting roles assigned to a user
const userIdSchema = {
  params: z.object({
    userId: z.string().uuid("User ID must be a valid UUID"),
  }),
};

// Schema for assigning a role to a user
const assignRoleSchema = {
  params: z.object({
    userId: z.string().uuid("User ID must be a valid UUID"),
  }),
  body: z.object({
    roleId: z.number().int().positive("Role ID must be a positive integer"),
  }),
};

// Schema for removing a role from a user
const removeRoleSchema = {
  params: z.object({
    userId: z.string().uuid("User ID must be a valid UUID"),
    roleId: z
      .string()
      .trim()
      .refine((val) => !isNaN(parseInt(val)), {
        message: "Role ID must be a number",
      }),
  }),
};

// Schema for updating all roles for a user
const updateUserRolesSchema = {
  params: z.object({
    userId: z.string().uuid("User ID must be a valid UUID"),
  }),
  body: z.object({
    roleIds: z.array(z.number().int().positive("Role ID must be a positive integer")).min(0, "RoleIds must be an array, even if empty"),
  }),
};

// Schema for getting users with a specific role
const roleIdSchema = {
  params: z.object({
    roleId: z
      .string()
      .trim()
      .refine((val) => !isNaN(parseInt(val)), {
        message: "Role ID must be a number",
      }),
  }),
};

module.exports = {
  userIdSchema,
  assignRoleSchema,
  removeRoleSchema,
  updateUserRolesSchema,
  roleIdSchema,
};
