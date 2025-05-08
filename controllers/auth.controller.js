/**
 * @module controllers/auth
 * @description Controller for authentication-related routes and operations
 */
const userService = require("../services/user.service");
const tokenService = require("../services/token.service");
const emailService = require("../services/email.service");
const { comparePassword } = require("../utils/hash");
const config = require("../config");
const { v4: uuidv4 } = require("uuid"); // For reset tokens
const logger = require("../services/logger.service");
const { ConflictResourceError } = require("../utils/errors");
/**
 * Sets a refresh token as an HTTP-only cookie
 * @private
 * @function setRefreshTokenCookie
 * @param {Object} res - Express response object
 * @param {string} token - Refresh token to set in cookie
 */
const setRefreshTokenCookie = (res, token) => {
  res.cookie(config.jwt.refreshCookieName, token, {
    httpOnly: true, // Prevent JS access
    secure: config.env === "production", // Send only over HTTPS in production
    sameSite: "lax", // Or 'strict'. Adjust based on frontend/backend domains. 'lax' is often a good default.
    maxAge: config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000, // Cookie expiry in ms
    path: "/", // Make accessible for all paths, including /api/auth/refresh
  });
};

/**
 * Clears the refresh token cookie
 * @private
 * @function clearRefreshTokenCookie
 * @param {Object} res - Express response object
 */
const clearRefreshTokenCookie = (res) => {
  res.clearCookie(config.jwt.refreshCookieName, {
    httpOnly: true,
    secure: config.env === "production",
    sameSite: "lax",
    path: "/",
  });
};

/**
 * Registers a new user account
 * @async
 * @function register
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 * @throws {409} If email is already registered
 * @throws {500} For server errors during registration
 */
exports.register = async (req, res, next) => {
  const { name, email, password, confirmPassword } = req.body;
  console.log(req.body);
  try {
    const userExists = await userService.findUserByEmail(email);
    if (userExists) {
      throw new ConflictResourceError("Email already in use");
    }
    // Service layer now throws specific error for duplicate email
    const newUser = await userService.createUser(name, email, password);

    // Send verification email via RabbitMQ
    await emailService.sendVerificationEmail(newUser.email, newUser.verification_token);

    res.status(201).json({
      message: "Registration successful. Please check your email to verify your account.",
      userId: newUser.id, // Avoid sending back sensitive info
    });
  } catch (error) {
    if (error.message === "Email already in use") {
      return res.status(409).json({ message: error.message });
    }
    next(error); // Pass other errors to global error handler
  }
};

/**
 * Verifies a user's email address via token
 * @async
 * @function verifyEmail
 * @param {Object} req - Express request object
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.token - Email verification token
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.verifyEmail = async (req, res, next) => {
  const { token } = req.query; // Validation ensures token exists

  try {
    const verifiedUser = await userService.verifyUser(token);
    if (!verifiedUser) {
      // Token was invalid, expired, or already used
      // Redirect to a client page indicating failure
      return res.redirect(`${config.clientUrl}/verification-failed?reason=invalid_token`);
      // Or return res.status(400).json({ message: 'Invalid or expired verification token.' });
    }
    // Redirect to login page or a success page on the client
    logger.info(`User ${verifiedUser.email} verified successfully.`);
    res.redirect(`${config.clientUrl}/login?verified=true`);
  } catch (error) {
    logger.error("Error during email verification:", error);
    // Redirect to a generic error page on the client
    res.redirect(`${config.clientUrl}/verification-failed?reason=server_error`);
    // next(error); // Or pass to global handler if preferred
  }
};

/**
 * Authenticates a user and issues access/refresh tokens
 * @async
 * @function login
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - User's email
 * @param {string} req.body.password - User's password
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 * @throws {401} If credentials are invalid
 * @throws {403} If account is not verified
 */
