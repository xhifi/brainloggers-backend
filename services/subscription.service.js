/**
 * @module services/subscription
 * @description Service for managing email subscribers, including subscribe, unsubscribe, and admin operations
 */
const db = require("../config/db");
const logger = require("./logger.service");
const { parse } = require("csv-parse/sync");
const csvStringify = require("csv-stringify");

/**
 * Subscribe a new email to the mailing list
 * @async
 * @function subscribe
 * @param {Object} subscriberData - Data for the new subscriber
 * @param {string} subscriberData.email - Subscriber's email address
 * @param {string} subscriberData.name - Subscriber's name
 * @param {string} [subscriberData.dateOfBirth] - Subscriber's date of birth (optional)
 * @param {Object} [subscriberData.metadata] - Additional metadata (optional)
 * @returns {Promise<Object>} The newly created subscriber
 * @throws {Error} If email is already subscribed or other database error occurs
 */
const subscribe = async ({ email, name, dateOfBirth, metadata = {} }) => {
  try {
    const sql = `
      INSERT INTO subscribers (email, name, date_of_birth, metadata, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id, email, name, date_of_birth, metadata, is_active, subscribed_at
    `;

    const { rows } = await db.query(sql, [email, name || null, dateOfBirth || null, metadata ? JSON.stringify(metadata) : null]);

    return rows[0];
  } catch (error) {
    if (error.code === "23505") {
      // Duplicate key violation
      throw new Error("Email is already subscribed");
    }
    logger.error("Error subscribing email:", { error, email });
    throw new Error("Failed to subscribe email");
  }
};

/**
 * Unsubscribe an email from the mailing list
 * @async
 * @function unsubscribe
 * @param {string} email - The email address to unsubscribe
 * @returns {Promise<Object|null>} The updated subscriber or null if not found
 * @throws {Error} If database error occurs
 */
const unsubscribe = async (email) => {
  try {
    console.log(email);
    const sql = `
      UPDATE subscribers
      SET is_active = false, unsubscribed_at = NOW(), updated_at = NOW()
      WHERE email = $1 AND is_active = true
      RETURNING id, email, name, is_active, unsubscribed_at
    `;

    const { rows } = await db.query(sql, [email]);
    return rows[0] || null;
  } catch (error) {
    console.log(error);
    logger.error("Error unsubscribing email:", { error, email });
    throw new Error("Failed to unsubscribe email");
  }
};

/**
 * Get all subscribers with optional filtering and pagination
 * @async
 * @function getSubscribers
 * @param {Object} options - Query options
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=10] - Records per page
 * @param {string} [options.search] - Search term for email or name
 * @param {boolean} [options.isActive] - Filter by active status
 * @param {string} [options.sortBy='id'] - Field to sort by
 * @param {string} [options.sortOrder='asc'] - Sort order ('asc' or 'desc')
 * @returns {Promise<Object>} Paginated subscribers with count
 * @throws {Error} If database error occurs
 */
