/**
 * @module Services/MailingListService
 * @description Service for managing mailing lists and subscribers
 */
const db = require("../config/db");
const logger = require("./logger.service");
const { NotFound, ConfictResource } = require("../utils/errors");

/**
 * Create a new mailing list and populate recipients based on filter criteria
 * @param {Object} mailingListData - Data for creating a new mailing list
 * @param {UUID} userId - ID of the user creating the mailing list
 * @returns {Promise<Object>} - Created mailing list with recipients count
 */
async function createMailingList(mailingListData, userId) {
  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    // Insert mailing list record
    const mailingListResult = await client.query(
      `INSERT INTO mailing_lists 
      (name, description, source_type, filter_criteria, created_by, updated_by)
      VALUES ($1, $2, $3, $4, $5, $5)
      RETURNING id, name, description, source_type, filter_criteria, is_active, created_at`,
      [
        mailingListData.name,
        mailingListData.description || null,
        "subscribers", // Currently only supporting subscribers as source
        JSON.stringify(mailingListData.filterCriteria || {}),
        userId,
      ]
    );

    const mailingList = mailingListResult.rows[0];

    // Build query to find subscribers matching filter criteria
    const { query, params } = buildFilterQuery(mailingListData.filterCriteria || {});

    // Get subscribers that match the filter criteria
    const subscribersResult = await client.query(query, params);
    const subscribers = subscribersResult.rows;

    // Insert recipients into mailing_list_recipients table
    if (subscribers.length > 0) {
      const insertPromises = subscribers.map((subscriber) =>
        client.query(
          `INSERT INTO mailing_list_recipients 
          (mailing_list_id, recipient_type, recipient_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (mailing_list_id, recipient_type, recipient_id) DO NOTHING`,
          [mailingList.id, "subscriber", subscriber.id]
        )
      );

      await Promise.all(insertPromises);
    }

    // Commit the transaction
    await client.query("COMMIT");

    // Return the created mailing list with recipient count
    return {
      ...mailingList,
      recipientCount: subscribers.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Error creating mailing list:", error);

    if (error.code === "23505") {
      throw new ConfictResource("A mailing list with this name already exists");
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Build a parameterized SQL query based on filter criteria
 * @param {Object} filterCriteria - Filter criteria from the request
 * @returns {Object} - SQL query and parameters
 */
function buildFilterQuery(filterCriteria) {
  // Start with base query that gets all active subscribers
  let query = `
    SELECT s.* 
    FROM subscribers s
    WHERE s.is_active = TRUE
  `;

  const params = [];
  let paramIndex = 1;

  // Handle tag filtering
  if (filterCriteria.tags && filterCriteria.tags.contains && filterCriteria.tags.contains.length > 0) {
    const tagIds = filterCriteria.tags.contains;
    // Use a subquery to check if a subscriber has all the required tags
    query += `
      AND (
        SELECT COUNT(DISTINCT st.tag_id) 
        FROM subscriber_tags st 
        WHERE st.subscriber_id = s.id 
        AND st.tag_id IN (${tagIds.map(() => `$${paramIndex++}`).join(", ")})
      ) = $${paramIndex++}
    `;

    // Add each tag ID as a parameter
    params.push(...tagIds);
    // Add the count of tag IDs as a parameter to ensure ALL required tags are present
    params.push(tagIds.length);
  }

  // Process standard subscriber fields
  const standardFields = ["name", "email", "date_of_birth", "is_active", "subscribed_at", "unsubscribed_at", "created_at", "updated_at"];

  standardFields.forEach((field) => {
    if (filterCriteria[field]) {
      const condition = buildCondition(`s.${field}`, filterCriteria[field], paramIndex, params);
      query += condition.sql;
      paramIndex = condition.nextParamIndex;
    }
  });

  // Handle metadata fields
  if (filterCriteria.metadata) {
    // For state field in metadata
    if (filterCriteria.metadata.state) {
      const condition = buildJsonCondition("s.metadata", "state", filterCriteria.metadata.state, paramIndex, params);
      query += condition.sql;
      paramIndex = condition.nextParamIndex;
    }

    // For interests array in metadata
    if (filterCriteria.metadata.interests && filterCriteria.metadata.interests.contains) {
      const interests = filterCriteria.metadata.interests.contains;
      interests.forEach((interest) => {
        query += ` AND s.metadata->>'interests' ? $${paramIndex++}`;
        params.push(interest);
      });
    }
  }

  return { query, params };
}

/**
 * Build SQL condition for a specific field based on operator
 * @param {string} field - Database field name
 * @param {Object} condition - Condition object with operator and value
 * @param {number} startParamIndex - Starting parameter index
 * @param {Array} params - Array of parameters to append to
 * @returns {Object} - SQL fragment and next parameter index
 */
function buildCondition(field, condition, startParamIndex, params) {
  let sql = "";
  let paramIndex = startParamIndex;

  // Handle each type of operator
  if (condition.eq !== undefined) {
    sql = ` AND ${field} = $${paramIndex++}`;
    params.push(condition.eq);
  } else if (condition.neq !== undefined) {
    sql = ` AND ${field} != $${paramIndex++}`;
    params.push(condition.neq);
  } else if (condition.contains !== undefined) {
    sql = ` AND ${field} ILIKE $${paramIndex++}`;
    params.push(`%${condition.contains}%`);
  } else if (condition.gte !== undefined) {
    sql = ` AND ${field} >= $${paramIndex++}`;
    params.push(condition.gte);
  } else if (condition.lte !== undefined) {
    sql = ` AND ${field} <= $${paramIndex++}`;
    params.push(condition.lte);
  } else if (condition.not_null === true) {
    sql = ` AND ${field} IS NOT NULL`;
  } else if (condition.null === true) {
    sql = ` AND ${field} IS NULL`;
  }

  return { sql, nextParamIndex: paramIndex };
}

/**
 * Build SQL condition for JSON/JSONB field
 * @param {string} jsonField - Database JSON field name
 * @param {string} jsonKey - Key in the JSON object
 * @param {Object} condition - Condition object with operator and value
 * @param {number} startParamIndex - Starting parameter index
 * @param {Array} params - Array of parameters to append to
 * @returns {Object} - SQL fragment and next parameter index
 */
function buildJsonCondition(jsonField, jsonKey, condition, startParamIndex, params) {
  let sql = "";
  let paramIndex = startParamIndex;

  if (condition.eq !== undefined) {
    sql = ` AND ${jsonField}->>'${jsonKey}' = $${paramIndex++}`;
    params.push(condition.eq);
  } else if (condition.neq !== undefined) {
    sql = ` AND ${jsonField}->>'${jsonKey}' != $${paramIndex++}`;
    params.push(condition.neq);
  } else if (condition.contains !== undefined) {
    sql = ` AND ${jsonField}->>'${jsonKey}' ILIKE $${paramIndex++}`;
    params.push(`%${condition.contains}%`);
  } else if (condition.not_null === true) {
    sql = ` AND ${jsonField}->>'${jsonKey}' IS NOT NULL`;
  } else if (condition.null === true) {
    sql = ` AND ${jsonField}->>'${jsonKey}' IS NULL`;
  }

  return { sql, nextParamIndex: paramIndex };
}

/**
 * Get mailing list by ID with recipient count
 * @param {number} id - Mailing list ID
 * @returns {Promise<Object>} - Mailing list with recipient count
 */
async function getMailingListById(id) {
  // Get mailing list record
  const mailingListResult = await db.query(
    `SELECT ml.*, u.email as created_by_email
     FROM mailing_lists ml
     LEFT JOIN users u ON ml.created_by = u.id
     WHERE ml.id = $1 AND ml.is_deleted = FALSE`,
    [id]
  );

  if (mailingListResult.rows.length === 0) {
    throw new NotFound("Mailing list not found");
  }

  const mailingList = mailingListResult.rows[0];

  // Get recipient count
  const countResult = await db.query(
    `SELECT COUNT(*) as count
     FROM mailing_list_recipients
     WHERE mailing_list_id = $1`,
    [id]
  );

  // Return combined result
  return {
    ...mailingList,
    recipientCount: parseInt(countResult.rows[0].count),
  };
}

/**
 * List mailing lists with pagination and filtering
 * @param {Object} queryParams - Query parameters for pagination and filtering
 * @returns {Promise<Object>} - Paginated list of mailing lists
 */
async function listMailingLists(queryParams) {
  // Set default query params
  const page = Number(queryParams.page) || 1;
  const limit = Number(queryParams.limit) || 10;
  const offset = (page - 1) * limit;
  const sortBy = queryParams.sortBy || "created_at";
  const sortOrder = queryParams.sortOrder || "desc";

  const params = [];
  let paramIndex = 1;

  // Build query with optional filters
  let query = `
    SELECT ml.*, u.email as created_by_email,
           (SELECT COUNT(*) FROM mailing_list_recipients mlr WHERE mlr.mailing_list_id = ml.id) as recipient_count
    FROM mailing_lists ml
    LEFT JOIN users u ON ml.created_by = u.id
    WHERE ml.is_deleted = FALSE
  `;

  // Add search filter if provided
  if (queryParams.search) {
    query += ` AND (ml.name ILIKE $${paramIndex} OR ml.description ILIKE $${paramIndex})`;
    params.push(`%${queryParams.search}%`);
    paramIndex++;
  }

  // Add active status filter if specified
  if (queryParams.isActive !== undefined) {
    query += ` AND ml.is_active = $${paramIndex}`;
    params.push(queryParams.isActive);
    paramIndex++;
  }

  // Add pagination and sorting
  const validSortColumns = ["id", "name", "created_at", "updated_at"];
  const validSortOrders = ["asc", "desc"];

  const actualSortBy = validSortColumns.includes(sortBy) ? sortBy : "created_at";
  const actualSortOrder = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder : "desc";

  query += ` ORDER BY ml.${actualSortBy} ${actualSortOrder}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  // Execute the main query
  const result = await db.query(query, params);

  // Get total count for pagination
  const countResult = await db.query(
    `SELECT COUNT(*) 
     FROM mailing_lists 
     WHERE is_deleted = FALSE
     ${queryParams.search ? ` AND (name ILIKE $1 OR description ILIKE $1)` : ""}
     ${queryParams.isActive !== undefined ? ` AND is_active = $${queryParams.search ? 2 : 1}` : ""}`,
    params.slice(0, paramIndex - 1)
  );

  const totalCount = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalCount / limit);

  return {
    data: result.rows,
    pagination: {
      page,
      limit,
      totalItems: totalCount,
      totalPages,
    },
  };
}

/**
 * Update an existing mailing list
 * @param {number} id - Mailing list ID
 * @param {Object} updateData - Data to update
 * @param {UUID} userId - ID of the user updating the mailing list
 * @returns {Promise<Object>} - Updated mailing list
 */
async function updateMailingList(id, updateData, userId) {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Check if mailing list exists
    const existingResult = await client.query("SELECT id FROM mailing_lists WHERE id = $1 AND is_deleted = FALSE", [id]);

    if (existingResult.rows.length === 0) {
      throw new NotFound("Mailing list not found");
    }

    // Prepare update query
    const updates = [];
    const params = [id, userId]; // id = $1, userId = $2
    let paramIndex = 3;

    if (updateData.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(updateData.name);
    }

    if (updateData.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(updateData.description);
    }

    if (updateData.filterCriteria !== undefined) {
      updates.push(`filter_criteria = $${paramIndex++}`);
      params.push(JSON.stringify(updateData.filterCriteria));
    }

    if (updateData.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(updateData.is_active);
    }

    updates.push("updated_by = $2"); // userId is already $2
    updates.push("updated_at = NOW()");

    // Update the mailing list
    const updateQuery = `
      UPDATE mailing_lists
      SET ${updates.join(", ")}
      WHERE id = $1
      RETURNING id, name, description, source_type, filter_criteria, is_active, created_at, updated_at
    `;

    const updateResult = await client.query(updateQuery, params);
    const updatedMailingList = updateResult.rows[0];

    // If filter criteria is updated, we need to update recipients
    if (updateData.filterCriteria) {
      // Delete all existing recipients
      await client.query("DELETE FROM mailing_list_recipients WHERE mailing_list_id = $1", [id]);

      // Build query to find subscribers matching new filter criteria
      const { query, params: filterParams } = buildFilterQuery(updateData.filterCriteria);

      // Get subscribers that match the new filter criteria
      const subscribersResult = await client.query(query, filterParams);
      const subscribers = subscribersResult.rows;

      // Insert new recipients
      if (subscribers.length > 0) {
        const insertPromises = subscribers.map((subscriber) =>
          client.query(
            `INSERT INTO mailing_list_recipients 
            (mailing_list_id, recipient_type, recipient_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (mailing_list_id, recipient_type, recipient_id) DO NOTHING`,
            [id, "subscriber", subscriber.id]
          )
        );

        await Promise.all(insertPromises);
      }

      // Get the updated recipient count
      const countResult = await client.query("SELECT COUNT(*) as count FROM mailing_list_recipients WHERE mailing_list_id = $1", [id]);

      updatedMailingList.recipientCount = parseInt(countResult.rows[0].count);
    } else {
      // Just get the current recipient count
      const countResult = await client.query("SELECT COUNT(*) as count FROM mailing_list_recipients WHERE mailing_list_id = $1", [id]);

      updatedMailingList.recipientCount = parseInt(countResult.rows[0].count);
    }

    await client.query("COMMIT");
    return updatedMailingList;
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Error updating mailing list:", error);

    if (error.code === "23505") {
      throw new ConfictResource("A mailing list with this name already exists");
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete a mailing list (soft delete)
 * @param {number} id - Mailing list ID
 * @param {UUID} userId - ID of the user deleting the mailing list
 * @returns {Promise<boolean>} - True if successfully deleted
 */
async function deleteMailingList(id, userId) {
  // Check if mailing list exists
  const existingResult = await db.query("SELECT id FROM mailing_lists WHERE id = $1 AND is_deleted = FALSE", [id]);

  if (existingResult.rows.length === 0) {
    throw new NotFound("Mailing list not found");
  }

  // Soft delete the mailing list
  await db.query(
    `UPDATE mailing_lists 
     SET is_deleted = TRUE, 
         updated_by = $2, 
         updated_at = NOW()
     WHERE id = $1`,
    [id, userId]
  );

  return true;
}

/**
 * Get recipients of a mailing list with pagination
 * @param {number} id - Mailing list ID
 * @param {Object} queryParams - Query parameters for pagination
 * @returns {Promise<Object>} - Paginated list of recipients
 */
async function getMailingListRecipients(id, queryParams) {
  // Check if mailing list exists
  const mailingListResult = await db.query("SELECT id, name FROM mailing_lists WHERE id = $1 AND is_deleted = FALSE", [id]);

  if (mailingListResult.rows.length === 0) {
    throw new NotFound("Mailing list not found");
  }

  // Set default query params
  const page = Number(queryParams.page) || 1;
  const limit = Number(queryParams.limit) || 10;
  const offset = (page - 1) * limit;

  // Create the SQL query for getting recipients
  const recipientsQuery = `
    SELECT s.*, mlr.recipient_type
    FROM mailing_list_recipients mlr
    JOIN subscribers s ON mlr.recipient_id = s.id AND mlr.recipient_type = 'subscriber'
    WHERE mlr.mailing_list_id = $1
    ORDER BY s.email
    LIMIT $2 OFFSET $3`;

  // Log the query with parameter values for debugging purposes
  logger.info(`[MAILING-LIST-RECIPIENTS][ID:${id}] SQL: ${recipientsQuery.replace(/\s+/g, " ")} PARAMS: [${id}, ${limit}, ${offset}]`);

  // Get recipients with pagination
  const recipientsResult = await db.query(recipientsQuery, [id, limit, offset]);

  // Create the count query
  const countQuery = `
    SELECT COUNT(*) 
    FROM mailing_list_recipients
    WHERE mailing_list_id = $1`;

  // Log the count query as well
  logger.info(`[MAILING-LIST-RECIPIENTS-COUNT][ID:${id}] SQL: ${countQuery.replace(/\s+/g, " ")} PARAMS: [${id}]`);

  // Get total count for pagination
  const countResult = await db.query(countQuery, [id]);

  const totalCount = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalCount / limit);

  return {
    mailingList: mailingListResult.rows[0],
    data: recipientsResult.rows,
    pagination: {
      page,
      limit,
      totalItems: totalCount,
      totalPages,
    },
  };
}

/**
 * Regenerate recipients for a mailing list based on current filter criteria
 * @param {number} id - Mailing list ID
 * @returns {Promise<Object>} - Updated mailing list with recipient count
 */
async function regenerateRecipients(id) {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Check if mailing list exists and get filter criteria
    const mailingListResult = await client.query("SELECT id, filter_criteria FROM mailing_lists WHERE id = $1 AND is_deleted = FALSE", [
      id,
    ]);

    if (mailingListResult.rows.length === 0) {
      throw new NotFound("Mailing list not found");
    }

    const mailingList = mailingListResult.rows[0];
    const filterCriteria = mailingList.filter_criteria;

    // Delete all existing recipients
    await client.query("DELETE FROM mailing_list_recipients WHERE mailing_list_id = $1", [id]);

    // Build query to find subscribers matching filter criteria
    const { query, params } = buildFilterQuery(filterCriteria);

    // Get subscribers that match the filter criteria
    const subscribersResult = await client.query(query, params);
    const subscribers = subscribersResult.rows;

    // Insert new recipients
    if (subscribers.length > 0) {
      const insertPromises = subscribers.map((subscriber) =>
        client.query(
          `INSERT INTO mailing_list_recipients 
          (mailing_list_id, recipient_type, recipient_id)
          VALUES ($1, $2, $3)
          ON CONFLICT (mailing_list_id, recipient_type, recipient_id) DO NOTHING`,
          [id, "subscriber", subscriber.id]
        )
      );

      await Promise.all(insertPromises);
    }

    // Get updated information
    const updatedResult = await client.query(
      `SELECT ml.*, 
        (SELECT COUNT(*) FROM mailing_list_recipients WHERE mailing_list_id = ml.id) as recipient_count
      FROM mailing_lists ml
      WHERE ml.id = $1`,
      [id]
    );

    await client.query("COMMIT");

    return updatedResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Error regenerating recipients:", error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createMailingList,
  getMailingListById,
  listMailingLists,
  updateMailingList,
  deleteMailingList,
  getMailingListRecipients,
  regenerateRecipients,
};