exports.login = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const user = await userService.findUserByEmail(email);

    // Get metadata for logging
    const metadata = {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      timestamp: new Date().toISOString(),
    };

    // Use timing-safe comparison for passwords if possible, bcrypt.compare is generally safe
    if (!user || !(await comparePassword(password, user.password_hash || ""))) {
      // Log failed login attempt
      logger.warn("Login failed: Invalid email or password", {
        event: "login_failure",
        email,
        reason: "Invalid email or password",
        ...metadata,
      });
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.is_verified) {
      // Log failed login due to unverified account
      logger.warn("Login failed: Account not verified", {
        event: "login_failure",
        email,
        reason: "Account not verified",
        ...metadata,
      });
      // Optional: Resend verification email? Add a dedicated endpoint for that.
      return res.status(403).json({
        message: "Account not verified. Please check your email.",
        needsVerification: true, // Flag for frontend UI
      });
    }

    // Generate tokens
    const accessToken = tokenService.generateAccessToken(user); // Pass user object with roles
    const refreshToken = tokenService.generateOpaqueRefreshToken();

    // Save refresh token in Redis (hashed) associated with the user ID
    const { hashedToken, expirySeconds } = await tokenService.saveRefreshToken(user.id, refreshToken);

    // Send refresh token in HttpOnly cookie
    setRefreshTokenCookie(res, hashedToken);

    // Log successful login
    logger.info("Login successful", {
      event: "login_success",
      userId: user.id,
      email: user.email,
      ...metadata,
    });

    // Send access token and non-sensitive user info in response body
    logger.info(`TO RECEIVE ACCESS TOKEN`, { accessToken });
    logger.info(`TO RECEIVE REFRESH TOKEN`, { hashedToken });
    res.json({
      message: "Login successful",
      accessToken,
      accessTokenExpiresIn: new Date().getTime() + parseInt(config.jwt.accessExpiration) * 60 * 1000,
      refreshTokenExpiresIn: new Date().getTime() + expirySeconds * 1000,
      user: {
        id: user.id,
        roles: user.roles || [],
      },
    });
  } catch (error) {
    logger.error("Login error", {
      error: error.message,
      stack: error.stack,
      email: email, // Log the email that was attempting to login
    });
    next(error);
  }
};

/**
 * Issues a new access token using a valid refresh token
 * @async
 * @function refreshToken
 * @param {Object} req - Express request object
 * @param {Object} req.cookies - Request cookies
 * @param {string} req.cookies[config.jwt.refreshCookieName] - Refresh token cookie
 * @param {Object} req.headers - Request headers
 * @param {string} req.headers.authorization - Authorization header with Bearer token
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 * @throws {401} If refresh token is invalid, missing, or user not found
 * @throws {403} If user account is no longer verified
 */
exports.refreshToken = async (req, res, next) => {
  const refreshTokenFromCookie = req.cookies[config.jwt.refreshCookieName];

  if (!refreshTokenFromCookie) {
    return res.status(401).json({ message: "Unauthorized: No refresh token provided" });
  }

  let userId = null;
  try {
    // Attempt to get userId from the expired Access Token in the Authorization header
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const expiredAccessToken = authHeader.split(" ")[1];
      // Decode without verification just to get payload
      const decodedExpired = tokenService.decodeToken(expiredAccessToken);
      if (decodedExpired && decodedExpired.userId) {
        userId = decodedExpired.userId;
      } else {
        logger.warn("Could not decode userId from expired access token in refresh request.");
      }
    }

    if (!userId) {
      clearRefreshTokenCookie(res); // Clear potentially invalid cookie
      return res.status(401).json({ message: "Unauthorized: Cannot identify user for refresh" });
    }

    // Validate the opaque token from cookie against Redis store for that user
    const isValid = await tokenService.validateRefreshToken(userId, refreshTokenFromCookie);

    if (!isValid) {
      logger.warn(`Invalid refresh token presented for user ${userId}. Potential token reuse or theft.`, { refreshTokenFromCookie });
      clearRefreshTokenCookie(res); // Clear the invalid cookie
      // SECURITY: Consider invalidating *all* refresh tokens for this user ID here
      // await tokenService.removeAllRefreshTokensForUser(userId); // Requires implementation
      return res.status(401).json({ message: "Unauthorized: Invalid or expired refresh token" });
    }

    // Fetch fresh user data to ensure the user still exists and roles are current
    const user = await userService.findUserById(userId);
    if (!user) {
      logger.warn(`User ${userId} not found during token refresh.`);
      clearRefreshTokenCookie(res);
      return res.status(401).json({ message: "Unauthorized: User associated with token not found" });
    }
    if (!user.is_verified) {
      logger.warn(`User ${userId} is no longer verified during token refresh.`);
      clearRefreshTokenCookie(res);
      await tokenService.removeRefreshToken(userId); // Remove the valid token as user is inactive
      return res.status(403).json({ message: "Forbidden: User account is not verified" });
    }

    // Issue new Access Token
    const newAccessToken = tokenService.generateAccessToken(user);

    // --- Recommended: Refresh Token Rotation ---
    const newRefreshToken = tokenService.generateOpaqueRefreshToken();
    // Save the NEW refresh token BEFORE sending it to the client
    const { hashedToken, expirySeconds } = await tokenService.saveRefreshToken(user.id, newRefreshToken);
    setRefreshTokenCookie(res, hashedToken); // Send the new refresh token back

    // --- End Rotation ---
    logger.info("Refresh token issued", {
      event: "refresh_token_success",
      userId: user.id,
      email: user.email,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      timestamp: new Date().toISOString(),
    });
    logger.info(`Tokens Refreshed for user ${user.email || user.id}`);
    logger.info(`New refresh token: ${hashedToken}`);
    logger.info(`New access token: ${newAccessToken}`);

    res.json({
      accessToken: newAccessToken,
      accessTokenExpiresIn: new Date().getTime() + parseInt(config.jwt.accessExpiration) * 60 * 1000,
      refreshToken: hashedToken,
      refreshTokenExpiresIn: expirySeconds * 60 * 1000, // Convert to milliseconds
      user: {
        // Send updated non-sensitive user info
        id: user.id,
        // email: user.email, // Avoid sending PII
        roles: user.roles || [],
      },
    });
  } catch (error) {
    // Avoid clearing the cookie on unexpected server errors, only on auth failures
    next(error);
  }
};

