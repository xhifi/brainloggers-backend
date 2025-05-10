const db = require("../config/db");
const { NotFound } = require("../utils/errors");

class TagService {
  /**
   * Create a new tag
   * @param {Object} tagData - Tag data object
   * @returns {Promise<Object>} Created tag
   */
  async createTag(tagData) {
    const result = await db.query(
      `INSERT INTO tags(name, description) 
       VALUES($1, $2) 
       RETURNING *`,
      [tagData.name, tagData.description]
    );

    return result.rows[0];
  }

  /**
   * Get all tags
   * @returns {Promise<Array>} List of all tags
   */
  async getAllTags() {
    const result = await db.query("SELECT * FROM tags ORDER BY name");
    return result.rows;
  }

  /**
   * Get tag by ID
   * @param {number} tagId - Tag ID
   * @returns {Promise<Object>} Tag object
   */
  async getTagById(tagId) {
    const result = await db.query("SELECT * FROM tags WHERE id = $1", [tagId]);

    if (result.rows.length === 0) {
      throw new NotFound(`Tag with ID ${tagId} not found`);
    }

    return result.rows[0];
  }

  /**
   * Update tag
   * @param {number} tagId - Tag ID to update
   * @param {Object} tagData - Updated tag data
   * @returns {Promise<Object>} Updated tag
   */
  async updateTag(tagId, tagData) {
    // First check if tag exists
    await this.getTagById(tagId);

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (tagData.name !== undefined) {
      fields.push(`name = $${paramIndex}`);
      values.push(tagData.name);
      paramIndex++;
    }

    if (tagData.description !== undefined) {
      fields.push(`description = $${paramIndex}`);
      values.push(tagData.description);
      paramIndex++;
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await db.query(
      `UPDATE tags 
       SET ${fields.join(", ")} 
       WHERE id = $${paramIndex} 
       RETURNING *`,
      [...values, tagId]
    );

    return result.rows[0];
  }

  /**
   * Delete tag by ID
   * @param {number} tagId - Tag ID to delete
   * @returns {Promise<void>}
   */
  async deleteTag(tagId) {
    // First check if tag exists
    await this.getTagById(tagId);

    const result = await db.query("DELETE FROM tags WHERE id = $1 RETURNING id", [tagId]);
    return result.rows[0];
  }

  /**
   * Assign tag to subscribers
   * @param {number} tagId - Tag ID
   * @param {Array<number>} subscriberIds - Array of subscriber IDs
   * @returns {Promise<Object>} Number of subscribers tagged
   */
  async assignTagToSubscribers(tagId, subscriberIds) {
    // First check if tag exists
    await this.getTagById(tagId);

    // Create values for bulk insert
    const values = subscriberIds.map((id) => `(${id}, ${tagId})`).join(", ");

    if (!values.length) {
      return { count: 0 };
    }

    const result = await db.query(`
      INSERT INTO subscriber_tags (subscriber_id, tag_id)
      VALUES ${values}
      ON CONFLICT (subscriber_id, tag_id) DO NOTHING
      RETURNING subscriber_id
    `);

    return { count: result.rows.length };
  }

  /**
   * Remove tag from subscribers
   * @param {number} tagId - Tag ID
   * @param {Array<number>} subscriberIds - Array of subscriber IDs
   * @returns {Promise<Object>} Number of untagged subscribers
   */
  async removeTagFromSubscribers(tagId, subscriberIds) {
    // First check if tag exists
    await this.getTagById(tagId);

    if (!subscriberIds.length) {
      return { count: 0 };
    }

    const subscriberIdPlaceholders = subscriberIds.map((_, idx) => `$${idx + 2}`).join(", ");

    const result = await db.query(
      `
      DELETE FROM subscriber_tags
      WHERE tag_id = $1 AND subscriber_id IN (${subscriberIdPlaceholders})
      RETURNING subscriber_id
    `,
      [tagId, ...subscriberIds]
    );

    return { count: result.rows.length };
  }

  /**
   * Get subscribers by tag ID
   * @param {number} tagId - Tag ID
   * @returns {Promise<Array>} List of subscribers with this tag
   */
  async getSubscribersByTag(tagId) {
    // First check if tag exists
    await this.getTagById(tagId);

    const result = await db.query(
      `
      SELECT s.* FROM subscribers s
      JOIN subscriber_tags st ON s.id = st.subscriber_id
      WHERE st.tag_id = $1
    `,
      [tagId]
    );

    return result.rows;
  }

  /**
   * Get tags for a subscriber
   * @param {number} subscriberId - Subscriber ID
   * @returns {Promise<Array>} List of tags for this subscriber
   */
  async getTagsBySubscriber(subscriberId) {
    // First check if subscriber exists
    const checkSubscriber = await db.query("SELECT id FROM subscribers WHERE id = $1", [subscriberId]);

    if (checkSubscriber.rows.length === 0) {
      throw new NotFound(`Subscriber with ID ${subscriberId} not found`);
    }

    const result = await db.query(
      `
      SELECT t.* FROM tags t
      JOIN subscriber_tags st ON t.id = st.tag_id
      WHERE st.subscriber_id = $1
      ORDER BY t.name
    `,
      [subscriberId]
    );

    return result.rows;
  }
}

module.exports = new TagService();
