/**
 * @module middleware/authorize
 * @description Middleware for role-based access control (RBAC) to restrict access based on permissions or roles
 */
const roleService = require("../services/role.service");
const logger = require("../services/logger.service");

/**
 * Checks if a user is authenticated before authorization
 * @private
 * @function ensureAuthenticated
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {boolean} True if authenticated, false otherwise
 */
const ensureAuthenticated = (req, res) => {
  if (!req.user || !req.user.id) {
    res.status(401).json({ message: "Unauthorized: Authentication required" });
    return false;
  }
  return true;
};

/**
 * Creates middleware that checks if the authenticated user has ALL the required permissions
 * @function hasAllPermissions
 * @param {...Object} requiredPerms - Permission objects to check
 * @param {string} requiredPerms.resource - Resource identifier (e.g., 'users', 'posts')
 * @param {string} requiredPerms.action - Action on the resource (e.g., 'read', 'create')
 * @returns {Function} Express middleware function
 * @throws {403} If user lacks required permissions
 * @throws {500} If an error occurs during permission verification
 *
 * @example
 * // Route requiring multiple permissions
 * router.get('/admin/reports',
 *   authenticate,
 *   hasAllPermissions(
 *     { resource: 'reports', action: 'read_all' },
 *     { resource: 'users', action: 'read_any' }
 *   ),
 *   reportsController.getAll
 * );
 */
const hasAllPermissions = (...requiredPerms) => {
  // Ensure we're working with a flat array of permission objects
  // This handles cases where the function is called with an object or array of objects
  let permsArray = requiredPerms;

  // If first arg is an array, use that instead (handles case of passing an array)
  if (requiredPerms.length === 1 && Array.isArray(requiredPerms[0])) {
    permsArray = requiredPerms[0];
  }

  // Input validation for requiredPerms
  if (!permsArray || permsArray.length === 0 || !permsArray.every((p) => p && p.resource && p.action)) {
    logger.error("Invalid input to hasAllPermissions middleware:", permsArray);
    // This is a server error (bad configuration)
    return (req, res, next) => next(new Error("Invalid permission configuration in middleware."));
  }

  return async (req, res, next) => {
    if (!ensureAuthenticated(req, res)) return;

    try {
      // Fetch fresh permissions map { resource: Set<action> } for the user
      const userPermissionsMap = await roleService.getPermissionsForUser(req.user.id);

      // Check if user has all required permissions
      const hasAll = permsArray.every((rp) => userPermissionsMap[rp.resource]?.has(rp.action));

      if (hasAll) {
        next(); // User has all required permissions
      } else {
        const missing = permsArray
          .filter((rp) => !userPermissionsMap[rp.resource]?.has(rp.action))
          .map((rp) => `${rp.resource}:${rp.action}`); // Format missing permissions
        logger.warn(`Authorization Failed: User ${req.user.id} missing required permissions: ${missing.join(", ")}`, {
          userId: req.user.id,
          path: req.path,
          method: req.method,
          missingPermissions: missing,
        });
        return res.status(403).json({ message: "Forbidden: Insufficient permissions" });
      }
    } catch (error) {
      logger.error(`Authorization Error (hasAllPermissions) for user ${req.user.id}:`, {
        error: error.message,
        stack: error.stack,
        userId: req.user.id,
        path: req.path,
        method: req.method,
      });
      return res.status(500).json({ message: "Internal server error during authorization" });
    }
  };
};

/**
 * Creates middleware that checks if the authenticated user has AT LEAST ONE of the required permissions
 * @function hasAnyPermission
 * @param {...Object} requiredPerms - Permission objects to check (user needs at least one)
 * @param {string} requiredPerms.resource - Resource identifier (e.g., 'users', 'posts')
 * @param {string} requiredPerms.action - Action on the resource (e.g., 'read', 'update')
 * @returns {Function} Express middleware function
 * @throws {403} If user lacks all specified permissions
 * @throws {500} If an error occurs during permission verification
 *
 * @example
 * // Route requiring at least one of several permissions
 * router.put('/users/:id',
 *   authenticate,
 *   hasAnyPermission(
 *     { resource: 'users', action: 'update_own' },
 *     { resource: 'users', action: 'update_any' }
 *   ),
 *   userController.updateUser
 * );
 */
