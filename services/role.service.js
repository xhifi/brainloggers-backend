/**
 * @module services/role
 * @description Service for role-based access control (RBAC) operations
 */
const db = require("../config/db");
const NodeCache = require("node-cache"); // Simple in-memory cache for permissions
const logger = require("./logger.service");

// Cache permissions associated with roles for 5 minutes
// Cache role IDs associated with role names indefinitely (or shorter TTL if roles change often)
const permissionCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
const roleIdCache = new NodeCache({ stdTTL: 0, checkperiod: 600 }); // 0 = infinite TTL
const userRolesCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

/**
 * Clears all role-related caches
 * @function clearCaches
 */
const clearCaches = () => {
  permissionCache.flushAll();
  roleIdCache.flushAll();
  userRolesCache.flushAll();
  logger.debug("Role caches cleared");
};

/**
 * Gets role IDs from role names with caching support
 * @async
 * @function getRoleIdsFromNames
 * @param {Array<string>} roleNames - Array of role names to convert to IDs
 * @returns {Promise<Array<number>>} Array of role IDs
 */
const getRoleIdsFromNames = async (roleNames) => {
  if (!roleNames || roleNames.length === 0) {
    return [];
  }
  const ids = [];
  const namesToFetch = [];
  for (const name of roleNames) {
    const cachedId = roleIdCache.get(name);
    if (cachedId !== undefined) {
      // Check if cache key exists (could be null/0)
      ids.push(cachedId);
    } else {
      // Ensure name is a string before adding
      if (typeof name === "string") {
        namesToFetch.push(name);
      } else {
        logger.warn(`Invalid role name type encountered: ${typeof name}, value: ${name}`);
      }
    }
  }

  if (namesToFetch.length > 0) {
    // Ensure placeholders match the number of parameters correctly
    const placeholders = namesToFetch.map((_, i) => `\$${i + 1}`).join(",");
    const sql = `SELECT id, name FROM roles WHERE name IN (${placeholders});`;
    try {
      const { rows } = await db.query(sql, namesToFetch);
      rows.forEach((row) => {
        ids.push(row.id);
        roleIdCache.set(row.name, row.id); // Cache fetched IDs
      });
    } catch (error) {
      logger.error("Error fetching role IDs:", error);
      // Decide how to handle - throw, return partial? Returning partial for now.
    }
  }
  // Filter out any potential null/undefined values before returning
  return ids.filter((id) => id !== null && id !== undefined);
};

/**
 * Gets a permissions map for a set of role IDs with caching
 * @async
 * @function getPermissionsForRoleIds
 * @param {Array<number|string>} roleIds - Array of role IDs
 * @returns {Promise<Object>} Permissions map with structure { resource: Set<action> }
 * @throws {Error} If database query fails
 */
const getPermissionsForRoleIds = async (roleIds) => {
  if (!roleIds || roleIds.length === 0) {
    return {}; // Return empty object if no role IDs
  }

  // Sort IDs to ensure consistent cache key
  const sortedRoleIds = [...roleIds]
    .map((id) => parseInt(id, 10))
    .filter((id) => !isNaN(id))
    .sort((a, b) => a - b);
  if (sortedRoleIds.length === 0) return {}; // Return empty object if no valid numeric IDs

  const cacheKey = `perms_map_for_roles_${sortedRoleIds.join("_")}`;
  const cachedPermissions = permissionCache.get(cacheKey);
  if (cachedPermissions) {
    // logger.debug(`Cache hit for permissions map: ${cacheKey}`);
    return cachedPermissions;
  }
  // logger.debug(`Cache miss for permissions map: ${cacheKey}`);

  // Construct placeholder string like \$1, \$2, \$3
  const placeholders = sortedRoleIds.map((_, i) => `\$${i + 1}`).join(",");

  // *** UPDATED SQL: Select resource and action ***
  const sql = `
        SELECT DISTINCT p.resource, p.action
        FROM permissions p
        JOIN role_permissions rp ON p.id = rp.permission_id
        WHERE rp.role_id IN (${placeholders});
    `;

  try {
    const { rows } = await db.query(sql, sortedRoleIds);

    // *** UPDATED PROCESSING: Build map { resource: Set<action> } ***
    const permissionsMap = {};
    rows.forEach((row) => {
      if (!permissionsMap[row.resource]) {
        permissionsMap[row.resource] = new Set();
      }
      permissionsMap[row.resource].add(row.action);
    });

    permissionCache.set(cacheKey, permissionsMap); // Store the map in cache
    return permissionsMap; // Return the map
  } catch (error) {
    logger.error("Error fetching permissions for roles:", error);
    throw error; // Rethrow or handle appropriately
  }
};

