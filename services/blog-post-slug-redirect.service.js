/**
 * @module services/blog-post-slug-redirect.service
 * @description Service for handling blog post slug redirects when slugs change
 */
const { query, transaction } = require("../config/db");
const logger = require("./logger.service");

/**
 * Add a slug redirect
 * @async
 * @function addSlugRedirect
 * @param {string} oldSlug - Old slug that should redirect
 * @param {string} newSlug - New slug to redirect to
 * @param {number} postId - Associated post ID
 * @returns {Promise<Object>} - Created redirect
 */
async function addSlugRedirect(oldSlug, newSlug, postId) {
  try {
    const result = await query(
      `INSERT INTO blog_post_slug_redirects (old_slug, new_slug, post_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (old_slug) DO UPDATE 
       SET new_slug = $2, post_id = $3, updated_at = NOW()
       RETURNING *`,
      [oldSlug, newSlug, postId]
    );

    return result.rows[0];
  } catch (error) {
    logger.error(`Failed to add slug redirect: ${error.message}`, {
      oldSlug,
      newSlug,
      postId,
      error: error.stack,
    });
    // Don't throw, we don't want to fail the main operation
    return null;
  }
}

/**
 * Find post ID by slug, checking redirects if needed
 * @async
 * @function findPostIdBySlug
 * @param {string} slug - Slug to find
 * @returns {Promise<Object>} - Post info with ID and possibly a redirect flag
 */
async function findPostIdBySlug(slug) {
  // First, try direct match
  const directResult = await query("SELECT id FROM blog_posts WHERE slug = $1 AND is_active = true", [slug]);

  if (directResult.rowCount > 0) {
    return {
      postId: directResult.rows[0].id,
      isRedirect: false,
    };
  }

  // If no direct match, look for a redirect
  const redirectResult = await query(
    `SELECT r.post_id, r.new_slug 
     FROM blog_post_slug_redirects r
     JOIN blog_posts p ON r.post_id = p.id
     WHERE r.old_slug = $1 AND p.is_active = true`,
    [slug]
  );

  if (redirectResult.rowCount > 0) {
    return {
      postId: redirectResult.rows[0].post_id,
      newSlug: redirectResult.rows[0].new_slug,
      isRedirect: true,
    };
  }

  return null;
}

module.exports = {
  addSlugRedirect,
  findPostIdBySlug,
};
