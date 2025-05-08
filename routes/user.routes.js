/**
 * @module routes/user
 * @description User routes for user management and authentication
 */
const express = require("express");
const userController = require("../controllers/user.controller");
const userRoleController = require("../controllers/user-role.controller");
const { validate } = require("../middleware/validate");
const authenticate = require("../middleware/authenticate");
const { hasAllPermissions, hasRoles } = require("../middleware/authorize");
const {
  userIdSchema,
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
  updateMeSchema,
  resetPasswordSchema,
} = require("../dtos/user.dto");
const { assignRoleSchema, removeRoleSchema, updateUserRolesSchema, roleIdSchema } = require("../dtos/user-role.dto");

const router = express.Router();

// Standard admin auth middleware
const adminAccess = [authenticate, hasRoles("admin")];
// User management permission middleware
const userManagementAccess = [authenticate, hasAllPermissions({ resource: "users", action: "manage" })];
const roleManagementAccess = [authenticate, hasAllPermissions({ resource: "roles", action: "manage" })];

/**
 * User profile routes - putting specific routes before parameterized routes
 */

/**
 * @route GET /api/users/me
 * @description Get current user profile
 * @access Private
 */
router.get("/me", authenticate, userController.getMe);

/**
 * @route PUT /api/users/me
 * @description Update current user profile
 * @access Private
 */
router.put("/me", authenticate, validate(updateMeSchema), userController.updateMe);

/**
 * @route PUT /api/users/me/change-password
 * @description Change current user password
 * @access Private
 */
router.put("/me/change-password", authenticate, validate(changePasswordSchema), userController.changePassword);

/**
 * @route POST /api/users/reset-password
 * @description Reset user password (admin only)
 * @access Private (Admin)
 */
router.post("/reset-password", validate(resetPasswordSchema), userController.resetPassword);

/**
 * User management routes
 */

/**
 * @route GET /api/users
 * @description Get all users (admin only)
 * @access Private (Admin)
 */
router.get("/", ...adminAccess, userController.getAllUsers);

/**
 * @route POST /api/users
 * @description Create a new user (admin only)
 * @access Private (Admin)
 */
router.post("/", ...adminAccess, validate(createUserSchema), userController.createUser);

/**
 * @route GET /api/users/:id
 * @description Get user by ID (admin only)
 * @access Private (Admin)
 */
router.get("/:id", ...adminAccess, validate(userIdSchema), userController.getUserById);

/**
 * @route PUT /api/users/:id
 * @description Update user (admin only)
 * @access Private (Admin)
 */
router.put("/:id", ...adminAccess, validate(updateUserSchema), userController.updateUser);

/**
 * @route DELETE /api/users/:id
 * @description Delete user (admin only)
 * @access Private (Admin)
 */
// Commenting out this route until the controller function is implemented
// router.delete("/:id", ...adminAccess, validate(userIdSchema), userController.deleteUser);

/**
 * @route PUT /api/users/:id/change-password
 * @description Admin changes user password (admin only)
 * @access Private (Admin)
 */
router.put("/:id/change-password", ...adminAccess, validate(changePasswordSchema), userController.adminChangePassword);

/**
 * User-Role Management Routes
 */

/**
 * @route GET /api/users/:userId/roles
 * @description Get all roles assigned to a user
 * @access Private (Admin or User Management)
 */
router.get("/:userId/roles", validate(userIdSchema), userRoleController.getUserRoles);

/**
 * @route POST /api/users/:userId/roles
 * @description Assign a role to a user
 * @access Private (Admin)
 */
router.post("/:userId/roles", ...adminAccess, validate(assignRoleSchema), userRoleController.assignRoleToUser);

/**
 * @route DELETE /api/users/:userId/roles/:roleId
 * @description Remove a role from a user
 * @access Private (Admin)
 */
router.delete("/:userId/roles/:roleId", ...adminAccess, validate(removeRoleSchema), userRoleController.removeRoleFromUser);

/**
 * @route PUT /api/users/:userId/roles
 * @description Replace all roles for a user
 * @access Private (Admin)
 */
router.put("/:userId/roles", ...adminAccess, validate(updateUserRolesSchema), userRoleController.updateUserRoles);

module.exports = router;
