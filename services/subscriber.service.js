/**
 * @module services/subscriber.service
 * @description Service for managing subscribers
 */
const db = require("../config/db");
const logger = require("./logger.service");
const { parse } = require("csv-parse/sync");
const { stringify } = require("csv-stringify/sync");
const NotFound = require("../utils/errors/NotFound");
const ConfictResource = require("../utils/errors/ConfictResource");

/**
 * Get all subscribers with pagination
 * @param {number} page - Page number
 * @param {number} limit - Limit per page
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} - List of subscribers
 */
async function getAllSubscribers(page = 1, limit = 20, filters = {}) {
  const offset = (page - 1) * limit;
  let query = "SELECT * FROM subscribers WHERE 1=1";
  const params = [];
  let paramIndex = 1;

  // Apply filters if provided
  if (filters.isActive !== undefined) {
    query += ` AND is_active = $${paramIndex++}`;
    params.push(filters.isActive);
  }

  if (filters.email) {
    query += ` AND email ILIKE $${paramIndex++}`;
    params.push(`%${filters.email}%`);
  }

  // Add count query for pagination
  const countQuery = query.replace("SELECT *", "SELECT COUNT(*)");

  // Add pagination
  query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  try {
    const { rows: countRows } = await db.query(countQuery, params.slice(0, -2));
    const total = parseInt(countRows[0].count);

    const { rows } = await db.query(query, params);

    return {
      subscribers: rows,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error("Error fetching subscribers:", error);
    throw error;
  }
}

/**
 * Get a subscriber by ID
 * @param {number} id - Subscriber ID
 * @returns {Promise<Object>} - Subscriber data
 */
async function getSubscriberById(id) {
  try {
    const { rows } = await db.query("SELECT * FROM subscribers WHERE id = $1", [id]);

    if (rows.length === 0) {
      throw new NotFound(`Subscriber with id ${id} not found`);
    }

    return rows[0];
  } catch (error) {
    logger.error(`Error fetching subscriber with id ${id}:`, error);
    throw error;
  }
}

/**
 * Get a subscriber by email
 * @param {string} email - Subscriber email
 * @returns {Promise<Object>} - Subscriber data
 */
async function getSubscriberByEmail(email) {
  try {
    const { rows } = await db.query("SELECT * FROM subscribers WHERE email = $1", [email]);

    if (rows.length === 0) {
      return null;
    }

    return rows[0];
  } catch (error) {
    logger.error(`Error fetching subscriber with email ${email}:`, error);
    throw error;
  }
}

/**
 * Create a new subscriber
 * @param {Object} subscriberData - Subscriber data
 * @returns {Promise<Object>} - Created subscriber
 */
async function createSubscriber(subscriberData) {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Check if email already exists
    const existingSubscriber = await getSubscriberByEmail(subscriberData.email);
    if (existingSubscriber) {
      if (!existingSubscriber.is_active) {
        // If the subscriber exists but is inactive, reactivate them
        const { rows } = await client.query(
          "UPDATE subscribers SET is_active = true, unsubscribed_at = NULL, updated_at = NOW() WHERE email = $1 RETURNING *",
          [subscriberData.email]
        );
        await client.query("COMMIT");
        return rows[0];
      } else {
        throw new ConfictResource(`Subscriber with email ${subscriberData.email} already exists`);
      }
    }

    // Insert new subscriber
    const { rows } = await client.query(
      "INSERT INTO subscribers (email, name, date_of_birth, metadata) VALUES ($1, $2, $3, $4) RETURNING *",
      [subscriberData.email, subscriberData.name || null, subscriberData.dateOfBirth || null, subscriberData.metadata || {}]
    );

    // Apply default "form-subscriber" tag if subscriber was created via /subscribe endpoint
    if (subscriberData.applyFormTag) {
      // Check if "form-subscriber" tag exists, create if not
      let tagId;
      const tagResult = await client.query("SELECT id FROM tags WHERE name = $1", ["form-subscriber"]);

      if (tagResult.rows.length === 0) {
        const newTagResult = await client.query("INSERT INTO tags (name, description) VALUES ($1, $2) RETURNING id", [
          "form-subscriber",
          "Subscribers who subscribed via the form",
        ]);
        tagId = newTagResult.rows[0].id;
      } else {
        tagId = tagResult.rows[0].id;
      }

      // Assign tag to subscriber
      await client.query("INSERT INTO subscriber_tags (subscriber_id, tag_id) VALUES ($1, $2)", [rows[0].id, tagId]);
    }

    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Error creating subscriber:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update a subscriber
 * @param {number} id - Subscriber ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} - Updated subscriber
 */
async function updateSubscriber(id, updateData) {
  try {
    // Check if subscriber exists
    const subscriber = await getSubscriberById(id);

    if (!subscriber) {
      throw new NotFound(`Subscriber with id ${id} not found`);
    }

    // Build update query
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (updateData.email) {
      updateFields.push(`email = $${paramIndex++}`);
      values.push(updateData.email);
    }

    if (updateData.name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      values.push(updateData.name);
    }

    if (updateData.dateOfBirth !== undefined) {
      updateFields.push(`date_of_birth = $${paramIndex++}`);
      values.push(updateData.dateOfBirth);
    }

    if (updateData.metadata !== undefined) {
      updateFields.push(`metadata = $${paramIndex++}`);
      values.push(updateData.metadata);
    }

    if (updateData.isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      values.push(updateData.isActive);

      // Update unsubscribed_at if we're deactivating the subscriber
      if (!updateData.isActive) {
        updateFields.push(`unsubscribed_at = $${paramIndex++}`);
        values.push(new Date());
      } else if (updateData.isActive) {
        updateFields.push(`unsubscribed_at = NULL`);
      }
    }

    updateFields.push(`updated_at = NOW()`);

    // Add subscriber ID as the last parameter
    values.push(id);

    const query = `
      UPDATE subscribers
      SET ${updateFields.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const { rows } = await db.query(query, values);
    return rows[0];
  } catch (error) {
    logger.error(`Error updating subscriber ${id}:`, error);
    throw error;
  }
}

/**
 * Delete a subscriber
 * @param {number} id - Subscriber ID
 * @returns {Promise<boolean>} - Success indicator
 */
async function deleteSubscriber(id) {
  try {
    // Check if subscriber exists
    await getSubscriberById(id);

    // Delete subscriber
    const result = await db.query("DELETE FROM subscribers WHERE id = $1", [id]);
    return result.rowCount > 0;
  } catch (error) {
    logger.error(`Error deleting subscriber ${id}:`, error);
    throw error;
  }
}

/**
 * Unsubscribe a subscriber by email
 * @param {string} email - Subscriber email
 * @returns {Promise<Object>} - Updated subscriber
 */
async function unsubscribeByEmail(email) {
  try {
    const subscriber = await getSubscriberByEmail(email);

    if (!subscriber) {
      throw new NotFound(`Subscriber with email ${email} not found`);
    }

    const { rows } = await db.query(
      "UPDATE subscribers SET is_active = false, unsubscribed_at = NOW(), updated_at = NOW() WHERE email = $1 RETURNING *",
      [email]
    );

    return rows[0];
  } catch (error) {
    logger.error(`Error unsubscribing ${email}:`, error);
    throw error;
  }
}

/**
 * Helper function to get or create a tag by name
 * @param {Object} client - Database client
 * @param {string} tagName - Tag name
 * @returns {Promise<number>} - Tag ID
 */
async function getOrCreateTag(client, tagName) {
  // First try to get the tag
  const { rows } = await client.query("SELECT id FROM tags WHERE name = $1", [tagName]);

  if (rows.length > 0) {
    return rows[0].id;
  }

  // Create the tag if it doesn't exist
  const { rows: newTag } = await client.query("INSERT INTO tags (name, description) VALUES ($1, $2) RETURNING id", [
    tagName,
    `Automatically created during CSV import`,
  ]);

  return newTag[0].id;
}

/**
 * Import subscribers from CSV data with progress reporting and batch processing
 * @param {string} csvData - CSV data as string
 * @param {Array<string>} tagNames - Tag names to apply
 * @param {Function} [progressCallback] - Optional callback for reporting progress
 * @param {Object} [options] - Import options
 * @param {boolean} [options.updateExisting=true] - Whether to update existing subscribers
 * @param {boolean} [options.createTags=true] - Whether to create tags from CSV data
 * @param {number} [options.batchSize=100] - Size of batches for processing
 * @returns {Promise<Object>} - Import results
 */
/**
 * Import subscribers from CSV data
 * @param {string} csvData - CSV content
 * @param {Array<string>} tagNames - Tags to apply to imported subscribers
 * @param {Object} options - Import options
 * @returns {Promise<Object>} Import results
 */
async function importSubscribers(csvData, options = {}) {
  const client = await db.getClient();
  const results = {
    total: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    processedRecords: 0,
  };

  // Set default options
  const importOptions = {
    updateExisting: options.updateExisting !== undefined ? options.updateExisting : true,
    createTags: options.createTags !== undefined ? options.createTags : true,
    batchSize: options.batchSize || 100,
  };

  try {
    await client.query("BEGIN");

    // Parse CSV data with headers
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relaxColumnCount: true, // Handle inconsistent column counts
      relaxQuotes: true, // Handle quotes more flexibly
      skipRecordsWithError: true, // Skip records with parsing errors
    });

    results.total = records.length;

    // Process tags from both provided tag names and any tags column in CSV
    const tagIdsMap = new Map(); // For quick lookups by name
    let csvTagsColumn = null;

    // Find tag column in CSV headers if it exists
    const headers = Object.keys(records[0] || {});
    for (const header of headers) {
      if (header.toLowerCase() === "tags" || header.toLowerCase() === "tag" || header.toLowerCase() === "categories") {
        csvTagsColumn = header;
        break;
      }
    }

    // Process records in batches for better performance
    const batchSize = importOptions.batchSize;
    const batches = [];

    for (let i = 0; i < records.length; i += batchSize) {
      batches.push(records.slice(i, Math.min(i + batchSize, records.length)));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const processedBatch = [];

      // Step 1: Process and validate each record in the batch
      for (const record of batch) {
        try {
          // Validate email
          if (!record.email || !isValidEmail(record.email)) {
            results.skipped++;
            results.errors.push(`Invalid email format: ${record.email || "empty"}`);
            continue;
          }

          // Extract subscriber data from record
          const subscriberData = extractSubscriberData(record, headers);

          // Process CSV tags if they exist and creation is enabled
          const recordTags = [];
          if (csvTagsColumn && record[csvTagsColumn] && importOptions.createTags) {
            // Split tags by common separators (comma, semicolon, pipe)
            const tagStrings = record[csvTagsColumn]
              .split(/[,;|]/)
              .map((tag) => tag.trim())
              .filter(Boolean);

            for (const tagName of tagStrings) {
              // Check if tag already processed
              if (!tagIdsMap.has(tagName.toLowerCase())) {
                const tagId = await getOrCreateTag(client, tagName);
                tagIdsMap.set(tagName.toLowerCase(), tagId);
              }
              recordTags.push(tagIdsMap.get(tagName.toLowerCase()));
            }
          }

          processedBatch.push({
            subscriberData,
            recordTags: [...new Set([...tagIdsMap.values(), ...recordTags])],
          });
        } catch (error) {
          results.errors.push(`Error processing record: ${error.message}`);
          results.skipped++;
        }
      }

      // Step 2: Find all existing subscribers in one query
      const emails = processedBatch.map((item) => item.subscriberData.email);
      const { rows: existingSubscribers } = await client.query(
        `SELECT id, email, metadata, name, date_of_birth FROM subscribers WHERE email = ANY($1)`,
        [emails]
      );

      // Create map for quick lookups
      const existingMap = new Map();
      existingSubscribers.forEach((sub) => existingMap.set(sub.email.toLowerCase(), sub));

      // Step 3: Prepare bulk operations
      const newSubscribers = [];
      const updateQueries = [];
      const tagAssignments = [];

      for (const item of processedBatch) {
        const email = item.subscriberData.email.toLowerCase();

        if (existingMap.has(email)) {
          const existing = existingMap.get(email);

          if (importOptions.updateExisting) {
            // Update existing subscriber with merged metadata
            const metadataToUpdate = {
              ...existing.metadata,
              ...item.subscriberData.metadata,
            };

            updateQueries.push({
              id: existing.id,
              name: item.subscriberData.name || existing.name,
              dateOfBirth: item.subscriberData.dateOfBirth || existing.date_of_birth,
              metadata: metadataToUpdate,
            });

            results.updated++;
          } else {
            results.skipped++;
          }

          // Add tag assignments for existing subscriber
          for (const tagId of item.recordTags) {
            tagAssignments.push([existing.id, tagId]);
          }
        } else {
          // Add new subscriber
          newSubscribers.push({
            ...item.subscriberData,
            recordTags: item.recordTags,
          });
        }
      }

      // Step 4: Execute bulk operations

      // Bulk insert new subscribers
      if (newSubscribers.length > 0) {
        const insertValues = [];
        const insertParams = [];
        let paramCounter = 1;

        newSubscribers.forEach((sub) => {
          insertValues.push(`($${paramCounter++}, $${paramCounter++}, $${paramCounter++}, $${paramCounter++})`);
          insertParams.push(sub.email, sub.name || null, sub.dateOfBirth || null, sub.metadata || {});
        });

        const insertQuery = `
          INSERT INTO subscribers (email, name, date_of_birth, metadata)
          VALUES ${insertValues.join(", ")}
          RETURNING id, email
        `;

        const { rows: insertedRows } = await client.query(insertQuery, insertParams);
        results.imported += insertedRows.length;

        // Add tag assignments for new subscribers
        for (let i = 0; i < insertedRows.length; i++) {
          const email = insertedRows[i].email.toLowerCase();
          const newSub = newSubscribers.find((s) => s.email.toLowerCase() === email);

          if (newSub && newSub.recordTags) {
            for (const tagId of newSub.recordTags) {
              tagAssignments.push([insertedRows[i].id, tagId]);
            }
          }
        }
      }

      // Process updates
      for (const update of updateQueries) {
        await client.query(
          `UPDATE subscribers 
           SET name = COALESCE($1, name), 
               date_of_birth = COALESCE($2, date_of_birth), 
               metadata = $3, 
               updated_at = NOW() 
           WHERE id = $4`,
          [update.name || null, update.dateOfBirth || null, update.metadata, update.id]
        );
      }

      // Bulk insert tag assignments if any
      if (tagAssignments.length > 0) {
        const tagValues = [];
        const tagParams = [];
        let tagParamCounter = 1;

        tagAssignments.forEach(([subId, tagId]) => {
          tagValues.push(`($${tagParamCounter++}, $${tagParamCounter++})`);
          tagParams.push(subId, tagId);
        });

        const tagQuery = `
          INSERT INTO subscriber_tags (subscriber_id, tag_id)
          VALUES ${tagValues.join(", ")}
          ON CONFLICT DO NOTHING
        `;

        await client.query(tagQuery, tagParams);
      }

      // Update processed record count
      results.processedRecords += batch.length;
    }

    await client.query("COMMIT");
    return results;
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Error importing subscribers:", error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Export subscribers to CSV format
 * @param {Object} filters - Filters for subscribers to export
 * @returns {Promise<string>} - CSV data
 */
async function exportSubscribers(filters = {}) {
  try {
    let query = "SELECT s.*, array_agg(t.name) as tags FROM subscribers s ";
    query += "LEFT JOIN subscriber_tags st ON s.id = st.subscriber_id ";
    query += "LEFT JOIN tags t ON st.tag_id = t.id WHERE 1=1 ";

    const params = [];
    let paramIndex = 1;

    // Apply filters
    if (filters.isActive !== undefined) {
      query += ` AND s.is_active = $${paramIndex++}`;
      params.push(filters.isActive);
    }

    if (filters.tagIds && filters.tagIds.length > 0) {
      query += ` AND s.id IN (
        SELECT subscriber_id FROM subscriber_tags 
        WHERE tag_id IN (${filters.tagIds.map((_, i) => `$${paramIndex + i}`).join(",")})
      )`;
      params.push(...filters.tagIds);
      paramIndex += filters.tagIds.length;
    }

    query += " GROUP BY s.id ORDER BY s.created_at DESC";

    const { rows } = await db.query(query, params);

    // Transform data for CSV
    const csvData = rows.map((row) => {
      const tags = row.tags && row.tags[0] ? row.tags.filter((t) => t !== null).join(",") : "";
      return {
        email: row.email,
        name: row.name || "",
        date_of_birth: row.date_of_birth ? new Date(row.date_of_birth).toISOString().split("T")[0] : "",
        is_active: row.is_active ? "Yes" : "No",
        subscribed_at: new Date(row.subscribed_at).toISOString().split("T")[0],
        tags: tags,
      };
    });

    // Generate CSV
    const csvString = stringify(csvData, { header: true });
    return csvString;
  } catch (error) {
    logger.error("Error exporting subscribers:", error);
    throw error;
  }
}

/**
 * Get subscribers with their tags
 * @param {Object} filters - Filters to apply
 * @param {number} page - Page number
 * @param {number} limit - Limit per page
 * @returns {Promise<Object>} - Subscribers with tags and pagination
 */
async function getSubscribersWithTags(filters = {}, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  let query = `
    SELECT s.*, array_agg(t.name) FILTER (WHERE t.name IS NOT NULL) as tags 
    FROM subscribers s
    LEFT JOIN subscriber_tags st ON s.id = st.subscriber_id
    LEFT JOIN tags t ON st.tag_id = t.id
    WHERE 1=1
  `;

  const params = [];
  let paramIndex = 1;

  // Apply filters
  if (filters.isActive !== undefined) {
    query += ` AND s.is_active = $${paramIndex++}`;
    params.push(filters.isActive);
  }

  if (filters.email) {
    query += ` AND s.email ILIKE $${paramIndex++}`;
    params.push(`%${filters.email}%`);
  }

  if (filters.tagIds && filters.tagIds.length > 0) {
    query += ` AND s.id IN (
      SELECT subscriber_id FROM subscriber_tags 
      WHERE tag_id IN (${filters.tagIds.map((_, i) => `$${paramIndex + i}`).join(",")})
    )`;
    params.push(...filters.tagIds);
    paramIndex += filters.tagIds.length;
  }

  // Add count query
  const countQuery =
    `
    SELECT COUNT(DISTINCT s.id) 
    FROM subscribers s
    LEFT JOIN subscriber_tags st ON s.id = st.subscriber_id
    LEFT JOIN tags t ON st.tag_id = t.id
    WHERE 1=1
  ` + query.substring(query.indexOf("WHERE 1=1") + 9);

  // Add group by and pagination
  query += ` GROUP BY s.id ORDER BY s.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  try {
    const { rows: countRows } = await db.query(countQuery, params.slice(0, -2));
    const total = parseInt(countRows[0].count);

    const { rows } = await db.query(query, params);

    return {
      subscribers: rows.map((row) => ({
        ...row,
        tags: row.tags || [],
      })),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error("Error fetching subscribers with tags:", error);
    throw error;
  }
}

/**
 * Helper function to validate email
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Extract subscriber data from CSV record
 * @param {Object} record - CSV record
 * @param {Array<string>} headers - CSV headers
 * @returns {Object} - Extracted subscriber data
 */
function extractSubscriberData(record, headers) {
  const subscriberData = {
    email: record.email,
    name: null,
    dateOfBirth: null,
    metadata: {},
  };

  // Handle name with multiple possible field names
  if (record.name) {
    subscriberData.name = record.name;
  } else if (record.full_name) {
    subscriberData.name = record.full_name;
  } else if (record.fullname) {
    subscriberData.name = record.fullname;
  } else if (record.first_name && record.last_name) {
    subscriberData.name = `${record.first_name} ${record.last_name}`.trim();
  } else if (record.firstname && record.lastname) {
    subscriberData.name = `${record.firstname} ${record.lastname}`.trim();
  }

  // Handle various date of birth formats
  const dobField = record.date_of_birth || record.dateOfBirth || record.dob || record.birthdate || record.birth_date || record.birthday;

  if (dobField) {
    try {
      subscriberData.dateOfBirth = new Date(dobField);
      // Check if date is valid
      if (isNaN(subscriberData.dateOfBirth.getTime())) {
        subscriberData.dateOfBirth = null;
        subscriberData.metadata.unparsed_date_of_birth = dobField;
      }
    } catch (e) {
      // If date parsing fails, store as string in metadata
      subscriberData.metadata.unparsed_date_of_birth = dobField;
    }
  }

  // Add any extra columns as metadata
  headers.forEach((key) => {
    // Skip standard fields and tags column
    const lowerKey = key.toLowerCase();
    if (
      ![
        "email",
        "name",
        "full_name",
        "fullname",
        "first_name",
        "last_name",
        "firstname",
        "lastname",
        "date_of_birth",
        "dateofbirth",
        "dob",
        "birthdate",
        "birth_date",
        "birthday",
        "tags",
        "tag",
        "categories",
      ].includes(lowerKey)
    ) {
      if (record[key] !== undefined && record[key] !== null && record[key] !== "") {
        // Try to parse JSON if the value looks like an object or array
        const value = record[key];
        if (
          typeof value === "string" &&
          ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]")))
        ) {
          try {
            subscriberData.metadata[key] = JSON.parse(value);
          } catch (e) {
            subscriberData.metadata[key] = value;
          }
        } else {
          subscriberData.metadata[key] = value;
        }
      }
    }
  });

  return subscriberData;
}

module.exports = {
  getAllSubscribers,
  getSubscriberById,
  getSubscriberByEmail,
  createSubscriber,
  updateSubscriber,
  deleteSubscriber,
  unsubscribeByEmail,
  importSubscribers,
  exportSubscribers,
  getSubscribersWithTags,
};
