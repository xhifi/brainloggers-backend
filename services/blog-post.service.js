/**
 * @module services/blog-post.service
 * @description Service for blog post management
 */
const { query, transaction } = require("../config/db");
const s3Service = require("./s3.service");
const slugRedirectService = require("./blog-post-slug-redirect.service");
const slugify = require("../utils/slugify");
const { NotFoundError, BadRequestError, ForbiddenError } = require("../utils/errors");
const ConflictResourceError = require("../utils/errors/ConfictResource");
const logger = require("./logger.service");

/**
 * Create a new blog post draft
 * @async
 * @function createBlogPost
 * @param {Object} postData - The blog post data
 * @param {string} postData.title - Post title
 * @param {string} postData.description - Post description/excerpt
 * @param {string} postData.content - Post markdown content
 * @param {string} postData.layout - Post layout template
 * @param {number[]} postData.authorIds - IDs of users who authored the post
 * @param {number[]} postData.tagIds - IDs of tags to associate with the post
 * @param {number} userId - ID of the user creating the post (will be added as author if not in authorIds)
 * @returns {Promise<Object>} Created blog post
 * @throws {ConflictResourceError} If title or slug already exists
 */
async function createBlogPost(postData, userId) {
  try {
    const { title, description, content, layout = "default", authorIds = [], tagIds = [] } = postData;
    // Create slug from title
    const baseSlug = slugify(title);

    // Check if the title already exists (case insensitive)
    const titleExists = await checkTitleExists(title);
    if (titleExists) {
      throw new ConflictResourceError(`A blog post with the title "${title}" already exists`);
    }

    // Check if the slug already exists
    const slugExists = await checkSlugExists(baseSlug);
    if (slugExists) {
      throw new ConflictResourceError(`A blog post with the slug "${baseSlug}" already exists`);
    }

    // If we reach here, both title and slug are unique
    const slug = baseSlug;

    // Validate that all tagIds exist before using them
    if (tagIds.length > 0) {
      const tagCheckResult = await query(`SELECT id FROM tags WHERE id IN (${tagIds.map((_, i) => `$${i + 1}`).join(",")})`, tagIds);

      if (tagCheckResult.rowCount !== tagIds.length) {
        throw new BadRequestError("Some of the provided tag IDs do not exist in the database");
      }
    }

    const result = await transaction(async (client) => {
      // Insert the blog post
      const postResult = await client.query(
        `INSERT INTO blog_posts (title, slug, description, content_key, layout, status) 
         VALUES ($1, $2, $3, $4, $5, 'draft') 
         RETURNING id, title, slug, description, content_key, layout, status, created_at, updated_at`,
        [title, slug, description, "", layout]
      );
      const post = postResult.rows[0]; // Upload content to S3 using slug for better readability
      const s3Key = `app_data/blog/posts/${slug}/src.md`;

      // Create a buffer from the content string
      const contentBuffer = Buffer.from(content);

      // Create file data object for s3Service.uploadFile
      const fileData = {
        buffer: contentBuffer,
        originalname: "src.md",
        mimetype: "text/markdown",
        size: contentBuffer.length,
      };

      // Upload the file with metadata
      await s3Service.uploadFile(fileData, `app_data/blog/posts/${slug}`, false);

      // Update the content key
      await client.query("UPDATE blog_posts SET content_key = $1 WHERE id = $2", [s3Key, post.id]);
      post.content_key = s3Key;

      // Make sure the creator is in the authors list
      const finalAuthorIds = [...new Set([...authorIds, userId])];

      // Add authors
      if (finalAuthorIds.length > 0) {
        const authorValues = finalAuthorIds
          .map((authorId, index) => {
            return `($1, $${index + 2}, 'editor')`;
          })
          .join(", ");

        await client.query(`INSERT INTO blog_post_authors (post_id, user_id, contribution_type) VALUES ${authorValues}`, [
          post.id,
          ...finalAuthorIds,
        ]);
      }

      // Add tags
      if (tagIds.length > 0) {
        const tagValues = tagIds
          .map((tagId, index) => {
            return `($1, $${index + 2})`;
          })
          .join(", ");

        await client.query(`INSERT INTO blog_post_tags (post_id, tag_id) VALUES ${tagValues}`, [post.id, ...tagIds]);
      }

      return post;
    });

    return await getBlogPostById(result.id);
  } catch (error) {
    // Re-throw known errors
    if (error instanceof ConflictResourceError || error instanceof BadRequestError) {
      throw error;
    }

    // Log other errors
    logger.error(`Error creating blog post: ${error.message}`, { error: error.stack });
    throw new Error(`Failed to create blog post: ${error.message}`);
  }
}

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
  try {
    const { title, description, content, layout, authorIds, tagIds } = updateData;

    // Check if post exists and get current data
    const postCheck = await query("SELECT * FROM blog_posts WHERE id = $1 AND is_active = true", [postId]);
    if (postCheck.rowCount === 0) {
      throw new NotFoundError("Blog post not found");
    }

    const originalPost = postCheck.rows[0];
    const oldSlug = originalPost.slug;
    // If title is being updated, check for conflicts
    let newSlug = oldSlug;
    if (title && title !== originalPost.title) {
      const baseSlug = slugify(title);

      // Use a transaction to validate both slug and title constraints
      // before making any changes to ensure consistency
      const validationRes = await transaction(async (client) => {
        // Check if the slug already exists in any other post (case insensitive)
        const slugCheckResult = await client.query("SELECT id FROM blog_posts WHERE slug = $1 AND id != $2 AND is_active = true", [
          baseSlug,
          postId,
        ]);

        if (slugCheckResult.rowCount > 0) {
          throw new ConflictResourceError(`A blog post with the slug "${baseSlug}" already exists`);
        }

        // Check if the title exists (case insensitive)
        const titleCheckResult = await client.query(
          "SELECT id FROM blog_posts WHERE LOWER(title) = LOWER($1) AND id != $2 AND is_active = true",
          [title, postId]
        );

        if (titleCheckResult.rowCount > 0) {
          throw new ConflictResourceError(`A blog post with the title "${title}" already exists`);
        }

        // Return the validated slug
        return baseSlug;
      });

      // If validation transaction completed successfully, use the validated slug
      newSlug = validationRes;
    }

    // Validate that all tagIds exist before using them
    if (tagIds && tagIds.length > 0) {
      const tagCheckResult = await query(`SELECT id FROM tags WHERE id IN (${tagIds.map((_, i) => `$${i + 1}`).join(",")})`, tagIds);

      if (tagCheckResult.rowCount !== tagIds.length) {
        throw new BadRequestError("Some of the provided tag IDs do not exist in the database");
      }
    }
    // Explicitly start transaction for blog post update
    return await transaction(async (client) => {
      try {
        let updateFields = [];
        let updateValues = [];
        let valueCounter = 1;

        // Build dynamic update query for post fields
        if (title) {
          updateFields.push(`title = $${valueCounter}`);
          updateValues.push(title);
          valueCounter++;

          // Update slug based on new title
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

        // Update the blog post if we have fields to update
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
      } catch (error) {
        // Re-throw conflict errors for proper client-side handling
        if (error instanceof ConflictResourceError) {
          throw error;
        }
        // Log and re-throw transaction errors
        logger.error(`Transaction error in updateBlogPost: ${error.message}`, {
          postId,
          error: error.stack,
        });
        throw error;
      }
    });
  } catch (error) {
    // Re-throw known errors
    if (error instanceof NotFoundError || error instanceof ConflictResourceError || error instanceof BadRequestError) {
      throw error;
    }

    // Log other errors
    logger.error(`Error updating blog post: ${error.message}`, { postId, userId, error: error.stack });
    throw new Error(`Failed to update blog post: ${error.message}`);
  }
}

