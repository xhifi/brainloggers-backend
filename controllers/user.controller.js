/**
 * @module controllers/user
 * @description Controller for user management operations and endpoints
 */
const userService = require("../services/user.service");
const roleService = require("../services/role.service"); // For RBAC checks
const db = require("../config/db"); // For transactions
const logger = require("../services/logger.service");
const { hashPassword, comparePassword } = require("../utils/hash");

/**
 * Maps a user database object to a safe DTO (Data Transfer Object)
 * @private
 * @function mapUserToDto
 * @param {Object} user - User database object with sensitive information
 * @returns {Object|null} User DTO with only safe fields or null if no user provided
 */
const mapUserToDto = (user) => {
  if (!user) return null;
  // Whitelist fields safe to return to the client
  return {
    id: user.id,
    email: user.email, // Consider if email should always be returned
    roles: user.roles || [],
    is_verified: user.is_verified,
    // Add other safe fields like 'name', 'avatar_url', 'created_at' if they exist
  };
};

/**
 * Returns the current authenticated user's profile information
 * @async
 * @function getMe
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user object from middleware
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 * @throws {404} If authenticated user data is unexpectedly missing
 */
exports.getMe = async (req, res, next) => {
  try {
    // req.user is attached by authenticate middleware and contains fresh user data
    const userDto = mapUserToDto(req.user);
    if (!userDto) {
      // Should not happen if authenticate middleware worked correctly
      return res.status(404).json({ message: "Authenticated user data not found" });
    }
    res.json(userDto);
  } catch (error) {
    next(error);
  }
};

