/**
 * @module services/blog-post-update
 * @description Alternative implementation for blog post updating
 */
const { query, transaction } = require("../config/db");
const s3Service = require("./s3.service");
const slugRedirectService = require("./blog-post-slug-redirect.service");
const slugify = require("../utils/slugify");
const { NotFoundError, BadRequestError, ForbiddenError } = require("../utils/errors");
const ConflictResourceError = require("../utils/errors/ConfictResource");
const logger = require("./logger.service");
const { getBlogPostById } = require("./blog-post.service");

/**
 * Update an existing blog post
 * @async
 * @function updateBlogPost
 * @param {number} postId - ID of the post to update
 * @param {Object} updateData - Data to update
 * @param {number} userId - ID of the user updating the post
 * @returns {Promise<Object>} Updated blog post
 * @throws {NotFoundError} If post not found
 * @throws {ConflictResourceError} If title or slug already exists
 */
async function updateBlogPost(postId, updateData, userId) {
  const { title, description, content, layout, authorIds, tagIds } = updateData;

  // Check if post exists and get current data
  const postCheck = await query("SELECT * FROM blog_posts WHERE id = $1 AND is_active = true", [postId]);
  if (postCheck.rowCount === 0) {
    throw new NotFoundError("Blog post not found");
  }

  const originalPost = postCheck.rows[0];
  const oldSlug = originalPost.slug;

  // If title is being updated, check for conflicts
  if (title && title !== originalPost.title) {
    const newSlug = slugify(title);

    // Check if any post with this title or slug exists (excluding current post)
    const titleCheckResult = await query(
      "SELECT id FROM blog_posts WHERE (LOWER(title) = LOWER($1) OR slug = $2) AND id != $3 AND is_active = true",
      [title, newSlug, postId]
    );

    // If any post exists with the same title or slug, throw a conflict error
    if (titleCheckResult.rowCount > 0) {
      throw new ConflictResourceError(`A blog post with this title or slug already exists`);
    }
  }

  // Validate that all tagIds exist before using them
  if (tagIds && tagIds.length > 0) {
    const tagCheckResult = await query(`SELECT id FROM tags WHERE id IN (${tagIds.map((_, i) => `$${i + 1}`).join(",")})`, tagIds);

    if (tagCheckResult.rowCount !== tagIds.length) {
      throw new BadRequestError("Some of the provided tag IDs do not exist in the database");
    }
  }

  // Start transaction
  return await transaction(async (client) => {
    let updateFields = [];
    let updateValues = [];
    let valueCounter = 1;

    // Calculate new slug if title changes
    let newSlug = oldSlug;

    if (title) {
      updateFields.push(`title = $${valueCounter}`);
      updateValues.push(title);
      valueCounter++;

      // Update slug based on new title
      newSlug = slugify(title);

      // Update slug in database
      updateFields.push(`slug = $${valueCounter}`);
      updateValues.push(newSlug);
      valueCounter++;

      logger.info(`Updating post ${postId} slug from '${oldSlug}' to '${newSlug}'`);
    }

    if (description !== undefined) {
      updateFields.push(`description = $${valueCounter}`);
      updateValues.push(description);
      valueCounter++;
    }

    if (layout) {
      updateFields.push(`layout = $${valueCounter}`);
      updateValues.push(layout);
      valueCounter++;
    }

    // Always update the updated_at timestamp
    updateFields.push("updated_at = NOW()");

    // Update the blog post with all collected field changes
    if (updateFields.length > 0) {
      await client.query(`UPDATE blog_posts SET ${updateFields.join(", ")} WHERE id = $${valueCounter} AND is_active = true`, [
        ...updateValues,
        postId,
      ]);
    }

    // If the title changed, update the content key and manage S3 folder change
    if (newSlug !== oldSlug) {
      // Define the S3 paths
      const oldFolderPath = `app_data/blog/posts/${oldSlug}`;
      const newFolderPath = `app_data/blog/posts/${newSlug}`;
      const newS3Key = `${newFolderPath}/src.md`;

      // Update content_key in database to match new location
      await client.query("UPDATE blog_posts SET content_key = $1 WHERE id = $2", [newS3Key, postId]);

      // Handle S3 content migration
      try {
        if (content) {
          // If we have new content, directly upload it to the new location
          const contentBuffer = Buffer.from(content);
          const fileData = {
            buffer: contentBuffer,
            originalname: "src.md",
            mimetype: "text/markdown",
            size: contentBuffer.length,
          };

          // Upload to the new location
          await s3Service.uploadFile(fileData, newFolderPath, false);
        } else {
          // If no new content, copy from old location to new
          const oldS3Key = `${oldFolderPath}/src.md`;

          // Get the old content
          const oldFileData = await s3Service.getFile(oldS3Key);

          if (oldFileData && oldFileData.content) {
            // Create file data object for uploadFile
            const fileData = {
              buffer: oldFileData.content,
              originalname: "src.md",
              mimetype: "text/markdown",
              size: oldFileData.contentLength || oldFileData.content.length,
            };

            // Upload to the new location
            await s3Service.uploadFile(fileData, newFolderPath, false);
          } else {
            logger.warn(`Could not find content at ${oldS3Key} when updating post ${postId}`);

            // Create empty content if original not found
            const emptyFileData = {
              buffer: Buffer.from(""),
              originalname: "src.md",
              mimetype: "text/markdown",
              size: 0,
            };

            await s3Service.uploadFile(emptyFileData, newFolderPath, false);
          }
        }

        // Delete the old folder and all its contents
        await s3Service.deleteFolder(oldFolderPath);

        // Create a redirect from the old slug to the new slug
        await slugRedirectService.addSlugRedirect(oldSlug, newSlug, postId);
        logger.info(`Content moved from ${oldFolderPath} to ${newFolderPath} and redirect created`);
      } catch (error) {
        logger.error(`Error handling S3 content during blog post update: ${error.message}`, {
          postId,
          oldSlug,
          newSlug,
          error: error.stack,
        });
        // Don't throw error - we should be able to recover from S3 issues
      }
    } else if (content) {
      // If only content changed (no slug change), update existing file
      try {
        const folderPath = `app_data/blog/posts/${newSlug}`;
        const fileKey = `${folderPath}/src.md`;

        const contentBuffer = Buffer.from(content);
        const fileData = {
          buffer: contentBuffer,
          originalname: "src.md",
          mimetype: "text/markdown",
          size: contentBuffer.length,
        };

        const fileExists = await s3Service.fileExists(fileKey);

        if (fileExists) {
          // If file exists, update it
          await s3Service.updateFile(fileKey, fileData, false);
        } else {
          // If new file, upload it
          await s3Service.uploadFile(fileData, folderPath, false);
        }
      } catch (error) {
        logger.error(`Error updating content in S3: ${error.message}`, {
          postId,
          slug: newSlug,
          error: error.stack,
        });
        // Don't throw error - we should still return the updated post
      }
    }

    // Update authors if provided
    if (authorIds && Array.isArray(authorIds)) {
      // First, delete existing authors
      await client.query("DELETE FROM blog_post_authors WHERE post_id = $1", [postId]);

      // Make sure the current user is in the authors list
      const finalAuthorIds = [...new Set([...authorIds, userId])];

      // Then insert new authors
      if (finalAuthorIds.length > 0) {
        const authorValues = finalAuthorIds
          .map((authorId, index) => {
            return `($1, $${index + 2}, 'editor')`;
          })
          .join(", ");

        await client.query(`INSERT INTO blog_post_authors (post_id, user_id, contribution_type) VALUES ${authorValues}`, [
          postId,
          ...finalAuthorIds,
        ]);
      }
    }

    // Update tags if provided
    if (tagIds && Array.isArray(tagIds)) {
      // First, delete existing tags
      await client.query("DELETE FROM blog_post_tags WHERE post_id = $1", [postId]);

      // Then insert new tags
      if (tagIds.length > 0) {
        const tagValues = tagIds
          .map((tagId, index) => {
            return `($1, $${index + 2})`;
          })
          .join(", ");

        await client.query(`INSERT INTO blog_post_tags (post_id, tag_id) VALUES ${tagValues}`, [postId, ...tagIds]);
      }
    }

    // Return the updated post
    const updatedPost = await getBlogPostById(postId);
    return updatedPost;
  });
}

module.exports = updateBlogPost;
