/**
 * @file reset_subscribers_seed.js
 * @description Seed file to reset subscribers and mailing lists and populate with 10,000 fresh subscribers
 */

const { Pool } = require("pg");
const { faker } = require("@faker-js/faker");
const dotenv = require("dotenv");
const path = require("path");

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

// Configure PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Constants
const SUBSCRIBER_COUNT = 10000;

// Arrays for generating realistic data
const INTERESTS = [
  "technology",
  "sports",
  "cooking",
  "travel",
  "finance",
  "health",
  "fitness",
  "art",
  "music",
  "books",
  "movies",
  "photography",
  "fashion",
  "gaming",
  "gardening",
  "DIY",
  "politics",
  "science",
  "history",
  "education",
];

const STATES = [
  "california",
  "new york",
  "texas",
  "florida",
  "illinois",
  "pennsylvania",
  "ohio",
  "michigan",
  "georgia",
  "north carolina",
  "new jersey",
  "virginia",
  "washington",
  "arizona",
  "massachusetts",
  "tennessee",
  "indiana",
  "missouri",
  "maryland",
  "wisconsin",
  "colorado",
  "minnesota",
  "south carolina",
  "alabama",
  "louisiana",
  "kentucky",
  "oregon",
  "oklahoma",
  "connecticut",
  "utah",
];

const MARITAL_STATUS = ["single", "married", "divorced", "widowed", "separated", "domestic partnership"];
const EDUCATION_LEVELS = ["high school", "associate degree", "bachelor degree", "master degree", "doctorate", "professional degree"];
const INCOME_BRACKETS = ["0-25k", "25k-50k", "50k-75k", "75k-100k", "100k-150k", "150k+"];
const EMPLOYMENT_STATUS = ["employed", "unemployed", "self-employed", "retired", "student"];

// Create tags for subscribers
const TAGS = [
  { name: "VIP", description: "High-value subscribers", color: "#FFD700" },
  { name: "Tech Enthusiast", description: "Interested in technology", color: "#3498DB" },
  { name: "New Customer", description: "Recently joined subscribers", color: "#2ECC71" },
  { name: "Loyal Customer", description: "Long-term subscribers", color: "#9B59B6" },
  { name: "High Spender", description: "Subscribers who spend a lot", color: "#E74C3C" },
  { name: "Newsletter", description: "Subscribed to newsletter", color: "#1ABC9C" },
  { name: "Blog Updates", description: "Subscribed to blog updates", color: "#F1C40F" },
  { name: "Product Updates", description: "Interested in product updates", color: "#2980B9" },
  { name: "Promotional", description: "Open to promotional emails", color: "#16A085" },
  { name: "Inactive", description: "Not engaged recently", color: "#7F8C8D" },
];

/**
 * Generate a random date within a range
 * @param {Date} startDate - Start date range
 * @param {Date} endDate - End date range
 * @returns {Date} - Random date within range
 */
function randomDate(startDate, endDate) {
  return new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()));
}

/**
 * Generate random array of elements from source array
 * @param {Array} sourceArray - Source array to pick from
 * @param {number} min - Minimum number of elements
 * @param {number} max - Maximum number of elements
 * @returns {Array} - Random selection of elements
 */
