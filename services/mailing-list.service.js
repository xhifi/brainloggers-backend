/**
 * @module Services/MailingListService
 * @description Service for managing mailing lists and subscribers
 */
const db = require("../config/db");
const logger = require("./logger.service");
const { NotFoundError, ConflictResourceError, BadRequestError } = require("../utils/errors");

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

    // Validate tag IDs if provided
    if (mailingListData.filter_criteria && mailingListData.filter_criteria.tags) {
      await validateTagIds(mailingListData.filter_criteria.tags);
    }

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
        JSON.stringify(mailingListData.filter_criteria || {}),
        userId,
      ]
    );
    const mailingList = mailingListResult.rows[0];

    // Build query to find subscribers matching filter criteria
    const { query, params } = buildFilterQuery(mailingListData.filter_criteria || {});

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

  // Process tag filtering if present
  if (filterCriteria.tags && filterCriteria.tags.length > 0) {
    const tagIds = filterCriteria.tags;
    // Use a subquery to check if a subscriber has all the required tags
    query += `
      AND (
        SELECT COUNT(DISTINCT st.tag_id) 
        FROM subscriber_tags st 
        JOIN tags t ON st.tag_id = t.id
        WHERE st.subscriber_id = s.id 
        AND st.tag_id IN (${tagIds.map(() => `$${paramIndex++}`).join(", ")})
        AND t.is_active = TRUE
      ) = $${paramIndex++}
    `;

    // Add each tag ID as a parameter
    params.push(...tagIds);
    // Add the count of tag IDs as a parameter to ensure ALL required tags are present
    params.push(tagIds.length);
  }

  // Process main filter if present
  if (filterCriteria.filter) {
    const condition = buildFilterCondition(filterCriteria.filter, paramIndex, params);
    if (condition.sql) {
      query += ` AND (${condition.sql})`;
      paramIndex = condition.nextParamIndex;
    }
  }

  return { query, params };
}

/**
 * Recursively build SQL conditions for filter groups
 * @param {Object} filter - Filter group or rule
 * @param {number} startParamIndex - Starting parameter index
 * @param {Array} params - Array of parameters to append to
 * @returns {Object} - SQL fragment and next parameter index
 */
function buildFilterCondition(filter, startParamIndex, params) {
  let sql = "";
  let paramIndex = startParamIndex;

  // Check if it's a group condition (AND/OR/NOT)
  if (filter.condition) {
    const subConditions = [];

    if (filter.condition === "not") {
      // Handle NOT condition
      const subCondition = buildFilterCondition(filter.rule, paramIndex, params);
      if (subCondition.sql) {
        sql = `NOT (${subCondition.sql})`;
        paramIndex = subCondition.nextParamIndex;
      }
    } else {
      // Handle AND/OR conditions
      const rules = filter.rules || [];
      for (const rule of rules) {
        const subCondition = buildFilterCondition(rule, paramIndex, params);
        if (subCondition.sql) {
          subConditions.push(subCondition.sql);
          paramIndex = subCondition.nextParamIndex;
        }
      }

      if (subConditions.length > 0) {
        const joinOperator = filter.condition.toUpperCase();
        sql = `(${subConditions.join(` ${joinOperator} `)})`;
      }
    }
  } else if (filter.field) {
    // It's a field rule
    sql = buildFieldCondition(filter, paramIndex, params);
    paramIndex += countParamsForField(filter);
  }

  return { sql, nextParamIndex: paramIndex };
}

/**
 * Build SQL condition for a specific field based on field and operator
 * @param {Object} rule - Field rule object with field, operator, and value
 * @param {number} startParamIndex - Starting parameter index
 * @param {Array} params - Array of parameters to append to
 * @returns {string} - SQL condition fragment
 */
