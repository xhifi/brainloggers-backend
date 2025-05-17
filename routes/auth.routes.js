/**
 * @module Routes/Authentication
 * @description Authentication routes for user registration, login, session management and password reset
 */
const express = require("express");
const authController = require("../controllers/auth.controller");
const { validate } = require("../middleware/validate");
const { registerSchema, loginSchema, verifyEmailSchema, forgotPasswordSchema, resetPasswordSchema } = require("../dtos/auth.dto");
const authenticate = require("../middleware/authenticate"); // For logout and potentially other auth routes

const router = express.Router();

/**
 * Register a new user account
 *
 * @route POST /api/auth/register
 * @group Authentication - Operations related to user authentication
 * @param {object} request.body.required - User registration data
 * @param {string} request.body.name.required - User's full name - eg: John Doe
 * @param {string} request.body.email.required - User's email address - eg: user@example.com
 * @param {string} request.body.password.required - User's password (min 8 chars) - eg: Password123!
 * @returns {object} 201 - User registered successfully
 * @returns {object} 400 - Validation error
 * @returns {object} 409 - Email already in use
 * @returns {object} 500 - Server error
 * @example request - Example request payload
 * {
 *   "name": "John Doe",
 *   "email": "john.doe@example.com",
 *   "password": "SecurePassword123!"
 * }
 * @example response - 201 - Example success response
 * {
 *   "success": true,
 *   "message": "Registration successful. Please check your email to verify your account."
 * }
 */
router.post("/register", validate(registerSchema), authController.register);

/**
 * Authenticate a user and return tokens
 *
 * @route POST /api/auth/login
 * @group Authentication - Operations related to user authentication
 * @param {object} request.body.required - Login credentials
 * @param {string} request.body.email.required - User's email address - eg: user@example.com
 * @param {string} request.body.password.required - User's password - eg: Password123!
 * @returns {object} 200 - Authentication successful
 * @returns {object} 400 - Validation error
 * @returns {object} 401 - Invalid credentials
 * @returns {object} 500 - Server error
 * @example request - Example request payload
 * {
 *   "email": "john.doe@example.com",
 *   "password": "SecurePassword123!"
 * }
 * @example response - 200 - Example success response
 * {
 *   "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
 *   "user": {
 *     "id": "123e4567-e89b-12d3-a456-426614174000",
 *     "roles": ["user"]
 *   }
 * }
 */
router.post("/login", validate(loginSchema), authController.login);

/**
 * Verify a user's email address with token
 *
 * @route GET /api/auth/verify-email
 * @group Authentication - Operations related to user authentication
 * @param {string} request.query.token.required - Email verification token - eg: abcdef123456
 * @returns {object} 200 - Email verified successfully
 * @returns {object} 400 - Invalid token
 * @returns {object} 404 - Token not found
 * @returns {object} 410 - Token expired
 * @returns {object} 500 - Server error
 * @example response - 200 - Example success response
 * {
 *   "success": true,
 *   "message": "Email verified successfully! You can now log in."
 * }
 */
router.get("/verify-email", validate(verifyEmailSchema), authController.verifyEmail); // GET request with token in query param

/**
 * Get new access token using refresh token
 *
 * @route POST /api/auth/refresh
 * @group Authentication - Operations related to user authentication
 * @description Expects refresh token in HTTP-only cookie
 * @returns {object} 200 - New access token generated
 * @returns {object} 401 - Invalid or expired refresh token
 * @returns {object} 500 - Server error
 * @example response - 200 - Example success response
 * {
 *   "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 * }
 */
router.post("/refresh", authController.refreshToken); // Expects refresh token in cookie

/**
 * Request a password reset email
 *
 * @route POST /api/auth/forgot-password
 * @group Authentication - Operations related to user authentication
 * @param {object} request.body.required - Password reset request
 * @param {string} request.body.email.required - User's registered email address - eg: user@example.com
 * @returns {object} 200 - Password reset email sent
 * @returns {object} 400 - Validation error
 * @returns {object} 404 - Email not found
 * @returns {object} 500 - Server error
 * @example request - Example request payload
 * {
 *   "email": "john.doe@example.com"
 * }
 * @example response - 200 - Example success response
 * {
 *   "success": true,
 *   "message": "If your email is registered in our system, you'll receive password reset instructions shortly."
 * }
 */
router.post("/forgot-password", validate(forgotPasswordSchema), authController.forgotPassword);

/**
 * Reset password with token
 *
 * @route POST /api/auth/reset-password
 * @group Authentication - Operations related to user authentication
 * @param {object} request.body.required - Password reset data
 * @param {string} request.body.token.required - Password reset token from email - eg: abcdef123456
 * @param {string} request.body.password.required - New password (min 8 chars) - eg: NewPassword123!
 * @returns {object} 200 - Password reset successful
 * @returns {object} 400 - Validation error
 * @returns {object} 404 - Token not found
 * @returns {object} 410 - Token expired
 * @returns {object} 500 - Server error
 * @example request - Example request payload
 * {
 *   "token": "abcdef123456",
 *   "password": "NewSecurePassword123!"
 * }
 * @example response - 200 - Example success response
 * {
 *   "success": true,
 *   "message": "Password has been reset successfully. You can now log in with your new password."
 * }
 */
router.post("/reset-password", validate(resetPasswordSchema), authController.resetPassword);

/**
 * Logout a user (invalidate tokens)
 *
 * @route POST /api/auth/logout
 * @group Authentication - Operations related to user authentication
 * @security JWT
 * @description Requires valid access token in Authorization header
 * @returns {object} 200 - Logout successful
 * @returns {object} 401 - Unauthorized - Invalid or missing token
 * @returns {object} 500 - Server error
 * @example response - 200 - Example success response
 * {
 *   "success": true,
 *   "message": "You have been logged out successfully."
 * }
 */
router.post("/logout", authenticate, authController.logout); // Needs authentication to identify the user/token to invalidate

module.exports = router;