const getSubscribers = async ({ page = 1, limit = 10, search, isActive, sortBy = "id", sortOrder = "asc" }) => {
  try {
    const offset = (page - 1) * limit;
    const params = [];
    let whereClause = "";
    let countWhereClause = "";

    // Building WHERE clause
    const conditions = [];
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(email ILIKE $${params.length} OR name ILIKE $${params.length})`);
    }

    if (isActive !== undefined) {
      params.push(isActive);
      conditions.push(`is_active = $${params.length}`);
    }

    if (conditions.length > 0) {
      whereClause = `WHERE ${conditions.join(" AND ")}`;
      countWhereClause = whereClause;
    }

    // Validate sortBy to prevent SQL injection
    const allowedSortFields = ["id", "email", "name", "subscribed_at", "is_active"];
    if (!allowedSortFields.includes(sortBy)) {
      sortBy = "id";
    }

    // Validate sortOrder
    if (sortOrder !== "asc" && sortOrder !== "desc") {
      sortOrder = "asc";
    }

    // Query for paginated results
    const sql = `
      SELECT 
        id, email, name, date_of_birth, 
        is_active, subscribed_at, unsubscribed_at, metadata
      FROM subscribers
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    // Query for total count
    const countSql = `
      SELECT COUNT(*) AS total FROM subscribers
      ${countWhereClause}
    `;

    const [resultsQuery, countQuery] = await Promise.all([
      db.query(sql, params),
      db.query(countSql, params.slice(0, params.length - 2)), // Remove limit and offset
    ]);

    const subscribers = resultsQuery.rows;
    const total = parseInt(countQuery.rows[0].total);

    return {
      subscribers,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error("Error fetching subscribers:", { error });
    throw new Error("Failed to fetch subscribers");
  }
};

/**
 * Get a subscriber by ID
 * @async
 * @function getSubscriberById
 * @param {number} id - Subscriber ID
 * @returns {Promise<Object|null>} Subscriber data or null if not found
 * @throws {Error} If database error occurs
 */
const getSubscriberById = async (id) => {
  try {
    const sql = `
      SELECT 
        id, email, name, date_of_birth, 
        is_active, subscribed_at, unsubscribed_at, metadata
      FROM subscribers
      WHERE id = $1
    `;

    const { rows } = await db.query(sql, [id]);
    return rows[0] || null;
  } catch (error) {
    logger.error("Error fetching subscriber by ID:", { error, id });
    throw new Error("Failed to fetch subscriber");
  }
};

/**
 * Get a subscriber by email
 * @async
 * @function getSubscriberByEmail
 * @param {string} email - Subscriber email
 * @returns {Promise<Object|null>} Subscriber data or null if not found
 * @throws {Error} If database error occurs
 */
const getSubscriberByEmail = async (email) => {
  try {
    const sql = `
      SELECT 
        id, email, name, date_of_birth, 
        is_active, subscribed_at, unsubscribed_at, metadata
      FROM subscribers
      WHERE email = $1
    `;

    const { rows } = await db.query(sql, [email]);
    return rows[0] || null;
  } catch (error) {
    logger.error("Error fetching subscriber by email:", { error, email });
    throw new Error("Failed to fetch subscriber");
  }
};

/**
 * Update a subscriber
 * @async
 * @function updateSubscriber
 * @param {number} id - Subscriber ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object|null>} Updated subscriber or null if not found
 * @throws {Error} If database error occurs
 */
const updateSubscriber = async (id, updateData) => {
  try {
    const allowedFields = ["email", "name", "date_of_birth", "is_active", "metadata"];
    const updates = [];
    const values = [];

    // Build dynamic SQL for updates
    Object.keys(updateData).forEach((key) => {
      // Convert camelCase to snake_case and check if field is allowed
      const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      if (allowedFields.includes(snakeKey)) {
        updates.push(`${snakeKey} = $${values.length + 1}`);

        // Handle metadata specially to convert to JSON
        if (snakeKey === "metadata") {
          values.push(JSON.stringify(updateData[key]));
        } else {
          values.push(updateData[key]);
        }
      }
    });

    if (updates.length === 0) {
      return await getSubscriberById(id); // No updates to make
    }

    // Add updated_at timestamp
    updates.push(`updated_at = NOW()`);

    // If setting to inactive, set unsubscribed_at
    if (updateData.isActive === false) {
      updates.push(`unsubscribed_at = NOW()`);
    }

    // Build final SQL
    const sql = `
      UPDATE subscribers
      SET ${updates.join(", ")}
      WHERE id = $${values.length + 1}
      RETURNING id, email, name, date_of_birth, is_active, subscribed_at, unsubscribed_at, metadata
    `;

    values.push(id);

    const { rows } = await db.query(sql, values);
    return rows[0] || null;
  } catch (error) {
    if (error.code === "23505") {
      // Duplicate key violation
      throw new Error("Email is already in use by another subscriber");
    }
    logger.error("Error updating subscriber:", { error, id });
    throw new Error("Failed to update subscriber");
  }
};

/**
 * Delete a subscriber
 * @async
 * @function deleteSubscriber
 * @param {number} id - Subscriber ID
 * @returns {Promise<boolean>} True if deleted, false if not found
 * @throws {Error} If database error occurs
 */
const deleteSubscriber = async (id) => {
  try {
    const sql = `
      DELETE FROM subscribers
      WHERE id = $1
      RETURNING id
    `;

    const { rowCount } = await db.query(sql, [id]);
    return rowCount > 0;
  } catch (error) {
    logger.error("Error deleting subscriber:", { error, id });
    throw new Error("Failed to delete subscriber");
  }
};

/**
 * Import subscribers from CSV content
 * @async
 * @function importSubscribersFromCSV
 * @param {string} csvContent - CSV content as string
 * @returns {Promise<Object>} Results of import operation
 * @throws {Error} If parsing or database error occurs
 */
const importSubscribersFromCSV = async (csvContent) => {
  try {
    // Parse CSV content
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const results = {
      total: records.length,
      added: 0,
      skipped: 0,
      errors: [],
    };

    // Process records in batches to avoid overloading the database
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);

      // Process each record in the current batch
      const promises = batch.map(async (record, index) => {
        try {
          // Map CSV columns to database fields
          const email = record.email?.toLowerCase();
          const name = record.name;

          // Build metadata from any additional fields
          const metadata = {};
          Object.keys(record).forEach((key) => {
            if (!["email", "name"].includes(key)) {
              metadata[key] = record[key];
            }
          });

          if (!email || !isValidEmail(email)) {
            results.errors.push({ row: i + index + 1, email, error: "Invalid or missing email" });
            results.skipped++;
            return;
          }

          if (!name) {
            results.errors.push({ row: i + index + 1, email, error: "Missing name" });
            results.skipped++;
            return;
          }

          // Check if subscriber already exists
          const existing = await getSubscriberByEmail(email);
          if (existing) {
            results.skipped++;
            return;
          }

          // Create new subscriber
          await subscribe({
            email,
            name,
            metadata,
          });

          results.added++;
        } catch (error) {
          const rowNum = i + index + 1;
          logger.error(`Error importing row ${rowNum}:`, { error, record });
          results.errors.push({ row: rowNum, email: record.email, error: error.message });
          results.skipped++;
        }
      });

      await Promise.all(promises);
    }

    return results;
  } catch (error) {
    logger.error("Error in CSV import:", { error });
    throw new Error("Failed to import subscribers: " + error.message);
  }
};

