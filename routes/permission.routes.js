/**
 * @module Routes/Permissions
 * @description Routes for permission management operations
 */
const express = require("express");
const permissionController = require("../controllers/permission.controller");
const userRoleController = require("../controllers/user-role.controller");
const { validate } = require("../middleware/validate");
const authenticate = require("../middleware/authenticate");
const { hasRoles } = require("../middleware/authorize");
const {
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
} = require("../dtos/permission.dto");
const { roleIdSchema: userRoleIdSchema } = require("../dtos/user-role.dto");

const router = express.Router();

// All routes require authentication and admin role
const adminAccess = [authenticate, hasRoles("admin")];

/**
 * Permission routes
 */

/**
 * @route GET /api/permissions
 * @description Get all permissions with optional filtering
 * @access Private (Admin)
 */
router.get("/", ...adminAccess, validate(listPermissionsSchema), permissionController.getAllPermissions);

/**
 * @route GET /api/permissions/:id
 * @description Get a permission by ID
 * @access Private (Admin)
 */
router.get("/:id", ...adminAccess, validate(permissionIdSchema), permissionController.getPermissionById);

/**
 * @route POST /api/permissions
 * @description Create a new permission
 * @access Private (Admin)
 */
router.post("/", ...adminAccess, validate(createPermissionSchema), permissionController.createPermission);

/**
 * @route PUT /api/permissions/:id
 * @description Update a permission
 * @access Private (Admin)
 */
router.put("/:id", ...adminAccess, validate(updatePermissionSchema), permissionController.updatePermission);

/**
 * @route DELETE /api/permissions/:id
 * @description Delete a permission
 * @access Private (Admin)
 */
router.delete("/:id", ...adminAccess, validate(permissionIdSchema), permissionController.deletePermission);

/**
 * Role routes
 */

/**
 * @route GET /api/permissions/roles
 * @description Get all roles with their permissions
 * @access Private (Admin)
 */
router.get("/roles", ...adminAccess, permissionController.getRolesWithPermissions);

/**
 * @route GET /api/permissions/roles/:id
 * @description Get a role with its permissions
 * @access Private (Admin)
 */
router.get("/roles/:id", ...adminAccess, validate(roleIdSchema), permissionController.getRoleWithPermissions);

/**
 * @route GET /api/permissions/roles/:roleId/users
 * @description Get all users with a specific role
 * @access Private (Admin)
 */
router.get("/roles/:roleId/users", ...adminAccess, validate(userRoleIdSchema), userRoleController.getUsersWithRole);

/**
 * @route POST /api/permissions/roles
 * @description Create a new role
 * @access Private (Admin)
 */
router.post("/roles", ...adminAccess, validate(createRoleSchema), permissionController.createRole);

/**
 * @route PUT /api/permissions/roles/:id
 * @description Update a role
 * @access Private (Admin)
 */
router.put("/roles/:id", ...adminAccess, validate(updateRoleSchema), permissionController.updateRole);

/**
 * @route DELETE /api/permissions/roles/:id
 * @description Delete a role
 * @access Private (Admin)
 */
router.delete("/roles/:id", ...adminAccess, validate(roleIdSchema), permissionController.deleteRole);

/**
 * Role-Permission assignment routes
 */

/**
 * @route POST /api/permissions/roles/:roleId/permissions
 * @description Assign a permission to a role
 * @access Private (Admin)
 */
router.post("/roles/:roleId/permissions", ...adminAccess, validate(assignPermissionSchema), permissionController.assignPermissionToRole);

/**
 * @route DELETE /api/permissions/roles/:roleId/permissions/:permissionId
 * @description Remove a permission from a role
 * @access Private (Admin)
 */
router.delete(
  "/roles/:roleId/permissions/:permissionId",
  ...adminAccess,
  validate(removePermissionSchema),
  permissionController.removePermissionFromRole
);

/**
 * @route PUT /api/permissions/roles/:roleId/permissions
 * @description Update all permissions for a role (replace existing)
 * @access Private (Admin)
 */
router.put("/roles/:roleId/permissions", ...adminAccess, validate(updateRolePermissionsSchema), permissionController.updateRolePermissions);

module.exports = router;
