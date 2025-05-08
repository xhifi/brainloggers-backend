/**
 * @module services/email
 * @description Service for sending transactional emails via message queue
 */
const queueService = require("./queue.service");
const config = require("../config");
const logger = require("./logger.service");

/**
 * Sends a verification email to a user
 * @async
 * @function sendVerificationEmail
 * @param {string} email - Recipient's email address
 * @param {string} token - Email verification token
 * @returns {Promise<void>}
 */
const sendVerificationEmail = async (email, token) => {
  const verificationLink = `${config.apiUrl}/api/auth/verify-email?token=${token}`; // Link to backend verification endpoint
  const message = {
    type: "verify",
    to: email,
    subject: "Verify Your Email Address",
    // Pass data needed for the template in the worker
    context: {
      verificationLink: verificationLink,
      appName: "Your Awesome App", // Make this configurable later
      clientUrl: config.clientUrl,
    },
  };
  await queueService.publishToQueue(config.rabbitmq.queue_email, message);
  logger.info(`[Queue] Verification email task published for ${email}`);
};

/**
 * Sends a password reset email to a user
 * @async
 * @function sendPasswordResetEmail
 * @param {string} email - Recipient's email address
 * @param {string} token - Password reset token
 * @returns {Promise<void>}
 */
const sendPasswordResetEmail = async (email, token) => {
  const resetLink = `${config.clientUrl}/reset-password?token=${token}`; // Link to frontend page that handles reset
  const message = {
    type: "reset",
    to: email,
    subject: "Password Reset Request",
    context: {
      resetLink: resetLink,
      appName: "Your Awesome App",
      clientUrl: config.clientUrl,
    },
  };
  await queueService.publishToQueue(config.rabbitmq.queue_email, message);
  logger.info(`[Queue] Password reset email task published for ${email}`);
};

// Maybe add a generic sendEmail function if needed elsewhere
/**
 * Generic email sending function (commented out but available for future use)
 * @async
 * @function sendEmail
 * @param {string} to - Recipient's email address
 * @param {string} subject - Email subject line
 * @param {string} text - Plain text version of email content
 * @param {string} html - HTML version of email content
 * @returns {Promise<void>}
 */
// const sendEmail = async (to, subject, text, html) => {
//     const message = { type: 'generic', to, subject, text, html };
//     await queueService.publishToQueue(config.rabbitmq.queue_email, message);
// }

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