/**
 * Publish a blog post
 * @async
 * @function publishBlogPost
 * @param {number} postId - ID of post to publish
 * @param {Date} publishedAt - Publication date (defaults to now)
 * @returns {Promise<Object>} Published blog post
 * @throws {NotFoundError} If post not found
 * @throws {BadRequestError} If post is already published
 */
async function publishBlogPost(postId, publishedAt = new Date()) {
  // Check if post exists
  const postCheck = await query("SELECT * FROM blog_posts WHERE id = $1 AND is_active = true", [postId]);

  if (postCheck.rowCount === 0) {
    throw new NotFoundError("Blog post not found");
  }

  const post = postCheck.rows[0];

  // If already published, throw error
  if (post.status === "published") {
    throw new BadRequestError("Blog post is already published");
  }

  // Update post status to published
  const result = await query(
    "UPDATE blog_posts SET status = 'published', published_at = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
    [publishedAt, postId]
  );

  return await getBlogPostById(postId);
}

/**
 * Get a blog post by ID with authors, tags, and content
 * @async
 * @function getBlogPostById
 * @param {number} postId - ID of the post to retrieve
 * @param {boolean} includeContent - Whether to include the markdown content
 * @returns {Promise<Object>} Blog post with all related data
 * @throws {NotFoundError} If post not found
 */
