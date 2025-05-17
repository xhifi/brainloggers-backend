/**
 * @module services/tag.service
 * @description Service for managing tags
 */
const db = require("../config/db");
const logger = require("./logger.service");
const NotFound = require("../utils/errors/NotFound");
const ConfictResource = require("../utils/errors/ConfictResource");

/**
 * Get all tags
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} - List of tags
 */
async function getAllTags(filters = {}) {
  try {
    let query = "SELECT * FROM tags WHERE 1=1";
    const params = [];
    let paramIndex = 1;

    // Apply filters if provided
    if (filters.isActive !== undefined) {
      query += ` AND is_active = $${paramIndex++}`;
      params.push(filters.isActive);
    }

    if (filters.name) {
      query += ` AND name ILIKE $${paramIndex++}`;
      params.push(`%${filters.name}%`);
    }

    query += " ORDER BY name ASC";

    const { rows } = await db.query(query, params);
    return rows;
  } catch (error) {
    logger.error("Error fetching tags:", error);
    throw error;
  }
}

/**
 * Get a tag by ID
 * @param {number} id - Tag ID
 * @returns {Promise<Object>} - Tag data
 */
async function getTagById(id) {
  try {
    const { rows } = await db.query("SELECT * FROM tags WHERE id = $1", [id]);

    if (rows.length === 0) {
      throw new NotFound(`Tag with id ${id} not found`);
    }

    return rows[0];
  } catch (error) {
    logger.error(`Error fetching tag with id ${id}:`, error);
    throw error;
  }
}

/**
 * Create a new tag
 * @param {Object} tagData - Tag data
 * @param {string} createdBy - User ID who created the tag
 * @returns {Promise<Object>} - Created tag
 */
async function createTag(tagData, createdBy = null) {
  try {
    // Check if tag with same name already exists
    const { rows: existing } = await db.query("SELECT * FROM tags WHERE name = $1", [tagData.name]);

    if (existing.length > 0) {
      throw new ConfictResource(`Tag with name ${tagData.name} already exists`);
    }

    const { rows } = await db.query("INSERT INTO tags (name, description, color, created_by) VALUES ($1, $2, $3, $4) RETURNING *", [
      tagData.name,
      tagData.description || null,
      tagData.color || null,
      createdBy,
    ]);

    return rows[0];
  } catch (error) {
    logger.error("Error creating tag:", error);
    throw error;
  }
}

/**
 * Update a tag
 * @param {number} id - Tag ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} - Updated tag
 */
