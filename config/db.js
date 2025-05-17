/**
 * @module config/db
 * @description PostgreSQL database configuration and query helpers
 */
const { Pool } = require("pg");
const config = require("./index");
const logger = require("../services/logger.service");

/**
 * PostgreSQL connection pool
 * @constant {Pool}
 */
const pool = new Pool(config.db);

pool.on("connect", () => {
  logger.info("PostgreSQL connected");
});

pool.on("error", (err, client) => {
  // Added client parameter
  logger.error("Unexpected error on idle PostgreSQL client", err);
  // Recommended action: remove the client from the pool or handle error appropriately
  // For simplicity, just logging here. Production apps might need more robust handling.
  // process.exit(-1); // Potentially too drastic, depends on the error
});

/**
 * Executes a SQL query with proper error handling and connection management
 * @async
 * @function query
 * @param {string} text - SQL query text
 * @param {Array} [params] - Query parameters
 * @returns {Promise<Object>} PostgreSQL query result
 * @throws {Error} Generic database error (avoids leaking query details)
 */
const query = async (text, params) => {
  const start = Date.now();
  let client; // Declare client variable
  try {
    client = await pool.connect(); // Get client from pool
    const res = await client.query(text, params);
    const duration = Date.now() - start;
    // Optional logging for development: Be careful logging params in production if they contain sensitive data
    // logger.debug('Executed query', { text, params: params || '[]', duration, rows: res.rowCount });
    return res;
  } catch (error) {
    // Log the error with context
    logger.error("Database Query Error:", {
      text,
      params: params || "[]", // Show params structure if available
      errorCode: error.code, // PostgreSQL error code (e.g., '23505' for unique violation)
      errorMessage: error.message,
    });
    // Don't expose raw SQL or detailed DB errors in production responses
    throw new Error("Database error occurred"); // Throw a generic error or a custom DB Error class
  } finally {
    if (client) {
      client.release(); // Ensure client is always released back to the pool
    }
  }
};

/**
 * Gets a database client for executing transactions
 * @async
 * @function getClient
 * @returns {Promise<Object>} PostgreSQL client from the connection pool
 * @throws {Error} If unable to acquire a client from the pool
 * @example
 * // Using a transaction
 * const client = await getClient();
 * try {
 *   await client.query('BEGIN');
 *   // ... perform multiple queries
 *   await client.query('COMMIT');
 * } catch (e) {
 *   await client.query('ROLLBACK');
 *   throw e;
 * } finally {
 *   client.release();
 * }
 */
const getClient = async () => {
  const client = await pool.connect();
  return client;
};

/**
 * Closes the PostgreSQL connection pool
 * @async
 * @function closePool
 * @returns {Promise<void>}
 */
const closePool = async () => {
  // Close database pool
  try {
    if (pool) {
      await pool.end();
      logger.info("Database pool closed.");
    }
  } catch (dbErr) {
    logger.error("Error closing database pool:", { error: dbErr.message, stack: dbErr.stack });
  }
};

/**
 * Execute a series of database queries within a transaction
 * @async
 * @function transaction
 * @param {Function} callback - Callback function that receives a client and executes queries
 * @returns {Promise<*>} Result of the callback function
 * @throws {Error} If the transaction fails
 * @example
 * // Using the transaction helper
 * const result = await transaction(async (client) => {
 *   const res1 = await client.query('INSERT INTO users(name) VALUES($1) RETURNING id', ['User 1']);
 *   const res2 = await client.query('INSERT INTO profiles(user_id, bio) VALUES($1, $2)', [res1.rows[0].id, 'Bio']);
 *   return res1.rows[0];
 * });
 */
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Transaction Error:", {
      errorCode: error.code,
      errorMessage: error.message,
      stack: error.stack,
    });
    throw error; // Re-throw the error to be handled by the caller
  } finally {
    client.release();
  }
};

module.exports = {
  pool, // Export pool for specific needs (e.g., listening to notifications)
  query, // Main query helper
  getClient, // Helper for transactions
  transaction, // Transaction helper function
  disconnect: closePool, // Close pool function
};
