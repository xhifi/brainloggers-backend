/**
 * @module dtos/permission
 * @description Data Transfer Object schemas for permission operations
 */
const { z } = require("zod");

// Schema for creating a new permission
const createPermissionSchema = {
  body: z.object({
    resource: z
      .string()
      .min(1, "Resource name is required")
      .regex(/^[a-zA-Z0-9_-]+$/, "Resource name must contain only alphanumeric characters, underscores and hyphens"),
    action: z
      .string()
      .min(1, "Action name is required")
      .regex(/^[a-zA-Z0-9_-]+$/, "Action name must contain only alphanumeric characters, underscores and hyphens"),
    description: z.string().optional(),
  }),
};

// Schema for updating a permission
const updatePermissionSchema = {
  params: z.object({
    id: z
      .string()
      .trim()
      .refine((val) => !isNaN(parseInt(val)), {
        message: "Permission ID must be a number",
      }),
  }),
  body: z
    .object({
      resource: z
        .string()
        .min(1, "Resource name is required")
        .regex(/^[a-zA-Z0-9_-]+$/, "Resource name must contain only alphanumeric characters, underscores and hyphens")
        .optional(),
      action: z
        .string()
        .min(1, "Action name is required")
        .regex(/^[a-zA-Z0-9_-]+$/, "Action name must contain only alphanumeric characters, underscores and hyphens")
        .optional(),
      description: z.string().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
};

// Schema for getting permissions by ID
const permissionIdSchema = {
  params: z.object({
    id: z
      .string()
      .trim()
      .refine((val) => !isNaN(parseInt(val)), {
        message: "Permission ID must be a number",
      }),
  }),
};

// Schema for listing permissions with filtering
const listPermissionsSchema = {
  query: z.object({
    resource: z.string().optional(),
    search: z.string().optional(),
  }),
};

// Schema for creating a new role
const createRoleSchema = {
  body: z.object({
    name: z
      .string()
      .min(1, "Role name is required")
      .max(50, "Role name cannot exceed 50 characters")
      .regex(/^[a-zA-Z0-9_-]+$/, "Role name must contain only alphanumeric characters, underscores and hyphens"),
    description: z.string().optional(),
    permissionIds: z.array(z.number().int().positive("Permission ID must be a positive integer")).optional(),
  }),
};

// Schema for updating a role
const updateRoleSchema = {
  params: z.object({
    id: z
      .string()
      .trim()
      .refine((val) => !isNaN(parseInt(val)), {
        message: "Role ID must be a number",
      }),
  }),
  body: z
    .object({
      name: z
        .string()
        .min(1, "Role name is required")
        .max(50, "Role name cannot exceed 50 characters")
        .regex(/^[a-zA-Z0-9_-]+$/, "Role name must contain only alphanumeric characters, underscores and hyphens")
        .optional(),
      description: z.string().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
};

// Schema for role ID
const roleIdSchema = {
  params: z.object({
    id: z
      .string()
      .trim()
      .refine((val) => !isNaN(parseInt(val)), {
        message: "Role ID must be a number",
      }),
  }),
};

// Schema for assigning a permission to a role
const assignPermissionSchema = {
  params: z.object({
    roleId: z
      .string()
      .trim()
      .refine((val) => !isNaN(parseInt(val)), {
        message: "Role ID must be a number",
      }),
  }),
  body: z.object({
    permissionId: z.number().int().positive("Permission ID must be a positive integer"),
  }),
};

// Schema for removing a permission from a role
const removePermissionSchema = {
  params: z.object({
    roleId: z
      .string()
      .trim()
      .refine((val) => !isNaN(parseInt(val)), {
        message: "Role ID must be a number",
      }),
    permissionId: z
      .string()
      .trim()
      .refine((val) => !isNaN(parseInt(val)), {
        message: "Permission ID must be a number",
      }),
  }),
};

// Schema for updating permissions for a role
const updateRolePermissionsSchema = {
  params: z.object({
    roleId: z
      .string()
      .trim()
      .refine((val) => !isNaN(parseInt(val)), {
        message: "Role ID must be a number",
      }),
  }),
  body: z.object({
    permissionIds: z.array(z.number().int().positive("Permission ID must be a positive integer")),
  }),
};

module.exports = {
  createPermissionSchema,
  updatePermissionSchema,
  permissionIdSchema,
  listPermissionsSchema,
  createRoleSchema,
  updateRoleSchema,
  roleIdSchema,
  assignPermissionSchema,
  removePermissionSchema,
  updateRolePermissionsSchema,
};
