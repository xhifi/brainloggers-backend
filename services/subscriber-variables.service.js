/**
 * @module services/subscriber-variables
 * @description Service for managing subscriber variables extracted from standard fields and metadata
 */

const db = require("../config/db");
const logger = require("./logger.service");

/**
 * Get all available variable definitions
 * @returns {Promise<Object>} Object with all available variables and their data types
 */
async function getAllAvailableVariables() {
  try {
    const { rows } = await db.query(`
      SELECT 
        variable_name,
        data_type
      FROM subscriber_variables 
      ORDER BY variable_name
    `);

    const result = {
      variables: {},
      total_count: rows.length,
    };

    rows.forEach((row) => {
      result.variables[row.variable_name] = {
        name: row.variable_name,
        data_type: row.data_type,
        example: `{{ ${row.variable_name} }}`, // Liquid format
      };
    });

    return result;
  } catch (error) {
    logger.error("Error fetching all available variables:", error);
    throw error;
  }
}

/**
 * Get actual variable values for a specific subscriber
 * @param {number} subscriberId - The subscriber ID
 * @returns {Promise<Object>} Object with all variable values for the subscriber
 */
async function getSubscriberVariables(subscriberId) {
  try {
    // Get subscriber data from the main subscribers table
    const { rows: subscriberRows } = await db.query(
      `
      SELECT id, email, name, date_of_birth, subscribed_at, unsubscribed_at, 
             created_at, updated_at, metadata
      FROM subscribers
      WHERE id = $1
    `,
      [subscriberId]
    );

    if (subscriberRows.length === 0) {
      throw new Error(`Subscriber with ID ${subscriberId} not found`);
    }

    const subscriber = subscriberRows[0];
    const result = {};

    // Add standard field values
    result.id = subscriber.id;
    result.email = subscriber.email;
    result.name = subscriber.name;
    result.date_of_birth = subscriber.date_of_birth;
    result.subscribed_at = subscriber.subscribed_at;
    result.unsubscribed_at = subscriber.unsubscribed_at;
    result.created_at = subscriber.created_at;
    result.updated_at = subscriber.updated_at;

    // Add metadata values with 'metadata.' prefix to match variable definitions
    if (subscriber.metadata && typeof subscriber.metadata === "object") {
      Object.keys(subscriber.metadata).forEach((key) => {
        result[`metadata.${key}`] = subscriber.metadata[key];
      });
    }

    return result;
  } catch (error) {
    logger.error("Error fetching subscriber variables:", error);
    throw error;
  }
}

/**
 * Get variables for multiple subscribers (for bulk operations like campaigns)
 * @param {Array<number>} subscriberIds - Array of subscriber IDs
 * @returns {Promise<Object>} Object mapping subscriber IDs to their variables
 */
async function getVariablesForSubscribers(subscriberIds) {
  if (!subscriberIds || subscriberIds.length === 0) {
    return {};
  }

  try {
    const placeholders = subscriberIds.map((_, index) => `$${index + 1}`).join(",");
    const { rows } = await db.query(
      `
      SELECT id, email, name, date_of_birth, subscribed_at, unsubscribed_at, 
             created_at, updated_at, metadata
      FROM subscribers
      WHERE id IN (${placeholders})
      ORDER BY id
    `,
      subscriberIds
    );

    const result = {};

    rows.forEach((subscriber) => {
      const variables = {};

      // Add standard field values
      variables.id = subscriber.id;
      variables.email = subscriber.email;
      variables.name = subscriber.name;
      variables.date_of_birth = subscriber.date_of_birth;
      variables.subscribed_at = subscriber.subscribed_at;
      variables.unsubscribed_at = subscriber.unsubscribed_at;
      variables.created_at = subscriber.created_at;
      variables.updated_at = subscriber.updated_at;

      // Add metadata values with 'metadata.' prefix
      if (subscriber.metadata && typeof subscriber.metadata === "object") {
        Object.keys(subscriber.metadata).forEach((key) => {
          variables[`metadata.${key}`] = subscriber.metadata[key];
        });
      }

      result[subscriber.id] = variables;
    });

    return result;
  } catch (error) {
    logger.error("Error fetching variables for multiple subscribers:", error);
    throw error;
  }
}