async function updateTag(id, updateData) {
  try {
    // Check if tag exists
    await getTagById(id);

    // Build update query
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (updateData.name) {
      // Check if new name conflicts with existing tag
      const { rows: existing } = await db.query("SELECT * FROM tags WHERE name = $1 AND id != $2", [updateData.name, id]);

      if (existing.length > 0) {
        throw new ConfictResource(`Tag with name ${updateData.name} already exists`);
      }

      updateFields.push(`name = $${paramIndex++}`);
      values.push(updateData.name);
    }

    if (updateData.description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      values.push(updateData.description);
    }

    if (updateData.color !== undefined) {
      updateFields.push(`color = $${paramIndex++}`);
      values.push(updateData.color);
    }

    if (updateData.isActive !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      values.push(updateData.isActive);
    }

    // Nothing to update
    if (updateFields.length === 0) {
      return getTagById(id);
    }

    updateFields.push(`updated_at = NOW()`);

    // Add tag ID as the last parameter
    values.push(id);

    const query = `
      UPDATE tags
      SET ${updateFields.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const { rows } = await db.query(query, values);
    return rows[0];
  } catch (error) {
    logger.error(`Error updating tag ${id}:`, error);
    throw error;
  }
}

/**
 * Delete a tag
 * @param {number} id - Tag ID
 * @returns {Promise<boolean>} - Success indicator
 */
async function deleteTag(id) {
  try {
    // Check if tag exists
    await getTagById(id);

    // Delete tag
    const result = await db.query("DELETE FROM tags WHERE id = $1", [id]);
    return result.rowCount > 0;
  } catch (error) {
    logger.error(`Error deleting tag ${id}:`, error);
    throw error;
  }
}

/**
 * Get tags for a subscriber
 * @param {number} subscriberId - Subscriber ID
 * @returns {Promise<Array>} - List of tags
 */
async function getTagsForSubscriber(subscriberId) {
  try {
    const query = `
      SELECT t.*
      FROM tags t
      JOIN subscriber_tags st ON t.id = st.tag_id
      WHERE st.subscriber_id = $1
      ORDER BY t.name ASC
    `;

    const { rows } = await db.query(query, [subscriberId]);
    return rows;
  } catch (error) {
    logger.error(`Error fetching tags for subscriber ${subscriberId}:`, error);
    throw error;
  }
}

/**
 * Assign tags to a subscriber
 * @param {number} subscriberId - Subscriber ID
 * @param {Array<number>} tagIds - Tag IDs to assign
 * @param {string} createdBy - User ID who assigned the tags
 * @returns {Promise<boolean>} - Success indicator
 */
async function assignTagsToSubscriber(subscriberId, tagIds, createdBy = null) {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Insert each tag, ignoring duplicates
    for (const tagId of tagIds) {
      // Verify tag exists
      const { rows } = await client.query("SELECT id FROM tags WHERE id = $1", [tagId]);
      if (rows.length === 0) {
        throw new NotFound(`Tag with id ${tagId} not found`);
      }

      // Assign tag to subscriber
      await client.query("INSERT INTO subscriber_tags (subscriber_id, tag_id, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING", [
        subscriberId,
        tagId,
        createdBy,
      ]);
    }

    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error(`Error assigning tags to subscriber ${subscriberId}:`, error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Remove tags from a subscriber
 * @param {number} subscriberId - Subscriber ID
 * @param {Array<number>} tagIds - Tag IDs to remove
 * @returns {Promise<boolean>} - Success indicator
 */
async function removeTagsFromSubscriber(subscriberId, tagIds) {
  try {
    // Remove specified tags from subscriber
    const placeholders = tagIds.map((_, index) => `$${index + 2}`).join(",");
    const query = `DELETE FROM subscriber_tags WHERE subscriber_id = $1 AND tag_id IN (${placeholders})`;

    await db.query(query, [subscriberId, ...tagIds]);
    return true;
  } catch (error) {
    logger.error(`Error removing tags from subscriber ${subscriberId}:`, error);
    throw error;
  }
}

/**
 * Get subscribers with a specific tag
 * @param {number} tagId - Tag ID
 * @param {number} page - Page number
 * @param {number} limit - Limit per page
 * @returns {Promise<Object>} - Subscribers with pagination
 */
async function getSubscribersByTag(tagId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;

  try {
    // Verify tag exists
    await getTagById(tagId);

    // Get subscribers with this tag
    const query = `
      SELECT s.*
      FROM subscribers s
      JOIN subscriber_tags st ON s.id = st.subscriber_id
      WHERE st.tag_id = $1
      ORDER BY s.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) 
      FROM subscribers s
      JOIN subscriber_tags st ON s.id = st.subscriber_id
      WHERE st.tag_id = $1
    `;

    const { rows: countRows } = await db.query(countQuery, [tagId]);
    const total = parseInt(countRows[0].count);

    const { rows } = await db.query(query, [tagId, limit, offset]);

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
    logger.error(`Error fetching subscribers with tag ${tagId}:`, error);
    throw error;
  }
}

module.exports = {
  getAllTags,
  getTagById,
  createTag,
  updateTag,
  deleteTag,
  getTagsForSubscriber,
  assignTagsToSubscriber,
  removeTagsFromSubscriber,
  getSubscribersByTag,
};
