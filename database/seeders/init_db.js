const fs = require("fs");
const path = require("path");
const { query } = require("../../config/db"); // Adjust the path as necessary
const { hashPassword } = require("../../utils/hash");
const logger = require("../../services/logger.service");

const seedFilePath = path.join(__dirname, "../migrations/001_create_initial_tables.sql");

(async function seedDatabase() {
  try {
    const seedSQL = fs.readFileSync(seedFilePath, "utf-8");
    const result = await query(seedSQL);
    if (result) {
      logger.info("Database seeded successfully.");
      const email = "shifa.newversion@gmail.com";
      const password = await hashPassword("jamyrose");
      const res = await query(
        `INSERT INTO users (email, password_hash, full_name)
            values($1, $2, $3)
            RETURNING id, email, password_hash, full_name`,
        [email, password, "Shifa ur Rehman"]
      );
      logger.info(`Super User created successfully: ${email}, ${res.rows[0].full_name}`);

      // Assign admin role (highest permission level) to the created user
      const roleResult = await query("SELECT id FROM roles WHERE name = $1", ["admin"]);
      if (roleResult.rows.length > 0) {
        const adminRoleId = roleResult.rows[0].id;
        const userId = res.rows[0].id;

        await query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", [userId, adminRoleId]);
        logger.info(`Admin role assigned successfully to user: ${email}`);
      } else {
        logger.error("Admin role not found in the database");
      }
    }
  } catch (error) {
    logger.error("Error seeding database:", { error: error.message, stack: error.stack });
  }
})();