function buildFieldCondition(rule, startParamIndex, params) {
  const { field, operator, value } = rule;
  let paramIndex = startParamIndex;

  // Determine if this is a standard field or a metadata field
  const standardFields = [
    "id",
    "email",
    "name",
    "date_of_birth",
    "is_active",
    "subscribed_at",
    "unsubscribed_at",
    "created_at",
    "updated_at",
  ];
  let fieldExpression;

  if (standardFields.includes(field)) {
    fieldExpression = `s.${field}`;
  } else if (field.startsWith("metadata.")) {
    // Extract the metadata key
    const metadataKey = field.substring("metadata.".length);
    fieldExpression = `s.metadata->>'${metadataKey}'`;
  } else {
    // Assume it's a top-level metadata field
    fieldExpression = `s.metadata->>'${field}'`;
  }

  // Build condition based on operator
  switch (operator) {
    // String operators
    case "eq":
      params.push(value);
      return `${fieldExpression} = $${paramIndex}`;

    case "neq":
      params.push(value);
      return `${fieldExpression} != $${paramIndex}`;

    case "contains":
      params.push(`%${value}%`);
      return `${fieldExpression} ILIKE $${paramIndex}`;

    case "not_contains":
      params.push(`%${value}%`);
      return `${fieldExpression} NOT ILIKE $${paramIndex}`;

    case "starts_with":
      params.push(`${value}%`);
      return `${fieldExpression} ILIKE $${paramIndex}`;

    case "ends_with":
      params.push(`%${value}`);
      return `${fieldExpression} ILIKE $${paramIndex}`;

    case "in":
      const placeholders = value.map((_, i) => `$${paramIndex + i}`).join(", ");
      params.push(...value);
      return `${fieldExpression} IN (${placeholders})`;

    case "not_in":
      const notInPlaceholders = value.map((_, i) => `$${paramIndex + i}`).join(", ");
      params.push(...value);
      return `${fieldExpression} NOT IN (${notInPlaceholders})`; // Numeric and date comparison operators    case "gt":
      params.push(value);

      if (isDateField(field, value)) {
        if (field.startsWith("metadata.")) {
          // For metadata date fields, cast extracted value to timestamp
          return `(${fieldExpression})::timestamp > $${paramIndex}::timestamp`;
        } else {
          return `${fieldExpression}::timestamp > $${paramIndex}::timestamp`;
        }
      } else if (field.startsWith("metadata.")) {
        // For metadata numeric fields, cast the value to numeric
        return `(${fieldExpression})::numeric > $${paramIndex}`;
      }
      return `${fieldExpression}::numeric > $${paramIndex}`;
    case "gte":
      params.push(value);

      if (isDateField(field, value)) {
        if (field.startsWith("metadata.")) {
          // For metadata date fields, cast extracted value to timestamp
          return `(${fieldExpression})::timestamp >= $${paramIndex}::timestamp`;
        } else {
          return `${fieldExpression}::timestamp >= $${paramIndex}::timestamp`;
        }
      } else if (field.startsWith("metadata.")) {
        return `(${fieldExpression})::numeric >= $${paramIndex}`;
      }
      return `${fieldExpression}::numeric >= $${paramIndex}`;
    case "lt":
      params.push(value);

      if (isDateField(field, value)) {
        if (field.startsWith("metadata.")) {
          // For metadata date fields, cast extracted value to timestamp
          return `(${fieldExpression})::timestamp < $${paramIndex}::timestamp`;
        } else {
          return `${fieldExpression}::timestamp < $${paramIndex}::timestamp`;
        }
      } else if (field.startsWith("metadata.")) {
        // For metadata numeric fields, cast the value to numeric
        return `(${fieldExpression})::numeric < $${paramIndex}`;
      }
      return `${fieldExpression}::numeric < $${paramIndex}`;
    case "lte":
      params.push(value);

      if (isDateField(field, value)) {
        if (field.startsWith("metadata.")) {
          // For metadata date fields, cast extracted value to timestamp
          return `(${fieldExpression})::timestamp <= $${paramIndex}::timestamp`;
        } else {
          return `${fieldExpression}::timestamp <= $${paramIndex}::timestamp`;
        }
      } else if (field.startsWith("metadata.")) {
        // For metadata numeric fields, cast the value to numeric
        return `(${fieldExpression})::numeric <= $${paramIndex}`;
      }
      return `${fieldExpression}::numeric <= $${paramIndex}`;
    case "between":
      params.push(value[0], value[1]);

      if (isDateField(field, value[0])) {
        if (field.startsWith("metadata.")) {
          // For metadata date fields, cast extracted value to timestamp
          return `(${fieldExpression})::timestamp BETWEEN $${paramIndex}::timestamp AND $${paramIndex + 1}::timestamp`;
        } else {
          return `${fieldExpression}::timestamp BETWEEN $${paramIndex}::timestamp AND $${paramIndex + 1}::timestamp`;
        }
      } else if (field.startsWith("metadata.")) {
        // For metadata numeric fields, cast the value to numeric
        return `(${fieldExpression})::numeric BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
      }
      return `${fieldExpression}::numeric BETWEEN $${paramIndex} AND $${paramIndex + 1}`;

    // Date operators
    case "extract_day":
      params.push(value);
      return `EXTRACT(DAY FROM ${fieldExpression}::timestamp) = $${paramIndex}`;

    case "extract_month":
      params.push(value);
      return `EXTRACT(MONTH FROM ${fieldExpression}::timestamp) = $${paramIndex}`;

    case "extract_year":
      params.push(value);
      return `EXTRACT(YEAR FROM ${fieldExpression}::timestamp) = $${paramIndex}`;

    // Boolean operators
    case "null":
      return `${fieldExpression} IS NULL`;

    case "not_null":
      return `${fieldExpression} IS NOT NULL`;

    // Array operators
    case "contains" /* for arrays */:
      // If field is metadata JSON array
      if (field.startsWith("metadata.")) {
        params.push(JSON.stringify(value));
        return `${fieldExpression}::jsonb @> $${paramIndex}::jsonb`;
      }
      params.push(value);
      return `${fieldExpression} @> ARRAY[$${paramIndex}]`;

    case "not_contains" /* for arrays */:
      if (field.startsWith("metadata.")) {
        params.push(JSON.stringify(value));
        return `NOT (${fieldExpression}::jsonb @> $${paramIndex}::jsonb)`;
      }
      params.push(value);
      return `NOT (${fieldExpression} @> ARRAY[$${paramIndex}])`;

    case "empty":
      return `${fieldExpression} = '[]' OR ${fieldExpression} IS NULL`;

    case "not_empty":
      return `${fieldExpression} != '[]' AND ${fieldExpression} IS NOT NULL`;

    case "size_eq":
      params.push(value);
      return `jsonb_array_length(${fieldExpression}::jsonb) = $${paramIndex}`;

    case "size_gt":
      params.push(value);
      return `jsonb_array_length(${fieldExpression}::jsonb) > $${paramIndex}`;

    case "size_lt":
      params.push(value);
      return `jsonb_array_length(${fieldExpression}::jsonb) < $${paramIndex}`;

    default:
      // Unknown operator, return empty string
      return "";
  }
}

/**
 * Determine if a field or value should be treated as a date/timestamp field
 * @param {string} field - Field name
 * @param {*} value - Field value
 * @returns {boolean} - True if field should be treated as a date
 */
function isDateField(field, value) {
  // Standard date fields
  const standardDateFields = ["subscribed_at", "unsubscribed_at", "created_at", "updated_at", "date_of_birth"];

  // Field name patterns that indicate a date
  const isDateFieldPattern = field.endsWith("_date") || field.endsWith("_at") || field.endsWith("_time");

  // Check if value itself is a date format
  const isDateValue = value instanceof Date || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value));

  return standardDateFields.includes(field) || isDateFieldPattern || isDateValue;
}

/**
 * Count the number of parameters needed for a field condition
 * @param {Object} rule - Field rule
 * @returns {number} - Number of parameters
 */
function countParamsForField(rule) {
  const { operator, value } = rule;

  switch (operator) {
    case "null":
    case "not_null":
    case "empty":
    case "not_empty":
      return 0;

    case "in":
    case "not_in":
      return value ? value.length : 0;

    case "between":
      return 2;

    default:
      return value !== undefined ? 1 : 0;
  }
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
    throw new NotFoundError("Mailing list not found");
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
      throw new NotFoundError("Mailing list not found");
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
    if (updateData.filter_criteria !== undefined) {
      updates.push(`filter_criteria = $${paramIndex++}`);
      params.push(JSON.stringify(updateData.filter_criteria));
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
    const updatedMailingList = updateResult.rows[0]; // If filter criteria is updated, we need to update recipients
    if (updateData.filter_criteria) {
      // Validate tag IDs if provided
      if (updateData.filter_criteria.tags) {
        await validateTagIds(updateData.filter_criteria.tags);
      }

      // Delete all existing recipients
      await client.query("DELETE FROM mailing_list_recipients WHERE mailing_list_id = $1", [id]);

      // Build query to find subscribers matching new filter criteria
      const { query, params: filterParams } = buildFilterQuery(updateData.filter_criteria);

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
    throw new NotFoundError("Mailing list not found");
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
    throw new NotFoundError("Mailing list not found");
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
      throw new NotFoundError("Mailing list not found");
    }
    const mailingList = mailingListResult.rows[0];
    const filterCriteria = mailingList.filter_criteria;

    // Validate tag IDs if they exist in the filter criteria
    if (filterCriteria && filterCriteria.tags) {
      await validateTagIds(filterCriteria.tags);
    }

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

/**
 * Validate and verify tag IDs exist and are active
 * @param {Array<number>} tagIds - Array of tag IDs to validate
 * @returns {Promise<boolean>} - True if all tags are valid
 * @throws {Error} - If any tag is invalid or inactive
 */
async function validateTagIds(tagIds) {
  if (!tagIds || tagIds.length === 0) {
    return true;
  }

  const client = await db.getClient();

  try {
    // Query to get all active tags with the given IDs
    const { rows } = await client.query(
      `SELECT id, name, is_active FROM tags 
       WHERE id = ANY($1)`,
      [tagIds]
    );

    // Check if all tag IDs were found
    if (rows.length !== tagIds.length) {
      const foundIds = rows.map((tag) => tag.id);
      const missingIds = tagIds.filter((id) => !foundIds.includes(id));
      throw new NotFoundError(`The following tag IDs were not found: ${missingIds.join(", ")}`);
    }

    // Check if all tags are active
    const inactiveTags = rows.filter((tag) => !tag.is_active);
    if (inactiveTags.length > 0) {
      throw new BadRequestError(`The following tags are inactive: ${inactiveTags.map((tag) => tag.name).join(", ")}`);
    }

    return true;
  } finally {
    client.release();
  }
}

/**
 * Preview subscribers matching filter criteria with optional pagination
 * @param {Object} filterCriteria - Filter criteria from the request
 * @param {Object} [queryParams] - Optional query parameters for pagination
 * @returns {Promise<Object>} Object containing count and optionally the paginated data
 */
async function previewFilterResults(filterCriteria, queryParams = {}) {
  let client;
  try {
    client = await db.getClient();

    const { query, params } = buildFilterQuery(filterCriteria);

    // First, get the total count
    const countQuery = `
      SELECT COUNT(*) 
      FROM (${query}) AS filtered_subscribers
    `;

    const countResult = await client.query(countQuery, params);
    const totalItems = parseInt(countResult.rows[0].count, 10);

    // If no pagination parameters are provided, only return the count
    if (!queryParams.page && !queryParams.limit) {
      return {
        count: totalItems,
      };
    }

    // Process pagination parameters
    const page = parseInt(queryParams.page, 10) || 1;
    const limit = parseInt(queryParams.limit, 10) || 10;
    const offset = (page - 1) * limit;

    // Add pagination to the query
    const paginatedQuery = `
      ${query}
      ORDER BY s.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const paginatedParams = [...params, limit, offset];

    // Execute the paginated query
    const result = await client.query(paginatedQuery, paginatedParams);

    return {
      count: totalItems,
      subscribers: result.rows,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  } catch (error) {
    logger.error("Error in previewFilterResults service:", error);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Get the total count of active subscribers
 * @returns {Promise<number>} - Total count of active subscribers
 */
async function getTotalSubscriberCount() {
  try {
    const query = "SELECT COUNT(*) as count FROM subscribers WHERE is_active = TRUE";
    const result = await db.query(query);
    return parseInt(result.rows[0].count, 10);
  } catch (error) {
    logger.error("Error getting total subscriber count:", error);
    throw error;
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
  validateTagIds,
  previewFilterResults,
  getTotalSubscriberCount,
};
