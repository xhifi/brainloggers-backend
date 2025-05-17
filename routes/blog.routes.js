/**
 * @module routes/blog.routes
 * @description Routes for blog post management including creation,
 * updating, publishing, listing, retrieval, and commenting
 */
const express = require("express");
const blogPostController = require("../controllers/blog-post.controller");
const authenticate = require("../middleware/authenticate");
const { validate } = require("../middleware/validate");
const { authorize, hasAllPermissions, hasAnyPermission } = require("../middleware/authorize");
const {
  createBlogPostSchema,
  updateBlogPostSchema,
  publishBlogPostSchema,
  getBlogPostSchema,
  getBlogPostBySlugSchema,
  listBlogPostsSchema,
  addCommentSchema,
  deleteBlogPostSchema,
} = require("../dtos/blog-post.dto");

const router = express.Router();

/**
 * Create a new blog post draft
 *
 * @route POST /api/blog
 * @group Blog - Operations for blog post management
 * @param {Object} request.body.required - Blog post data
 * @returns {Object} 201 - Blog post created successfully
 * @returns {Object} 400 - Validation error
 * @returns {Object} 401 - Unauthorized
 * @returns {Object} 403 - Forbidden
 * @returns {Object} 500 - Server error
 * @security JWT
 */
router.post(
  "/",
  authenticate,
  hasAllPermissions({ resource: "blog", action: "create" }),
  validate(createBlogPostSchema),
  blogPostController.createBlogPost
);

/**
 * List all blog posts with pagination and filtering
 *
 * @route GET /api/blog
 * @group Blog - Operations for blog post management
 * @param {number} request.query.page - Page number for pagination
 * @param {number} request.query.limit - Number of items per page
 * @param {string} request.query.status - Filter posts by status [draft, published, archived]
 * @param {string} request.query.sortBy - Sort field [title, created_at, updated_at, published_at]
 * @param {string} request.query.sortOrder - Sort order [asc, desc]
 * @param {string} request.query.tag - Filter by tag name
 * @param {number} request.query.author - Filter by author ID
 * @returns {Object} 200 - List of blog posts
 * @returns {Object} 400 - Validation error
 * @returns {Object} 401 - Unauthorized
 * @returns {Object} 500 - Server error
 * @security JWT
 */
router.get(
  "/",
  authenticate,
  hasAllPermissions({ resource: "blog", action: "read" }),
  validate(listBlogPostsSchema),
  blogPostController.listBlogPosts
);

/**
 * Get a blog post by ID
 *
 * @route GET /api/blog/:id
 * @group Blog - Operations for blog post management
 * @param {number} request.params.id.required - Blog post ID
 * @param {boolean} request.query.content - Whether to include markdown content
 * @returns {Object} 200 - Blog post details
 * @returns {Object} 400 - Validation error
 * @returns {Object} 401 - Unauthorized
 * @returns {Object} 404 - Blog post not found
 * @returns {Object} 500 - Server error
 * @security JWT
 */
router.get(
  "/:id",
  authenticate,
  hasAllPermissions({ resource: "blog", action: "read" }),
  validate(getBlogPostSchema),
  blogPostController.getBlogPost
);

/**
 * Get a blog post by slug
 *
 * @route GET /api/blog/by-slug/:slug
 * @group Blog - Operations for blog post management
 * @param {string} request.params.slug.required - Blog post slug
 * @param {boolean} request.query.content - Whether to include markdown content
 * @returns {Object} 200 - Blog post details
 * @returns {Object} 400 - Validation error
 * @returns {Object} 401 - Unauthorized
 * @returns {Object} 404 - Blog post not found
 * @returns {Object} 500 - Server error
 * @security JWT
 */
router.get(
  "/by-slug/:slug",
  authenticate,
  hasAllPermissions({ resource: "blog", action: "read" }),
  validate(getBlogPostBySlugSchema),
  blogPostController.getBlogPostBySlug
);

