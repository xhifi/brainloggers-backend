/**
 * @module controllers/blog-post.controller
 * @description Controller for blog post management
 */
const blogPostService = require("../services/blog-post.service");
const { BadRequestError, NotFoundError, ForbiddenError } = require("../utils/errors");
const ConflictResourceError = require("../utils/errors/ConfictResource");
const logger = require("../services/logger.service");

/**
 * Create a new blog post
 * @async
 * @function createBlogPost
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function createBlogPost(req, res, next) {
  try {
    const postData = req.body;
    const userId = req.user.id;

    const post = await blogPostService.createBlogPost(postData, userId);

    res.status(201).json({
      success: true,
      data: post,
      message: "Blog post created successfully",
    });
  } catch (error) {
    logger.error(`Error creating blog post: ${error.message}`, {
      userId: req.user.id,
      error: error.stack,
    });
    next(error);
  }
}

/**
 * List all blog posts with pagination and filters
 * @async
 * @function listBlogPosts
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function listBlogPosts(req, res, next) {
  try {
    const options = {
      page: req.query.page || 1,
      limit: req.query.limit || 10,
      status: req.query.status,
      sortBy: req.query.sortBy || "created_at",
      sortOrder: req.query.sortOrder || "desc",
      tag: req.query.tag,
      authorId: req.query.author ? parseInt(req.query.author, 10) : undefined,
    };

    // If user doesn't have admin rights, only show published posts
    const userRoles = req.user.roles || [];
    const isAdmin = userRoles.includes("admin") || userRoles.includes("editor");
    if (!isAdmin) {
      options.status = "published";
    }

    const result = await blogPostService.listBlogPosts(options);

    res.status(200).json({
      success: true,
      data: result.posts,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error(`Error listing blog posts: ${error.message}`, { error: error.stack });
    next(error);
  }
}

/**
 * Get a blog post by ID
 * @async
 * @function getBlogPost
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function getBlogPost(req, res, next) {
  try {
    const postId = req.params.id;
    const includeContent = req.query.content === "true";

    const post = await blogPostService.getBlogPostById(postId, includeContent);

    // If post is not published, verify the user has permission
    if (post.status !== "published") {
      const userRoles = req.user.roles || [];
      const isAdmin = userRoles.includes("admin") || userRoles.includes("editor");
      const isAuthor = post.authors.some((author) => author.id === req.user.id);

      if (!isAdmin && !isAuthor) {
        throw new ForbiddenError("You don't have permission to access this post");
      }
    }

    res.status(200).json({
      success: true,
      data: post,
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
      return;
    }
    logger.error(`Error getting blog post: ${error.message}`, {
      userId: req.user.id,
      postId: req.params.id,
      error: error.stack,
    });
    next(error);
  }
}

/**
 * Get a blog post by slug
 * @async
 * @function getBlogPostBySlug
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function getBlogPostBySlug(req, res, next) {
  try {
    const slug = req.params.slug;
    const includeContent = req.query.content === "true";

    const post = await blogPostService.getBlogPostBySlug(slug, includeContent);

    // If post is not published, verify the user has permission
    if (post.status !== "published") {
      const userRoles = req.user.roles || [];
      const isAdmin = userRoles.includes("admin") || userRoles.includes("editor");
      const isAuthor = post.authors.some((author) => author.id === req.user.id);

      if (!isAdmin && !isAuthor) {
        throw new ForbiddenError("You don't have permission to access this post");
      }
    }

    // Handle redirects
    if (post.redirected && req.query.noRedirect !== "true") {
      // If this is a redirect, provide redirect info
      res.status(200).json({
        success: true,
        data: post,
        redirect: {
          from: post.originalSlug,
          to: post.currentSlug,
          permanent: true,
        },
      });
    } else {
      // Normal response
      res.status(200).json({
        success: true,
        data: post,
      });
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
      return;
    }
    logger.error(`Error getting blog post by slug: ${error.message}`, {
      userId: req.user.id,
      slug: req.params.slug,
      error: error.stack,
    });
    next(error);
  }
}

/**
 * Update a blog post
 * @async
 * @function updateBlogPost
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function updateBlogPost(req, res, next) {
  try {
    const postId = req.params.id;
    const updateData = req.body;
    const userId = req.user.id;

    // Check if the user has permission to edit this post
    const post = await blogPostService.getBlogPostById(postId);
    const userRoles = req.user.roles || [];
    const isAdmin = userRoles.includes("admin") || userRoles.includes("editor");
    const isAuthor = post.authors.some((author) => author.id === userId);

    if (!isAdmin && !isAuthor) {
      throw new ForbiddenError("You don't have permission to edit this post");
    } // Get the updated blog post data
    const updatedPost = await blogPostService.updateBlogPost(postId, updateData, userId);

    // Return the blog post data (might not include content if S3 retrieval failed)
    res.status(200).json({
      success: true,
      data: updatedPost,
      message: "Blog post updated successfully",
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
      return;
    } else if (error instanceof ConflictResourceError || error.name === "ConflictResourceError" || error.statusCode === 409) {
      res.status(409).json({
        success: false,
        message: error.message || "A blog post with this title or slug already exists",
        code: "TITLE_SLUG_CONFLICT",
      });
      return;
    } else if (error instanceof BadRequestError) {
      res.status(400).json({
        success: false,
        message: error.message,
      });
      return;
    } else if (error instanceof ForbiddenError) {
      res.status(403).json({
        success: false,
        message: error.message,
      });
      return;
    }

    logger.error(`Error updating blog post: ${error.message}`, {
      userId: req.user.id,
      postId: req.params.id,
      error: error.stack,
    });
    next(error);
  }
}

/**
 * Publish a blog post
 * @async
 * @function publishBlogPost
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function publishBlogPost(req, res, next) {
  try {
    const postId = req.params.id;
    const publishedAt = req.body.publishedAt ? new Date(req.body.publishedAt) : new Date();

    // Admin rights checked in route middleware

    const post = await blogPostService.publishBlogPost(postId, publishedAt);

    res.status(200).json({
      success: true,
      data: post,
      message: "Blog post published successfully",
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError) {
      res.status(error instanceof NotFoundError ? 404 : 400).json({
        success: false,
        message: error.message,
      });
      return;
    }
    logger.error(`Error publishing blog post: ${error.message}`, {
      userId: req.user.id,
      postId: req.params.id,
      error: error.stack,
    });
    next(error);
  }
}

/**
 * Delete a blog post (soft delete)
 * @async
 * @function deleteBlogPost
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function deleteBlogPost(req, res, next) {
  try {
    const postId = parseInt(req.params.id, 10);

    if (isNaN(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid blog post ID",
        errors: [{ field: "id", message: "ID must be a number", code: "invalid_type" }],
      });
    }

    // Admin rights checked in route middleware

    await blogPostService.deleteBlogPost(postId);

    res.status(200).json({
      success: true,
      message: "Blog post deleted successfully",
    });
  } catch (error) {
    if (error instanceof NotFoundError) {
      res.status(404).json({
        success: false,
        message: error.message,
      });
      return;
    }
    logger.error(`Error deleting blog post: ${error.message}`, {
      userId: req.user.id,
      postId: req.params.id,
      error: error.stack,
    });
    next(error);
  }
}

/**
 * Add a comment to a blog post
 * @async
 * @function addComment
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function addComment(req, res, next) {
  try {
    const postId = req.params.id;
    const commentData = req.body;
    const userId = req.user.id;

    const comment = await blogPostService.addComment(postId, commentData, userId);

    res.status(201).json({
      success: true,
      data: comment,
      message: comment.is_approved ? "Comment added successfully" : "Comment submitted and awaiting approval",
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BadRequestError) {
      res.status(error instanceof NotFoundError ? 404 : 400).json({
        success: false,
        message: error.message,
      });
      return;
    }
    logger.error(`Error adding comment: ${error.message}`, {
      userId: req.user.id,
      postId: req.params.id,
      error: error.stack,
    });
    next(error);
  }
}

/**
 * Get comments for a blog post
 * @async
 * @function getPostComments
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
async function getPostComments(req, res, next) {
  try {
    const postId = req.params.id;
    const showUnapproved = req.query.showUnapproved === "true";

    // Check admin rights for viewing unapproved comments
    const userRoles = req.user.roles || [];
    const isAdmin = userRoles.includes("admin");

    const comments = await blogPostService.getPostComments(postId, showUnapproved, isAdmin);

    res.status(200).json({
      success: true,
      data: comments,
    });
  } catch (error) {
    logger.error(`Error getting post comments: ${error.message}`, {
      userId: req.user.id,
      postId: req.params.id,
      error: error.stack,
    });
    next(error);
  }
}

module.exports = {
  createBlogPost,
  listBlogPosts,
  getBlogPost,
  getBlogPostBySlug,
  updateBlogPost,
  publishBlogPost,
  deleteBlogPost,
  addComment,
  getPostComments,
};