/**
 * Updates the current authenticated user's profile information
 * @async
 * @function updateMe
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user object from middleware
 * @param {Object} req.body - Request body with update fields
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.updateMe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    // Extract allowed fields from body - DO NOT update password here
    const { email /*, name, avatar_url */ } = req.body;

    let client = await db.getClient();
    await client.query("BEGIN");

    try {
      // Construct SQL update query for allowed fields
      const updateFields = [];
      const updateParams = [];
      let paramIndex = 1;

      if (email !== undefined && email !== req.user.email) {
        const existingEmailUser = await userService.findUserByEmail(email);
        if (existingEmailUser && existingEmailUser.id !== userId) {
          const emailConflictError = new Error("Email address already in use by another account.");
          emailConflictError.statusCode = 409;
          emailConflictError.expose = true;
          throw emailConflictError;
        }
        updateFields.push(`email = $${paramIndex++}`);
        updateParams.push(email);
      }

      if (updateFields.length > 0) {
        updateFields.push(`updated_at = NOW()`);
        const updateUserSql = `UPDATE users SET ${updateFields.join(", ")} WHERE id = $${paramIndex++} RETURNING id;`;
        updateParams.push(userId);

        const userUpdateResult = await client.query(updateUserSql, updateParams);

        if (userUpdateResult.rowCount === 0) {
          const notFoundError = new Error("User not found during update operation.");
          notFoundError.statusCode = 404;
          notFoundError.expose = true;
          throw notFoundError;
        }
      }

      await client.query("COMMIT");

      // Fetch updated user data to return
      const updatedUser = await userService.findUserById(userId);
      res.json({
        message: "Profile updated successfully",
        user: mapUserToDto(updatedUser),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Changes the current user's password
 * @async
 * @function changePassword
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user object from middleware
 * @param {Object} req.body - Request body with password fields
 * @param {string} req.body.currentPassword - User's current password
 * @param {string} req.body.newPassword - New password to set
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.changePassword = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    // Fetch user with password hash
    const user = await userService.findUserWithPasswordById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const isPasswordValid = await comparePassword(currentPassword, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password in database
    await db.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [newPasswordHash, userId]);

    logger.info(`User ${userId} changed their password`);
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    next(error);
  }
};

/**
 * Resets a user's password (admin function)
 * @async
 * @function resetPassword
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body with email and new password
 * @param {string} req.body.email - Email of the user whose password to reset
 * @param {string} req.body.newPassword - New password to set
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.resetPassword = async (req, res, next) => {
  try {
    const { email, newPassword } = req.body;

    // Find user by email
    const user = await userService.findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: "User not found with this email" });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password in database
    await db.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [newPasswordHash, user.id]);

    logger.info(`Password reset for user ${user.id} (${email})`);
    res.json({ message: "Password reset successfully" });
  } catch (error) {
    next(error);
  }
};

/**
 * Creates a new user account
 * @async
 * @function createUser
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body with user details
 * @param {string} req.body.email - Email for the new user
 * @param {string} req.body.password - Password for the new user
 * @param {Array} [req.body.roles] - Optional array of role IDs to assign
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.createUser = async (req, res, next) => {
  const { email, password, roles = [] } = req.body;
  let client;

  try {
    // Check if email is already in use
    const existingUser = await userService.findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ message: "Email address already in use" });
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Begin transaction
    client = await db.getClient();
    await client.query("BEGIN");

    try {
      // Insert new user
      const insertUserResult = await client.query(
        `INSERT INTO users (email, password_hash, is_verified, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW()) RETURNING id`,
        [email, passwordHash, false]
      );

      const newUserId = insertUserResult.rows[0].id;

      // Assign roles if provided
      if (roles && roles.length > 0) {
        const roleValues = roles.map((roleId, index) => `($1, $${index + 2})`).join(", ");
        const roleParams = [newUserId, ...roles];

        await client.query(`INSERT INTO user_roles (user_id, role_id) VALUES ${roleValues}`, roleParams);
      }

      await client.query("COMMIT");

      // Fetch the complete user data with roles
      const newUser = await userService.findUserById(newUserId);

      logger.info(`New user created: ${email} (ID: ${newUserId})`);
      res.status(201).json({
        message: "User created successfully",
        user: mapUserToDto(newUser),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } catch (error) {
    next(error);
  } finally {
    if (client) client.release();
  }
};

/**
 * Admin changes a user's password
 * @async
 * @function adminChangePassword
 * @param {Object} req - Express request object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.id - User ID whose password to change
 * @param {Object} req.body - Request body with password field
 * @param {string} req.body.newPassword - New password to set
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.adminChangePassword = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { newPassword } = req.body;

    // Check if user exists
    const user = await userService.findUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password in database
    await db.query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [newPasswordHash, userId]);

    logger.info(`Admin changed password for user ${userId}`);
    res.json({ message: "Password changed successfully" });
  } catch (error) {
    next(error);
  }
};

/**
 * Returns a list of all users in the system
 * @async
 * @function getAllUsers
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters for filtering and pagination
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 * @throws {500} If database query fails
 */
exports.getAllUsers = async (req, res, next) => {
  // Permission 'users:read_all' checked by middleware
  // TODO: Implement pagination, filtering, sorting from query parameters (req.query)
  try {
    // Using a dedicated service function is better practice, but showing query for example:
    const sql = `
            SELECT u.id, u.email, u.is_verified, array_agg(r.name) FILTER (WHERE r.name IS NOT NULL) as roles
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            GROUP BY u.id
            ORDER BY u.created_at DESC;
            -- Add LIMIT \$1 OFFSET \$2 for pagination based on req.query;
        `;
    const { rows } = await db.query(sql); // Use db.query helper
    res.json(rows.map(mapUserToDto)); // Map results to safe DTOs
  } catch (error) {
    next(error);
  }
};

/**
 * Returns a specific user by their ID
 * @async
 * @function getUserById
 * @param {Object} req - Express request object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.id - User ID to retrieve
 * @param {Object} req.user - Authenticated user from middleware
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 * @throws {404} If the requested user is not found
 */
exports.getUserById = async (req, res, next) => {
  console.log(`API HIT - GET /api/users/${req.params.id}`);
  // Permission 'users:read_any' checked by middleware
  const userIdToView = req.params.id;
  const requestingUserId = req.user.id; // From authenticate middleware
  console.log(userIdToView, requestingUserId);
  try {
    // Optimization: If user is requesting their own profile, use getMe logic
    if (userIdToView === requestingUserId) {
      // Still map DTO for consistency, even though getMe uses req.user directly
      return res.json(mapUserToDto(req.user));
    }

    // Fetch the user being requested
    const user = await userService.findUserById(userIdToView);
    const userDto = mapUserToDto(user);
    if (!userDto) {
      return res.status(404).json({ message: "User not found" });
    }

    // Requirement: "same role users can read each other's information."
    // This is implicitly handled by the `hasAllPermissions({ resource: 'users', action: 'read_any' })`
    // check in the middleware. If a user has that permission, they can read anyone's profile
    // regardless of role similarity (unless a more specific permission denied it).
    // No additional controller logic needed here for the read operation based on the requirement.

    res.json(userDto);
  } catch (error) {
    next(error);
  }
};

/**
 * Updates a user's profile information
 * @async
 * @function updateUser
 * @param {Object} req - Express request object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.id - User ID to update
 * @param {Object} req.body - Request body with update fields
 * @param {string} [req.body.email] - New email address
 * @param {Object} req.user - Authenticated user from middleware
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 * @throws {403} If user lacks permission to perform the update
 * @throws {404} If the user to update doesn't exist
 * @throws {409} If new email conflicts with an existing user
 */
exports.updateUser = async (req, res, next) => {
  // Middleware 'hasAnyPermission({ resource: 'users', action: 'update_own' }, { resource: 'users', action: 'update_any' })'
  // has already run, ensuring the user has *at least one* of the necessary base permissions.
  const userIdToUpdate = req.params.id;
  const requestingUserId = req.user.id;
  const requestingUserRoles = req.user.roles || [];
  // Extract allowed fields from body - DO NOT update password or is_verified here
  const { email /*, name, avatar_url */ } = req.body;
  // Role updates should likely be a separate endpoint/permission (e.g., PUT /api/users/:id/roles)

  let client; // For transaction

  try {
    // Fetch permissions map needed for internal logic checks
    const permissionsMap = await roleService.getPermissionsForUser(requestingUserId);
    const targetUser = await userService.findUserById(userIdToUpdate); // Need target user info

    if (!targetUser) {
      return res.status(404).json({ message: "User to update not found" });
    }

    let canPerformSpecificUpdate = false;
    let isSelfUpdate = userIdToUpdate === requestingUserId;

    // --- Refined Logic: Check SPECIFIC permission needed for THIS operation ---
    if (isSelfUpdate) {
      // User is updating their own profile - requires 'users:update_own'
      if (permissionsMap["users"]?.has("update_own")) {
        canPerformSpecificUpdate = true;
      } else {
        // Middleware allowed access based on possibly having 'update_any', but the specific 'update_own' is missing.
        logger.warn(`User ${requestingUserId} attempted self-update without 'users:update_own' permission.`);
        return res.status(403).json({ message: "Forbidden: You do not have permission to update your own profile." });
      }
    } else {
      // User is attempting to update another user - requires 'users:update_any'
      if (permissionsMap["users"]?.has("update_any")) {
        // Check the "same role" restriction BEFORE allowing update
        const targetUserRoles = targetUser.roles || [];
        const commonRoles = targetUserRoles.filter((role) => requestingUserRoles.includes(role));

        if (commonRoles.length > 0) {
          // Shared role detected, block update even with 'update_any' permission
          logger.warn(
            `User ${requestingUserId} blocked from updating user ${userIdToUpdate} due to shared role(s): ${commonRoles.join(", ")}`
          );
          return res.status(403).json({
            message: "Forbidden: Users with the same role cannot modify each other's profiles.",
          });
        } else {
          // Has 'update_any' and no conflicting roles - allow update
          canPerformSpecificUpdate = true;
        }
      } else {
        // Middleware might have allowed if user had 'update_own', but that doesn't apply here.
        // The specific 'update_any' permission is missing.
        logger.warn(`User ${requestingUserId} attempted to update user ${userIdToUpdate} without 'users:update_any' permission.`);
        return res.status(403).json({ message: "Forbidden: You do not have permission to update other users." });
      }
    }

    // --- Final check before proceeding ---
    if (!canPerformSpecificUpdate) {
      // This case should be covered by the logic above, but acts as a safeguard
      logger.error(
        `Update block safeguard triggered for user ${requestingUserId} -> ${userIdToUpdate}. This indicates a potential logic flaw.`
      );
      return res.status(403).json({ message: "Forbidden: Update operation not permitted." });
    }

    // --- Perform Update within a Transaction ---
    client = await db.getClient(); // Get a client from the pool
    await client.query("BEGIN");

    try {
      // Construct SQL update query for allowed fields in the 'users' table
      const updateFields = [];
      const updateParams = [];
      let paramIndex = 1;

      if (email !== undefined && email !== targetUser.email) {
        // Only update if email is provided and different
        // IMPORTANT: Add validation to check if the new email is already taken by *another* user
        const existingEmailUser = await userService.findUserByEmail(email);
        if (existingEmailUser && existingEmailUser.id !== userIdToUpdate) {
          // Use a specific error class or message that the error handler can catch
          const emailConflictError = new Error("Email address already in use by another account.");
          emailConflictError.statusCode = 409; // Set status code for the error handler
          emailConflictError.expose = true; // Mark message as safe to expose
          throw emailConflictError;
        }
        updateFields.push(`email = \$${paramIndex++}`);
        updateParams.push(email);
      }
      // Add other updatable fields similarly...
      // if (name !== undefined && name !== targetUser.name) {
      //    updateFields.push(`name = \$${paramIndex++}`);
      //    updateParams.push(name);
      // }

      let userUpdateResult = { rowCount: 0 };
      if (updateFields.length > 0) {
        updateFields.push(`updated_at = NOW()`); // Always update timestamp
        const updateUserSql = `UPDATE users SET ${updateFields.join(", ")} WHERE id = \$${paramIndex++} RETURNING id;`;
        updateParams.push(userIdToUpdate);

        logger.debug(`Executing user update for ${userIdToUpdate}: ${updateUserSql}`, updateParams); // Log query before execution
        userUpdateResult = await client.query(updateUserSql, updateParams);

        if (userUpdateResult.rowCount === 0) {
          // This might happen if the ID was valid initially but deleted concurrently
          const notFoundError = new Error("User not found during update operation.");
          notFoundError.statusCode = 404;
          notFoundError.expose = true;
          throw notFoundError;
        }
      } else {
        // No fields to update in the users table
        logger.info(`No direct user fields to update for user ${userIdToUpdate}.`);
        // Optionally return early if no fields provided, or continue if role updates might happen
        // For now, let's assume at least one field should be provided for an update request
        // return res.status(400).json({ message: "No valid fields provided for update." });
      }

      // --- Handle role updates in a separate dedicated endpoint ---
      // It's cleaner and requires specific permissions (e.g., 'users:manage_roles')

      await client.query("COMMIT"); // Commit transaction

      // Fetch updated user data to return (outside transaction)
      const updatedUser = await userService.findUserById(userIdToUpdate);
      res.json({
        message: "User updated successfully",
        user: mapUserToDto(updatedUser),
      });
    } catch (error) {
      await client.query("ROLLBACK"); // Rollback on any error during transaction
      throw error; // Re-throw errors (like email conflict, not found) to be caught by outer catch
    } finally {
      client.release(); // Release client back to the pool
    }
  } catch (error) {
    // Ensure client is released even if connection failed before transaction block
    if (client) {
      try {
        client.release();
      } catch (releaseError) {
        logger.error("Error releasing DB client:", releaseError);
      }
    }
    next(error); // Pass error (including custom ones with statusCode) to global error handler
  }
};

/**
 * TODO: Deletes a user account
 * @async
 * @function deleteUser
 * @param {Object} req - Express request object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.id - User ID to delete
 * @param {Object} req.user - Authenticated user from middleware
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
// exports.deleteUser = async (req, res, next) => { ... };
