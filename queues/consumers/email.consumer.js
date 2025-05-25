const config = require("../../config");
const transporter = require("../../config/aws"); // Nodemailer SES transport or fallback
const logger = require("../../services/logger.service");
// Consider using a template engine like EJS or Liquid for real emails
// const ejs = require('ejs');
// const { Liquid } = require('liquidjs');
// const path = require('path');
// const fs = require('fs');

const MAX_RETRIES = 3; // Max times to attempt sending a failed email

// Basic templating function (replace with EJS/Liquid)
const renderTemplate = (type, context) => {
  let subject = "Notification";
  let htmlContent = `<p>Notification details: ${JSON.stringify(context)}</p>`;
  let textContent = `Notification details: ${JSON.stringify(context)}`;

  try {
    const appName = context.appName || "Your App";
    if (type === "verify" && context?.verificationLink) {
      subject = `Verify Your Email for ${appName}`;
      htmlContent = `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 5px; max-width: 600px; margin: 20px auto;">
                    <h2 style="color: #333;">Welcome to ${appName}!</h2>
                    <p style="color: #555; line-height: 1.6;">Please click the button below to verify your email address:</p>
                    <p style="margin: 25px 0; text-align: center;">
                        <a href="${context.verificationLink}" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">Verify Email</a>
                    </p>
                    <p style="color: #555; line-height: 1.6;">If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="word-break: break-all;"><a href="${context.verificationLink}" style="color: #007bff;">${context.verificationLink}</a></p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #777; text-align: center;">If you didn't sign up for ${appName}, please ignore this email.</p>
                </div>`;
      textContent = `Welcome to ${appName}! Verify your email by visiting this link: ${context.verificationLink}`;
    } else if (type === "reset" && context?.resetLink) {
      subject = `Password Reset Request for ${appName}`;
      htmlContent = `
                 <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 5px; max-width: 600px; margin: 20px auto;">
                    <h2 style="color: #333;">Password Reset Request</h2>
                    <p style="color: #555; line-height: 1.6;">You requested a password reset for your account at ${appName}.</p>
                    <p style="color: #555; line-height: 1.6;">Click the button below to set a new password:</p>
                     <p style="margin: 25px 0; text-align: center;">
                        <a href="${context.resetLink}" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">Reset Password</a>
                    </p>
                    <p style="color: #555; line-height: 1.6;">This link will expire in 60 minutes.</p>
                    <p style="color: #555; line-height: 1.6;">If the button doesn't work, copy and paste this link into your browser:</p>
                    <p style="word-break: break-all;"><a href="${context.resetLink}" style="color: #007bff;">${context.resetLink}</a></p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="font-size: 12px; color: #777; text-align: center;">If you didn't request a password reset, please ignore this email.</p>
                </div>`;
      textContent = `Reset your password for ${appName} by visiting this link (expires in 60 minutes): ${context.resetLink}`;
    } else {
      // Fallback for generic or unknown types
      subject = context.subject || subject;
      htmlContent = context.html || htmlContent;
      textContent = context.text || textContent;
    }
  } catch (renderError) {
    logger.error(`[Email Worker] Error rendering template type ${type}:`, renderError);
    // Use fallback content on render error
  }

  return { subject, html: htmlContent, text: textContent };
};

