const nodemailer = require("nodemailer");
const { SESClient, SendRawEmailCommand } = require("@aws-sdk/client-ses");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const config = require("./index");
const logger = require("../services/logger.service");

// Initialize SES client and nodemailer transporter
let sesTransporter = null;

if (config.aws.region && config.aws.sesFromEmail) {
  try {
    const sesClientConfig = { region: config.aws.region };
    // Only add credentials if explicitly provided, otherwise rely on SDK's default chain
    if (config.aws.accessKeyId && config.aws.secretAccessKey) {
      sesClientConfig.credentials = {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      };
    }

    const ses = new SESClient(sesClientConfig);

    sesTransporter = nodemailer.createTransport({
      SES: { ses, aws: { SendRawEmailCommand } }, // Pass SendRawEmailCommand here
    });
    logger.info(`Nodemailer SES transport configured for region ${config.aws.region}`);
  } catch (error) {
    logger.error(`Failed to configure Nodemailer SES transport: ${error.message}`);
    logger.warn("Email functionality might be disabled or degraded.");
    sesTransporter = null; // Ensure transporter is null on error
  }
} else {
  logger.warn("AWS SES configuration missing (AWS_REGION, SES_FROM_EMAIL). Email functionality disabled. Falling back to console output.");
  // Fallback to a console logger or ethereal.email for development
  sesTransporter = nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true,
  });
  logger.info("Nodemailer configured for stream transport (console output).");
}

// Initialize S3 client
let s3Client = null;

if (config.aws.region) {
  try {
    const s3ClientConfig = { region: config.aws.region };

    // Only add credentials if explicitly provided, otherwise rely on SDK's default chain
    if (config.aws.accessKeyId && config.aws.secretAccessKey) {
      s3ClientConfig.credentials = {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
      };
    }

    s3Client = new S3Client(s3ClientConfig);
    logger.info(`AWS S3 client configured for region ${config.aws.region}`);
  } catch (error) {
    logger.error(`Failed to configure AWS S3 client: ${error.message}`);
    logger.warn("S3 functionality might be disabled or degraded.");
    s3Client = null;
  }
} else {
  logger.warn("AWS S3 configuration missing (AWS_REGION). S3 functionality disabled.");
}

// For backwards compatibility, default export remains the SES transporter
module.exports = sesTransporter;

// Named exports for more explicit imports
module.exports.sesTransporter = sesTransporter;
module.exports.s3Client = s3Client;