/**
 * Search for variables by name pattern
 * @param {string} pattern - Search pattern (supports SQL LIKE patterns)
 * @param {string} [dataType] - Filter by data type ('string', 'number', 'email', etc.)
 * @returns {Promise<Array>} Array of matching variable definitions
 */
async function searchVariables(pattern, dataType = null) {
  try {
    let query = `
      SELECT 
        variable_name,
        data_type
      FROM subscriber_variables 
      WHERE variable_name ILIKE $1
    `;

    const params = [`%${pattern}%`];

    if (dataType) {
      query += ` AND data_type = $2`;
      params.push(dataType);
    }

    query += `
      ORDER BY 
        CASE 
          WHEN variable_name LIKE 'metadata.%' THEN 2 
          ELSE 1 
        END,
        variable_name
    `;

    const { rows } = await db.query(query, params);

    return rows.map((row) => ({
      name: row.variable_name,
      type: row.variable_name.startsWith("metadata.") ? "metadata" : "standard",
      data_type: row.data_type,
      example: `{{${row.variable_name}}}`,
    }));
  } catch (error) {
    logger.error("Error searching variables:", error);
    throw error;
  }
}

/**
 * Get variable definition statistics
 * @returns {Promise<Object>} Statistics about available variable definitions
 */
async function getVariableStatistics() {
  try {
    // Get count by type (standard vs metadata)
    const { rows: typeStats } = await db.query(`
      SELECT 
        CASE 
          WHEN variable_name LIKE 'metadata.%' THEN 'metadata'
          ELSE 'standard'
        END as variable_type,
        COUNT(*) as count
      FROM subscriber_variables
      GROUP BY 
        CASE 
          WHEN variable_name LIKE 'metadata.%' THEN 'metadata'
          ELSE 'standard'
        END
    `);

    // Get count by data type
    const { rows: dataTypeStats } = await db.query(`
      SELECT 
        data_type,
        COUNT(*) as count
      FROM subscriber_variables
      GROUP BY data_type
      ORDER BY count DESC
    `);

    // Get total subscriber count for potential usage calculation
    const { rows: subscriberCount } = await db.query(`
      SELECT COUNT(*) as total_subscribers
      FROM subscribers
    `);

    // Get all variable definitions
    const { rows: allVariables } = await db.query(`
      SELECT 
        variable_name,
        data_type,
        CASE 
          WHEN variable_name LIKE 'metadata.%' THEN 'metadata'
          ELSE 'standard'
        END as variable_type
      FROM subscriber_variables
      ORDER BY variable_name
    `);

    return {
      total_variables: allVariables.length,
      total_subscribers: parseInt(subscriberCount[0].total_subscribers),
      by_type: typeStats.reduce((acc, row) => {
        acc[row.variable_type] = {
          unique_variables: parseInt(row.count),
        };
        return acc;
      }, {}),
      by_data_type: dataTypeStats.map((row) => ({
        data_type: row.data_type,
        count: parseInt(row.count),
      })),
      all_variables: allVariables.map((row) => ({
        name: row.variable_name,
        type: row.variable_type,
        data_type: row.data_type,
        example: `{{${row.variable_name}}}`,
      })),
    };
  } catch (error) {
    logger.error("Error fetching variable statistics:", error);
    throw error;
  }
}

/**
 * Manual trigger to refresh variable definitions from a subscriber (useful for testing or manual updates)
 * @param {number} subscriberId - The subscriber ID to analyze for new variable definitions
 * @returns {Promise<void>}
 */