const hasAnyPermission = (...requiredPerms) => {
  // Ensure we're working with a flat array of permission objects
  let permsArray = requiredPerms;

  // If first arg is an array, use that instead
  if (requiredPerms.length === 1 && Array.isArray(requiredPerms[0])) {
    permsArray = requiredPerms[0];
  }

  // Input validation
  if (!permsArray || permsArray.length === 0 || !permsArray.every((p) => p && p.resource && p.action)) {
    logger.error("Invalid input to hasAnyPermission middleware:", permsArray);
    return (req, res, next) => next(new Error("Invalid permission configuration in middleware."));
  }

  return async (req, res, next) => {
    if (!ensureAuthenticated(req, res)) return;

    try {
      const userPermissionsMap = await roleService.getPermissionsForUser(req.user.id);

      // Check if user has at least one of the required permissions
      const hasAtLeastOne = permsArray.some((rp) => userPermissionsMap[rp.resource]?.has(rp.action));

      if (hasAtLeastOne) {
        next(); // User has at least one required permission
      } else {
        const checkedPerms = permsArray.map((rp) => `${rp.resource}:${rp.action}`);
        logger.warn(`Authorization Failed: User ${req.user.id} missing ANY required permission from: ${checkedPerms.join(", ")}`, {
          userId: req.user.id,
          path: req.path,
          method: req.method,
          requiredPermissions: checkedPerms,
        });
        return res.status(403).json({ message: "Forbidden: Insufficient permissions for this action" });
      }
    } catch (error) {
      logger.error(`Authorization Error (hasAnyPermission) for user ${req.user.id}:`, {
        error: error.message,
        stack: error.stack,
        userId: req.user.id,
        path: req.path,
        method: req.method,
      });
      return res.status(500).json({ message: "Internal server error during authorization" });
    }
  };
};

/**
 * Creates middleware that checks if user has AT LEAST ONE of the specified roles
 * @function hasRoles
 * @param {...string} requiredRoles - Role names to check (user needs at least one)
 * @returns {Function} Express middleware function
 * @throws {403} If user lacks all specified roles
 *
 * @example
 * // Route requiring admin or moderator role
 * router.delete('/posts/:id',
 *   authenticate,
 *   hasRoles('admin', 'moderator'),
 *   postsController.deletePost
 * );
 */
const hasRoles = (...requiredRoles) => {
  // Handle array arguments (e.g. hasRoles(['admin', 'editor']))
  const roleArray = requiredRoles.length === 1 && Array.isArray(requiredRoles[0]) ? requiredRoles[0] : requiredRoles;

  // Input validation
  if (!roleArray || roleArray.length === 0) {
    logger.error("Invalid input to hasRoles middleware:", roleArray);
    return (req, res, next) => next(new Error("Invalid role configuration in middleware."));
  }

  return (req, res, next) => {
    if (!ensureAuthenticated(req, res)) return;

    if (!req.user.roles || req.user.roles.length === 0) {
      logger.warn(`Authorization Failed: User ${req.user.id} has no roles assigned.`, {
        userId: req.user.id,
        path: req.path,
        method: req.method,
      });
      return res.status(403).json({ message: "Forbidden: User has no assigned roles" });
    }

    const hasRequiredRole = req.user.roles.some((userRole) => roleArray.includes(userRole));

    if (hasRequiredRole) {
      next();
    } else {
      logger.warn(
        `Authorization Failed: User ${req.user.id} missing required roles: ${roleArray.join(", ")} (User has: ${req.user.roles.join(
          ", "
        )})`,
        {
          userId: req.user.id,
          path: req.path,
          method: req.method,
          requiredRoles: roleArray,
          userRoles: req.user.roles,
        }
      );
      return res.status(403).json({ message: "Forbidden: Required role missing" });
    }
  };
};

module.exports = {
  hasAllPermissions,
  hasAnyPermission,
  hasRoles,
};