/**
 * Export subscribers to CSV
 * @async
 * @function exportSubscribersToCSV
 * @param {Object} filters - Filters to apply (same as getSubscribers)
 * @returns {Promise<string>} CSV content as string
 * @throws {Error} If database or formatting error occurs
 */
const exportSubscribersToCSV = async (filters = {}) => {
  try {
    // Remove pagination from filters but keep other filters
    const { page, limit, ...otherFilters } = filters;

    // Get all subscribers matching filters without pagination
    const sql = `
      SELECT 
        id, email, name, date_of_birth, 
        is_active, subscribed_at, unsubscribed_at, metadata
      FROM subscribers
      ${buildWhereClause(otherFilters)}
      ORDER BY id ASC
    `;

    const { rows } = await db.query(sql, buildWhereParams(otherFilters));

    // Format data for CSV
    const formattedData = rows.map((subscriber) => {
      const formatted = {
        id: subscriber.id,
        email: subscriber.email,
        name: subscriber.name,
        date_of_birth: subscriber.date_of_birth,
        is_active: subscriber.is_active ? "Yes" : "No",
        subscribed_at: formatDate(subscriber.subscribed_at),
        unsubscribed_at: subscriber.unsubscribed_at ? formatDate(subscriber.unsubscribed_at) : "",
      };

      // Add metadata fields if present
      if (subscriber.metadata) {
        Object.keys(subscriber.metadata).forEach((key) => {
          formatted[`metadata_${key}`] = subscriber.metadata[key];
        });
      }

      return formatted;
    });

    // Convert to CSV
    return new Promise((resolve, reject) => {
      csvStringify(formattedData, { header: true }, (err, output) => {
        if (err) reject(new Error("Failed to generate CSV: " + err.message));
        else resolve(output);
      });
    });
  } catch (error) {
    logger.error("Error exporting subscribers to CSV:", { error });
    throw new Error("Failed to export subscribers to CSV");
  }
};

