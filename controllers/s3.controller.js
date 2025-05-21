/**
 * @module controllers/s3.controller
 * @description Controller for S3 file and folder operations
 */
const s3Service = require("../services/s3.service");
const logger = require("../services/logger.service");

/**
 * Upload a file to S3
 * @async
 * @function uploadFile
 * @param {Object} req - Express request object
 * @param {Object} req.file - Uploaded file data from multer
 * @param {Object} req.body - Request body
 * @param {string} req.body.folderPath - Optional folder path to store file in
 * @param {boolean} req.body.isPublic - Whether the file should be publicly readable (default: false)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.uploadFile = async (req, res, next) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { folderPath } = req.body;
    // Convert isPublic string to boolean (form data sends strings)
    const isPublic = req.body.isPublic === "true";

    const result = await s3Service.uploadFile(req.file, folderPath, isPublic);

    res.status(201).json({
      message: "File uploaded successfully",
      file: result,
    });
  } catch (error) {
    logger.error(`Error in uploadFile controller: ${error.message}`, { error });
    next(error);
  }
};

/**
 * Create a folder in S3
 * @async
 * @function createFolder
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.folderPath - Folder path to create
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.createFolder = async (req, res, next) => {
  try {
    const { folderPath } = req.body;
    const result = await s3Service.createFolder(folderPath);

    res.status(201).json({
      message: "Folder created successfully",
      folder: result,
    });
  } catch (error) {
    logger.error(`Error in createFolder controller: ${error.message}`, { error });
    next(error);
  }
};

/**
 * Get a file from S3
 * @async
 * @function getFile
 * @param {Object} req - Express request object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.fileKey - S3 key of the file to retrieve
 * @param {Object} req.query - Query parameters
 * @param {boolean} req.query.presigned - Whether to return a presigned URL
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.getFile = async (req, res, next) => {
  try {
    const fileKey = req.params.fileKey.join("/");
    console.log(fileKey);
    const presigned = req.query.presigned === "true";

    const result = await s3Service.getFile(fileKey, presigned);

    if (presigned) {
      return res.json({
        message: "Presigned URL generated successfully",
        file: result,
      });
    } else {
      // Stream file directly to response
      res.setHeader("Content-Type", result.contentType || "application/octet-stream");
      res.setHeader("Content-Length", result.contentLength || 0);
      res.setHeader("Content-Disposition", `inline; filename="${fileKey.split("/").pop()}"`);
      res.setHeader("x-direct-transfer", "true");
      return res.send(result.content);
    }
  } catch (error) {
    if (error.name === "NoSuchKey") {
      return res.status(404).json({ message: "File not found" });
    }
    logger.error(`Error in getFile controller: ${error.message}`, { error });
    next(error);
  }
};

/**
 * List files in an S3 bucket path
 * @async
 * @function listFiles
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.prefix - S3 prefix (folder path) to list
 * @param {boolean} req.query.recursive - Whether to list recursively
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.listFiles = async (req, res, next) => {
  try {
    const prefix = req.query.prefix || "";
    const recursive = req.query.recursive === "true";

    const result = await s3Service.listFiles(prefix, recursive);

    res.json({
      message: "Files listed successfully",
      ...result,
    });
  } catch (error) {
    logger.error(`Error in listFiles controller: ${error.message}`, { error });
    next(error);
  }
};

/**
 * Update a file in S3
 * @async
 * @function updateFile
 * @param {Object} req - Express request object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.fileKey - S3 key of the file to update
 * @param {Object} req.file - Uploaded file data from multer
 * @param {Object} req.body - Request body
 * @param {boolean} req.body.isPublic - Whether the file should be publicly readable (default: false)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.updateFile = async (req, res, next) => {
  try {
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { fileKey } = req.params;
    // Convert isPublic string to boolean (form data sends strings)
    const isPublic = req.body.isPublic === "true";

    const result = await s3Service.updateFile(fileKey, req.file, isPublic);

    res.json({
      message: "File updated successfully",
      file: result,
    });
  } catch (error) {
    logger.error(`Error in updateFile controller: ${error.message}`, { error });
    next(error);
  }
};

/**
 * Move/rename a file in S3
 * @async
 * @function moveFile
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.sourceKey - S3 key of the source file
 * @param {string} req.body.destinationKey - S3 key of the destination
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.moveFile = async (req, res, next) => {
  try {
    const { sourceKey, destinationKey } = req.body;
    const result = await s3Service.moveFile(sourceKey, destinationKey);

    res.json({
      message: "File moved successfully",
      file: result,
    });
  } catch (error) {
    logger.error(`Error in moveFile controller: ${error.message}`, { error });
    next(error);
  }
};

/**
 * Delete a file from S3
 * @async
 * @function deleteFile
 * @param {Object} req - Express request object
 * @param {Object} req.params - URL parameters
 * @param {string} req.params.fileKey - S3 key of the file to delete
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.deleteFile = async (req, res, next) => {
  try {
    const { fileKey } = req.params;
    const result = await s3Service.deleteFile(fileKey);

    res.json({
      message: "File deleted successfully",
      result,
    });
  } catch (error) {
    logger.error(`Error in deleteFile controller: ${error.message}`, { error });
    next(error);
  }
};

/**
 * Delete a folder from S3
 * @async
 * @function deleteFolder
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.folderPath - S3 folder path to delete
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.deleteFolder = async (req, res, next) => {
  try {
    const { folderPath } = req.body;
    const result = await s3Service.deleteFolder(folderPath);

    res.json({
      message: "Folder deleted successfully",
      result,
    });
  } catch (error) {
    logger.error(`Error in deleteFolder controller: ${error.message}`, { error });
    next(error);
  }
};
