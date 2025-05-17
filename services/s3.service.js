/**
 * @module services/s3
 * @description Service for Amazon S3 storage operations (CRUD for files and folders)
 */
const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Readable } = require("stream");
const config = require("../config");
const logger = require("./logger.service");
const { s3Client } = require("../config/aws");
const { NotFound, NotFoundError } = require("../utils/errors");
const ConflictResourceError = require("../utils/errors/ConfictResource");

const bucketName = config.aws.s3BucketName;

/**
 * Check if the S3 client and bucket are properly configured
 * @returns {boolean} True if S3 is configured, false otherwise
 */
const isS3Configured = () => {
  if (!bucketName) {
    logger.error("S3 bucket name is not configured. Check AWS_S3_BUCKET_NAME in your .env file.");
    return false;
  }

  if (!config.aws.region) {
    logger.error("AWS region is not configured. Check AWS_REGION in your .env file.");
    return false;
  }

  return true;
};

/**
 * Check if a file or folder exists in S3
 * @async
 * @function fileExists
 * @param {string} key - S3 key of the file or folder to check
 * @returns {Promise<boolean>} True if the file exists, false otherwise
 */
const fileExists = async (key) => {
  if (!isS3Configured()) {
    throw new Error("S3 is not properly configured");
  }

  try {
    const params = {
      Bucket: bucketName,
      Key: key,
    };

    const command = new HeadObjectCommand(params);
    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === "NotFound" || error.name === "NoSuchKey") {
      return false;
    }
    // If it's another type of error, re-throw it
    throw error;
  }
};

/**
 * Upload a file to S3 bucket directly from memory
 * @async
 * @function uploadFile
 * @param {Object} fileData - File data object from multer memory storage
 * @param {Buffer} fileData.buffer - File content in memory
 * @param {string} fileData.originalname - Original file name
 * @param {string} fileData.mimetype - File MIME type
 * @param {string} [folderPath=''] - S3 folder path (optional)
 * @param {boolean} [isPublic=false] - Whether the file should be publicly readable
 * @returns {Promise<Object>} Upload result with file details
 * @throws {Error} If the file upload fails
 */
const uploadFile = async (fileData, folderPath = "", isPublic = false) => {
  if (!isS3Configured()) {
    throw new Error("S3 is not properly configured");
  }

  try {
    // Create the S3 key (path) using the folder path and original filename
    const s3Key = folderPath ? `${folderPath.replace(/^\/*|\/*$/g, "")}/${fileData.originalname}` : fileData.originalname;

    // Check if the file already exists
    const exists = await fileExists(s3Key);
    if (exists) {
      throw new ConflictResourceError(`File already exists: ${s3Key}`);
    }

    // Set up the S3 upload parameters using the buffer directly
    const params = {
      Bucket: bucketName,
      Key: s3Key,
      Body: fileData.buffer, // Use the buffer directly instead of reading from disk
      ContentType: fileData.mimetype,
      ACL: isPublic ? "public-read" : "private", // Set ACL based on isPublic parameter
      // You can add other parameters like Metadata, etc. as needed
    };

    // Execute the upload command
    const command = new PutObjectCommand(params);
    const result = await s3Client.send(command);

    // Generate a presigned URL for temporary access to the file
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key,
    });
    const presignedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 }); // 1 hour expiry

    // Return the upload result with file details
    return {
      key: s3Key,
      location: `https://${bucketName}.s3.${config.aws.region}.amazonaws.com/${s3Key}`,
      presignedUrl,
      etag: result.ETag,
      size: fileData.size,
      mimetype: fileData.mimetype,
      originalName: fileData.originalname,
      isPublic: isPublic,
    };
  } catch (error) {
    logger.error(`Error uploading file to S3: ${error.message}`, { error });
    throw error;
  }
};

/**
 * Create a folder in S3 bucket
 * @async
 * @function createFolder
 * @param {string} folderPath - Folder path to create
 * @returns {Promise<Object>} Creation result with folder details
 * @throws {Error} If the folder creation fails
 */