/**
 * Add tags to a subscriber
 * @async
 * @function addTagsToSubscriber
 * @param {number} subscriberId - Subscriber ID
 * @param {Array<string>} tagNames - Array of tag names to add
 * @returns {Promise<Array>} Array of added tags
 * @throws {Error} If database error occurs
 */
const addTagsToSubscriber = async (subscriberId, tagNames) => {
  try {
    // Begin transaction
    await db.query("BEGIN");

    const addedTags = [];

    // Process each tag name
    for (const tagName of tagNames) {
      // Check if tag exists, if not create it
      const tagResult = await db.query(
        `INSERT INTO tags (name)
         VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = $1
         RETURNING id, name`,
        [tagName]
      );

      const tagId = tagResult.rows[0].id;

      // Add relation between subscriber and tag if it doesn't exist
      await db.query(
        `INSERT INTO subscriber_tags (subscriber_id, tag_id)
         VALUES ($1, $2)
         ON CONFLICT (subscriber_id, tag_id) DO NOTHING`,
        [subscriberId, tagId]
      );

      addedTags.push(tagResult.rows[0]);
    }

    // Commit transaction
    await db.query("COMMIT");

    return addedTags;
  } catch (error) {
    // Rollback transaction on error
    await db.query("ROLLBACK");
    logger.error("Error adding tags to subscriber:", { error, subscriberId, tagNames });
    throw new Error(`Failed to add tags to subscriber: ${error.message}`);
  }
};

/**
 * Remove tags from a subscriber
 * @async
 * @function removeTagsFromSubscriber
 * @param {number} subscriberId - Subscriber ID
 * @param {Array<string>} tagNames - Array of tag names to remove
 * @returns {Promise<number>} Number of tags removed
 * @throws {Error} If database error occurs
 */
const removeTagsFromSubscriber = async (subscriberId, tagNames) => {
  try {
    if (!tagNames || tagNames.length === 0) {
      return 0;
    }

    const placeholders = tagNames.map((_, index) => `$${index + 2}`).join(", ");

    const result = await db.query(
      `DELETE FROM subscriber_tags
       WHERE subscriber_id = $1
       AND tag_id IN (
         SELECT id FROM tags WHERE name IN (${placeholders})
       )
       RETURNING tag_id`,
      [subscriberId, ...tagNames]
    );

    return result.rowCount;
  } catch (error) {
    logger.error("Error removing tags from subscriber:", { error, subscriberId, tagNames });
    throw new Error(`Failed to remove tags from subscriber: ${error.message}`);
  }
};

/**
 * Get all tags for a subscriber
 * @async
 * @function getSubscriberTags
 * @param {number} subscriberId - Subscriber ID
 * @returns {Promise<Array>} Array of tags
 * @throws {Error} If database error occurs
 */
const getSubscriberTags = async (subscriberId) => {
  try {
    const sql = `
      SELECT t.id, t.name
      FROM tags t
      JOIN subscriber_tags st ON t.id = st.tag_id
      WHERE st.subscriber_id = $1
      ORDER BY t.name ASC
    `;

    const { rows } = await db.query(sql, [subscriberId]);
    return rows;
  } catch (error) {
    logger.error("Error fetching subscriber tags:", { error, subscriberId });
    throw new Error(`Failed to fetch subscriber tags: ${error.message}`);
  }
};

/**
 * Get all unique tags in the system
 * @async
 * @function getAllTags
 * @param {Object} options - Query options
 * @param {string} [options.search] - Search term for tag name
 * @returns {Promise<Array>} Array of tags with usage count
 * @throws {Error} If database error occurs
 */
const getAllTags = async ({ search = null } = {}) => {
  try {
    let sql = `
      SELECT t.id, t.name, COUNT(st.subscriber_id) as usage_count
      FROM tags t
      LEFT JOIN subscriber_tags st ON t.id = st.tag_id
    `;

    const params = [];

    if (search) {
      sql += ` WHERE t.name ILIKE $1`;
      params.push(`%${search}%`);
    }

    sql += `
      GROUP BY t.id, t.name
      ORDER BY t.name ASC
    `;

    const { rows } = await db.query(sql, params);
    return rows;
  } catch (error) {
    logger.error("Error fetching all tags:", { error });
    throw new Error(`Failed to fetch tags: ${error.message}`);
  }
};

