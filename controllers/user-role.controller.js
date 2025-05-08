/**
 * @module controllers/user-role
 * @description Controller for managing user-role assignments
 */
const roleService = require("../services/role.service");
const logger = require("../services/logger.service");
const { NotFoundError, ForbiddenError } = require("../utils/errors");

/**
 * Get all roles assigned to a user
 * @async
 * @function getUserRoles
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response with user roles
 */
const getUserRoles = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const roles = await roleService.getRolesForUser(userId);
    return res.json({ userId, roles });
  } catch (error) {
    logger.error("Error in getUserRoles controller:", { error });
    return next(error);
  }
};

/**
 * Assign a role to a user
 * @async
 * @function assignRoleToUser
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response with assignment result
 */
const assignRoleToUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { roleId } = req.body;

    const result = await roleService.assignRoleToUser(userId, roleId);

    if (result.already_assigned) {
      return res.json({
        message: "Role is already assigned to this user",
        user_id: result.user_id,
        role_id: result.role_id,
      });
    }

    return res.status(201).json({
      message: "Role assigned to user successfully",
      user_id: result.user_id,
      role_id: result.role_id,
    });
  } catch (error) {
    if (error.message.includes("not found")) {
      return next(new NotFoundError(error.message));
    }
    logger.error("Error in assignRoleToUser controller:", { error });
    return next(error);
  }
};

/**
 * Remove a role from a user
 * @async
 * @function removeRoleFromUser
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response
 */
const removeRoleFromUser = async (req, res, next) => {
  try {
    const { userId, roleId } = req.params;

    const removed = await roleService.removeRoleFromUser(userId, parseInt(roleId));

    if (!removed) {
      throw new NotFoundError(`Role ${roleId} is not assigned to user ${userId}`);
    }

    return res.json({
      message: "Role removed from user successfully",
      user_id: userId,
      role_id: parseInt(roleId),
    });
  } catch (error) {
    logger.error("Error in removeRoleFromUser controller:", { error });
    return next(error);
  }
};

/**
 * Replace all roles for a user
 * @async
 * @function updateUserRoles
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response
 */
const updateUserRoles = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { roleIds } = req.body;

    const result = await roleService.updateUserRoles(userId, roleIds);

    return res.json({
      message: "User roles updated successfully",
      user_id: result.user_id,
      roles_added: result.roles_added,
    });
  } catch (error) {
    if (error.message.includes("not found")) {
      return next(new NotFoundError(error.message));
    }
    if (error.message.includes("invalid")) {
      return next(new ForbiddenError(error.message));
    }
    logger.error("Error in updateUserRoles controller:", { error });
    return next(error);
  }
};

/**
 * Get all users with a specific role
 * @async
 * @function getUsersWithRole
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Object} JSON response with users
 */
const getUsersWithRole = async (req, res, next) => {
  try {
    const { roleId } = req.params;

    const users = await roleService.getUsersWithRole(parseInt(roleId));

    return res.json({
      role_id: parseInt(roleId),
      users,
    });
  } catch (error) {
    logger.error("Error in getUsersWithRole controller:", { error });
    return next(error);
  }
};

module.exports = {
  getUserRoles,
  assignRoleToUser,
  removeRoleFromUser,
  updateUserRoles,
  getUsersWithRole,
};