/**
 * Update a blog post
 *
 * @route PUT /api/blog/:id
 * @group Blog - Operations for blog post management
 * @param {number} request.params.id.required - Blog post ID
 * @param {Object} request.body.required - Updated blog post data
 * @returns {Object} 200 - Blog post updated successfully
 * @returns {Object} 400 - Validation error
 * @returns {Object} 401 - Unauthorized
 * @returns {Object} 403 - Forbidden
 * @returns {Object} 404 - Blog post not found
 * @returns {Object} 500 - Server error
 * @security JWT
 */
router.put(
  "/:id",
  authenticate,
  hasAllPermissions({ resource: "blog", action: "update" }),
  validate(updateBlogPostSchema),
  blogPostController.updateBlogPost
);

/**
 * Publish a blog post (admin only)
 *
 * @route PUT /api/blog/:id/publish
 * @group Blog - Operations for blog post management
 * @param {number} request.params.id.required - Blog post ID
 * @param {Object} request.body - Publication options
 * @param {string} request.body.publishedAt - Publication date (ISO format)
 * @returns {Object} 200 - Blog post published successfully
 * @returns {Object} 400 - Validation error
 * @returns {Object} 401 - Unauthorized
 * @returns {Object} 403 - Forbidden
 * @returns {Object} 404 - Blog post not found
 * @returns {Object} 500 - Server error
 * @security JWT
 */
router.put(
  "/:id/publish",
  authenticate,
  hasAllPermissions({ resource: "blog", action: "publish" }),
  validate(publishBlogPostSchema),
  blogPostController.publishBlogPost
);

/**
 * Delete a blog post (soft delete)
 *
 * @route DELETE /api/blog/:id
 * @group Blog - Operations for blog post management
 * @param {number} request.params.id.required - Blog post ID
 * @returns {Object} 200 - Blog post deleted successfully
 * @returns {Object} 401 - Unauthorized
 * @returns {Object} 403 - Forbidden
 * @returns {Object} 404 - Blog post not found
 * @returns {Object} 500 - Server error
 * @security JWT
 */
router.delete(
  "/:id",
  authenticate,
  hasAllPermissions({ resource: "blog", action: "delete" }),
  validate(deleteBlogPostSchema),
  blogPostController.deleteBlogPost
);

/**
 * Add a comment to a blog post
 *
 * @route POST /api/blog/:id/comments
 * @group Blog Comments - Operations for blog comments
 * @param {number} request.params.id.required - Blog post ID
 * @param {Object} request.body.required - Comment data
 * @param {string} request.body.content.required - Comment content
 * @param {number} request.body.parentId - Parent comment ID for replies
 * @returns {Object} 201 - Comment added successfully
 * @returns {Object} 400 - Validation error
 * @returns {Object} 401 - Unauthorized
 * @returns {Object} 403 - Forbidden
 * @returns {Object} 404 - Blog post not found
 * @returns {Object} 500 - Server error
 * @security JWT
 */
router.post(
  "/:id/comments",
  authenticate,
  hasAllPermissions({ resource: "blog", action: "comment" }),
  validate(addCommentSchema),
  blogPostController.addComment
);

/**
 * Get comments for a blog post
 *
 * @route GET /api/blog/:id/comments
 * @group Blog Comments - Operations for blog comments
 * @param {number} request.params.id.required - Blog post ID
 * @param {boolean} request.query.showUnapproved - Whether to include unapproved comments (admin only)
 * @returns {Object} 200 - Comments retrieved successfully
 * @returns {Object} 401 - Unauthorized
 * @returns {Object} 403 - Forbidden
 * @returns {Object} 404 - Blog post not found
 * @returns {Object} 500 - Server error
 * @security JWT
 */
router.get(
  "/:id/comments",
  authenticate,
  hasAllPermissions({ resource: "blog", action: "read" }),
  validate(getBlogPostSchema),
  blogPostController.getPostComments
);

module.exports = router;
