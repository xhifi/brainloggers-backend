const mjml2html = require("mjml");
const { v4: uuidv4 } = require("uuid");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const db = require("../config/db");
const config = require("../config");
const logger = require("./logger.service");
const { NotFound } = require("../utils/errors");

// Initialize S3 client
const s3Client = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
});

const BUCKET_NAME = config.aws.bucketName;
const TEMPLATE_FOLDER = "templates";
const IMAGE_FOLDER = "images";

/**
 * Extract template variables from MJML content
 * @param {string} mjmlContent - The MJML content
 * @returns {Array} - Array of variable names
 */
const extractTemplateVariables = (mjmlContent) => {
  const regex = /\{\{\s*([\w\.]+)\s*\}\}/g;
  const variables = [];
  let match;

  while ((match = regex.exec(mjmlContent)) !== null) {
    variables.push(match[1]);
  }

  return [...new Set(variables)]; // Return unique variables
};

/**
 * Process MJML template and return HTML
 * @param {string} mjmlContent - The MJML template content
 * @returns {Object} - Object containing HTML output and errors if any
 */
const processMjmlToHtml = (mjmlContent) => {
  try {
    const result = mjml2html(mjmlContent, {
      validationLevel: "strict",
      filePath: __dirname,
    });

    return {
      html: result.html,
      errors: result.errors,
    };
  } catch (error) {
    logger.error("Error processing MJML to HTML:", error);
    throw new Error(`Error processing MJML: ${error.message}`);
  }
};

/**
 * Upload file to S3
 * @param {string} key - The S3 object key
 * @param {Buffer|string} content - The content to upload
 * @param {string} contentType - The content type of the file
 * @returns {Promise<string>} - S3 key of the uploaded file
 */
const uploadToS3 = async (key, content, contentType) => {
  try {
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: content,
      ContentType: contentType,
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);
    return key;
  } catch (error) {
    logger.error("Error uploading to S3:", error);
    throw new Error(`Error uploading to S3: ${error.message}`);
  }
};

/**
 * Get signed URL for an S3 object
 * @param {string} key - The S3 object key
 * @param {number} expiresIn - URL expiration time in seconds
 * @returns {Promise<string>} - Signed URL
 */
const getS3SignedUrl = async (key, expiresIn = 3600) => {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (error) {
    logger.error("Error generating signed URL:", error);
    throw new Error(`Error generating signed URL: ${error.message}`);
  }
};

/**
 * Replace template variables with actual values
 * @param {string} template - The template content (HTML or MJML)
 * @param {Object} variables - Object containing variable values
 * @returns {string} - The processed template
 */
const processTemplateVariables = (template, variables) => {
  let processed = template;

  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
    processed = processed.replace(regex, value || "");
  });

  return processed;
};

/**
 * Create a new email template
 * @param {Object} templateData - Template data
 * @param {string} userId - ID of the user creating the template
 * @returns {Promise<Object>} - Created template
 */
const createTemplate = async (templateData, userId) => {
  const { name, description, category, mjmlSource } = templateData;
  let templateVariables = templateData.templateVariables;

  // Extract variables if not provided
  if (!templateVariables || templateVariables.length === 0) {
    templateVariables = extractTemplateVariables(mjmlSource);
  }

  // Process MJML to HTML
  const { html, errors } = processMjmlToHtml(mjmlSource);

  if (errors && errors.length > 0) {
    logger.warn("MJML processing had errors:", errors);
  }

  // Generate unique folder for this template
  const templateId = uuidv4();
  const templateFolder = `${TEMPLATE_FOLDER}/${templateId}`;

  // Upload MJML and HTML to S3
  const mjmlKey = `${templateFolder}/template.mjml`;
  const htmlKey = `${templateFolder}/template.html`;

  await uploadToS3(mjmlKey, mjmlSource, "text/plain");
  await uploadToS3(htmlKey, html, "text/html");

  // Save to database
  const query = `
    INSERT INTO email_templates (
      name, description, category, mjml_s3_key, html_s3_key, 
      template_variables, s3_assets_path, created_by, updated_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $8
    ) RETURNING *
  `;

  const values = [name, description || null, category || null, mjmlKey, htmlKey, JSON.stringify(templateVariables), templateFolder, userId];

  try {
    const result = await db.query(query, values);
    return transformTemplateFromDb(result.rows[0]);
  } catch (error) {
    logger.error("Error creating template:", error);
    throw error;
  }
};

