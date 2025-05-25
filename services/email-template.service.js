/**
 * @module services/email-template
 * @description Service for managing email templates with MJML and Liquid support
 */
const mjml = require("mjml");
const { Liquid } = require("liquidjs");
const db = require("../config/db");
const logger = require("./logger.service");
const s3Service = require("./s3.service");
const { NotFoundError, ConflictResourceError, BadRequestError } = require("../utils/errors");

// Initialize Liquid engine
const liquid = new Liquid({
  strictFilters: false, // Don't throw errors for undefined filters
  strictVariables: false, // Don't throw errors for undefined variables
});

// S3 path for storing email template files
const S3_TEMPLATES_PATH = "app_data/templates";

/**
 * Extract Liquid variables from a template string
 * @param {string} templateContent - The template content to parse
 * @returns {Array<string>} - Array of variable names used in the template
 */
function extractTemplateVariables(templateContent) {
  const variables = new Set();

  // Liquid variable pattern: {{ variable_name }} or {{ object.property }}
  const variableRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s*(?:\|\s*[^}]+)?\s*\}\}/g;

  // Liquid tag pattern: {% if variable %}, {% for item in array %}, etc.
  const tagRegex = /\{\%\s*(?:if|unless|for|assign|capture|include|case|when)\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g;

  let match;

  // Extract variables from {{ variable }} patterns
  while ((match = variableRegex.exec(templateContent)) !== null) {
    const varName = match[1].trim();
    // Skip complex expressions and filters, just get the base variable
    const baseVar = varName.split(".")[0].split("|")[0].trim();
    if (baseVar && !baseVar.includes(" ") && !baseVar.includes("+") && !baseVar.includes("-")) {
      variables.add(baseVar);
      // Also add the full path for nested properties
      if (varName.includes(".")) {
        variables.add(varName);
      }
    }
  }

  // Extract variables from {% tag variable %} patterns
  while ((match = tagRegex.exec(templateContent)) !== null) {
    const varName = match[1].trim();
    const baseVar = varName.split(".")[0].trim();
    if (baseVar && !baseVar.includes(" ")) {
      variables.add(baseVar);
      // Also add the full path for nested properties
      if (varName.includes(".")) {
        variables.add(varName);
      }
    }
  }

  return Array.from(variables);
}

/**
 * Categorize template variables between standard subscriber fields and custom fields
 * Uses the subscriber_variables table for efficient variable lookup
 * @param {Array<string>} variables - List of variables extracted from template
 * @returns {Promise<Object>} Object with standard and custom variables with availability info
 */
async function categorizeTemplateVariables(variables) {
  const subscriberVariablesService = require("./subscriber-variables.service");

  // Standard subscriber fields
  const standardSubscriberFields = ["id", "email", "name", "date_of_birth", "subscribed_at", "unsubscribed_at", "created_at", "updated_at"];

  // Standard campaign fields
  const standardCampaignFields = ["campaign_name", "sent_date", "unsubscribe_url", "company_name", "company_address"];

  // All standard fields combined
  const allStandardFields = [...standardSubscriberFields, ...standardCampaignFields];

  // Get all available variables from subscriber_variables table
  const availableVariables = await subscriberVariablesService.getAllAvailableVariables();
  const availableVariableNames = [...Object.keys(availableVariables.standard), ...Object.keys(availableVariables.metadata)];

  const standardVariables = [];
  const metadataVariables = [];
  const customVariables = [];
  const unavailableVariables = [];

  variables.forEach((variable) => {
    // Check if it's a standard field
    if (allStandardFields.includes(variable)) {
      const variableInfo = availableVariables.standard[variable];
      standardVariables.push({
        name: variable,
        available: true,
        type: "standard",
        subscriberCount: variableInfo?.usage_count || 0,
      });
    }
    // Check if it's a metadata field (starts with metadata.)
    else if (variable.startsWith("metadata.")) {
      const isAvailable = availableVariableNames.includes(variable);
      const variableInfo = availableVariables.metadata[variable];

      metadataVariables.push({
        name: variable.substring("metadata.".length),
        fullName: variable,
        available: isAvailable,
        type: variableInfo?.type || "unknown",
        subscriberCount: variableInfo?.usage_count || 0,
      });
    }
    // Otherwise it's a custom variable provided by user
    else {
      // Check if it exists in our subscriber variables (could be a direct metadata reference)
      const isAvailable = availableVariableNames.includes(variable);
      const standardInfo = availableVariables.standard[variable];
      const metadataInfo = availableVariables.metadata[variable];
      const variableInfo = standardInfo || metadataInfo;

      if (isAvailable) {
        metadataVariables.push({
          name: variable,
          fullName: variable,
          available: true,
          type: variableInfo?.type || "unknown",
          subscriberCount: variableInfo?.usage_count || 0,
        });
      } else {
        customVariables.push({
          name: variable,
          available: false,
          type: "custom",
        });
      }
    }
  });

  return {
    standard: standardVariables,
    metadata: metadataVariables,
    custom: customVariables,
    unavailable: unavailableVariables,
    summary: {
      total: variables.length,
      available: standardVariables.length + metadataVariables.filter((v) => v.available).length,
      unavailable: customVariables.length + metadataVariables.filter((v) => !v.available).length,
    },
  };
}

