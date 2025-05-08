/**
 * @module middleware/upload
 * @description Middleware for handling file uploads using multer with memory storage
 */
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const logger = require("../services/logger.service");

// Use memory storage instead of disk storage
const storage = multer.memoryStorage();

// File filter function to validate file types
const fileFilter = (req, file, cb) => {
  // Accept all file types by default - customize this based on your needs
  // Example: Only accept images, PDFs, and common document formats
  const allowedMimeTypes = [
    // Images
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    // Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
    // Text
    "text/plain",
    "text/csv",
    // Archives
    "application/zip",
    "application/x-rar-compressed",
    // Other
    "application/json",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed. Allowed types: ${allowedMimeTypes.join(", ")}`), false);
  }
};

// Set file size limits
const limits = {
  fileSize: 10 * 1024 * 1024, // 10MB limit - adjust based on your needs
};

// Create multer upload instance with memory storage
const upload = multer({
  storage,
  fileFilter,
  limits,
});

// Error handler for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred during upload
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        message: "File too large. Maximum file size is 10MB.",
      });
    }
    logger.error(`Multer error: ${err.message}`, { error: err });
    return res.status(400).json({
      message: `File upload error: ${err.message}`,
    });
  } else if (err) {
    // Non-multer error
    logger.error(`File upload error: ${err.message}`, { error: err });
    return res.status(400).json({
      message: err.message,
    });
  }

  next();
};

module.exports = {
  upload,
  handleMulterError,
};