/**
 * Update an existing email template
 * @param {number} id - Template ID
 * @param {Object} templateData - Updated template data
 * @param {string} userId - ID of the user updating the template
 * @returns {Promise<Object>} - Updated template
 */
const updateTemplate = async (id, templateData, userId) => {
  // Get existing template
  const existingTemplate = await getTemplateById(id);
  if (!existingTemplate) {
    throw new NotFound("Template not found");
  }

  let updateFields = [];
  let values = [];
  let paramCount = 1;

  // Process all possible update fields
  if (templateData.name !== undefined) {
    updateFields.push(`name = $${paramCount++}`);
    values.push(templateData.name);
  }

  if (templateData.description !== undefined) {
    updateFields.push(`description = $${paramCount++}`);
    values.push(templateData.description);
  }

  if (templateData.category !== undefined) {
    updateFields.push(`category = $${paramCount++}`);
    values.push(templateData.category);
  }

  if (templateData.isActive !== undefined) {
    updateFields.push(`is_active = $${paramCount++}`);
    values.push(templateData.isActive);
  }

  // If MJML source is provided, reprocess and update S3 files
  if (templateData.mjmlSource) {
    const mjmlSource = templateData.mjmlSource;
    const { html } = processMjmlToHtml(mjmlSource);

    // Extract variables if not provided
    const templateVariables = templateData.templateVariables || extractTemplateVariables(mjmlSource);

    // Upload updated MJML and HTML to S3 (using same keys)
    await uploadToS3(existingTemplate.mjmlS3Key, mjmlSource, "text/plain");
    await uploadToS3(existingTemplate.htmlS3Key, html, "text/html");

    // Update template_variables in database
    updateFields.push(`template_variables = $${paramCount++}`);
    values.push(JSON.stringify(templateVariables));
  } else if (templateData.templateVariables) {
    updateFields.push(`template_variables = $${paramCount++}`);
    values.push(JSON.stringify(templateData.templateVariables));
  }

  // Add updated_by and updated_at
  updateFields.push(`updated_by = $${paramCount++}`);
  values.push(userId);

  updateFields.push(`updated_at = NOW()`);

  // Update the database
  const query = `
    UPDATE email_templates 
    SET ${updateFields.join(", ")} 
    WHERE id = $${paramCount++} 
    RETURNING *
  `;

  values.push(id);

  try {
    const result = await db.query(query, values);
    if (result.rows.length === 0) {
      throw new NotFound("Template not found");
    }
    return transformTemplateFromDb(result.rows[0]);
  } catch (error) {
    logger.error(`Error updating template ${id}:`, error);
    throw error;
  }
};

/**
 * Delete a template (soft delete)
 * @param {number} id - Template ID
 * @returns {Promise<boolean>} - Success status
 */
const deleteTemplate = async (id) => {
  const query = `
    UPDATE email_templates 
    SET is_deleted = true, updated_at = NOW() 
    WHERE id = $1 AND is_deleted = false 
    RETURNING id
  `;

  try {
    const result = await db.query(query, [id]);
    if (result.rows.length === 0) {
      throw new NotFound("Template not found or already deleted");
    }
    return true;
  } catch (error) {
    logger.error(`Error deleting template ${id}:`, error);
    throw error;
  }
};

/**
 * Get template by ID
 * @param {number} id - Template ID
 * @returns {Promise<Object>} - Template data
 */
const getTemplateById = async (id) => {
  const query = `
    SELECT * FROM email_templates 
    WHERE id = $1 AND is_deleted = false
  `;

  try {
    const result = await db.query(query, [id]);
    if (result.rows.length === 0) {
      throw new NotFound("Template not found");
    }
    return transformTemplateFromDb(result.rows[0]);
  } catch (error) {
    logger.error(`Error getting template ${id}:`, error);
    throw error;
  }
};

/**
 * List templates with pagination and filtering
 * @param {Object} options - Filter and pagination options
 * @returns {Promise<Object>} - Paginated template list
 */