/**
 * Convert MJML content to HTML
 * @param {string} mjmlContent - MJML template content
 * @returns {string} - Converted HTML content
 */
function convertMjmlToHtml(mjmlContent) {
  const result = mjml(mjmlContent);

  if (result.errors && result.errors.length > 0) {
    logger.error("MJML conversion errors:", result.errors);
    throw new BadRequestError("Invalid MJML content: " + result.errors[0].message);
  }

  return result.html;
}

/**
 * Validate Liquid template syntax
 * @param {string} templateContent - Template content to validate
 * @returns {boolean} - True if valid, throws error if invalid
 */
async function validateLiquidTemplate(templateContent) {
  try {
    // Parse the template to check for syntax errors
    await liquid.parseAndRender(templateContent, {});
    return true;
  } catch (error) {
    logger.error("Liquid template validation error:", error);
    throw new BadRequestError(`Invalid Liquid template: ${error.message}`);
  }
}

/**
 * Create a new email template
 * @param {Object} templateData - Template data
 * @param {string} userId - ID of the user creating the template
 * @returns {Promise<Object>} - Created template
 */
async function createEmailTemplate(templateData, userId) {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Validate MJML and Liquid syntax
    await validateLiquidTemplate(templateData.mjmlContent);
    const htmlContent = convertMjmlToHtml(templateData.mjmlContent);

    // Extract template variables
    const variables = extractTemplateVariables(templateData.mjmlContent);
    const categorizedVariables = categorizeTemplateVariables(variables);

    // Insert template record
    const insertResult = await client.query(
      `INSERT INTO email_templates 
       (name, description, category, has_attachments, template_variables, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING id, name, description, category, has_attachments, template_variables, created_at`,
      [
        templateData.name,
        templateData.description || null,
        templateData.category || "General",
        templateData.hasAttachments || false,
        JSON.stringify({
          standard: categorizedVariables.standard,
          metadata: categorizedVariables.metadata,
          custom: categorizedVariables.custom,
          subject: templateData.subject,
        }),
        userId,
      ]
    );

    const template = insertResult.rows[0];

    // Generate S3 keys
    const templateDirPath = `${S3_TEMPLATES_PATH}/${template.id}-${templateData.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    const mjmlKey = `${templateDirPath}/source.mjml`;
    const htmlKey = `${templateDirPath}/converted.html`;

    // Upload files to S3
    await Promise.all([
      s3Service.uploadFileContent(mjmlKey, templateData.mjmlContent, "text/plain"),
      s3Service.uploadFileContent(htmlKey, htmlContent, "text/html"),
    ]);

    // Update template record with S3 keys
    await client.query(
      `UPDATE email_templates 
       SET mjml_s3_key = $1, html_s3_key = $2, s3_assets_path = $3
       WHERE id = $4`,
      [mjmlKey, htmlKey, templateDirPath, template.id]
    );

    // Get the updated template
    const updatedResult = await client.query(`SELECT * FROM email_templates WHERE id = $1`, [template.id]);

    await client.query("COMMIT");

    return updatedResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Error creating email template:", error);

    if (error.code === "23505") {
      throw new ConflictResourceError("A template with this name already exists");
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get email template by ID
 * @param {number} id - Template ID
 * @param {boolean} includeContent - Whether to include template content from S3
 * @returns {Promise<Object>} - Email template
 */
async function getEmailTemplateById(id, includeContent = false) {
  const result = await db.query("SELECT * FROM email_templates WHERE id = $1 AND is_deleted = FALSE", [id]);

  if (result.rows.length === 0) {
    throw new NotFoundError("Email template not found");
  }

  const template = result.rows[0];

  if (includeContent && template.mjml_s3_key) {
    try {
      const mjmlContent = await s3Service.getFileContent(template.mjml_s3_key);
      template.mjmlContent = mjmlContent;

      if (template.html_s3_key) {
        const htmlContent = await s3Service.getFileContent(template.html_s3_key);
        template.htmlContent = htmlContent;
      }
    } catch (error) {
      logger.error(`Error retrieving template content for template ${id}:`, error);
      // Continue without content if there's an error retrieving it
    }
  }

  return template;
}

/**
 * List email templates with pagination and filtering
 * @param {Object} queryParams - Query parameters for pagination and filtering
 * @returns {Promise<Object>} - Paginated list of email templates
 */
async function listEmailTemplates(queryParams = {}) {
  // Set default query params
  const page = Number(queryParams.page) || 1;
  const limit = Number(queryParams.limit) || 10;
  const offset = (page - 1) * limit;
  const sortBy = queryParams.sortBy || "created_at";
  const sortOrder = queryParams.sortOrder || "desc";

  const params = [];
  let paramIndex = 1;

  // Build query with optional filters
  let query = `
    SELECT * 
    FROM email_templates
    WHERE is_deleted = FALSE
  `;

  // Add search filter if provided
  if (queryParams.search) {
    query += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
    params.push(`%${queryParams.search}%`);
    paramIndex++;
  }

  // Add category filter if provided
  if (queryParams.category) {
    query += ` AND category = $${paramIndex}`;
    params.push(queryParams.category);
    paramIndex++;
  }

  // Add active status filter if specified
  if (queryParams.isActive !== undefined) {
    query += ` AND is_active = $${paramIndex}`;
    params.push(queryParams.isActive);
    paramIndex++;
  }

  // Add pagination and sorting
  const validSortColumns = ["id", "name", "category", "created_at", "updated_at"];
  const validSortOrders = ["asc", "desc"];

  const actualSortBy = validSortColumns.includes(sortBy) ? sortBy : "created_at";
  const actualSortOrder = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder : "desc";

  query += ` ORDER BY ${actualSortBy} ${actualSortOrder}
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(limit, offset);

  // Execute the main query
  const result = await db.query(query, params);

  // Get total count for pagination
  const countQuery = `
    SELECT COUNT(*) 
    FROM email_templates 
    WHERE is_deleted = FALSE
    ${queryParams.search ? ` AND (name ILIKE $1 OR description ILIKE $1)` : ""}
    ${queryParams.category ? ` AND category = $${queryParams.search ? 2 : 1}` : ""}
    ${queryParams.isActive !== undefined ? ` AND is_active = $${(queryParams.search ? 1 : 0) + (queryParams.category ? 1 : 0) + 1}` : ""}
  `;

  const countParams = params.slice(0, paramIndex - 1);
  const countResult = await db.query(countQuery, countParams);

  const totalCount = parseInt(countResult.rows[0].count);
  const totalPages = Math.ceil(totalCount / limit);

  return {
    data: result.rows,
    pagination: {
      page,
      limit,
      totalItems: totalCount,
      totalPages,
    },
  };
}