/**
 * Gets a permissions map for a specific user
 * @async
 * @function getPermissionsForUser
 * @param {string} userId - User ID to fetch permissions for
 * @returns {Promise<Object>} Permissions map with structure { resource: Set<action> }
 */
const getPermissionsForUser = async (userId) => {
  // This requires fetching user's roles first
  const userRoles = await getRolesForUser(userId); // Gets role names
  if (!userRoles || userRoles.length === 0) return {}; // Return empty map

  const roleIds = await getRoleIdsFromNames(userRoles);
  if (!roleIds || roleIds.length === 0) return {}; // Return empty map

  return getPermissionsForRoleIds(roleIds); // Returns the map { resource: Set<action> }
};

/**
 * Gets role names assigned to a user
 * @async
 * @function getRolesForUser
 * @param {string} userId - User ID to fetch roles for
 * @returns {Promise<Array<string>>} Array of role names
 */
const getRolesForUser = async (userId) => {
  if (!userId) return [];

  // Check cache first
  const cacheKey = `user_roles_${userId}`;
  const cachedRoles = userRolesCache.get(cacheKey);
  if (cachedRoles) {
    return cachedRoles;
  }

  const sql = `
        SELECT r.name
        FROM roles r
        JOIN user_roles ur ON r.id = ur.role_id
        WHERE ur.user_id = \$1;
    `;
  const { rows } = await db.query(sql, [userId]);
  const roles = rows.map((row) => row.name);

  // Cache the results
  userRolesCache.set(cacheKey, roles);

  return roles;
};

/**
 * Gets all roles in the system
 * @async
 * @function getAllRoles
 * @returns {Promise<Array<Object>>} Array of role objects
 */
const getAllRoles = async () => {
  try {
    const sql = `
      SELECT id, name, description, created_at, updated_at
      FROM roles
      ORDER BY name ASC
    `;

    const { rows } = await db.query(sql);
    return rows;
  } catch (error) {
    logger.error("Error getting all roles:", error);
    throw error;
  }
};

/**
 * Gets a role by ID
 * @async
 * @function getRoleById
 * @param {number} id - Role ID
 * @returns {Promise<Object|null>} Role object or null if not found
 */
const getRoleById = async (id) => {
  try {
    const sql = `
      SELECT id, name, description, created_at, updated_at
      FROM roles
      WHERE id = $1
    `;

    const { rows } = await db.query(sql, [id]);
    return rows.length ? rows[0] : null;
  } catch (error) {
    logger.error(`Error getting role by ID ${id}:`, error);
    throw error;
  }
};

/**
 * Gets a role by name
 * @async
 * @function getRoleByName
 * @param {string} name - Role name
 * @returns {Promise<Object|null>} Role object or null if not found
 */
const getRoleByName = async (name) => {
  try {
    const sql = `
      SELECT id, name, description, created_at, updated_at
      FROM roles
      WHERE name = $1
    `;

    const { rows } = await db.query(sql, [name]);
    return rows.length ? rows[0] : null;
  } catch (error) {
    logger.error(`Error getting role by name ${name}:`, error);
    throw error;
  }
};

/**
 * Assign a role to a user
 * @async
 * @function assignRoleToUser
 * @param {string} userId - User ID
 * @param {number} roleId - Role ID
 * @returns {Promise<Object>} Assignment details
 */
const assignRoleToUser = async (userId, roleId) => {
  try {
    // Check if user exists
    const userSql = `SELECT id FROM users WHERE id = $1`;
    const userResult = await db.query(userSql, [userId]);
    if (userResult.rows.length === 0) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Check if role exists
    const roleSql = `SELECT id FROM roles WHERE id = $1`;
    const roleResult = await db.query(roleSql, [roleId]);
    if (roleResult.rows.length === 0) {
      throw new Error(`Role with ID ${roleId} not found`);
    }

    // Check if already assigned
    const checkSql = `
      SELECT * FROM user_roles
      WHERE user_id = $1 AND role_id = $2
    `;

    const checkResult = await db.query(checkSql, [userId, roleId]);
    if (checkResult.rows.length > 0) {
      return { already_assigned: true, user_id: userId, role_id: roleId };
    }

    // Assign the role
    const sql = `
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2)
      RETURNING user_id, role_id
    `;

    const { rows } = await db.query(sql, [userId, roleId]);

    // Clear user roles cache
    const cacheKey = `user_roles_${userId}`;
    userRolesCache.del(cacheKey);

    return { assigned: true, user_id: rows[0].user_id, role_id: rows[0].role_id };
  } catch (error) {
    logger.error(`Error assigning role ${roleId} to user ${userId}:`, error);
    throw error;
  }
};