function randomArrayElements(sourceArray, min, max) {
  const count = Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffled = [...sourceArray].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/**
 * Generate random number of tags for a subscriber with probability distribution
 * @returns {Array} - Array of tag IDs
 */
function generateRandomTags() {
  // 60% chance to have at least one tag
  if (Math.random() > 0.4) {
    const tagProbabilities = {
      VIP: 0.1, // 10% chance to be VIP
      "Tech Enthusiast": 0.25, // 25% chance to be tech enthusiast
      "New Customer": 0.3, // 30% chance to be new
      "Loyal Customer": 0.2, // 20% chance to be loyal
      "High Spender": 0.15, // 15% chance to be high spender
      Newsletter: 0.7, // 70% chance to be subscribed to newsletter
      "Blog Updates": 0.4, // 40% chance for blog updates
      "Product Updates": 0.5, // 50% chance for product updates
      Promotional: 0.6, // 60% chance for promotional
      Inactive: 0.05, // 5% chance to be inactive
    };

    return TAGS.filter((tag) => Math.random() <= tagProbabilities[tag.name]).map((tag) => tag.name);
  }

  return [];
}

/**
 * Generate realistic metadata for a subscriber
 * @returns {Object} - Metadata object
 */
function generateMetadata() {
  // Generate between 1-5 interests
  const interests = randomArrayElements(INTERESTS, 1, 5);

  // 75% chance to have state
  const state = Math.random() <= 0.75 ? faker.helpers.arrayElement(STATES) : null;

  // 60% chance to have last ordered date within last year
  const hasOrdered = Math.random() <= 0.6;
  const lastOrdered = hasOrdered ? randomDate(new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), new Date()).toISOString() : null;

  // 50% chance to have marital status
  const maritalStatus = Math.random() <= 0.5 ? faker.helpers.arrayElement(MARITAL_STATUS) : null;

  // Other demographic details with varying probabilities
  const metadata = {
    interests,
    state,
    last_ordered: lastOrdered,
    marital_status: maritalStatus,
  };

  // 40% chance to have additional demographic info
  if (Math.random() <= 0.4) {
    metadata.education_level = faker.helpers.arrayElement(EDUCATION_LEVELS);
    metadata.income_bracket = faker.helpers.arrayElement(INCOME_BRACKETS);
    metadata.employment_status = faker.helpers.arrayElement(EMPLOYMENT_STATUS);
  }

  // 30% chance to have number of purchases
  if (hasOrdered && Math.random() <= 0.3) {
    // Pareto distribution for purchases (many with few, few with many)
    const purchaseCount = Math.floor(Math.random() * Math.random() * 50) + 1;
    metadata.purchase_count = purchaseCount;

    // If they have purchases, maybe add total spent
    if (Math.random() <= 0.5) {
      // Average order value between $20-200
      const avgOrderValue = 20 + Math.random() * 180;
      metadata.total_spent = Math.round(purchaseCount * avgOrderValue * 100) / 100;
    }
  }

  // 25% chance to have referral source
  if (Math.random() <= 0.25) {
    const sources = ["google", "facebook", "twitter", "instagram", "friend", "advertisement", "blog", "other"];
    metadata.referral_source = faker.helpers.arrayElement(sources);
  }

  // 20% chance to have account preferences
  if (Math.random() <= 0.2) {
    metadata.preferences = {
      notification_frequency: faker.helpers.arrayElement(["daily", "weekly", "monthly"]),
      theme: faker.helpers.arrayElement(["light", "dark", "system"]),
      language: faker.helpers.arrayElement(["en", "es", "fr", "de", "zh"]),
    };
  }

  return metadata;
}

/**
 * Generate a unique email that's not in the list of used emails
 * @param {Set} usedEmails - Set of already used emails
 * @returns {string} - Unique email
 */
function generateUniqueEmail(usedEmails) {
  // Create a unique email with a timestamp and random number to ensure uniqueness
  let email;
  do {
    // Add some randomness to ensure uniqueness
    const randomNumber = Math.floor(Math.random() * 1000000);
    const firstName = faker.person.firstName().toLowerCase();
    const lastName = faker.person.lastName().toLowerCase();
    const domain = faker.helpers.arrayElement(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "example.com", "test.com"]);

    // Combine with different patterns to generate unique emails
    if (Math.random() > 0.5) {
      email = `${firstName}.${lastName}${randomNumber}@${domain}`.toLowerCase();
    } else {
      email = `${firstName}_${lastName}${randomNumber}@${domain}`.toLowerCase();
    }
  } while (usedEmails.has(email));

  usedEmails.add(email);
  return email;
}

/**
 * Reset and seed the subscribers and mailing lists data
 */
