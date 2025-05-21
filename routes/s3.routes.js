/**
 * @module Routes/Storage
 * @description Routes for S3 file and folder operations
 */
const express = require("express");
const { validate } = require("../middleware/validate");
const { upload, handleMulterError } = require("../middleware/upload");
const authenticate = require("../middleware/authenticate");
const { hasAllPermissions, hasAnyPermission, hasRoles } = require("../middleware/authorize");
const {
  createFolderSchema,
  getFileSchema,
  listFilesSchema,
  updateFileSchema,
  moveFileSchema,
  deleteFileSchema,
  deleteFolderSchema,
} = require("../dtos/s3.dto");
const s3Controller = require("../controllers/s3.controller");

const router = express.Router();

/**
 * @route POST /api/v1/storage/upload
 * @description Upload a file to S3
 * @access Private - requires authentication and storage:write permission
 */
router.post(
  "/upload",
  authenticate,
  hasAnyPermission({ resource: "storage", action: "write" }, { resource: "storage", action: "admin" }),
  upload.single("file"),
  handleMulterError,
  s3Controller.uploadFile
);

/**
 * @route POST /api/v1/storage/folders
 * @description Create a folder in S3
 * @access Private - requires authentication and storage:write permission
 */
router.post(
  "/folders",
  authenticate,
  hasAnyPermission({ resource: "storage", action: "write" }, { resource: "storage", action: "admin" }),
  validate(createFolderSchema),
  s3Controller.createFolder
);

/**
 * @route GET /api/v1/storage/files/:fileKey
 * @description Get a file from S3 (download or get presigned URL)
 * @access Private - requires authentication and storage:read permission
 */
router.get(
  "/files/*fileKey",
  authenticate,
  hasAnyPermission({ resource: "storage", action: "read" }, { resource: "storage", action: "admin" }),
  // validate(getFileSchema),
  s3Controller.getFile
);

/**
 * @route GET /api/v1/storage/list
 * @description List files and folders in S3
 * @access Private - requires authentication and storage:list permission
 */
router.get(
  "/list",
  authenticate,
  hasAnyPermission({ resource: "storage", action: "list" }, { resource: "storage", action: "admin" }),
  validate(listFilesSchema),
  s3Controller.listFiles
);

/**
 * @route PUT /api/v1/storage/files/:fileKey
 * @description Update a file in S3
 * @access Private - requires authentication and storage:write permission
 */
router.put(
  "/files/:fileKey",
  authenticate,
  hasAnyPermission({ resource: "storage", action: "write" }, { resource: "storage", action: "admin" }),
  validate(updateFileSchema),
  upload.single("file"),
  handleMulterError,
  s3Controller.updateFile
);

/**
 * @route POST /api/v1/storage/move
 * @description Move/rename a file in S3
 * @access Private - requires authentication and storage:write permission
 */
router.post(
  "/move",
  authenticate,
  hasAnyPermission({ resource: "storage", action: "write" }, { resource: "storage", action: "admin" }),
  validate(moveFileSchema),
  s3Controller.moveFile
);

/**
 * @route DELETE /api/v1/storage/files/:fileKey
 * @description Delete a file from S3
 * @access Private - requires authentication and storage:delete permission
 */
router.delete(
  "/files/:fileKey",
  authenticate,
  hasAnyPermission({ resource: "storage", action: "delete" }, { resource: "storage", action: "admin" }),
  validate(deleteFileSchema),
  s3Controller.deleteFile
);

/**
 * @route DELETE /api/v1/storage/folders
 * @description Delete a folder from S3
 * @access Private - requires authentication and storage:delete permission
 */
router.delete(
  "/folders",
  authenticate,
  hasAnyPermission({ resource: "storage", action: "delete" }, { resource: "storage", action: "admin" }),
  validate(deleteFolderSchema),
  s3Controller.deleteFolder
);

module.exports = router;