async function getBlogPostById(postId, includeContent = false) {
  // Get post
  const postResult = await query(
    `SELECT p.*, 
     (SELECT COUNT(*) FROM blog_comments WHERE post_id = p.id AND is_active = true) as comment_count
     FROM blog_posts p 
     WHERE p.id = $1 AND p.is_active = true`,
    [postId]
  );

  if (postResult.rowCount === 0) {
    throw new NotFoundError("Blog post not found");
  }

  const post = postResult.rows[0];

  // Get authors
  const authorsResult = await query(
    `SELECT u.id, u.full_name AS name, u.email, bpa.contribution_type
     FROM blog_post_authors bpa
     JOIN users u ON bpa.user_id = u.id
     WHERE bpa.post_id = $1`,
    [postId]
  );

  post.authors = authorsResult.rows;

  // Get tags
  const tagsResult = await query(
    `SELECT t.id, t.name
     FROM blog_post_tags bpt
     JOIN tags t ON bpt.tag_id = t.id
     WHERE bpt.post_id = $1`,
    [postId]
  );

  post.tags = tagsResult.rows;
  // Get content if requested
  if (includeContent && post.content_key) {
    try {
      // Set a timeout for fetching the content
      const contentTimeout = 5000; // 5 seconds
      const contentPromise = s3Service.getFile(post.content_key);

      const fileData = await Promise.race([
        contentPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("S3 content retrieval timed out")), contentTimeout)),
      ]);

      post.content = fileData.content.toString();
    } catch (error) {
      logger.error(`Failed to get blog post content from S3: ${error.message}`, { postId, contentKey: post.content_key });
      post.content = "";
    }
  }

  return post;
}

/**
 * Get a blog post by slug
 * @async
 * @function getBlogPostBySlug
 * @param {string} slug - Slug of the post to retrieve
 * @param {boolean} includeContent - Whether to include the markdown content
 * @returns {Promise<Object>} Blog post with all related data
 * @throws {NotFoundError} If post not found
 */
async function getBlogPostBySlug(slug, includeContent = false) {
  // Try to find post by slug, including redirect lookup
  const slugLookup = await slugRedirectService.findPostIdBySlug(slug);

  if (!slugLookup) {
    throw new NotFoundError("Blog post not found");
  }

  const post = await getBlogPostById(slugLookup.postId, includeContent);

  // If this was a redirect, add info to the response
  if (slugLookup.isRedirect) {
    post.redirected = true;
    post.originalSlug = slug;
    post.currentSlug = slugLookup.newSlug;
  }

  return post;
}

/**
 * List blog posts with pagination and filtering options
 * @async
 * @function listBlogPosts
 * @param {Object} options - List options
 * @param {number} [options.page=1] - Page number
 * @param {number} [options.limit=10] - Posts per page
 * @param {string} [options.status] - Filter by post status
 * @param {string} [options.sortBy="created_at"] - Field to sort by
 * @param {string} [options.sortOrder="desc"] - Sort direction
 * @param {string} [options.tag] - Filter by tag
 * @param {string} [options.authorId] - Filter by author UUID
 * @returns {Promise<Object>} Paginated posts with total count
 */
async function listBlogPosts(options = {}) {
  const { page = 1, limit = 10, status, sortBy = "created_at", sortOrder = "desc", tag, authorId } = options;

  const offset = (page - 1) * limit;
  let params = [limit, offset];
  let paramCounter = 3;

  let whereConditions = ["p.is_active = true"];
  let joins = [];

  // Add status filter if provided
  if (status) {
    whereConditions.push(`p.status = $${paramCounter}`);
    params.push(status);
    paramCounter++;
  }

  // Add tag filter if provided
  if (tag) {
    joins.push(`JOIN blog_post_tags bpt ON p.id = bpt.post_id 
               JOIN tags t ON bpt.tag_id = t.id AND t.name = $${paramCounter}`);
    params.push(tag);
    paramCounter++;
  }

  // Add author filter if provided
  if (authorId) {
    joins.push(`JOIN blog_post_authors bpa ON p.id = bpa.post_id AND bpa.user_id = $${paramCounter}`);
    params.push(authorId);
    paramCounter++;
  }

  const joinClause = joins.length > 0 ? joins.join(" ") : "";
  const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : "";

  // Get posts
  const postsResult = await query(
    `SELECT DISTINCT p.id, p.title, p.slug, p.description, p.layout, p.status, 
     p.published_at, p.created_at, p.updated_at,
     (SELECT COUNT(*) FROM blog_comments c WHERE c.post_id = p.id AND c.is_active = true) as comment_count
     FROM blog_posts p
     ${joinClause}
     ${whereClause}
     ORDER BY p.${sortBy} ${sortOrder} 
     LIMIT $1 OFFSET $2`,
    params
  );

  // Get total count for pagination
  const countResult = await query(
    `SELECT COUNT(DISTINCT p.id) as total
     FROM blog_posts p
     ${joinClause}
     ${whereClause}`,
    params.slice(2) // Remove limit and offset
  );

  const posts = postsResult.rows;
  const total = parseInt(countResult.rows[0].total);

  // Get authors and tags for each post
  for (let post of posts) {
    // Get authors
    const authorsResult = await query(
      `SELECT u.id, u.full_name AS name, u.email, bpa.contribution_type
       FROM blog_post_authors bpa
       JOIN users u ON bpa.user_id = u.id
       WHERE bpa.post_id = $1`,
      [post.id]
    );

    post.authors = authorsResult.rows;

    // Get tags
    const tagsResult = await query(
      `SELECT t.id, t.name
       FROM blog_post_tags bpt
       JOIN tags t ON bpt.tag_id = t.id
       WHERE bpt.post_id = $1`,
      [post.id]
    );

    post.tags = tagsResult.rows;
  }

  return {
    posts,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + posts.length < total,
    },
  };
}