/**
 * Update an email template
 * @param {number} id - Template ID
 * @param {Object} updateData - Data to update
 * @param {string} userId - ID of the user updating the template
 * @returns {Promise<Object>} - Updated template
 */
async function updateEmailTemplate(id, updateData, userId) {
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    // Check if template exists
    const existingResult = await client.query("SELECT * FROM email_templates WHERE id = $1 AND is_deleted = FALSE", [id]);

    if (existingResult.rows.length === 0) {
      throw new NotFoundError("Email template not found");
    }

    const existingTemplate = existingResult.rows[0];
    const updates = [];
    const params = [id]; // First parameter is always the ID
    let paramIndex = 2;

    // Build update query based on provided fields
    if (updateData.name) {
      updates.push(`name = $${paramIndex}`);
      params.push(updateData.name);
      paramIndex++;
    }

    if (updateData.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(updateData.description);
      paramIndex++;
    }

    if (updateData.category) {
      updates.push(`category = $${paramIndex}`);
      params.push(updateData.category);
      paramIndex++;
    }

    if (updateData.hasAttachments !== undefined) {
      updates.push(`has_attachments = $${paramIndex}`);
      params.push(updateData.hasAttachments);
      paramIndex++;
    }

    if (updateData.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex}`);
      params.push(updateData.isActive);
      paramIndex++;
    }

    // Always update updated_by and updated_at
    updates.push(`updated_by = $${paramIndex}`);
    params.push(userId);
    paramIndex++;

    updates.push(`updated_at = NOW()`);

    // Handle MJML content update if provided
    let newVariables = null;
    if (updateData.mjmlContent) {
      // Validate MJML and Liquid syntax
      await validateLiquidTemplate(updateData.mjmlContent);
      const htmlContent = convertMjmlToHtml(updateData.mjmlContent);

      // Extract template variables
      const variables = extractTemplateVariables(updateData.mjmlContent);
      const categorizedVariables = categorizeTemplateVariables(variables);

      // Include subject from existing or new data
      const subject = updateData.subject || (existingTemplate.template_variables && existingTemplate.template_variables.subject) || "";

      newVariables = {
        standard: categorizedVariables.standard,
        metadata: categorizedVariables.metadata,
        custom: categorizedVariables.custom,
        subject,
      };

      updates.push(`template_variables = $${paramIndex}`);
      params.push(JSON.stringify(newVariables));
      paramIndex++;

      // Upload new content to S3
      if (existingTemplate.mjml_s3_key && existingTemplate.html_s3_key) {
        await Promise.all([
          s3Service.uploadFileContent(existingTemplate.mjml_s3_key, updateData.mjmlContent, "text/plain"),
          s3Service.uploadFileContent(existingTemplate.html_s3_key, htmlContent, "text/html"),
        ]);
      } else {
        // Generate S3 keys if they don't exist
        const templateName = updateData.name || existingTemplate.name;
        const templateDirPath = `${S3_TEMPLATES_PATH}/${id}-${templateName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
        const mjmlKey = `${templateDirPath}/source.mjml`;
        const htmlKey = `${templateDirPath}/converted.html`;

        await Promise.all([
          s3Service.uploadFileContent(mjmlKey, updateData.mjmlContent, "text/plain"),
          s3Service.uploadFileContent(htmlKey, htmlContent, "text/html"),
        ]);

        updates.push(`mjml_s3_key = $${paramIndex}`);
        params.push(mjmlKey);
        paramIndex++;

        updates.push(`html_s3_key = $${paramIndex}`);
        params.push(htmlKey);
        paramIndex++;

        updates.push(`s3_assets_path = $${paramIndex}`);
        params.push(templateDirPath);
        paramIndex++;
      }
    } else if (updateData.subject && existingTemplate.template_variables) {
      // Update only the subject in template_variables
      const templateVars = { ...existingTemplate.template_variables, subject: updateData.subject };
      updates.push(`template_variables = $${paramIndex}`);
      params.push(JSON.stringify(templateVars));
      paramIndex++;
    }

    // If there are no updates, return the existing template
    if (updates.length === 0) {
      return existingTemplate;
    }

    // Execute update query
    const updateQuery = `
      UPDATE email_templates
      SET ${updates.join(", ")}
      WHERE id = $1
      RETURNING *
    `;

    const updateResult = await client.query(updateQuery, params);

    await client.query("COMMIT");

    return updateResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Error updating email template:", error);

    if (error.code === "23505") {
      throw new ConflictResourceError("A template with this name already exists");
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete an email template (soft delete)
 * @param {number} id - Template ID
 * @param {string} userId - ID of the user deleting the template
 * @returns {Promise<boolean>} - True if successfully deleted
 */
async function deleteEmailTemplate(id, userId) {
  // Check if template exists
  const existingResult = await db.query("SELECT id FROM email_templates WHERE id = $1 AND is_deleted = FALSE", [id]);

  if (existingResult.rows.length === 0) {
    throw new NotFoundError("Email template not found");
  }

  // Soft delete the template
  await db.query(
    `UPDATE email_templates 
     SET is_deleted = TRUE, 
         updated_by = $2, 
         updated_at = NOW()
     WHERE id = $1`,
    [id, userId]
  );

  return true;
}

/**
 * Get variables used in a template
 * @param {number} id - Template ID
 * @returns {Promise<Object>} - Template variables
 */
async function getTemplateVariables(id) {
  const result = await db.query("SELECT template_variables FROM email_templates WHERE id = $1 AND is_deleted = FALSE", [id]);

  if (result.rows.length === 0) {
    throw new NotFoundError("Email template not found");
  }

  return result.rows[0].template_variables || { standard: [], metadata: [], custom: [] };
}

/**
 * Render MJML content with Liquid and convert to HTML
 * @param {string} mjmlContent - MJML content with Liquid variables
 * @param {Object|number} contextOrSubscriberId - Liquid context object or subscriber ID to load variables
 * @param {Object} additionalContext - Additional context to merge (when using subscriber ID)
 * @returns {Promise<Object>} - Rendered HTML content
 */
async function renderTemplate(mjmlContent, contextOrSubscriberId = {}, additionalContext = {}) {
  try {
    let context = {};

    // Check if first parameter is a subscriber ID (number)
    if (typeof contextOrSubscriberId === "number") {
      const subscriberVariablesService = require("./subscriber-variables.service");
      const subscriberVariables = await subscriberVariablesService.getSubscriberVariables(contextOrSubscriberId);

      // Merge subscriber variables with additional context
      context = {
        ...subscriberVariables.standard,
        metadata: subscriberVariables.metadata,
        ...additionalContext,
      };
    } else {
      // Use provided context directly
      context = contextOrSubscriberId;
    }

    // Render the template with Liquid
    const renderedMjml = await liquid.parseAndRender(mjmlContent, context);

    // Convert the rendered MJML to HTML
    const htmlResult = convertMjmlToHtml(renderedMjml);

    return {
      html: htmlResult,
      mjml: renderedMjml,
      context: context, // Include context for debugging
    };
  } catch (error) {
    logger.error("Error rendering template:", error);
    throw new BadRequestError(`Error rendering template: ${error.message}`);
  }
}

/**
 * Preview an email template with sample data or real subscriber data
 * @param {number} id - Template ID or raw MJML content
 * @param {Object|number} sampleDataOrSubscriberId - Sample data object or subscriber ID for real data
 * @param {boolean} isRawContent - Whether id is raw content instead of template ID
 * @param {Object} additionalContext - Additional context to merge with subscriber data
 * @returns {Promise<Object>} - Rendered HTML preview
 */
async function previewTemplate(id, sampleDataOrSubscriberId = {}, isRawContent = false, additionalContext = {}) {
  let mjmlContent;

  if (isRawContent) {
    // Use the provided content directly
    mjmlContent = id;
  } else {
    // Get the template from database
    const template = await getEmailTemplateById(id, true);

    if (!template.mjmlContent) {
      throw new NotFoundError("Template content not found");
    }

    mjmlContent = template.mjmlContent;
  }
  // Render the template with sample data or subscriber data
  return renderTemplate(mjmlContent, sampleDataOrSubscriberId, additionalContext);
}

/**
 * Render variables in a string with fallback values (Liquid alternative)
 * Supports formats like {{ variable }} or {{ variable | default: "default" }}
 * @param {string} content - Template content
 * @param {Object} data - Data for interpolation
 * @returns {Promise<string>} - Content with variables replaced
 */
async function renderVariables(content, data) {
  if (!content) return "";

  try {
    // Use Liquid to render the content
    return await liquid.parseAndRender(content, data);
  } catch (error) {
    logger.error("Error rendering variables:", error);
    // Fallback to original content if rendering fails
    return content;
  }
}

/**
 * Get standard template variables with real usage data from subscriber_variables table
 * @returns {Promise<Object>} Available template variables with usage statistics
 */
async function getStandardTemplateVariables() {
  const subscriberVariablesService = require("./subscriber-variables.service");

  try {
    const availableVariables = await subscriberVariablesService.getAllAvailableVariables();

    // Add campaign variables (these are provided during campaign sending)
    const campaignVariables = {
      campaign_name: { name: "campaign_name", type: "string", usage_count: 0, example: "{{campaign_name}}" },
      sent_date: { name: "sent_date", type: "date", usage_count: 0, example: "{{sent_date}}" },
      unsubscribe_url: { name: "unsubscribe_url", type: "url", usage_count: 0, example: "{{unsubscribe_url}}" },
      company_name: { name: "company_name", type: "string", usage_count: 0, example: "{{company_name}}" },
      company_address: { name: "company_address", type: "string", usage_count: 0, example: "{{company_address}}" },
    };

    return {
      subscriber: {
        standard: availableVariables.standard,
        metadata: availableVariables.metadata,
      },
      campaign: campaignVariables,
      examples: {
        basic_greeting: "Hello {{name}}, welcome to our newsletter!",
        personalized_content: "Hi {{name}}, we found {{metadata.interests}} might interest you.",
        campaign_footer: "This email was sent on {{sent_date}} as part of {{campaign_name}}. {{unsubscribe_url}}",
      },
    };
  } catch (error) {
    logger.error("Error fetching standard template variables:", error);
    throw error;
  }
}

module.exports = {
  createEmailTemplate,
  getEmailTemplateById,
  listEmailTemplates,
  updateEmailTemplate,
  deleteEmailTemplate,
  getTemplateVariables,
  renderTemplate,
  previewTemplate,
  extractTemplateVariables,
  convertMjmlToHtml,
  categorizeTemplateVariables,
  getStandardTemplateVariables,
};
