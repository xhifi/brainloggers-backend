const nodemailer = require("nodemailer");
const { SESClient, SendRawEmailCommand } = require("@aws-sdk/client-ses"); // Ensure SendRawEmailCommand is imported
const config = require("./index");
const logger = require("../services/logger.service");

let transporter = null;

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

    transporter = nodemailer.createTransport({
      SES: { ses, aws: { SendRawEmailCommand } }, // Pass SendRawEmailCommand here
    });
    logger.info(`Nodemailer SES transport configured for region ${config.aws.region}`);
  } catch (error) {
    logger.error(`Failed to configure Nodemailer SES transport: ${error.message}`);
    logger.warn("Email functionality might be disabled or degraded.");
    transporter = null; // Ensure transporter is null on error
  }
} else {
  logger.warn("AWS SES configuration missing (AWS_REGION, SES_FROM_EMAIL). Email functionality disabled. Falling back to console output.");
  // Fallback to a console logger or ethereal.email for development
  transporter = nodemailer.createTransport({
    streamTransport: true,
    newline: "unix",
    buffer: true,
  });
  logger.info("Nodemailer configured for stream transport (console output).");
}

module.exports = transporter; // Export the configured transporter (or null/fallback)