async function resetAndSeedData() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    console.log("Deleting existing mailing list recipients...");
    await client.query("DELETE FROM mailing_list_recipients");

    console.log("Deleting existing mailing lists...");
    await client.query("DELETE FROM mailing_lists");

    console.log("Deleting existing subscriber tags...");
    await client.query("DELETE FROM subscriber_tags");

    console.log("Deleting existing subscribers...");
    await client.query("DELETE FROM subscribers");

    console.log("Deleting existing tags...");
    await client.query("DELETE FROM tags");

    console.log("Creating tags...");
    for (const tag of TAGS) {
      await client.query("INSERT INTO tags(name, description, color) VALUES($1, $2, $3)", [tag.name, tag.description, tag.color]);
    }

    console.log(`Generating ${SUBSCRIBER_COUNT} subscribers with metadata...`);

    // Get tag IDs from database for later use
    const tagResult = await client.query("SELECT id, name FROM tags");
    const tagIdsByName = {};
    tagResult.rows.forEach((tag) => {
      tagIdsByName[tag.name] = tag.id;
    });

    // Keep track of used emails to ensure uniqueness
    const usedEmails = new Set();

    // Generate and insert subscribers in batches to avoid memory issues
    const BATCH_SIZE = 1000;
    const batches = Math.ceil(SUBSCRIBER_COUNT / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, SUBSCRIBER_COUNT);
      const batchSize = batchEnd - batchStart;

      console.log(`Processing batch ${batchIndex + 1}/${batches} (${batchSize} subscribers)...`);

      const subscriberBatch = [];
      const tagAssignments = [];

      for (let i = 0; i < batchSize; i++) {
        // Generate random subscriber data with realistic patterns and ensure unique email
        const email = generateUniqueEmail(usedEmails);
        const name = faker.person.fullName();

        // 80% of subscribers are active
        const isActive = Math.random() <= 0.8;

        // Generate subscription date - weighted toward recent dates
        const yearAgo = new Date();
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);

        // More recent subscribers, with exponential distribution
        const timeFactor = Math.pow(Math.random(), 2); // Exponential distribution
        const subscriptionDate = new Date(Date.now() - timeFactor * (365 * 24 * 60 * 60 * 1000));

        // Only 20% of inactive subscribers have unsubscribe date
        const unsubscribedAt =
          !isActive && Math.random() <= 0.2
            ? new Date(subscriptionDate.getTime() + Math.random() * (Date.now() - subscriptionDate.getTime()))
            : null;

        // 30% chance to have date of birth
        const dateOfBirth = Math.random() <= 0.3 ? randomDate(new Date(1950, 0, 1), new Date(2005, 0, 1)) : null;

        // Generate rich metadata
        const metadata = generateMetadata();

        // Add to batch
        subscriberBatch.push({
          email,
          name,
          dateOfBirth,
          metadata,
          isActive,
          subscribedAt: subscriptionDate,
          unsubscribedAt,
        });

        // Generate tags for this subscriber
        const subscriberTags = generateRandomTags();
        if (subscriberTags.length > 0) {
          tagAssignments.push({
            email,
            tags: subscriberTags.map((tagName) => tagIdsByName[tagName]),
          });
        }
      }

      // Insert subscribers in this batch
      for (const subscriber of subscriberBatch) {
        const result = await client.query(
          `INSERT INTO subscribers(email, name, date_of_birth, metadata, is_active, subscribed_at, unsubscribed_at) 
           VALUES($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            subscriber.email,
            subscriber.name,
            subscriber.dateOfBirth,
            JSON.stringify(subscriber.metadata),
            subscriber.isActive,
            subscriber.subscribedAt,
            subscriber.unsubscribedAt,
          ]
        );

        const subscriberId = result.rows[0].id;

        // Find tag assignments for this subscriber
        const assignment = tagAssignments.find((t) => t.email === subscriber.email);
        if (assignment && assignment.tags.length > 0) {
          for (const tagId of assignment.tags) {
            await client.query("INSERT INTO subscriber_tags(subscriber_id, tag_id) VALUES($1, $2)", [subscriberId, tagId]);
          }
        }
      }
    }

    console.log("Data seeding completed successfully!");
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error seeding data:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the seeding function
resetAndSeedData()
  .then(() => {
    console.log("Completed reset and seed process!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Failed to reset and seed data:", err);
    process.exit(1);
  });