const createFolder = async (folderPath) => {
  if (!isS3Configured()) {
    throw new Error("S3 is not properly configured");
  }

  try {
    // Normalize folder path to ensure it has trailing slash but no leading slash
    const normalizedPath = `${folderPath.replace(/^\/*|\/*$/g, "")}/`;

    // Check if the folder already exists
    // In S3, folders are virtual, so we need to use ListObjectsV2 with the folder prefix
    const listParams = {
      Bucket: bucketName,
      Prefix: normalizedPath,
      MaxKeys: 1,
    };
    const listCommand = new ListObjectsV2Command(listParams);
    const listResult = await s3Client.send(listCommand);

    if (listResult.Contents && listResult.Contents.length > 0) {
      logger.error(`Folder already exists in S3: ${normalizedPath}`);
      throw new ConflictResourceError(`Folder already exists: ${folderPath}`);
    }

    // Create an empty object to represent the folder
    const params = {
      Bucket: bucketName,
      Key: normalizedPath,
      Body: "", // Empty content for folder placeholder
    };

    const command = new PutObjectCommand(params);
    const result = await s3Client.send(command);

    return {
      key: normalizedPath,
      location: `https://${bucketName}.s3.${config.aws.region}.amazonaws.com/${normalizedPath}`,
      etag: result.ETag,
    };
  } catch (error) {
    logger.error(`Error creating folder in S3: ${error.message}`, { error });
    throw error;
  }
};

/**
 * Get a file from S3 bucket
 * @async
 * @function getFile
 * @param {string} fileKey - S3 key of the file to retrieve
 * @param {boolean} [generatePresignedUrl=false] - Whether to generate a presigned URL
 * @returns {Promise<Object>} File data or presigned URL
 * @throws {Error} If the file retrieval fails
 */
const getFile = async (fileKey, generatePresignedUrl = false) => {
  if (!isS3Configured()) {
    throw new Error("S3 is not properly configured");
  }

  try {
    // First check if the file exists
    const exists = await fileExists(fileKey);
    if (!exists) {
      logger.error(`File not found in S3: ${fileKey}`);
      throw new NotFound(`File not found: ${fileKey}`);
    }

    const params = {
      Bucket: bucketName,
      Key: fileKey,
    };

    if (generatePresignedUrl) {
      // Generate a presigned URL for temporary access
      const command = new GetObjectCommand(params);
      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 hour expiry

      return {
        key: fileKey,
        presignedUrl,
      };
    } else {
      // Get the file content directly with a timeout
      const command = new GetObjectCommand(params);

      // Use Promise.race to implement a timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("S3 getFile operation timed out")), 5000); // 5 seconds timeout
      });

      const response = await Promise.race([s3Client.send(command), timeoutPromise]);

      // Convert the readable stream to a buffer
      const chunks = [];
      const stream = response.Body;
      if (stream instanceof Readable) {
        const streamTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("S3 stream reading timed out")), 5000); // 5 seconds timeout
        });

        try {
          await Promise.race([
            (async () => {
              for await (const chunk of stream) {
                chunks.push(chunk);
              }
            })(),
            streamTimeoutPromise,
          ]);
        } catch (error) {
          if (error.message === "S3 stream reading timed out") {
            logger.error(`Stream reading timed out for ${fileKey}`);
            // Return empty content rather than failing completely
            return {
              key: fileKey,
              content: Buffer.from(""),
              contentType: "text/plain",
              contentLength: 0,
              error: "Content retrieval timed out",
            };
          }
          throw error;
        }
      }

      const fileContent = Buffer.concat(chunks);

      return {
        key: fileKey,
        content: fileContent,
        contentType: response.ContentType,
        etag: response.ETag,
        lastModified: response.LastModified,
        metadata: response.Metadata,
        contentLength: response.ContentLength,
      };
    }
  } catch (error) {
    logger.error(`Error getting file from S3: ${error.message}`, { fileKey, error });

    // Return empty content rather than failing completely
    return {
      key: fileKey,
      content: Buffer.from(""),
      contentType: "text/plain",
      contentLength: 0,
      error: error.message || "Unknown S3 error",
    };
  }
};

/**
 * List files and folders in an S3 bucket path
 * @async
 * @function listFiles
 * @param {string} [prefix=''] - S3 prefix (folder path) to list
 * @param {boolean} [recursive=false] - Whether to recursively list all files
 * @returns {Promise<Object>} List of files and folders
 * @throws {Error} If the listing fails
 */
