const { z } = require("zod");

// JSDOC comments for CreateFolderSchema using typedefs
/**
 * @typedef {Object} CreateFolderSchema
 * @property {string} folderPath - The path of the folder to be created in S3
 * @property {string} [folderPath.required] - The folder path is required
 * @property {string} [folderPath.min] - The folder path must be at least 1 character long
 * @property {string} [folderPath.trim] - The folder path must be trimmed of whitespace
 */
const createFolderSchema = {
  body: z.object({
    folderPath: z.string().min(1, "Folder path is required").trim(),
  }),
};

const getFileSchema = {
  params: z.object({
    fileKey: z.string().min(1, "File key is required").trim(),
  }),
  query: z
    .object({
      presigned: z.enum(["true", "false"]).optional().default("false"),
    })
    .optional(),
};

const listFilesSchema = {
  query: z
    .object({
      prefix: z.string().optional().default(""),
      recursive: z.enum(["true", "false"]).optional().default("false"),
    })
    .optional(),
};

const updateFileSchema = {
  params: z.object({
    fileKey: z.string().min(1, "File key is required").trim(),
  }),
};

const moveFileSchema = {
  body: z.object({
    sourceKey: z.string().min(1, "Source file key is required").trim(),
    destinationKey: z.string().min(1, "Destination file key is required").trim(),
  }),
};

const deleteFileSchema = {
  params: z.object({
    fileKey: z.string().min(1, "File key is required").trim(),
  }),
};

const deleteFolderSchema = {
  body: z.object({
    folderPath: z.string().min(1, "Folder path is required").trim(),
  }),
};

module.exports = {
  createFolderSchema,
  getFileSchema,
  listFilesSchema,
  updateFileSchema,
  moveFileSchema,
  deleteFileSchema,
  deleteFolderSchema,
};
