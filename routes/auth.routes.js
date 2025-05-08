/**
 * @module routes/auth
 * @description Authentication routes for user registration, login, session management and password reset
 */
const express = require("express");
const authController = require("../controllers/auth.controller");
const { validate } = require("../middleware/validate");
const { registerSchema, loginSchema, verifyEmailSchema, forgotPasswordSchema, resetPasswordSchema } = require("../dtos/auth.dto");
const authenticate = require("../middleware/authenticate"); // For logout and potentially other auth routes

const router = express.Router();

/**
 * @route POST /api/auth/register
 * @description Register a new user account
 * @access Public
 */
router.post("/register", validate(registerSchema), authController.register);

/**
 * @route POST /api/auth/login
 * @description Authenticate a user and return tokens
 * @access Public
 */
router.post("/login", validate(loginSchema), authController.login);

/**
 * @route GET /api/auth/verify-email
 * @description Verify a user's email address with token
 * @access Public
 */
router.get("/verify-email", validate(verifyEmailSchema), authController.verifyEmail); // GET request with token in query param

/**
 * @route POST /api/auth/refresh
 * @description Get new access token using refresh token
 * @access Public
 */
router.post("/refresh", authController.refreshToken); // Expects refresh token in cookie

/**
 * @route POST /api/auth/forgot-password
 * @description Request a password reset email
 * @access Public
 */
router.post("/forgot-password", validate(forgotPasswordSchema), authController.forgotPassword);

/**
 * @route POST /api/auth/reset-password
 * @description Reset password with token
 * @access Public
 */
router.post("/reset-password", validate(resetPasswordSchema), authController.resetPassword);

/**
 * @route POST /api/auth/logout
 * @description Logout a user (invalidate tokens)
 * @access Private - requires authentication
 */
router.post("/logout", authenticate, authController.logout); // Needs authentication to identify the user/token to invalidate

/**
 * @route GET /api/auth/session
 * @description Check if user is authenticated (for unauthenticated users)
 * @access Public
 */
router.get("/session", (req, res, next) => {
  // This handler is only reached if the 'authenticate' middleware below is NOT called or fails early
  res.json({ isAuthenticated: false, user: null });
});

/**
 * @route GET /api/auth/session
 * @description Check if user is authenticated (for authenticated users)
 * @access Private - requires authentication
 */
router.get("/session", authenticate, (req, res) => {
  // This handler is reached if 'authenticate' middleware succeeds and calls next()
  // req.user is attached by the authenticate middleware
  res.json({
    isAuthenticated: true,
    user: {
      id: req.user.id,
      // email: req.user.email // Avoid sending email if not needed
      roles: req.user.roles,
      is_verified: req.user.is_verified,
    },
  });
});

module.exports = router;