const listFiles = async (prefix = "", recursive = false) => {
  if (!isS3Configured()) {
    throw new Error("S3 is not properly configured");
  }

  try {
    // Normalize the prefix to have a trailing slash for folder paths, unless empty
    const normalizedPrefix = prefix ? `${prefix.replace(/^\/*|\/*$/g, "")}/` : "";

    const params = {
      Bucket: bucketName,
      Prefix: normalizedPrefix,
      Delimiter: recursive ? undefined : "/", // Use delimiter to organize by "folder"
    };

    const command = new ListObjectsV2Command(params);
    const response = await s3Client.send(command);

    // Process directories (CommonPrefixes) and files (Contents)
    const directories = (response.CommonPrefixes || []).map((prefix) => ({
      key: prefix.Prefix,
      name: prefix.Prefix.split("/").slice(-2)[0],
      type: "folder",
      path: prefix.Prefix,
    }));

    const files = (response.Contents || [])
      // Filter out the current directory placeholder
      .filter((item) => item.Key !== normalizedPrefix)
      .map((item) => {
        const name = item.Key.split("/").pop();
        // Skip empty names (trailing slashes that indicate folders)
        if (!name) return null;

        return {
          key: item.Key,
          name,
          type: "file",
          size: item.Size,
          lastModified: item.LastModified,
          etag: item.ETag,
          path: item.Key,
        };
      })
      .filter(Boolean); // Remove any null items

    return {
      files,
      directories,
      prefix: normalizedPrefix,
      isTruncated: response.IsTruncated,
      nextContinuationToken: response.NextContinuationToken,
    };
  } catch (error) {
    logger.error(`Error listing files in S3: ${error.message}`, { error });
    throw error;
  }
};

/**
 * Update (replace) a file in S3 bucket directly from memory
 * @async
 * @function updateFile
 * @param {string} fileKey - S3 key of the file to update
 * @param {Object} fileData - New file data from multer memory storage
 * @param {Buffer} fileData.buffer - File content in memory
 * @param {string} fileData.mimetype - File MIME type
 * @param {boolean} [isPublic=false] - Whether the file should be publicly readable
 * @returns {Promise<Object>} Update result with file details
 * @throws {Error} If the file update fails
 */
const updateFile = async (fileKey, fileData, isPublic = false) => {
  if (!isS3Configured()) {
    throw new Error("S3 is not properly configured");
  }

  try {
    // First check if the file exists
    const exists = await fileExists(fileKey);
    if (!exists) {
      logger.error(`File not found in S3: ${fileKey}`);
      throw new NotFound(`File not found: ${fileKey}`);
    }

    // Set up the S3 upload parameters with buffer
    const params = {
      Bucket: bucketName,
      Key: fileKey,
      Body: fileData.buffer, // Use the buffer directly instead of reading from disk
      ContentType: fileData.mimetype,
      ACL: isPublic ? "public-read" : "private", // Set ACL based on isPublic parameter
    };

    // Execute the update command
    const command = new PutObjectCommand(params);
    const result = await s3Client.send(command);

    // Generate a presigned URL for temporary access to the file
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    });
    const presignedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 }); // 1 hour expiry

    return {
      key: fileKey,
      location: `https://${bucketName}.s3.${config.aws.region}.amazonaws.com/${fileKey}`,
      presignedUrl,
      etag: result.ETag,
      size: fileData.size,
      mimetype: fileData.mimetype,
      originalName: fileData.originalname,
      isPublic: isPublic,
    };
  } catch (error) {
    logger.error(`Error updating file in S3: ${error.message}`, { error });
    throw error;
  }
};

/**
 * Move/rename a file or folder in S3 bucket
 * @async
 * @function moveFile
 * @param {string} sourceKey - S3 key of the source file or folder
 * @param {string} destinationKey - S3 key of the destination
 * @returns {Promise<Object>} Move result with file details
 * @throws {Error} If the file move fails
 */