/**
 * Delete a blog post (soft delete)
 * @async
 * @function deleteBlogPost
 * @param {number} postId - ID of post to delete
 * @returns {Promise<Object>} Result of the operation
 * @throws {NotFoundError} If post not found
 */
async function deleteBlogPost(postId) {
  // Ensure postId is an integer
  const postIdInt = parseInt(postId, 10);

  if (isNaN(postIdInt)) {
    throw new BadRequestError("Invalid post ID: must be a number");
  }

  // Check if post exists
  const postCheck = await query("SELECT id FROM blog_posts WHERE id = $1 AND is_active = true", [postIdInt]);

  if (postCheck.rowCount === 0) {
    throw new NotFoundError("Blog post not found");
  }

  // Soft delete
  await query("UPDATE blog_posts SET is_active = false, updated_at = NOW() WHERE id = $1", [postIdInt]);

  return { message: "Blog post deleted successfully" };
}

/**
 * Add a comment to a blog post
 * @async
 * @function addComment
 * @param {number} postId - ID of the post to comment on
 * @param {Object} commentData - Comment data
 * @param {string} commentData.content - Comment content
 * @param {number} [commentData.parentId] - ID of parent comment
 * @param {number} userId - ID of the user adding the comment
 * @returns {Promise<Object>} Added comment
 * @throws {NotFoundError} If post not found
 * @throws {BadRequestError} If parent comment not found
 */