async function refreshSubscriberVariables(subscriberId) {
  try {
    // Get the subscriber data
    const { rows } = await db.query("SELECT * FROM subscribers WHERE id = $1", [subscriberId]);

    if (rows.length === 0) {
      throw new Error(`Subscriber with ID ${subscriberId} not found`);
    }

    // Call the database function to extract variable definitions
    await db.query("SELECT extract_subscriber_variable_definitions($1::subscribers)", [rows[0]]);

    logger.info(`Variable definitions refreshed from subscriber ${subscriberId}`);
  } catch (error) {
    logger.error(`Error refreshing variable definitions from subscriber ${subscriberId}:`, error);
    throw error;
  }
}

/**
 * Analyze template variable availability for specific subscribers or all subscribers
 * @param {number} templateId - Template ID (for context)
 * @param {Array<number>} [subscriberIds] - Specific subscriber IDs to analyze (optional)
 * @returns {Promise<Object>} Availability analysis for template variables
 */
async function analyzeTemplateVariableAvailability(templateId, subscriberIds = null) {
  try {
    // First, get the template content to extract variables
    const { rows: templateRows } = await db.query(
      `
      SELECT mjml_content, html_content 
      FROM email_templates 
      WHERE id = $1
    `,
      [templateId]
    );

    if (templateRows.length === 0) {
      throw new Error(`Template with ID ${templateId} not found`);
    }

    // Extract variables from template content (simple regex approach)
    const template = templateRows[0];
    const content = template.mjml_content || template.html_content || "";
    const variableMatches = content.match(/\{\{([^}]+)\}\}/g) || [];
    const templateVariables = [...new Set(variableMatches.map((match) => match.replace(/[{}]/g, "").trim()))];

    if (templateVariables.length === 0) {
      return {
        available: [],
        unavailable: [],
        summary: {
          total_variables: 0,
          available_count: 0,
          unavailable_count: 0,
        },
      };
    }

    // Check which variables exist in our definitions
    const placeholders = templateVariables.map((_, index) => `$${index + 1}`).join(",");
    const { rows: definedVariables } = await db.query(
      `
      SELECT variable_name, data_type
      FROM subscriber_variables
      WHERE variable_name IN (${placeholders})
    `,
      templateVariables
    );

    const definedVariableNames = new Set(definedVariables.map((row) => row.variable_name));

    const available = definedVariables.map((row) => ({
      name: row.variable_name,
      data_type: row.data_type,
      type: row.variable_name.startsWith("metadata.") ? "metadata" : "standard",
      status: "defined",
    }));

    const unavailable = templateVariables
      .filter((varName) => !definedVariableNames.has(varName))
      .map((varName) => ({
        name: varName,
        reason: "Variable not defined in system",
        suggestion: varName.includes(".") ? "Check if this metadata field exists in subscriber data" : "Verify variable name spelling",
      }));

    // If specific subscribers are provided, check actual data availability
    let dataAvailability = null;
    if (subscriberIds && subscriberIds.length > 0) {
      const subscriberData = await getVariablesForSubscribers(subscriberIds);

      dataAvailability = available.map((variable) => {
        const subscribersWithData = subscriberIds.filter((id) => {
          const data = subscriberData[id];
          return data && data[variable.name] !== null && data[variable.name] !== undefined;
        });

        return {
          ...variable,
          subscribers_with_data: subscribersWithData.length,
          total_subscribers_checked: subscriberIds.length,
          availability_percentage: Math.round((subscribersWithData.length / subscriberIds.length) * 100),
        };
      });
    }

    return {
      template_id: templateId,
      variables_found: templateVariables.length,
      available,
      unavailable,
      data_availability: dataAvailability,
      summary: {
        total_variables: templateVariables.length,
        available_count: available.length,
        unavailable_count: unavailable.length,
      },
    };
  } catch (error) {
    logger.error("Error analyzing template variable availability:", error);
    throw error;
  }
}

module.exports = {
  getAllAvailableVariables,
  getSubscriberVariables,
  getVariablesForSubscribers,
  searchVariables,
  getVariableStatistics,
  refreshSubscriberVariables,
  analyzeTemplateVariableAvailability,
};
