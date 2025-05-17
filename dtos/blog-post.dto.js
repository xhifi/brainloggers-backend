/**
 * @module dtos/blog-post.dto
 * @description Data Transfer Objects for blog post operations using Zod for validation
 */

const { z } = require("zod");

/**
 * @typedef {Object} CreateBlogPostSchema
 * @property {string} title - Title of the blog post
 * @property {string} description - Short description or excerpt of the post
 * @property {string} content - Markdown content of the blog post
 * @property {string} layout - Layout template to use for rendering
 * @property {string[]} authorIds - UUIDs of users who authored the post
 * @property {number[]} tagIds - IDs of tags to associate with the post
 */
const createBlogPostSchema = {
  body: z.object({
    title: z.string().trim().min(1, { message: "Title is required" }).max(255, { message: "Title cannot exceed 255 characters" }),
    description: z.string().trim().optional(),
    content: z.string().min(1, { message: "Content is required" }),
    layout: z.string().default("default"),
    authorIds: z
      .array(z.string().uuid({ message: "Author ID must be a valid UUID" }))
      .optional()
      .default([]),
    tagIds: z
      .array(z.number().int({ message: "Tag ID must be an integer" }).positive({ message: "Tag ID must be a positive number" }))
      .optional()
      .default([]),
  }),
};

/**
 * @typedef {Object} UpdateBlogPostSchema
 * @property {number} id - ID of the blog post to update
 * @property {string} [title] - Updated title of the blog post
 * @property {string} [description] - Updated description
 * @property {string} [content] - Updated markdown content
 * @property {string} [layout] - Updated layout template * @property {string[]} [authorIds] - Updated author UUIDs
 * @property {number[]} [tagIds] - Updated tag IDs
 */
const updateBlogPostSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  body: z
    .object({
      title: z
        .string()
        .trim()
        .min(1, { message: "Title cannot be empty" })
        .max(255, { message: "Title cannot exceed 255 characters" })
        .optional(),
      description: z.string().trim().optional(),
      content: z.string().optional(),
      layout: z.string().optional(),
      authorIds: z.array(z.string().uuid({ message: "Author ID must be a valid UUID" })).optional(),
      tagIds: z
        .array(z.number().int({ message: "Tag ID must be an integer" }).positive({ message: "Tag ID must be a positive number" }))
        .optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update",
    }),
};

/**
 * @typedef {Object} PublishBlogPostSchema
 * @property {number} id - ID of the blog post to publish
 * @property {string} [publishedAt] - When to publish the blog post (defaults to now)
 */
const publishBlogPostSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    publishedAt: z
      .string()
      .optional()
      .transform((val) => (val ? new Date(val) : new Date())),
  }),
};

/**
 * @typedef {Object} GetBlogPostSchema
 * @property {number} id - ID of the blog post
 */
const getBlogPostSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
};

/**
 * @typedef {Object} GetBlogPostBySlugSchema
 * @property {string} slug - Slug of the blog post
 */
const getBlogPostBySlugSchema = {
  params: z.object({
    slug: z.string().trim().min(1, { message: "Slug is required" }),
  }),
};

/**
 * @typedef {Object} ListBlogPostsSchema
 * @property {number} page - Page number for pagination
 * @property {number} limit - Number of posts per page
 * @property {string} status - Filter posts by status
 * @property {string} sortBy - Field to sort by
 * @property {string} sortOrder - Sort order (asc, desc)
 */
const listBlogPostsSchema = {
  query: z.object({
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1)),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 10)),
    status: z.enum(["draft", "published", "archived"]).optional(),
    sortBy: z.enum(["title", "created_at", "updated_at", "published_at"]).optional().default("created_at"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
    tag: z.string().optional(),
    author: z.string().optional(),
  }),
};

/**
 * @typedef {Object} AddCommentSchema
 * @property {number} postId - ID of the blog post to comment on
 * @property {string} content - Comment content
 * @property {number} [parentId] - ID of parent comment for nested replies
 */
const addCommentSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "Post ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
  body: z.object({
    content: z.string().trim().min(1, { message: "Comment content is required" }),
    parentId: z
      .number()
      .int({ message: "Parent comment ID must be an integer" })
      .positive({ message: "Parent comment ID must be a positive number" })
      .optional(),
  }),
};

/**
 * @typedef {Object} DeleteBlogPostSchema
 * @property {number} id - ID of the blog post to delete
 */
const deleteBlogPostSchema = {
  params: z.object({
    id: z
      .string()
      .regex(/^\d+$/, "ID must be a number")
      .transform((val) => parseInt(val, 10)),
  }),
};

module.exports = {
  createBlogPostSchema,
  updateBlogPostSchema,
  publishBlogPostSchema,
  getBlogPostSchema,
  getBlogPostBySlugSchema,
  listBlogPostsSchema,
  addCommentSchema,
  deleteBlogPostSchema,
};
