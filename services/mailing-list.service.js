/**
 * @module services/mailing-list
 * @description Service for managing mailing lists and their recipients
 * @category Services
 * @subcategory Mailing List
 */
const db = require("../config/db");
const logger = require("./logger.service");
const { NotFound, BadRequest } = require("../utils/errors");
const tagService = require("./tag.service");
const subscriptionService = require("./subscription.service");

/**
 * Create a new mailing list
 * @async
 * @function createMailingList
 * @memberof module:services/mailing-list
 * @param {Object} mailingListData - Mailing list data
 * @param {string} mailingListData.name - Name of the mailing list
 * @param {string} [mailingListData.description] - Optional description
 * @param {string} [mailingListData.sourceType='subscribers'] - Source type ('subscribers', 'users', 'mixed')
 * @param {Object} [mailingListData.filterCriteria] - Optional filter criteria
 * @param {Object} [mailingListData.tagFilter] - Optional tag filter
 * @param {string} userId - User ID who is creating the mailing list
 * @returns {Promise<Object>} Created mailing list
 */
const createMailingList = async (mailingListData, userId) => {
  const { name, description, sourceType = "subscribers", filterCriteria, tagFilter } = mailingListData;

  // Validate required fields
  if (!name) {
    throw new BadRequest("Mailing list name is required");
  }

  try {
    const query = `
      INSERT INTO mailing_lists (
        name, 
        description, 
        source_type, 
        filter_criteria, 
        tag_filter,
        created_by, 
        updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      name,
      description || null,
      sourceType,
      filterCriteria ? JSON.stringify(filterCriteria) : null,
      tagFilter ? JSON.stringify(tagFilter) : null,
      userId,
      userId,
    ];

    const result = await db.query(query, values);
    const mailingList = result.rows[0];

    // If tagFilter is provided, fetch recipients based on tags
    if (mailingList && tagFilter && Object.keys(tagFilter).length > 0) {
      await updateMailingListRecipients(mailingList.id, sourceType, tagFilter);
    }

    return transformMailingListFromDb(mailingList);
  } catch (error) {
    logger.error("Error creating mailing list:", error);
    throw error;
  }
};

/**
 * Update an existing mailing list
 * @async
 * @function updateMailingList
 * @memberof module:services/mailing-list
 * @param {number} id - Mailing list ID
 * @param {Object} mailingListData - Updated mailing list data
 * @param {string} [mailingListData.name] - Name of the mailing list
 * @param {string} [mailingListData.description] - Description
 * @param {string} [mailingListData.sourceType] - Source type ('subscribers', 'users', 'mixed')
 * @param {Object} [mailingListData.filterCriteria] - Filter criteria
 * @param {Object} [mailingListData.tagFilter] - Tag filter
 * @param {boolean} [mailingListData.isActive] - Active status
 * @param {string} userId - User ID who is updating the mailing list
 * @returns {Promise<Object>} Updated mailing list
 */
const updateMailingList = async (id, mailingListData, userId) => {
  // Check if mailing list exists
  const existingMailingList = await getMailingListById(id);

  // Build update query dynamically based on provided fields
  const updateFields = [];
  const values = [];
  let paramCount = 1;

  if (mailingListData.name !== undefined) {
    updateFields.push(`name = $${paramCount++}`);
    values.push(mailingListData.name);
  }

  if (mailingListData.description !== undefined) {
    updateFields.push(`description = $${paramCount++}`);
    values.push(mailingListData.description);
  }

  if (mailingListData.sourceType !== undefined) {
    updateFields.push(`source_type = $${paramCount++}`);
    values.push(mailingListData.sourceType);
  }

  if (mailingListData.filterCriteria !== undefined) {
    updateFields.push(`filter_criteria = $${paramCount++}`);
    values.push(JSON.stringify(mailingListData.filterCriteria));
  }

  if (mailingListData.tagFilter !== undefined) {
    updateFields.push(`tag_filter = $${paramCount++}`);
    values.push(JSON.stringify(mailingListData.tagFilter));
  }

  if (mailingListData.isActive !== undefined) {
    updateFields.push(`is_active = $${paramCount++}`);
    values.push(mailingListData.isActive);
  }

  // Add updated_by and updated_at
  updateFields.push(`updated_by = $${paramCount++}`);
  values.push(userId);
  updateFields.push(`updated_at = NOW()`);

  // Add mailing list ID to the values array
  values.push(id);

  // Prepare and execute the update query
  try {
    const query = `
      UPDATE mailing_lists
      SET ${updateFields.join(", ")}
      WHERE id = $${paramCount} AND is_deleted = false
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new NotFound("Mailing list not found or already deleted");
    }

    const updatedMailingList = result.rows[0];

    // If tagFilter was updated, update the recipients
    if (mailingListData.tagFilter !== undefined) {
      await updateMailingListRecipients(id, updatedMailingList.source_type, updatedMailingList.tag_filter);
    }

    return transformMailingListFromDb(updatedMailingList);
  } catch (error) {
    logger.error(`Error updating mailing list ${id}:`, error);
    throw error;
  }
};