async function addComment(postId, commentData, userId) {
  const { content, parentId } = commentData;

  // Check if post exists
  const postCheck = await query("SELECT id FROM blog_posts WHERE id = $1 AND is_active = true", [postId]);

  if (postCheck.rowCount === 0) {
    throw new NotFoundError("Blog post not found");
  }

  // Check if parent comment exists if provided
  if (parentId) {
    const parentCheck = await query("SELECT id FROM blog_comments WHERE id = $1 AND post_id = $2 AND is_active = true", [parentId, postId]);

    if (parentCheck.rowCount === 0) {
      throw new BadRequestError("Parent comment not found");
    }
  }

  // Check if user is an admin to auto-approve comment
  const userRolesResult = await query(
    "SELECT r.name FROM users u JOIN user_roles ur ON u.id = ur.user_id JOIN roles r ON ur.role_id = r.id WHERE u.id = $1",
    [userId]
  );

  const userRoles = userRolesResult.rows.map((row) => row.name);
  const isAdmin = userRoles.includes("admin");

  // Insert the comment
  const result = await query(
    `INSERT INTO blog_comments 
     (post_id, user_id, parent_id, content, is_approved) 
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [postId, userId, parentId || null, content, isAdmin]
  );

  // Get user info for the comment
  const userResult = await query("SELECT id, full_name AS name, email FROM users WHERE id = $1", [userId]);

  const comment = result.rows[0];
  comment.user = userResult.rows[0];

  return comment;
}

/**
 * Get comments for a blog post
 * @async
 * @function getPostComments
 * @param {number} postId - ID of the post
 * @param {boolean} showUnapproved - Whether to include unapproved comments
 * @param {boolean} isAdmin - Whether the requester is an admin
 * @returns {Promise<Array>} List of comments
 */
async function getPostComments(postId, showUnapproved = false, isAdmin = false) {
  let whereClause = "c.post_id = $1 AND c.is_active = true";

  // Only admins can see unapproved comments
  if (!isAdmin || !showUnapproved) {
    whereClause += " AND c.is_approved = true";
  }

  const result = await query(
    `SELECT c.*, u.full_name as user_name, u.email as user_email
     FROM blog_comments c
     JOIN users u ON c.user_id = u.id
     WHERE ${whereClause}
     ORDER BY c.created_at ASC`,
    [postId]
  );

  return result.rows;
}

/**
 * Check if a slug already exists (excluding a specific post)
 * @async
 * @function checkSlugExists
 * @param {string} slug - The slug to check
 * @param {number|null} excludePostId - Post ID to exclude from the check (optional)
 * @param {Object} dbClient - Database client (optional, for transaction)
 * @returns {Promise<boolean>} - True if slug exists
 */
async function checkSlugExists(slug, excludePostId = null, dbClient = null) {
  try {
    let sql = "SELECT id FROM blog_posts WHERE slug = $1 AND is_active = true";
    const params = [slug];

    if (excludePostId) {
      sql += " AND id != $2";
      params.push(excludePostId);
    }

    const result = dbClient ? await dbClient.query(sql, params) : await query(sql, params);

    return result.rowCount > 0;
  } catch (error) {
    logger.error(`Failed to check slug existence: ${error.message}`, { slug, excludePostId, error: error.stack });
    // Default to true for safety (assume conflict)
    return true;
  }
}

/**
 * Check if a blog post title already exists (excluding a specific post)
 * @async
 * @function checkTitleExists
 * @param {string} title - The title to check
 * @param {number|null} excludePostId - Post ID to exclude from the check (optional)
 * @param {Object} dbClient - Database client (optional, for transaction)
 * @returns {Promise<boolean>} - True if title exists
 */
async function checkTitleExists(title, excludePostId = null, dbClient = null) {
  try {
    let sql = "SELECT id FROM blog_posts WHERE LOWER(title) = LOWER($1) AND is_active = true";
    const params = [title];

    if (excludePostId) {
      sql += " AND id != $2";
      params.push(excludePostId);
    }

    const result = dbClient ? await dbClient.query(sql, params) : await query(sql, params);

    return result.rowCount > 0;
  } catch (error) {
    logger.error(`Failed to check title existence: ${error.message}`, { title, excludePostId, error: error.stack });
    // Default to true for safety (assume conflict)
    return true;
  }
}

/**
 * Validate if a slug can be used (doesn't conflict with existing slugs)
 * @async
 * @function validateSlug
 * @param {string} slug - The slug to validate
 * @param {number|null} excludePostId - Post ID to exclude from the check (optional)
 * @returns {Promise<Object>} - Validation result with isValid and suggestedSlug
 */
async function validateSlug(slug, excludePostId = null) {
  try {
    // Handle null/undefined/empty slugs
    if (!slug || slug.trim() === "") {
      const fallbackSlug = `post-${Date.now()}`;
      return {
        isValid: false,
        suggestedSlug: fallbackSlug,
        message: `Empty or invalid slug provided. Using generated slug '${fallbackSlug}' instead.`,
      };
    }

    // Sanitize slug to ensure it's valid
    const sanitizedSlug = slugify(slug);

    // Check if slug exists for another post
    const exists = await checkSlugExists(sanitizedSlug, excludePostId);

    if (!exists) {
      return {
        isValid: true,
        suggestedSlug: sanitizedSlug,
      };
    }

    // If slug exists, generate a unique one with timestamp
    const suggestedSlug = `${sanitizedSlug}-${Date.now()}`;
    return {
      isValid: false,
      suggestedSlug,
      message: `Slug '${sanitizedSlug}' already exists for another post. Using '${suggestedSlug}' instead.`,
    };
  } catch (error) {
    logger.error(`Error validating slug: ${error.message}`, { slug, excludePostId, error: error.stack });
    // For safety, suggest a unique slug with timestamp
    const timestamp = Date.now();
    const fallbackSlug = slug ? `${slugify(slug)}-${timestamp}` : `post-${timestamp}`;

    return {
      isValid: false,
      suggestedSlug: fallbackSlug,
      message: `Error validating slug: ${error.message}`,
    };
  }
}

module.exports = {
  createBlogPost,
  updateBlogPost,
  publishBlogPost,
  getBlogPostById,
  getBlogPostBySlug,
  listBlogPosts,
  deleteBlogPost,
  addComment,
  getPostComments,
  validateSlug,
  checkSlugExists,
  checkTitleExists,
};