/**
 * Remove a role from a user
 * @async
 * @function removeRoleFromUser
 * @param {string} userId - User ID
 * @param {number} roleId - Role ID
 * @returns {Promise<boolean>} True if removed, false if not found
 */
const removeRoleFromUser = async (userId, roleId) => {
  try {
    const sql = `
      DELETE FROM user_roles
      WHERE user_id = $1 AND role_id = $2
      RETURNING user_id
    `;

    const { rows } = await db.query(sql, [userId, roleId]);

    // Clear user roles cache
    const cacheKey = `user_roles_${userId}`;
    userRolesCache.del(cacheKey);

    return rows.length > 0;
  } catch (error) {
    logger.error(`Error removing role ${roleId} from user ${userId}:`, error);
    throw error;
  }
};

/**
 * Update roles for a user (replace all roles)
 * @async
 * @function updateUserRoles
 * @param {string} userId - User ID
 * @param {Array<number>} roleIds - Array of role IDs
 * @returns {Promise<Object>} Update results
 */
const updateUserRoles = async (userId, roleIds) => {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Verify user exists
    const userSql = `SELECT id FROM users WHERE id = $1`;
    const userResult = await client.query(userSql, [userId]);
    if (userResult.rows.length === 0) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Remove all current roles for this user
    const deleteSql = `DELETE FROM user_roles WHERE user_id = $1`;
    await client.query(deleteSql, [userId]);

    // If no new roles, just return
    if (!roleIds || roleIds.length === 0) {
      await client.query("COMMIT");

      // Clear user roles cache
      const cacheKey = `user_roles_${userId}`;
      userRolesCache.del(cacheKey);

      return { user_id: userId, roles_added: 0 };
    }

    // Verify all roles exist
    const placeholders = roleIds.map((_, i) => `$${i + 1}`).join(", ");
    const verifyRolesSql = `
      SELECT id FROM roles
      WHERE id IN (${placeholders})
    `;

    const verifyRolesResult = await client.query(verifyRolesSql, roleIds);
    const validRoleIds = verifyRolesResult.rows.map((row) => row.id);

    if (validRoleIds.length !== roleIds.length) {
      throw new Error("One or more role IDs are invalid");
    }

    // Insert all new roles
    const insertValues = [];
    const insertParams = [];

    for (let i = 0; i < roleIds.length; i++) {
      insertValues.push(`($1, $${i + 2})`);
      insertParams.push(roleIds[i]);
    }

    if (insertValues.length > 0) {
      const insertSql = `
        INSERT INTO user_roles (user_id, role_id)
        VALUES ${insertValues.join(", ")}
      `;

      await client.query(insertSql, [userId, ...insertParams]);
    }

    await client.query("COMMIT");

    // Clear user roles cache
    const cacheKey = `user_roles_${userId}`;
    userRolesCache.del(cacheKey);

    return {
      user_id: userId,
      roles_added: roleIds.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error(`Error updating roles for user ${userId}:`, error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get users with a specific role
 * @async
 * @function getUsersWithRole
 * @param {number} roleId - Role ID
 * @returns {Promise<Array<Object>>} Array of user objects
 */
const getUsersWithRole = async (roleId) => {
  try {
    const sql = `
      SELECT u.id, u.email, u.full_name
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      WHERE ur.role_id = $1 AND u.deleted_at IS NULL
      ORDER BY u.full_name
    `;

    const { rows } = await db.query(sql, [roleId]);
    return rows;
  } catch (error) {
    logger.error(`Error getting users with role ${roleId}:`, error);
    throw error;
  }
};

module.exports = {
  getPermissionsForRoleIds,
  getPermissionsForUser,
  getRolesForUser,
  getRoleIdsFromNames,
  clearCaches,
  getAllRoles,
  getRoleById,
  getRoleByName,
  assignRoleToUser,
  removeRoleFromUser,
  updateUserRoles,
  getUsersWithRole,
};
