/**
 * @module controllers/tag.controller
 * @description Controller for handling tag-related operations
 */
const tagService = require("../services/tag.service");
const { createTagSchema, updateTagSchema } = require("../dtos/tag.dto");

/**
 * Get all tags
 */
async function getAllTags(req, res, next) {
  try {
    const filters = {
      name: req.query.name || null,
      isActive: req.query.isActive !== undefined ? req.query.isActive === "true" : undefined,
    };

    const tags = await tagService.getAllTags(filters);
    res.status(200).json(tags);
  } catch (error) {
    next(error);
  }
}

/**
 * Get a tag by ID
 */
async function getTagById(req, res, next) {
  try {
    const tag = await tagService.getTagById(parseInt(req.params.id));
    res.status(200).json(tag);
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new tag
 */
async function createTag(req, res, next) {
  try {
    const validationResult = createTagSchema.body.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        message: "Invalid input",
        details: validationResult.error.errors.map((error) => ({
          path: error.path.join("."),
          message: error.message,
        })),
      });
    }

    const tag = await tagService.createTag(validationResult.data, req.user?.id);
    res.status(201).json(tag);
  } catch (error) {
    next(error);
  }
}

/**
 * Update a tag
 */
async function updateTag(req, res, next) {
  try {
    const validationResult = updateTagSchema.body.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        message: "Invalid input",
        details: validationResult.error.errors.map((error) => ({
          path: error.path.join("."),
          message: error.message,
        })),
      });
    }

    const updatedTag = await tagService.updateTag(parseInt(req.params.id), validationResult.data);
    res.status(200).json(updatedTag);
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a tag
 */
async function deleteTag(req, res, next) {
  try {
    await tagService.deleteTag(parseInt(req.params.id));
    res.status(200).json({
      message: "Tag deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get subscribers with a specific tag
 */
async function getSubscribersByTag(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await tagService.getSubscribersByTag(parseInt(req.params.id), page, limit);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAllTags,
  getTagById,
  createTag,
  updateTag,
  deleteTag,
  getSubscribersByTag,
};