const processEmailTask = async (msgData) => {
  if (!transporter) {
    logger.error("[Email Worker] Nodemailer transporter is not available. Cannot send email.");
    // Decide whether to Nack or Ack based on whether it's recoverable
    return "discard"; // Discard as it's not recoverable without transporter restart
  }

  // Basic validation of incoming message data
  if (!msgData || !msgData.type || !msgData.to) {
    logger.error("[Email Worker] Invalid message data received:", msgData);
    return "discard"; // Indicate message should be discarded (non-retryable)
  }

  logger.info(`[Email Worker] Processing task type: ${msgData.type} for ${msgData.to}`);

  try {
    // Render email content using a basic templater or EJS/Liquid
    const { subject, html, text } = renderTemplate(msgData.type, msgData.context || {});

    const mailOptions = {
      from: `"${msgData.context?.appName || "Your App"}" <${config.aws.sesFromEmail}>`, // Use app name in from field
      to: msgData.to,
      subject: subject,
      text: text, // Plain text version
      html: html, // HTML version
    };

    // Send mail using the configured transporter
    const info = await transporter.sendMail(mailOptions);
    // Check if transporter logs to console (streamTransport)
    if (transporter.options && transporter.options.streamTransport) {
      logger.info(`[Email Worker] Simulated email sent to console for ${msgData.to} (Type: ${msgData.type})`);
      logger.debug("--- Email Content ---");
      logger.debug(`To: ${mailOptions.to}`);
      logger.debug(`From: ${mailOptions.from}`);
      logger.debug(`Subject: ${mailOptions.subject}`);
      logger.debug(`Text Body:\n${mailOptions.text}`);
      logger.debug("--- End Email Content ---");
    } else {
      logger.info(
        `[Email Worker] Message sent successfully via SES to ${msgData.to} (Type: ${msgData.type}, MessageID: ${info.messageId || "N/A"})`
      );
    }
    return "success"; // Indicate success
  } catch (error) {
    logger.error(`[Email Worker] Failed to send email to ${msgData.to} (Type: ${msgData.type}):`, error.message);
    // Analyze error to see if it's retryable (e.g., temporary network issue, SES throttling)
    // Or non-retryable (e.g., invalid email address format, permanent SES rejection like MessageRejected)
    // Example check (customize based on potential AWS SES error codes/messages):
    if (error.code === "InvalidParameterValue" || error.code === "MessageRejected" || error.message.includes("Invalid address")) {
      logger.error(`[Email Worker] Non-retryable error sending to ${msgData.to}. Discarding message.`);
      return "discard"; // Non-retryable error
    }
    // Assume other errors might be retryable (like temporary network issues, throttling)
    logger.warn(`[Email Worker] Assuming retryable error for ${msgData.to}.`);
    return "retry"; // Indicate failure, suggest retry
  }
};

const start = async (channel) => {
  const queueName = config.rabbitmq.queue_email;

  try {
    // Ensure queue exists (asserted also in connectRabbitMQ, but good practice here too)
    await channel.assertQueue(queueName, { durable: true });
    // Process one message at a time per consumer. Increase if needed and if processing is fast & idempotent.
    channel.prefetch(1);
    logger.info(` [*] Waiting for messages in queue: ${queueName}. To exit press CTRL+C`);

    channel.consume(
      queueName,
      async (msg) => {
        if (msg === null) {
          logger.warn("[Email Worker] Consumer cancelled by server.");
          return; // Stop processing if consumer is cancelled
        }

        let msgData;
        let processingResult = "retry"; // Default to retry on unknown error

        try {
          msgData = JSON.parse(msg.content.toString());
          processingResult = await processEmailTask(msgData);
        } catch (parseError) {
          logger.error("[Email Worker] Error parsing message content:", parseError, msg.content.toString());
          processingResult = "discard"; // Unparseable message, discard
        }

        // --- Acknowledge, Retry or Discard based on processing result ---
        try {
          if (processingResult === "success") {
            channel.ack(msg); // Acknowledge success
            // logger.debug(` [x] Ack message for ${msgData?.to}`);
          } else if (processingResult === "discard") {
            logger.warn(`[Email Worker] Discarding message permanently for ${msgData?.to || "Unknown recipient"}`);
            // Acknowledge the message to remove it from the queue
            channel.ack(msg);
            // Alternatively, use Nack with requeue=false if you have a DLX setup for failed messages
            // channel.nack(msg, false, false);
          } else {
            // 'retry'
            // Handle retry logic - Basic version: Nack and let RabbitMQ requeue if configured, or implement delayed retry
            logger.warn(`[Email Worker] Nacking message for ${msgData?.to || "Unknown recipient"} for potential retry (requeue=false).`);
            // Nack without requeueing immediately. A Dead Letter Exchange with TTL is the standard way for delayed retries.
            // If no DLX, nacking with requeue=false means the message is lost unless redelivered by RabbitMQ logic (e.g., channel closure).
            channel.nack(msg, false, false); // Nack without requeue
            // WARNING: Without DLX, 'retry' might effectively mean 'discard' here.
            // Consider implementing proper dead-lettering for robust retries.
          }
        } catch (ackNackError) {
          logger.error(`[Email Worker] Error Ack/Nacking message for ${msgData?.to}:`, ackNackError);
          // If ack/nack fails, the message might be redelivered, potentially causing duplicates if processing already succeeded.
          // This indicates a channel or connection issue, which should ideally trigger reconnection logic.
        }
      },
      {
        noAck: false, // Manual acknowledgment is required
      }
    );
  } catch (error) {
    logger.error(`[Email Worker] Error starting consumer for queue ${queueName}:`, error.message);
    // Implement reconnection logic for channel/connection errors if needed, though config/rabbitmq handles connection retries.
    throw error; // Throw error to potentially stop worker startup if critical
  }
};

module.exports = { start };
