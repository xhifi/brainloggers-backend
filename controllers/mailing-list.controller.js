/**
 * @module controllers/mailing-list
 * @description Controller for mailing list endpoints
 */
const mailingListService = require("../services/mailing-list.service");
const { BadRequest } = require("../utils/errors");
const logger = require("../services/logger.service");

/**
 * Create a new mailing list
 * @async
 * @function createMailingList
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.createMailingList = async (req, res, next) => {
  try {
    const { name, description, sourceType, filterCriteria, tagFilter } = req.body;
    const userId = req.user.id;

    if (!name) {
      throw new BadRequest("Mailing list name is required");
    }

    const mailingList = await mailingListService.createMailingList(
      {
        name,
        description,
        sourceType,
        filterCriteria,
        tagFilter,
      },
      userId
    );

    res.status(201).json({
      success: true,
      data: mailingList,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing mailing list
 * @async
 * @function updateMailingList
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.updateMailingList = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const mailingList = await mailingListService.updateMailingList(id, req.body, userId);

    res.json({
      success: true,
      data: mailingList,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a mailing list
 * @async
 * @function deleteMailingList
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.deleteMailingList = async (req, res, next) => {
  try {
    const { id } = req.params;

    await mailingListService.deleteMailingList(id);

    res.json({
      success: true,
      message: "Mailing list deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a mailing list by ID
 * @async
 * @function getMailingListById
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getMailingListById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const mailingList = await mailingListService.getMailingListById(id);

    res.json({
      success: true,
      data: mailingList,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * List mailing lists with pagination and filtering
 * @async
 * @function listMailingLists
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.listMailingLists = async (req, res, next) => {
  try {
    const { page, limit, search, isActive } = req.query;

    const options = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      search,
      isActive: isActive !== undefined ? isActive === "true" : undefined,
    };

    const result = await mailingListService.listMailingLists(options);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get recipients of a mailing list
 * @async
 * @function getMailingListRecipients
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getMailingListRecipients = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page, limit } = req.query;

    const options = {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    };

    const result = await mailingListService.getMailingListRecipients(id, options);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get available variables for a mailing list
 * @async
 * @function getMailingListVariables
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.getMailingListVariables = async (req, res, next) => {
  try {
    const { id } = req.params;

    const variables = await mailingListService.getMailingListVariables(id);

    res.json({
      success: true,
      data: variables,
    });
  } catch (error) {
    next(error);
  }
};
