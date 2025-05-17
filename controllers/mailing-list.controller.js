/**
 * @module Controllers/MailingListController
 * @description Controller for mailing list operations
 */
const mailingListService = require("../services/mailing-list.service");
const logger = require("../services/logger.service");
const { BadRequest } = require("../utils/errors");

/**
 * Create a new mailing list
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function createMailingList(req, res, next) {
  try {
    const userId = req.user.id;
    const mailingListData = req.body;

    const result = await mailingListService.createMailingList(mailingListData, userId);

    res.status(201).json({
      success: true,
      message: "Mailing list created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get a mailing list by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getMailingListById(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      throw new BadRequest("Invalid mailing list ID");
    }

    const mailingList = await mailingListService.getMailingListById(parseInt(id));

    res.status(200).json({
      success: true,
      data: mailingList,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List mailing lists with pagination and filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function listMailingLists(req, res, next) {
  try {
    const result = await mailingListService.listMailingLists(req.query);

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update a mailing list
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function updateMailingList(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!id || isNaN(parseInt(id))) {
      throw new BadRequest("Invalid mailing list ID");
    }

    const updateData = req.body;
    const updatedMailingList = await mailingListService.updateMailingList(parseInt(id), updateData, userId);

    res.status(200).json({
      success: true,
      message: "Mailing list updated successfully",
      data: updatedMailingList,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a mailing list (soft delete)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function deleteMailingList(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!id || isNaN(parseInt(id))) {
      throw new BadRequest("Invalid mailing list ID");
    }

    await mailingListService.deleteMailingList(parseInt(id), userId);

    res.status(200).json({
      success: true,
      message: "Mailing list deleted successfully",
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get recipients of a mailing list with pagination
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function getMailingListRecipients(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      throw new BadRequest("Invalid mailing list ID");
    }

    const result = await mailingListService.getMailingListRecipients(parseInt(id), req.query);

    res.status(200).json({
      success: true,
      mailingList: result.mailingList,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Regenerate recipients for a mailing list based on current filter criteria
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
async function regenerateRecipients(req, res, next) {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      throw new BadRequest("Invalid mailing list ID");
    }

    const updatedMailingList = await mailingListService.regenerateRecipients(parseInt(id));

    res.status(200).json({
      success: true,
      message: "Mailing list recipients regenerated successfully",
      data: updatedMailingList,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createMailingList,
  getMailingListById,
  listMailingLists,
  updateMailingList,
  deleteMailingList,
  getMailingListRecipients,
  regenerateRecipients,
};
