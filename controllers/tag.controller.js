const TagService = require("../services/tag.service");
const tagService = new TagService();

class TagController {
  /**
   * Create a new tag
   */
  async createTag(req, res, next) {
    try {
      const tag = await tagService.createTag(req.body);
      return res.status(201).json(tag);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all tags
   */
  async getAllTags(req, res, next) {
    try {
      const tags = await tagService.getAllTags();
      return res.json(tags);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get tag by ID
   */
  async getTagById(req, res, next) {
    try {
      const tag = await tagService.getTagById(req.params.tagId);
      return res.json(tag);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update tag
   */
  async updateTag(req, res, next) {
    try {
      const tag = await tagService.updateTag(req.params.tagId, req.body);
      return res.json(tag);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete tag
   */
  async deleteTag(req, res, next) {
    try {
      await tagService.deleteTag(req.params.tagId);
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Assign tag to subscribers
   */
  async assignTagToSubscribers(req, res, next) {
    try {
      const result = await tagService.assignTagToSubscribers(req.params.tagId, req.body.subscriberIds);
      return res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove tag from subscribers
   */
  async removeTagFromSubscribers(req, res, next) {
    try {
      const result = await tagService.removeTagFromSubscribers(req.params.tagId, req.body.subscriberIds);
      return res.json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get subscribers by tag
   */
  async getSubscribersByTag(req, res, next) {
    try {
      const subscribers = await tagService.getSubscribersByTag(req.params.tagId);
      return res.json(subscribers);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get tags by subscriber
   */
  async getTagsBySubscriber(req, res, next) {
    try {
      const tags = await tagService.getTagsBySubscriber(req.params.subscriberId);
      return res.json(tags);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TagController();