const listTemplates = async (options = {}) => {
  const { page = 1, limit = 10, category, search, isActive } = options;

  const offset = (page - 1) * limit;
  const params = [];
  let paramCount = 1;

  let whereConditions = ["is_deleted = false"];

  if (category) {
    whereConditions.push(`category = $${paramCount++}`);
    params.push(category);
  }

  if (search) {
    whereConditions.push(`(name ILIKE $${paramCount} OR description ILIKE $${paramCount})`);
    params.push(`%${search}%`);
    paramCount++;
  }

  if (isActive !== undefined) {
    whereConditions.push(`is_active = $${paramCount++}`);
    params.push(isActive);
  }

  const whereClause = whereConditions.length ? "WHERE " + whereConditions.join(" AND ") : "";

  // Count query for pagination
  const countQuery = `
    SELECT COUNT(*) as total
    FROM email_templates
    ${whereClause}
  `;

  // Data query with pagination
  const dataQuery = `
    SELECT *
    FROM email_templates
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramCount++} OFFSET $${paramCount++}
  `;

  params.push(limit, offset);

  try {
    const countResult = await db.query(countQuery, params.slice(0, paramCount - 3));
    const dataResult = await db.query(dataQuery, params);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    return {
      data: dataResult.rows.map(transformTemplateFromDb),
      pagination: {
        total,
        totalPages,
        currentPage: page,
        limit,
      },
    };
  } catch (error) {
    logger.error("Error listing templates:", error);
    throw error;
  }
};

/**
 * Upload a template image to S3
 * @param {Object} file - Uploaded file object from multer
 * @param {string} userId - User ID of uploader
 * @returns {Promise<Object>} - Upload result with URL
 */
const uploadTemplateImage = async (file, userId) => {
  if (!file) {
    throw new Error("No file provided");
  }

  const uniqueId = uuidv4();
  const fileExtension = file.originalname.split(".").pop();
  const key = `${IMAGE_FOLDER}/${uniqueId}.${fileExtension}`;

  try {
    await uploadToS3(key, file.buffer, file.mimetype);
    const url = await getS3SignedUrl(key, 60 * 60 * 24); // 24-hour signed URL

    return {
      url,
      key,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    };
  } catch (error) {
    logger.error("Error uploading template image:", error);
    throw error;
  }
};

/**
 * Transform database row to template object
 * @param {Object} dbTemplate - Template row from database
 * @returns {Object} - Transformed template object
 */
const transformTemplateFromDb = (dbTemplate) => {
  if (!dbTemplate) return null;

  return {
    id: dbTemplate.id,
    name: dbTemplate.name,
    description: dbTemplate.description,
    category: dbTemplate.category,
    mjmlS3Key: dbTemplate.mjml_s3_key,
    htmlS3Key: dbTemplate.html_s3_key,
    templateVariables: dbTemplate.template_variables
      ? typeof dbTemplate.template_variables === "string"
        ? JSON.parse(dbTemplate.template_variables)
        : dbTemplate.template_variables
      : [],
    s3AssetsPath: dbTemplate.s3_assets_path,
    hasAttachments: dbTemplate.has_attachments,
    isActive: dbTemplate.is_active,
    createdBy: dbTemplate.created_by,
    updatedBy: dbTemplate.updated_by,
    createdAt: dbTemplate.created_at,
    updatedAt: dbTemplate.updated_at,
  };
};

/**
 * Render template with variable substitution
 * @param {number} templateId - Template ID
 * @param {Object} variables - Variables to substitute
 * @returns {Promise<string>} - Rendered HTML
 */
const renderTemplate = async (templateId, variables = {}) => {
  const template = await getTemplateById(templateId);

  if (!template) {
    throw new NotFound("Template not found");
  }

  // Get HTML from S3
  const getCommand = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: template.htmlS3Key,
  });

  try {
    const response = await s3Client.send(getCommand);
    const html = await response.Body.transformToString();

    // Replace variables
    return processTemplateVariables(html, variables);
  } catch (error) {
    logger.error(`Error rendering template ${templateId}:`, error);
    throw new Error(`Error rendering template: ${error.message}`);
  }
};

module.exports = {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getTemplateById,
  listTemplates,
  uploadTemplateImage,
  renderTemplate,
  processTemplateVariables,
  extractTemplateVariables,
};
