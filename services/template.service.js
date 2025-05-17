/**
 * @module services/email-template.service
 * @description Service for managing email templates with MJML processing and S3 storage
 */

const mjml = require("mjml");
const db = require("../config/db");
const s3Service = require("./s3.service");
const logger = require("./logger.service");
const NotFound = require("../utils/errors/NotFound");
const ConflictResourceError = require("../utils/errors/ConfictResource");
const subscriberService = require("./subscriber.service");

// S3 directory for storing email templates
const TEMPLATES_S3_PREFIX = "email-templates/";

/**
 * Extract variables from template content using regex
 * Supports formats like {{ variable }} or {{ variable || "default" }}
 * @param {string} content - Template content
 * @returns {Array<string>} - Array of found variable names
 */
function extractVariables(content) {
  // Regex to match {{ variable }} or {{ variable || "default" }} patterns
  const variableRegex = /\{\{\s*([a-zA-Z0-9_.]+)(?:\s*\|\|\s*["'](?:[^"']*)["'])?\s*\}\}/g;
  const variables = new Set();
  let match;

  while ((match = variableRegex.exec(content)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * Create a new email template with MJML content
 * @async
 * @function createEmailTemplate
 * @param {Object} templateData - Template data
 * @param {string} templateData.name - Template name
 * @param {string} templateData.subject - Email subject
 * @param {string} templateData.mjmlContent - MJML content
 * @param {string} [templateData.description] - Template description
 * @param {string} [templateData.category] - Template category
 * @param {boolean} [templateData.hasAttachments] - Whether template has attachments
 * @param {Object} [templateData.metadata] - Additional metadata
 * @returns {Promise<Object>} Created template object
 * @throws {ConflictResourceError} If a template with the same name already exists
 */
async function createEmailTemplate(templateData) {
  const { name, subject, mjmlContent, description, category, hasAttachments, metadata } = templateData;

  // Check if template with same name exists
  const existingTemplate = await db.query("SELECT id FROM email_templates WHERE name = $1 AND is_deleted = FALSE", [name]);
  if (existingTemplate.rows.length > 0) {
    throw new ConflictResourceError(`Email template with name '${name}' already exists`);
  }

  try {
    // Convert MJML to HTML
    const { html, errors } = mjml(mjmlContent);

    if (errors && errors.length > 0) {
      logger.error("MJML processing errors:", errors);
      throw new Error("Invalid MJML content: " + errors.map((e) => e.message).join(", "));
    }

    // Extract variable names from the template
    const extractedVariables = extractVariables(mjmlContent);

    // Create unique keys for S3
    const timestamp = Date.now();
    const s3AssetsPath = `${TEMPLATES_S3_PREFIX}${timestamp}/${name.replace(/\s+/g, "-").toLowerCase()}/`;
    const mjmlKey = `${s3AssetsPath}template.mjml`;
    const htmlKey = `${s3AssetsPath}template.html`;

    // Upload both MJML and HTML to S3
    await s3Service.uploadFile(mjmlKey, mjmlContent, { contentType: "text/plain" });
    await s3Service.uploadFile(htmlKey, html, { contentType: "text/html" });

    // Get user ID from request (if available)
    const userId = templateData.userId; // This should be passed from the controller

    // Store template in database
    const query = `
      INSERT INTO email_templates (
        name, subject, description, category, s3_assets_path, mjml_s3_key, html_s3_key, 
        has_attachments, template_variables, metadata, created_by, is_active, is_deleted
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const values = [
      name,
      subject,
      description || null,
      category || "General",
      s3AssetsPath,
      mjmlKey,
      htmlKey,
      hasAttachments || false,
      JSON.stringify(extractedVariables),
      metadata || null,
      userId || null,
      true, // is_active default true
      false, // is_deleted default false
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  } catch (error) {
    // Clean up S3 files if database insertion fails
    logger.error("Error creating email template:", error);
    throw error;
  }
}

/**
 * Update an existing email template
 * @async
 * @function updateEmailTemplate
 * @param {number} id - Template ID
 * @param {Object} templateData - Template data to update
 * @returns {Promise<Object>} Updated template object
 * @throws {NotFound} If template doesn't exist
 */
async function updateEmailTemplate(id, templateData) {
  // Check if template exists
  const templateCheck = await db.query("SELECT * FROM email_templates WHERE id = $1 AND is_deleted = FALSE", [id]);
  if (templateCheck.rows.length === 0) {
    throw new NotFound(`Email template with ID ${id} not found`);
  }

  const existingTemplate = templateCheck.rows[0];
  const updateFields = [];
  const values = [id]; // First parameter is the ID
  let paramIndex = 2;

  // Build dynamic update query based on provided fields
  Object.keys(templateData).forEach((key) => {
    if (templateData[key] !== undefined && key !== "userId") {
      let dbField = key.replace(/([A-Z])/g, "_$1").toLowerCase(); // Convert camelCase to snake_case

      // Special handling for MJML content
      if (key === "mjmlContent") {
        dbField = "mjml_s3_key";

        // We'll update the S3 content later, for now just mark for update
        updateFields.push(`${dbField} = $${paramIndex++}`);
        values.push(existingTemplate.mjml_s3_key); // Use existing key, we'll update content later

        // Also mark HTML key for update
        updateFields.push(`html_s3_key = $${paramIndex++}`);
        values.push(existingTemplate.html_s3_key); // Use existing key

        // Extract and update variables
        const extractedVariables = extractVariables(templateData.mjmlContent);
        updateFields.push(`template_variables = $${paramIndex++}`);
        values.push(JSON.stringify(extractedVariables));
      } else {
        updateFields.push(`${dbField} = $${paramIndex++}`);
        values.push(templateData[key]);
      }
    }
  });

  // Add updated_by if userId is provided
  if (templateData.userId) {
    updateFields.push(`updated_by = $${paramIndex++}`);
    values.push(templateData.userId);
  }

  if (updateFields.length === 0) {
    return existingTemplate; // Nothing to update
  }

  // Execute update query
  const query = `
    UPDATE email_templates 
    SET ${updateFields.join(", ")}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND is_deleted = FALSE
    RETURNING *
  `;

  const result = await db.query(query, values);

  // If MJML content was updated, process and upload new versions
  if (templateData.mjmlContent) {
    // Convert MJML to HTML
    const { html, errors } = mjml(templateData.mjmlContent);

    if (errors && errors.length > 0) {
      logger.error("MJML processing errors:", errors);
      throw new Error("Invalid MJML content: " + errors.map((e) => e.message).join(", "));
    }

    // Upload both MJML and HTML to S3 (overwriting existing files)
    await s3Service.uploadFile(existingTemplate.mjml_s3_key, templateData.mjmlContent, { contentType: "text/plain" });
    await s3Service.uploadFile(existingTemplate.html_s3_key, html, { contentType: "text/html" });
  }

  return result.rows[0];
}

/**
 * Get an email template by ID
 * @async
 * @function getEmailTemplateById
 * @param {number} id - Template ID
 * @param {boolean} [includeContent=false] - Whether to include MJML and HTML content
 * @returns {Promise<Object>} Template object
 * @throws {NotFound} If template doesn't exist
 */
async function getEmailTemplateById(id, includeContent = false) {
  const template = await db.query("SELECT * FROM email_templates WHERE id = $1 AND is_deleted = FALSE", [id]);

  if (template.rows.length === 0) {
    throw new NotFound(`Email template with ID ${id} not found`);
  }

  const templateData = template.rows[0];

  // If requested, fetch content from S3
  if (includeContent) {
    try {
      // Get MJML content
      templateData.mjmlContent = await s3Service.getFileContent(templateData.mjml_s3_key);

      // Get HTML content
      templateData.htmlContent = await s3Service.getFileContent(templateData.html_s3_key);
    } catch (error) {
      logger.error(`Error fetching S3 content for template ${id}:`, error);
      // Continue with the template data we have, but without content
    }
  }

  return templateData;
}

/**
 * Delete an email template
 * @async
 * @function deleteEmailTemplate
 * @param {number} id - Template ID
 * @param {string} [userId] - User ID performing the delete
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteEmailTemplate(id, userId = null) {
  // First get the template to find S3 keys
  const template = await db.query("SELECT * FROM email_templates WHERE id = $1 AND is_deleted = FALSE", [id]);

  if (template.rows.length === 0) {
    return false;
  }

  // Soft delete the template rather than actually deleting it
  const query = `
    UPDATE email_templates 
    SET is_deleted = TRUE, 
        updated_at = CURRENT_TIMESTAMP,
        updated_by = $2
    WHERE id = $1
    RETURNING *
  `;

  await db.query(query, [id, userId]);

  return true;
}

/**
 * List all email templates with pagination and filtering
 * @async
 * @function getAllEmailTemplates
 * @param {number} [page=1] - Page number
 * @param {number} [limit=20] - Items per page
 * @param {Object} [filters={}] - Optional filters
 * @returns {Promise<Object>} Object containing templates and pagination info
 */
async function getAllEmailTemplates(page = 1, limit = 20, filters = {}) {
  const offset = (page - 1) * limit;
  let query = "SELECT * FROM email_templates WHERE is_deleted = FALSE";
  const params = [];
  let paramIndex = 1;

  // Apply filters if provided
  if (filters.isActive !== undefined) {
    query += ` AND is_active = $${paramIndex++}`;
    params.push(filters.isActive);
  }

  if (filters.category) {
    query += ` AND category = $${paramIndex++}`;
    params.push(filters.category);
  }

  if (filters.search) {
    query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
    params.push(`%${filters.search}%`);
    paramIndex++;
  }

  // Add count query for pagination
  const countQuery = query.replace("SELECT *", "SELECT COUNT(*)");

  // Add pagination
  query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(limit, offset);

  try {
    const { rows: countRows } = await db.query(countQuery, params.slice(0, -2));
    const total = parseInt(countRows[0].count);

    const { rows } = await db.query(query, params);

    return {
      templates: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error("Error getting email templates:", error);
    throw error;
  }
}

/**
 * Render an email template with variable data
 * @async
 * @function renderEmailTemplate
 * @param {number} templateId - Template ID
 * @param {Object} [data={}] - Data for variable interpolation
 * @param {number} [subscriberId] - Optional subscriber ID to get data
 * @returns {Promise<Object>} Object with rendered subject and HTML content
 * @throws {NotFound} If template doesn't exist
 */
async function renderEmailTemplate(templateId, data = {}, subscriberId) {
  // Get template with content
  const template = await getEmailTemplateById(templateId, true);

  // Prepare the data context for variable interpolation
  let context = { ...data };

  // If subscriberId provided, merge subscriber data
  if (subscriberId) {
    try {
      const subscriber = await subscriberService.getSubscriberById(subscriberId);

      // Merge subscriber fields into context
      if (subscriber) {
        context = {
          ...context,
          ...subscriber,
          metadata: subscriber.metadata || {},
        };
      }
    } catch (error) {
      logger.warn(`Error fetching subscriber ${subscriberId} for template rendering:`, error);
      // Continue with what data we have
    }
  }

  // Process subject template
  const subject = renderVariables(template.subject, context);

  // Process HTML content template
  let htmlContent = template.htmlContent;

  if (htmlContent) {
    htmlContent = renderVariables(htmlContent, context);
  }

  return {
    subject,
    htmlContent,
    mjmlContent: template.mjmlContent,
    templateId: template.id,
    templateName: template.name,
  };
}

/**
 * Render variables in a string with fallback values
 * Supports formats like {{ variable }} or {{ variable || "default" }}
 * @param {string} content - Template content
 * @param {Object} data - Data for interpolation
 * @returns {string} - Content with variables replaced
 */
function renderVariables(content, data) {
  if (!content) return "";

  // Replace all variable patterns
  return content.replace(/\{\{\s*([a-zA-Z0-9_.]+)(?:\s*\|\|\s*(["'])([^"]*)\2)?\s*\}\}/g, (match, path, _quote, defaultValue) => {
    // Navigate the object path (supports nested properties like user.profile.name)
    const value = path.split(".").reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), data);

    // Return the value or default if specified, or empty string
    return value !== undefined ? value : defaultValue !== undefined ? defaultValue : "";
  });
}

/**
 * Get available subscriber variables for templates
 * @async
 * @function getAvailableSubscriberVariables
 * @returns {Promise<Object>} Object with available variable paths and examples
 */
async function getAvailableSubscriberVariables() {
  let standardFields = {};
  let metadataFields = {};

  try {
    // Get table columns dynamically from PostgreSQL information schema
    const columnQuery = `
      SELECT 
        column_name, 
        data_type, 
        column_default
      FROM 
        information_schema.columns 
      WHERE 
        table_name = 'subscribers'
        AND table_schema = current_schema()
      ORDER BY 
        ordinal_position`;

    const { rows: columns } = await db.query(columnQuery);

    // Get real example data for table columns
    const exampleQuery = `
      SELECT * FROM subscribers 
      WHERE is_active = true 
      ORDER BY created_at DESC 
      LIMIT 1`;

    const { rows: examples } = await db.query(exampleQuery);
    const exampleData = examples.length > 0 ? examples[0] : {};

    // Map columns to standardFields with descriptions and examples
    columns.forEach((column) => {
      // Skip internal columns or columns we don't want to expose
      if (["is_deleted", "unsubscribed_at"].includes(column.column_name)) {
        return;
      }

      // Convert snake_case to camelCase for the field key
      const fieldKey = column.column_name.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

      // Generate appropriate description based on column name
      let description = column.column_name
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      if (column.column_name === "id") description = "Subscriber's unique ID";
      else if (column.column_name === "created_at") description = "Subscription date";
      else if (column.column_name === "updated_at") description = "Last update date";

      // Get example from real data or create a sensible default
      let example = exampleData[column.column_name];

      // If no example available, create one based on data type
      if (example === undefined || example === null) {
        switch (column.data_type) {
          case "integer":
            example = 123;
            break;
          case "character varying":
            example = fieldKey === "email" ? "example@mail.com" : "Example value";
            break;
          case "boolean":
            example = true;
            break;
          case "date":
            example = "2023-05-15";
            break;
          case "timestamp with time zone":
            example = new Date().toISOString();
            break;
          default:
            example = `Example ${fieldKey}`;
        }
      }

      // Add field to standardFields
      standardFields[fieldKey] = {
        example,
        description,
        type: column.data_type,
      };
    });

    // Extract all unique metadata keys from subscribers using PostgreSQL's jsonb functions
    const metadataKeysQuery = `
      WITH metadata_keys AS (
        SELECT DISTINCT jsonb_object_keys(metadata) AS key
        FROM subscribers
        WHERE metadata IS NOT NULL
      )
      SELECT 
        mk.key,
        (SELECT metadata->mk.key FROM subscribers WHERE metadata ? mk.key LIMIT 1) AS example
      FROM 
        metadata_keys mk
      ORDER BY 
        mk.key`;

    const { rows: metadataKeys } = await db.query(metadataKeysQuery);

    // Process metadata keys
    metadataKeys.forEach((row) => {
      metadataFields[row.key] = {
        example: row.example,
        description: `Custom metadata: ${row.key}`,
        type: typeof row.example,
      };
    });
  } catch (error) {
    logger.error("Error fetching subscriber variables:", error);

    // Fallback to hardcoded fields in case of error
    standardFields = {
      id: { example: 123, description: "Subscriber's unique ID", type: "integer" },
      email: { example: "example@mail.com", description: "Email address", type: "string" },
      name: { example: "John Doe", description: "Full name", type: "string" },
      dateOfBirth: { example: "1985-04-15", description: "Date of birth (YYYY-MM-DD)", type: "date" },
      isActive: { example: true, description: "Subscription status (active/inactive)", type: "boolean" },
      createdAt: { example: "2023-05-15T10:30:00Z", description: "Subscription date", type: "timestamp" },
      updatedAt: { example: "2023-06-20T14:45:00Z", description: "Last update date", type: "timestamp" },
    };
  }

  // Combine all variables
  return {
    standard: standardFields,
    metadata: metadataFields,
    usage: {
      basic: "{{ name }}",
      withDefault: '{{ name || "Valued Subscriber" }}',
      metadata: "{{ metadata.preferredLanguage }}",
    },
  };
}

/**
 * Extract variables from email template
 * @async
 * @function getTemplateVariables
 * @param {number} templateId - Template ID
 * @returns {Promise<Object>} Object with detected variables
 * @throws {NotFound} If template doesn't exist
 */
async function getTemplateVariables(templateId) {
  // If templateId provided, get specific template variables
  if (templateId) {
    const template = await getEmailTemplateById(templateId, true);

    // Extract variables from template content
    const variables = template.mjmlContent ? extractVariables(template.mjmlContent) : JSON.parse(template.extracted_variables || "[]");

    return {
      templateName: template.name,
      variables,
      subscriberVariables: await getAvailableSubscriberVariables(),
    };
  }

  // If no templateId, just return available subscriber variables
  return {
    subscriberVariables: await getAvailableSubscriberVariables(),
  };
}

module.exports = {
  createEmailTemplate,
  updateEmailTemplate,
  getEmailTemplateById,
  deleteEmailTemplate,
  getAllEmailTemplates,
  renderEmailTemplate,
  getTemplateVariables,
  getAvailableSubscriberVariables,
  extractVariables,
};
