/**
 * @module utils/hash
 * @description Utility functions for password hashing and verification using bcrypt
 */
const bcrypt = require("bcrypt");

/**
 * Hashes a plain text password using bcrypt
 * @async
 * @function hashPassword
 * @param {string} password - The plain text password to hash
 * @returns {Promise<string>} A promise that resolves to the hashed password
 * @throws {Error} If bcrypt hashing fails
 */
const hashPassword = async (password) => {
  const saltRounds = 10; // Or more, configurable
  return bcrypt.hash(password, saltRounds);
};

/**
 * Compares a plain text password against a hashed password
 * @async
 * @function comparePassword
 * @param {string} plainPassword - The plain text password to check
 * @param {string} hashedPassword - The hashed password to compare against
 * @returns {Promise<boolean>} A promise that resolves to true if passwords match, false otherwise
 * @throws {Error} If bcrypt comparison fails
 */
const comparePassword = async (plainPassword, hashedPassword) => {
  // Ensure hashedPassword is not null or undefined before comparing
  if (!hashedPassword) {
    return false;
  }
  return bcrypt.compare(plainPassword, hashedPassword);
};

module.exports = { hashPassword, comparePassword };