/**
 * Get subscribers by tags
 * @async
 * @function getSubscribersByTags
 * @param {Array<string>} tagNames - Array of tag names to filter by
 * @param {Object} options - Query options
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=10] - Records per page
 * @param {string} [options.matchType='any'] - Match type: 'any' or 'all'
 * @returns {Promise<Object>} Paginated subscribers with count
 * @throws {Error} If database error occurs
 */
const getSubscribersByTags = async (tagNames, { page = 1, limit = 10, matchType = "any", isActive } = {}) => {
  try {
    if (!tagNames || tagNames.length === 0) {
      return {
        subscribers: [],
        pagination: {
          total: 0,
          page,
          limit,
          pages: 0,
        },
      };
    }

    const offset = (page - 1) * limit;
    const params = [...tagNames];

    // Build WHERE clause for active status
    let activeCondition = "";
    if (isActive !== undefined) {
      activeCondition = "AND s.is_active = $" + (params.length + 1);
      params.push(isActive);
    }

    // Different query based on match type
    let sql;
    let countSql;

    if (matchType === "all") {
      // Match subscribers who have ALL the specified tags
      sql = `
        SELECT 
          s.id, s.email, s.name, s.date_of_birth, 
          s.is_active, s.subscribed_at, s.unsubscribed_at, s.metadata
        FROM subscribers s
        JOIN (
          SELECT subscriber_id
          FROM subscriber_tags st
          JOIN tags t ON st.tag_id = t.id
          WHERE t.name = ANY($1::text[])
          ${activeCondition}
          GROUP BY subscriber_id
          HAVING COUNT(DISTINCT t.name) = $${params.length + 1}
        ) matching_subscribers ON s.id = matching_subscribers.subscriber_id
        ORDER BY s.name ASC
        LIMIT $${params.length + 2} OFFSET $${params.length + 3}
      `;

      countSql = `
        SELECT COUNT(*) AS total
        FROM (
          SELECT subscriber_id
          FROM subscriber_tags st
          JOIN tags t ON st.tag_id = t.id
          WHERE t.name = ANY($1::text[])
          GROUP BY subscriber_id
          HAVING COUNT(DISTINCT t.name) = $${params.length + 1}
        ) matching_subscribers
        JOIN subscribers s ON s.id = matching_subscribers.subscriber_id
        WHERE 1=1 ${activeCondition}
      `;

      params.push(tagNames.length);
    } else {
      // Default: Match subscribers who have ANY of the specified tags
      sql = `
        SELECT DISTINCT
          s.id, s.email, s.name, s.date_of_birth, 
          s.is_active, s.subscribed_at, s.unsubscribed_at, s.metadata
        FROM subscribers s
        JOIN subscriber_tags st ON s.id = st.subscriber_id
        JOIN tags t ON st.tag_id = t.id
        WHERE t.name = ANY($1::text[])
        ${activeCondition}
        ORDER BY s.name ASC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;

      countSql = `
        SELECT COUNT(DISTINCT s.id) AS total
        FROM subscribers s
        JOIN subscriber_tags st ON s.id = st.subscriber_id
        JOIN tags t ON st.tag_id = t.id
        WHERE t.name = ANY($1::text[])
        ${activeCondition}
      `;
    }

    // Append limit and offset params
    params.push(limit, offset);

    const [resultsQuery, countQuery] = await Promise.all([
      db.query(sql, params),
      db.query(countSql, params.slice(0, params.length - 2)), // Remove limit and offset
    ]);

    const subscribers = resultsQuery.rows;
    const total = parseInt(countQuery.rows[0].total);

    return {
      subscribers,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error("Error fetching subscribers by tags:", { error, tagNames });
    throw new Error(`Failed to fetch subscribers by tags: ${error.message}`);
  }
};

module.exports = {
  subscribe,
  unsubscribe,
  getSubscribers,
  getSubscriberById,
  getSubscriberByEmail,
  updateSubscriber,
  deleteSubscriber,
  importSubscribersFromCSV,
  exportSubscribersToCSV,
  addTagsToSubscriber,
  removeTagsFromSubscriber,
  getSubscriberTags,
  getAllTags,
  getSubscribersByTags,
};