/**
 * Update the recipients of a mailing list based on tag filters
 * @async
 * @function updateMailingListRecipients
 * @memberof module:services/mailing-list
 * @param {number} mailingListId - Mailing list ID
 * @param {string} sourceType - Source type ('subscribers', 'users', 'mixed')
 * @param {Object} tagFilter - Tag filter criteria
 * @returns {Promise<void>}
 */
const updateMailingListRecipients = async (mailingListId, sourceType, tagFilter) => {
  try {
    // First, clear existing recipients
    await db.query("DELETE FROM mailing_list_recipients WHERE mailing_list_id = $1", [mailingListId]);

    // Skip if no tag filter
    if (!tagFilter) return;

    // Parse tag filter if it's a string
    const parsedTagFilter = typeof tagFilter === "string" ? JSON.parse(tagFilter) : tagFilter;

    // Get tag IDs from filter
    const tagIds = Array.isArray(parsedTagFilter.tagIds) ? parsedTagFilter.tagIds : [];
    if (tagIds.length === 0) return;

    // For subscribers (default case)
    if (sourceType === "subscribers" || sourceType === "mixed") {
      // Get subscribers with the specified tags
      const subscribersQuery = `
        SELECT DISTINCT s.id 
        FROM subscribers s
        JOIN subscriber_tags st ON s.id = st.subscriber_id
        WHERE st.tag_id = ANY($1::int[])
        AND s.is_active = true
      `;

      const subscribersResult = await db.query(subscribersQuery, [tagIds]);

      // Add subscribers to mailing list recipients
      if (subscribersResult.rows.length > 0) {
        const insertValues = subscribersResult.rows
          .map((row) => {
            return `(${mailingListId}, 'subscriber', ${row.id})`;
          })
          .join(", ");

        const insertQuery = `
          INSERT INTO mailing_list_recipients (mailing_list_id, recipient_type, recipient_id)
          VALUES ${insertValues}
          ON CONFLICT (mailing_list_id, recipient_type, recipient_id) DO NOTHING
        `;

        await db.query(insertQuery);
      }
    }

    // For users - implementation could be similar if users can have tags
    if (sourceType === "users" || sourceType === "mixed") {
      // Implementation for users would go here
      // For now, this is a placeholder
    }
  } catch (error) {
    logger.error(`Error updating mailing list recipients for list ${mailingListId}:`, error);
    throw error;
  }
};

/**
 * Delete a mailing list (soft delete)
 * @async
 * @function deleteMailingList
 * @memberof module:services/mailing-list
 * @param {number} id - Mailing list ID
 * @returns {Promise<boolean>} Success status
 */