/**
 * Logs out a user by invalidating their tokens
 * @async
 * @function logout
 * @param {Object} req - Express request object
 * @param {Object} req.user - Authenticated user from middleware
 * @param {Object} req.cookies - Request cookies
 * @param {Object} req.headers - Request headers
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.logout = async (req, res, next) => {
  // authenticate middleware should have run, attaching req.user
  const userId = req.user?.id;
  const email = req.user?.email;
  const refreshTokenFromCookie = req.cookies[config.jwt.refreshCookieName];

  try {
    if (userId) {
      // Remove the refresh token stored in Redis for this user
      await tokenService.removeRefreshToken(userId);

      // Log user logout
      logger.info("User logged out", {
        event: "logout",
        userId,
        email,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        timestamp: new Date().toISOString(),
      });
    } else {
      // If somehow logout is called without authentication, log it but still clear cookie
      logger.warn("Logout called without authenticated user ID.");
    }

    // Optional: Blacklist the current access token being used for logout
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      await tokenService.blacklistAccessToken(token);
    }

    // Always clear the refresh token cookie on the client side
    clearRefreshTokenCookie(res);

    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    logger.error("Logout error", {
      error: error.message,
      stack: error.stack,
      userId,
    });
    next(error);
  }
};

/**
 * Initiates password reset process by sending a reset link
 * @async
 * @function forgotPassword
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.email - User's email address
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
exports.forgotPassword = async (req, res, next) => {
  const { email } = req.body;
  try {
    const user = await userService.findUserByEmail(email);
    if (user && user.is_verified) {
      // Only send if user exists and is verified
      const resetToken = uuidv4(); // Generate secure random token
      await userService.setPasswordResetToken(user.id, resetToken);

      // Send email via queue
      await emailService.sendPasswordResetEmail(user.email, resetToken);
      logger.info(`Password reset requested for verified user ${user.email}. Token sent.`);
    } else if (user && !user.is_verified) {
      logger.info(`Password reset requested for unverified email: ${email}`);
    } else {
      logger.info(`Password reset requested for non-existent email: ${email}`);
      // Do NOT reveal if the email exists or not for security reasons.
    }

    // Always return a success-like response to prevent email enumeration attacks
    res.status(200).json({ message: "If an account with that email exists and is verified, a password reset link has been sent." });
  } catch (error) {
    next(error);
  }
};

/**
 * Resets a user's password using a valid reset token
 * @async
 * @function resetPassword
 * @param {Object} req - Express request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.token - Password reset token
 * @param {string} req.body.password - New password
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 * @throws {400} If token is invalid or expired
 */
exports.resetPassword = async (req, res, next) => {
  const { token, password } = req.body;
  try {
    // Find user by valid, non-expired token
    const user = await userService.findUserByResetToken(token);

    if (!user) {
      return res.status(400).json({ message: "Password reset token is invalid or has expired." });
    }

    // Reset the password and clear the token fields in DB
    await userService.resetPassword(user.id, password);

    // SECURITY: Invalidate all active sessions (refresh tokens) for this user upon password reset
    await tokenService.removeRefreshToken(user.id); // Clear the current token store

    logger.info(`Password successfully reset for user ${user.email || user.id}`);
    res.status(200).json({ message: "Password has been reset successfully." });
  } catch (error) {
    next(error);
  }
};