const moveFile = async (sourceKey, destinationKey) => {
  if (!isS3Configured()) {
    throw new Error("S3 is not properly configured");
  }

  try {
    // Check if source file exists
    const exists = await fileExists(sourceKey);
    if (!exists) {
      logger.error(`Source file not found in S3: ${sourceKey}`);
      throw new NotFound(`Source file not found: ${sourceKey}`);
    }

    // Copy the file to the new location
    const copyParams = {
      Bucket: bucketName,
      CopySource: `${bucketName}/${sourceKey}`,
      Key: destinationKey,
    };

    const copyCommand = new CopyObjectCommand(copyParams);
    const copyResult = await s3Client.send(copyCommand);

    // Delete the source file
    const deleteParams = {
      Bucket: bucketName,
      Key: sourceKey,
    };

    const deleteCommand = new DeleteObjectCommand(deleteParams);
    await s3Client.send(deleteCommand);

    return {
      sourceKey,
      destinationKey,
      location: `https://${bucketName}.s3.${config.aws.region}.amazonaws.com/${destinationKey}`,
      etag: copyResult.CopyObjectResult.ETag,
    };
  } catch (error) {
    logger.error(`Error moving file in S3: ${error.message}`, { error });
    throw error;
  }
};

/**
 * Delete a file or folder from S3 bucket
 * @async
 * @function deleteFile
 * @param {string} fileKey - S3 key of the file or folder to delete
 * @returns {Promise<Object>} Deletion result
 * @throws {Error} If the file deletion fails
 */
const deleteFile = async (fileKey) => {
  if (!isS3Configured()) {
    throw new Error("S3 is not properly configured");
  }

  try {
    // Check if file exists before attempting to delete
    const exists = await fileExists(fileKey);
    if (!exists) {
      logger.error(`File not found in S3: ${fileKey}`);
      throw new NotFound(`File not found: ${fileKey}`);
    }

    const params = {
      Bucket: bucketName,
      Key: fileKey,
    };

    const command = new DeleteObjectCommand(params);
    await s3Client.send(command);

    return {
      key: fileKey,
      deleted: true,
    };
  } catch (error) {
    logger.error(`Error deleting file from S3: ${error.message}`, { error });
    throw error;
  }
};

/**
 * Delete a folder and all its contents from S3 bucket
 * @async
 * @function deleteFolder
 * @param {string} folderPath - S3 folder path to delete
 * @returns {Promise<Object>} Deletion result
 * @throws {Error} If the folder deletion fails
 */
const deleteFolder = async (folderPath) => {
  if (!isS3Configured()) {
    throw new Error("S3 is not properly configured");
  }

  try {
    // Normalize folder path to ensure it has trailing slash but no leading slash
    const normalizedPath = `${folderPath.replace(/^\/*|\/*$/g, "")}/`;

    // Check if the folder exists using a list operation
    // We do this instead of fileExists because folders are virtual in S3
    const listParams = {
      Bucket: bucketName,
      Prefix: normalizedPath,
      MaxKeys: 1,
    };
    const listCommand = new ListObjectsV2Command(listParams);
    const listResult = await s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      logger.error(`Folder not found in S3: ${normalizedPath}`);
      throw new NotFoundError(`Folder not found: ${folderPath}`);
    }

    // List all objects in the folder
    const folderContents = await listFiles(normalizedPath, true);
    const allObjects = [...folderContents.files, { key: normalizedPath }]; // Include the folder itself

    // Delete each object
    const deletionResults = await Promise.all(
      allObjects.map(async (obj) => {
        try {
          // We don't want to double-check file existence here since we already listed the files
          const deleteParams = {
            Bucket: bucketName,
            Key: obj.key,
          };
          const deleteCommand = new DeleteObjectCommand(deleteParams);
          await s3Client.send(deleteCommand);
          return { key: obj.key, deleted: true };
        } catch (error) {
          logger.error(`Error deleting object ${obj.key}: ${error.message}`);
          return { key: obj.key, deleted: false, error: error.message };
        }
      })
    );

    return {
      path: normalizedPath,
      deleted: true,
      totalDeleted: deletionResults.filter((r) => r.deleted).length,
      totalFailed: deletionResults.filter((r) => !r.deleted).length,
      details: deletionResults,
    };
  } catch (error) {
    logger.error(`Error deleting folder from S3: ${error.message}`, { error });
    throw error;
  }
};

module.exports = {
  uploadFile,
  createFolder,
  getFile,
  listFiles,
  updateFile,
  moveFile,
  deleteFile,
  deleteFolder,
  isS3Configured,
  fileExists,
};