const deleteMailingList = async (id) => {
  try {
    const query = `
      UPDATE mailing_lists
      SET is_deleted = true, updated_at = NOW()
      WHERE id = $1 AND is_deleted = false
      RETURNING id
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      throw new NotFound("Mailing list not found or already deleted");
    }

    return true;
  } catch (error) {
    logger.error(`Error deleting mailing list ${id}:`, error);
    throw error;
  }
};

/**
 * Get a mailing list by ID
 * @async
 * @function getMailingListById
 * @memberof module:services/mailing-list
 * @param {number} id - Mailing list ID
 * @returns {Promise<Object>} Mailing list data
 */
const getMailingListById = async (id) => {
  try {
    const query = `
      SELECT *
      FROM mailing_lists
      WHERE id = $1 AND is_deleted = false
    `;

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      throw new NotFound("Mailing list not found");
    }

    const mailingList = transformMailingListFromDb(result.rows[0]);

    // Get recipient count
    mailingList.recipientCount = await getRecipientCount(id);

    return mailingList;
  } catch (error) {
    logger.error(`Error getting mailing list ${id}:`, error);
    throw error;
  }
};

/**
 * List mailing lists with pagination and filtering
 * @async
 * @function listMailingLists
 * @memberof module:services/mailing-list
 * @param {Object} options - Filter and pagination options
 * @returns {Promise<Object>} Paginated mailing list results
 */
const listMailingLists = async (options = {}) => {
  const { page = 1, limit = 10, search, isActive } = options;

  const offset = (page - 1) * limit;
  const params = [];
  let paramCount = 1;

  // Build WHERE conditions
  let whereConditions = ["is_deleted = false"];

  if (search) {
    whereConditions.push(`(name ILIKE $${paramCount} OR description ILIKE $${paramCount})`);
    params.push(`%${search}%`);
    paramCount++;
  }

  if (isActive !== undefined) {
    whereConditions.push(`is_active = $${paramCount++}`);
    params.push(isActive);
  }

  const whereClause = whereConditions.length ? "WHERE " + whereConditions.join(" AND ") : "";

  // Count query for pagination
  const countQuery = `
    SELECT COUNT(*) as total
    FROM mailing_lists
    ${whereClause}
  `;

  // Data query with pagination
  const dataQuery = `
    SELECT *
    FROM mailing_lists
    ${whereClause}
    ORDER BY updated_at DESC
    LIMIT $${paramCount++} OFFSET $${paramCount++}
  `;

  params.push(limit, offset);

  try {
    const countResult = await db.query(countQuery, params.slice(0, paramCount - 3));
    const dataResult = await db.query(dataQuery, params);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // Transform and augment with recipient counts
    const mailingLists = [];
    for (const list of dataResult.rows) {
      const transformedList = transformMailingListFromDb(list);
      transformedList.recipientCount = await getRecipientCount(list.id);
      mailingLists.push(transformedList);
    }

    return {
      data: mailingLists,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        limit,
      },
    };
  } catch (error) {
    logger.error("Error listing mailing lists:", error);
    throw error;
  }
};

/**
 * Get the count of recipients in a mailing list
 * @async
 * @function getRecipientCount
 * @memberof module:services/mailing-list
 * @param {number} mailingListId - Mailing list ID
 * @returns {Promise<number>} Count of recipients
 */
const getRecipientCount = async (mailingListId) => {
  try {
    const query = `
      SELECT COUNT(*) as count
      FROM mailing_list_recipients
      WHERE mailing_list_id = $1
    `;

    const result = await db.query(query, [mailingListId]);
    return parseInt(result.rows[0].count);
  } catch (error) {
    logger.error(`Error getting recipient count for mailing list ${mailingListId}:`, error);
    return 0; // Return 0 on error instead of failing
  }
};

/**
 * Get recipients of a mailing list with pagination
 * @async
 * @function getMailingListRecipients
 * @memberof module:services/mailing-list
 * @param {number} mailingListId - Mailing list ID
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Paginated recipients
 */
const getMailingListRecipients = async (mailingListId, options = {}) => {
  const { page = 1, limit = 100 } = options;
  const offset = (page - 1) * limit;

  try {
    // First check if the mailing list exists
    await getMailingListById(mailingListId);

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM mailing_list_recipients
      WHERE mailing_list_id = $1
    `;

    // Query for recipients with pagination
    const recipientsQuery = `
      SELECT r.*, 
             CASE 
                WHEN r.recipient_type = 'subscriber' THEN 
                  (SELECT row_to_json(s) FROM (SELECT * FROM subscribers WHERE id = r.recipient_id) s)
                WHEN r.recipient_type = 'user' THEN 
                  (SELECT row_to_json(u) FROM (SELECT id, email, full_name FROM users WHERE id = r.recipient_id) u)
                ELSE NULL
             END as recipient_data
      FROM mailing_list_recipients r
      WHERE r.mailing_list_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const [countResult, recipientsResult] = await Promise.all([
      db.query(countQuery, [mailingListId]),
      db.query(recipientsQuery, [mailingListId, limit, offset]),
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // Transform recipients data
    const recipients = recipientsResult.rows.map((row) => {
      return {
        id: row.id,
        recipientType: row.recipient_type,
        recipientId: row.recipient_id,
        recipientData: row.recipient_data,
        createdAt: row.created_at,
      };
    });

    return {
      data: recipients,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        limit,
      },
    };
  } catch (error) {
    logger.error(`Error getting recipients for mailing list ${mailingListId}:`, error);
    throw error;
  }
};

/**
 * Get variables available for a mailing list
 * @async
 * @function getMailingListVariables
 * @memberof module:services/mailing-list
 * @param {number} mailingListId - Mailing list ID
 * @returns {Promise<Array>} List of available variables for email templates
 * @example
 * // Example of returned variables
 * [
 *   { name: "email", description: "Recipient's email address", example: "user@example.com" },
 *   { name: "name", description: "Recipient's name", example: "John Doe" },
 *   { name: "date_of_birth", description: "Recipient's date of birth", example: "1990-01-01" }
 * ]
 */
const getMailingListVariables = async (mailingListId) => {
  try {
    // First check if the mailing list exists
    const mailingList = await getMailingListById(mailingListId);

    // Define base variables available for all mailing lists
    const baseVariables = [
      { name: "email", description: "Recipient's email address", example: "user@example.com" },
      { name: "name", description: "Recipient's name", example: "John Doe" },
    ];

    let additionalVariables = [];

    // Add date_of_birth if subscribers are included
    if (mailingList.sourceType === "subscribers" || mailingList.sourceType === "mixed") {
      additionalVariables.push({
        name: "date_of_birth",
        description: "Recipient's date of birth",
        example: "1990-01-01",
      });

      // Add metadata fields if available in any subscriber
      // Get sample subscriber to extract metadata schema
      const sampleQuery = `
        SELECT s.metadata
        FROM subscribers s
        JOIN mailing_list_recipients mlr ON s.id = mlr.recipient_id AND mlr.recipient_type = 'subscriber'
        WHERE mlr.mailing_list_id = $1 AND s.metadata IS NOT NULL
        LIMIT 1
      `;

      const sampleResult = await db.query(sampleQuery, [mailingListId]);

      if (sampleResult.rows.length > 0 && sampleResult.rows[0].metadata) {
        const metadata = sampleResult.rows[0].metadata;

        Object.keys(metadata).forEach((key) => {
          additionalVariables.push({
            name: `metadata.${key}`,
            description: `Custom field: ${key}`,
            example: typeof metadata[key] === "string" ? metadata[key] : JSON.stringify(metadata[key]),
          });
        });
      }
    }

    // Add user-specific variables if users are included
    if (mailingList.sourceType === "users" || mailingList.sourceType === "mixed") {
      additionalVariables = [
        ...additionalVariables,
        { name: "full_name", description: "User's full name", example: "John Doe" },
        // Add other user fields as needed
      ];
    }

    return [...baseVariables, ...additionalVariables];
  } catch (error) {
    logger.error(`Error getting variables for mailing list ${mailingListId}:`, error);
    throw error;
  }
};

/**
 * Transform a mailing list database row to API format
 * @function transformMailingListFromDb
 * @memberof module:services/mailing-list
 * @param {Object} dbMailingList - Mailing list row from database
 * @returns {Object} Transformed mailing list object
 */
const transformMailingListFromDb = (dbMailingList) => {
  if (!dbMailingList) return null;

  return {
    id: dbMailingList.id,
    name: dbMailingList.name,
    description: dbMailingList.description,
    sourceType: dbMailingList.source_type,
    filterCriteria: dbMailingList.filter_criteria
      ? typeof dbMailingList.filter_criteria === "string"
        ? JSON.parse(dbMailingList.filter_criteria)
        : dbMailingList.filter_criteria
      : null,
    tagFilter: dbMailingList.tag_filter
      ? typeof dbMailingList.tag_filter === "string"
        ? JSON.parse(dbMailingList.tag_filter)
        : dbMailingList.tag_filter
      : null,
    isActive: dbMailingList.is_active,
    createdBy: dbMailingList.created_by,
    updatedBy: dbMailingList.updated_by,
    createdAt: dbMailingList.created_at,
    updatedAt: dbMailingList.updated_at,
  };
};

module.exports = {
  createMailingList,
  updateMailingList,
  deleteMailingList,
  getMailingListById,
  listMailingLists,
  getMailingListRecipients,
  getMailingListVariables,
};
