/**
 * @module services/campaign
 * @description Service for managing email campaigns
 * @category Services
 * @subcategory Campaign
 */
const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");
const logger = require("./logger.service");
const { NotFound, ConfictResource } = require("../utils/errors");
const templateService = require("./template.service");
const mailingListService = require("./mailing-list.service");
const queueService = require("./queue.service");

/**
 * Create a new email campaign
 * @function createCampaign
 * @memberof module:services/campaign
 * @param {Object} campaignData - Campaign data
 * @param {string} userId - ID of the user creating the campaign
 * @returns {Promise<Object>} - Created campaign
 */
const createCampaign = async (campaignData, userId) => {
  logger.info(`Creating new campaign: "${campaignData.name}" by user ${userId}`);
  const {
    name,
    description,
    subject,
    templateId,
    mailingListIds,
    scheduledAt,
    status = "draft",
    senderName,
    senderEmail,
    replyToEmail,
    trackOpens,
    trackClicks,
    templateVariables,
    metaData,
  } = campaignData;

  // Verify template exists
  logger.info(`Verifying template ID ${templateId} exists`);
  try {
    await templateService.getTemplateById(templateId);
  } catch (error) {
    logger.error(`Invalid template ID ${templateId} used in campaign creation:`, error);
    throw new Error("Invalid template ID");
  }

  // Verify all mailing lists exist
  if (mailingListIds && mailingListIds.length > 0) {
    logger.info(`Verifying ${mailingListIds.length} mailing lists exist`);
    for (const listId of mailingListIds) {
      try {
        await mailingListService.getMailingListById(listId);
      } catch (error) {
        logger.error(`Invalid mailing list ID ${listId} used in campaign creation:`, error);
        throw new Error(`Invalid mailing list ID: ${listId}`);
      }
    }
  } else {
    logger.warn("No mailing lists specified for campaign");
  }

  // Generate campaign ID
  const campaignId = uuidv4();
  logger.info(`Generated campaign ID: ${campaignId}`);

  const query = `
    INSERT INTO email_campaigns (
      id, name, description, subject, template_id, 
      status, scheduled_at, sender_name, sender_email, reply_to_email,
      track_opens, track_clicks, template_variables, meta_data,
      created_by, updated_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15
    ) RETURNING *
  `;

  const values = [
    campaignId,
    name,
    description || null,
    subject,
    templateId,
    status,
    scheduledAt || null,
    senderName || null,
    senderEmail || null,
    replyToEmail || null,
    trackOpens !== undefined ? trackOpens : true,
    trackClicks !== undefined ? trackClicks : true,
    templateVariables ? JSON.stringify(templateVariables) : null,
    metaData ? JSON.stringify(metaData) : null,
    userId,
  ];

  try {
    logger.info(`Saving campaign "${name}" to database`);
    const result = await db.query(query, values);
    const campaign = transformCampaignFromDb(result.rows[0]);

    // Associate mailing lists with the campaign
    if (mailingListIds && mailingListIds.length > 0) {
      logger.info(`Associating campaign with ${mailingListIds.length} mailing lists`);
      await associateMailingLists(campaignId, mailingListIds);
    }

    logger.info(`Successfully created campaign ID ${campaignId}`);
    return campaign;
  } catch (error) {
    logger.error(`Error creating campaign "${name}":`, error);
    throw error;
  }
};

/**
 * Update an existing campaign
 * @function updateCampaign
 * @memberof module:services/campaign
 * @param {string} id - Campaign ID
 * @param {Object} campaignData - Updated campaign data
 * @param {string} userId - ID of the user updating the campaign
 * @returns {Promise<Object>} - Updated campaign
 */
const updateCampaign = async (id, campaignData, userId) => {
  logger.info(`Updating campaign ID ${id} by user ${userId}`);

  // Get existing campaign
  logger.info(`Fetching existing campaign with ID ${id}`);
  const campaign = await getCampaignById(id);

  // Check if campaign can be updated
  if (campaign.status === "sent" || campaign.status === "sending") {
    logger.warn(`Cannot update campaign ${id} with status "${campaign.status}"`);
    throw new ConfictResource("Cannot update campaign that has been sent or is being sent");
  }

  // If updating template, verify it exists
  if (campaignData.templateId) {
    logger.info(`Verifying new template ID ${campaignData.templateId} exists`);
    try {
      await templateService.getTemplateById(campaignData.templateId);
    } catch (error) {
      logger.error(`Invalid template ID ${campaignData.templateId} used in campaign update:`, error);
      throw new Error("Invalid template ID");
    }
  }

  let updateFields = [];
  let values = [];
  let paramCount = 1;

  // Process all possible update fields
  const updateableFields = [
    { field: "name", dbField: "name" },
    { field: "description", dbField: "description" },
    { field: "subject", dbField: "subject" },
    { field: "templateId", dbField: "template_id" },
    { field: "status", dbField: "status" },
    { field: "scheduledAt", dbField: "scheduled_at" },
    { field: "senderName", dbField: "sender_name" },
    { field: "senderEmail", dbField: "sender_email" },
    { field: "replyToEmail", dbField: "reply_to_email" },
    { field: "trackOpens", dbField: "track_opens" },
    { field: "trackClicks", dbField: "track_clicks" },
  ];

  for (const { field, dbField } of updateableFields) {
    if (campaignData[field] !== undefined) {
      updateFields.push(`${dbField} = $${paramCount++}`);
      values.push(campaignData[field]);
      logger.info(`Updating campaign field "${dbField}" to: ${campaignData[field]}`);
    }
  }

  // Handle special fields that need JSON stringification
  if (campaignData.templateVariables !== undefined) {
    updateFields.push(`template_variables = $${paramCount++}`);
    values.push(JSON.stringify(campaignData.templateVariables));
    logger.info(`Updating template variables with ${Object.keys(campaignData.templateVariables || {}).length} variables`);
  }

  if (campaignData.metaData !== undefined) {
    updateFields.push(`meta_data = $${paramCount++}`);
    values.push(JSON.stringify(campaignData.metaData));
    logger.info(`Updating campaign metadata`);
  }

  // Add updated_by and updated_at
  updateFields.push(`updated_by = $${paramCount++}`);
  values.push(userId);

  updateFields.push(`updated_at = NOW()`);

  // If no fields to update, just return the existing campaign
  if (updateFields.length === 0) {
    logger.info(`No fields to update for campaign ${id}`);
    return campaign;
  }

  // Update the campaign in database
  const query = `
    UPDATE email_campaigns 
    SET ${updateFields.join(", ")} 
    WHERE id = $${paramCount++} 
    RETURNING *
  `;

  values.push(id);

  try {
    logger.info(`Executing database update for campaign ID ${id}`);
    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      logger.warn(`Campaign ID ${id} not found in database during update`);
      throw new NotFound("Campaign not found");
    }

    // Update mailing lists if provided
    if (campaignData.mailingListIds) {
      logger.info(`Updating mailing list associations for campaign ${id}`);
      await updateMailingLists(id, campaignData.mailingListIds);
    }

    logger.info(`Successfully updated campaign ID ${id}`);
    return await getCampaignById(id); // Get campaign with fresh data including mailing lists
  } catch (error) {
    logger.error(`Error updating campaign ${id}:`, error);
    throw error;
  }
};

/**
 * Delete a campaign (soft delete)
 * @function deleteCampaign
 * @memberof module:services/campaign
 * @param {string} id - Campaign ID
 * @returns {Promise<boolean>} - Success status
 */
const deleteCampaign = async (id) => {
  logger.info(`Soft-deleting campaign ID ${id}`);

  // Check if campaign exists and can be deleted
  logger.info(`Verifying campaign ${id} status before deletion`);
  const campaign = await getCampaignById(id);

  if (campaign.status === "sent" || campaign.status === "sending") {
    logger.warn(`Cannot delete campaign ${id} with status "${campaign.status}"`);
    throw new ConfictResource("Cannot delete campaign that has been sent or is being sent");
  }

  const query = `
    UPDATE email_campaigns 
    SET is_deleted = true, updated_at = NOW() 
    WHERE id = $1 AND is_deleted = false 
    RETURNING id
  `;

  try {
    logger.info(`Executing soft delete for campaign ${id}`);
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      logger.warn(`Campaign ID ${id} not found or already deleted`);
      throw new NotFound("Campaign not found or already deleted");
    }

    logger.info(`Successfully marked campaign ID ${id} as deleted`);
    return true;
  } catch (error) {
    logger.error(`Error deleting campaign ${id}:`, error);
    throw error;
  }
};

/**
 * Get campaign by ID
 * @function getCampaignById
 * @memberof module:services/campaign
 * @param {string} id - Campaign ID
 * @returns {Promise<Object>} - Campaign data
 */
const getCampaignById = async (id) => {
  logger.info(`Fetching campaign ID ${id}`);

  const query = `
    SELECT c.*, 
           COUNT(cs.id) FILTER (WHERE cs.status = 'sent') as sent_count,
           COUNT(cs.id) FILTER (WHERE cs.status = 'opened') as opened_count,
           COUNT(cs.id) FILTER (WHERE cs.status = 'clicked') as clicked_count,
           COUNT(cs.id) FILTER (WHERE cs.status = 'bounced') as bounced_count,
           COUNT(cs.id) FILTER (WHERE cs.status = 'failed') as failed_count
    FROM email_campaigns c
    LEFT JOIN campaign_sends cs ON c.id = cs.campaign_id
    WHERE c.id = $1 AND c.is_deleted = false
    GROUP BY c.id
  `;

  try {
    logger.info(`Executing query to fetch campaign ${id}`);
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      logger.warn(`Campaign ID ${id} not found`);
      throw new NotFound("Campaign not found");
    }

    // Get associated mailing lists
    logger.info(`Fetching mailing lists for campaign ${id}`);
    const mailingLists = await getMailingListsForCampaign(id);

    const campaign = transformCampaignFromDb(result.rows[0]);
    campaign.mailingLists = mailingLists;

    logger.info(`Successfully retrieved campaign ID ${id}`);
    return campaign;
  } catch (error) {
    logger.error(`Error getting campaign ${id}:`, error);
    throw error;
  }
};

/**
 * List campaigns with pagination and filtering
 * @function listCampaigns
 * @memberof module:services/campaign
 * @param {Object} options - Filter and pagination options
 * @returns {Promise<Object>} - Paginated campaign list
 */
const listCampaigns = async (options = {}) => {
  const { page = 1, limit = 10, status, search, templateId, mailingListId } = options;
  logger.info(
    `Listing campaigns - Page: ${page}, Limit: ${limit}, Status: ${status || "all"}, Search: "${search || ""}", Template: ${
      templateId || "all"
    }, List: ${mailingListId || "all"}`
  );

  const offset = (page - 1) * limit;
  const params = [];
  let paramCount = 1;

  let whereConditions = ["c.is_deleted = false"];
  let joinConditions = [];

  if (status) {
    whereConditions.push(`c.status = $${paramCount++}`);
    params.push(status);
  }

  if (search) {
    whereConditions.push(`(c.name ILIKE $${paramCount} OR c.description ILIKE $${paramCount})`);
    params.push(`%${search}%`);
    paramCount++;
  }

  if (templateId) {
    whereConditions.push(`c.template_id = $${paramCount++}`);
    params.push(templateId);
  }

  if (mailingListId) {
    joinConditions.push(`INNER JOIN campaign_mailing_lists cml ON c.id = cml.campaign_id AND cml.mailing_list_id = $${paramCount++}`);
    params.push(mailingListId);
  }

  const joins = joinConditions.length ? joinConditions.join(" ") : "";
  const whereClause = whereConditions.length ? "WHERE " + whereConditions.join(" AND ") : "";

  // Count query for pagination
  const countQuery = `
    SELECT COUNT(DISTINCT c.id) as total
    FROM email_campaigns c
    ${joins}
    ${whereClause}
  `;

  // Data query with pagination and statistics
  const dataQuery = `
    SELECT c.*,
           COUNT(cs.id) FILTER (WHERE cs.status = 'sent') as sent_count,
           COUNT(cs.id) FILTER (WHERE cs.status = 'opened') as opened_count,
           COUNT(cs.id) FILTER (WHERE cs.status = 'clicked') as clicked_count,
           COUNT(cs.id) FILTER (WHERE cs.status = 'bounced') as bounced_count,
           COUNT(cs.id) FILTER (WHERE cs.status = 'failed') as failed_count
    FROM email_campaigns c
    ${joins}
    LEFT JOIN campaign_sends cs ON c.id = cs.campaign_id
    ${whereClause}
    GROUP BY c.id
    ORDER BY c.created_at DESC
    LIMIT $${paramCount++} OFFSET $${paramCount++}
  `;

  params.push(limit, offset);

  try {
    logger.info(`Executing count query for campaigns`);
    const countResult = await db.query(countQuery, params.slice(0, paramCount - 3));

    logger.info(`Executing data query for campaigns`);
    const dataResult = await db.query(dataQuery, params);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // Get associated mailing lists for all campaigns in batch
    const campaigns = [];

    for (const row of dataResult.rows) {
      logger.info(`Fetching mailing lists for campaign ${row.id}`);
      const mailingLists = await getMailingListsForCampaign(row.id);
      const campaign = transformCampaignFromDb(row);
      campaign.mailingLists = mailingLists;
      campaigns.push(campaign);
    }

    logger.info(`Found ${total} campaigns, returning page ${page} of ${totalPages}`);
    return {
      data: campaigns,
      pagination: {
        total,
        totalPages,
        currentPage: page,
        limit,
      },
    };
  } catch (error) {
    logger.error(`Error listing campaigns:`, error);
    throw error;
  }
};

/**
 * Associate mailing lists with a campaign
 * @function associateMailingLists
 * @memberof module:services/campaign
 * @param {string} campaignId - Campaign ID
 * @param {Array<string>} mailingListIds - Array of mailing list IDs
 * @returns {Promise<boolean>} - Success status
 */
const associateMailingLists = async (campaignId, mailingListIds) => {
  logger.info(`Associating campaign ${campaignId} with ${mailingListIds.length} mailing lists`);

  if (!mailingListIds || mailingListIds.length === 0) {
    logger.warn(`No mailing lists to associate with campaign ${campaignId}`);
    return true;
  }

  const values = mailingListIds
    .map((listId, index) => {
      return `($1, $${index + 2})`;
    })
    .join(", ");

  const query = `
    INSERT INTO campaign_mailing_lists (campaign_id, mailing_list_id)
    VALUES ${values}
    ON CONFLICT (campaign_id, mailing_list_id) DO NOTHING
  `;

  try {
    logger.info(`Executing query to associate mailing lists with campaign ${campaignId}`);
    await db.query(query, [campaignId, ...mailingListIds]);
    logger.info(`Successfully associated mailing lists with campaign ${campaignId}`);
    return true;
  } catch (error) {
    logger.error(`Error associating mailing lists with campaign ${campaignId}:`, error);
    throw error;
  }
};

/**
 * Update mailing lists associated with a campaign
 * @function updateMailingLists
 * @memberof module:services/campaign
 * @param {string} campaignId - Campaign ID
 * @param {Array<string>} mailingListIds - Array of mailing list IDs
 * @returns {Promise<boolean>} - Success status
 */
const updateMailingLists = async (campaignId, mailingListIds) => {
  logger.info(`Updating mailing list associations for campaign ${campaignId}`);

  // First remove all existing associations
  const deleteQuery = `
    DELETE FROM campaign_mailing_lists
    WHERE campaign_id = $1
  `;

  try {
    logger.info(`Removing existing mailing list associations for campaign ${campaignId}`);
    await db.query(deleteQuery, [campaignId]);

    // Then create new associations
    if (mailingListIds && mailingListIds.length > 0) {
      logger.info(`Creating ${mailingListIds.length} new mailing list associations for campaign ${campaignId}`);
      return await associateMailingLists(campaignId, mailingListIds);
    }

    logger.info(`No new mailing lists to associate with campaign ${campaignId}`);
    return true;
  } catch (error) {
    logger.error(`Error updating mailing lists for campaign ${campaignId}:`, error);
    throw error;
  }
};

/**
 * Get mailing lists associated with a campaign
 * @function getMailingListsForCampaign
 * @memberof module:services/campaign
 * @param {string} campaignId - Campaign ID
 * @returns {Promise<Array>} - Array of mailing lists
 */
const getMailingListsForCampaign = async (campaignId) => {
  logger.info(`Fetching mailing lists for campaign ${campaignId}`);

  const query = `
    SELECT ml.* 
    FROM mailing_lists ml
    INNER JOIN campaign_mailing_lists cml ON ml.id = cml.mailing_list_id
    WHERE cml.campaign_id = $1 AND ml.is_deleted = false
  `;

  try {
    const result = await db.query(query, [campaignId]);
    logger.info(`Found ${result.rows.length} mailing lists for campaign ${campaignId}`);
    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      subscriberCount: parseInt(row.subscriber_count) || 0,
    }));
  } catch (error) {
    logger.error(`Error getting mailing lists for campaign ${campaignId}:`, error);
    throw error;
  }
};

/**
 * Transform database row to campaign object
 * @function transformCampaignFromDb
 * @memberof module:services/campaign
 * @param {Object} dbCampaign - Campaign row from database
 * @returns {Object} - Transformed campaign object
 */
const transformCampaignFromDb = (dbCampaign) => {
  if (!dbCampaign) return null;

  return {
    id: dbCampaign.id,
    name: dbCampaign.name,
    description: dbCampaign.description,
    subject: dbCampaign.subject,
    templateId: dbCampaign.template_id,
    status: dbCampaign.status,
    scheduledAt: dbCampaign.scheduled_at,
    sentAt: dbCampaign.sent_at,
    senderName: dbCampaign.sender_name,
    senderEmail: dbCampaign.sender_email,
    replyToEmail: dbCampaign.reply_to_email,
    trackOpens: dbCampaign.track_opens,
    trackClicks: dbCampaign.track_clicks,
    templateVariables: dbCampaign.template_variables
      ? typeof dbCampaign.template_variables === "string"
        ? JSON.parse(dbCampaign.template_variables)
        : dbCampaign.template_variables
      : {},
    metaData: dbCampaign.meta_data
      ? typeof dbCampaign.meta_data === "string"
        ? JSON.parse(dbCampaign.meta_data)
        : dbCampaign.meta_data
      : {},
    stats: {
      sentCount: parseInt(dbCampaign.sent_count) || 0,
      openedCount: parseInt(dbCampaign.opened_count) || 0,
      clickedCount: parseInt(dbCampaign.clicked_count) || 0,
      bouncedCount: parseInt(dbCampaign.bounced_count) || 0,
      failedCount: parseInt(dbCampaign.failed_count) || 0,
    },
    createdBy: dbCampaign.created_by,
    updatedBy: dbCampaign.updated_by,
    createdAt: dbCampaign.created_at,
    updatedAt: dbCampaign.updated_at,
  };
};

/**
 * Send a campaign immediately or schedule it for later
 * @function sendCampaign
 * @memberof module:services/campaign
 * @param {string} campaignId - Campaign ID
 * @param {string} userId - ID of the user sending the campaign
 * @param {boolean} sendNow - Whether to send immediately or use scheduled time
 * @returns {Promise<Object>} - Updated campaign
 */
const sendCampaign = async (campaignId, userId, sendNow = false) => {
  logger.info(`Request to ${sendNow ? "immediately send" : "schedule"} campaign ${campaignId} by user ${userId}`);

  // Get campaign with all details
  const campaign = await getCampaignById(campaignId);

  // Check campaign status
  if (campaign.status === "sent") {
    logger.warn(`Cannot send campaign ${campaignId} that has already been sent`);
    throw new ConfictResource("Campaign has already been sent");
  }

  if (campaign.status === "sending") {
    logger.warn(`Cannot send campaign ${campaignId} that is currently being sent`);
    throw new ConfictResource("Campaign is already being sent");
  }

  // Check that campaign has required fields
  if (!campaign.subject) {
    logger.error(`Cannot send campaign ${campaignId} without a subject`);
    throw new Error("Campaign must have a subject");
  }

  if (!campaign.templateId) {
    logger.error(`Cannot send campaign ${campaignId} without a template`);
    throw new Error("Campaign must have a template");
  }

  if (!campaign.mailingLists || campaign.mailingLists.length === 0) {
    logger.error(`Cannot send campaign ${campaignId} without any mailing lists`);
    throw new Error("Campaign must have at least one mailing list");
  }

  let newStatus;
  let scheduledAt = campaign.scheduledAt;
  let updateFields = [];
  let params = [campaignId];
  let paramCount = 2;

  if (sendNow) {
    // Send immediately
    newStatus = "queued";
    updateFields.push(`status = $${paramCount++}`);
    params.push(newStatus);

    scheduledAt = new Date();
    updateFields.push(`scheduled_at = $${paramCount++}`);
    params.push(scheduledAt);

    logger.info(`Setting campaign ${campaignId} to status "queued" for immediate sending`);
  } else {
    // Schedule for later
    if (!scheduledAt) {
      logger.error(`Cannot schedule campaign ${campaignId} without a scheduled date`);
      throw new Error("Scheduled date is required");
    }

    // If scheduled time is in the past, throw error
    if (new Date(scheduledAt) <= new Date()) {
      logger.error(`Cannot schedule campaign ${campaignId} for a past date ${scheduledAt}`);
      throw new Error("Scheduled date must be in the future");
    }

    newStatus = "scheduled";
    updateFields.push(`status = $${paramCount++}`);
    params.push(newStatus);

    logger.info(`Setting campaign ${campaignId} to status "scheduled" for future sending at ${scheduledAt}`);
  }

  // Add updated_by
  updateFields.push(`updated_by = $${paramCount++}`);
  params.push(userId);

  updateFields.push(`updated_at = NOW()`);

  const query = `
    UPDATE email_campaigns 
    SET ${updateFields.join(", ")} 
    WHERE id = $1 
    RETURNING *
  `;

  try {
    // Update campaign status
    logger.info(`Updating campaign ${campaignId} status to ${newStatus}`);
    const result = await db.query(query, params);

    if (result.rows.length === 0) {
      logger.warn(`Campaign ${campaignId} not found during status update`);
      throw new NotFound("Campaign not found");
    }

    // If sending immediately, queue the campaign job
    if (sendNow) {
      logger.info(`Queueing campaign ${campaignId} for immediate processing`);
      await queueService.addToQueue("campaign-processor", {
        campaignId,
        action: "process",
      });
    }

    logger.info(`Successfully ${sendNow ? "queued" : "scheduled"} campaign ${campaignId}`);
    return await getCampaignById(campaignId);
  } catch (error) {
    logger.error(`Error sending/scheduling campaign ${campaignId}:`, error);
    throw error;
  }
};

/**
 * Cancel a scheduled or queued campaign
 * @function cancelCampaign
 * @memberof module:services/campaign
 * @param {string} campaignId - Campaign ID
 * @param {string} userId - ID of the user cancelling the campaign
 * @returns {Promise<Object>} - Updated campaign
 */
const cancelCampaign = async (campaignId, userId) => {
  logger.info(`Cancelling campaign ${campaignId} by user ${userId}`);

  // Get campaign
  const campaign = await getCampaignById(campaignId);

  // Check if campaign can be cancelled
  if (campaign.status !== "scheduled" && campaign.status !== "queued") {
    logger.warn(`Cannot cancel campaign ${campaignId} with status "${campaign.status}"`);
    throw new ConfictResource("Only scheduled or queued campaigns can be cancelled");
  }

  const query = `
    UPDATE email_campaigns 
    SET status = 'draft', updated_by = $2, updated_at = NOW() 
    WHERE id = $1 
    RETURNING *
  `;

  try {
    logger.info(`Setting campaign ${campaignId} status back to "draft"`);
    const result = await db.query(query, [campaignId, userId]);

    if (result.rows.length === 0) {
      logger.warn(`Campaign ${campaignId} not found during cancellation`);
      throw new NotFound("Campaign not found");
    }

    logger.info(`Successfully cancelled campaign ${campaignId}`);
    return await getCampaignById(campaignId);
  } catch (error) {
    logger.error(`Error cancelling campaign ${campaignId}:`, error);
    throw error;
  }
};

/**
 * Get campaign statistics
 * @function getCampaignStats
 * @memberof module:services/campaign
 * @param {string} campaignId - Campaign ID
 * @returns {Promise<Object>} - Campaign statistics
 */
const getCampaignStats = async (campaignId) => {
  logger.info(`Fetching statistics for campaign ${campaignId}`);

  const query = `
    SELECT
      COUNT(cs.id) as total_sends,
      COUNT(cs.id) FILTER (WHERE cs.status = 'sent') as sent_count,
      COUNT(cs.id) FILTER (WHERE cs.status = 'opened') as opened_count,
      COUNT(cs.id) FILTER (WHERE cs.status = 'clicked') as clicked_count,
      COUNT(cs.id) FILTER (WHERE cs.status = 'bounced') as bounced_count,
      COUNT(cs.id) FILTER (WHERE cs.status = 'failed') as failed_count,
      COUNT(DISTINCT cs.subscriber_id) FILTER (WHERE cs.status = 'opened') as unique_opens,
      COUNT(DISTINCT cs.subscriber_id) FILTER (WHERE cs.status = 'clicked') as unique_clicks
    FROM campaign_sends cs
    WHERE cs.campaign_id = $1
  `;

  // Query for click details
  const clickQuery = `
    SELECT
      click_url,
      COUNT(*) as click_count
    FROM campaign_clicks
    WHERE campaign_id = $1
    GROUP BY click_url
    ORDER BY click_count DESC
  `;

  try {
    logger.info(`Executing query to get campaign ${campaignId} statistics`);
    const statsResult = await db.query(query, [campaignId]);

    logger.info(`Executing query to get campaign ${campaignId} click details`);
    const clicksResult = await db.query(clickQuery, [campaignId]);

    // Get the campaign itself for context
    const campaign = await getCampaignById(campaignId);

    const stats = statsResult.rows[0];
    const totalSends = parseInt(stats.total_sends) || 0;

    // Calculate percentages, avoiding division by zero
    const openRate = totalSends > 0 ? (parseInt(stats.opened_count) / totalSends) * 100 : 0;
    const clickRate = totalSends > 0 ? (parseInt(stats.clicked_count) / totalSends) * 100 : 0;
    const bounceRate = totalSends > 0 ? (parseInt(stats.bounced_count) / totalSends) * 100 : 0;
    const failureRate = totalSends > 0 ? (parseInt(stats.failed_count) / totalSends) * 100 : 0;

    logger.info(`Successfully retrieved statistics for campaign ${campaignId}`);
    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        status: campaign.status,
        sentAt: campaign.sentAt,
      },
      stats: {
        totalSends,
        sent: parseInt(stats.sent_count) || 0,
        opened: parseInt(stats.opened_count) || 0,
        clicked: parseInt(stats.clicked_count) || 0,
        bounced: parseInt(stats.bounced_count) || 0,
        failed: parseInt(stats.failed_count) || 0,
        uniqueOpens: parseInt(stats.unique_opens) || 0,
        uniqueClicks: parseInt(stats.unique_clicks) || 0,
        openRate: parseFloat(openRate.toFixed(2)),
        clickRate: parseFloat(clickRate.toFixed(2)),
        bounceRate: parseFloat(bounceRate.toFixed(2)),
        failureRate: parseFloat(failureRate.toFixed(2)),
      },
      clickDetails: clicksResult.rows.map((row) => ({
        url: row.click_url,
        count: parseInt(row.click_count),
      })),
    };
  } catch (error) {
    logger.error(`Error getting statistics for campaign ${campaignId}:`, error);
    throw error;
  }
};

/**
 * Find all campaigns that are scheduled to be sent now
 * @function findScheduledCampaigns
 * @memberof module:services/campaign
 * @returns {Promise<Array>} - List of campaigns ready to be sent
 */
const findScheduledCampaigns = async () => {
  logger.info("Finding scheduled campaigns that are ready to be sent");

  try {
    const { rows } = await db.query(
      `SELECT * FROM email_campaigns 
       WHERE status = 'scheduled' 
       AND scheduled_at <= CURRENT_TIMESTAMP
       AND is_deleted = FALSE`,
      []
    );

    logger.info(`Found ${rows.length} campaigns scheduled to be sent now`);
    return rows;
  } catch (error) {
    logger.error("Error finding scheduled campaigns:", error);
    throw error;
  }
};

module.exports = {
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getCampaignById,
  listCampaigns,
  sendCampaign,
  cancelCampaign,
  getCampaignStats,
  findScheduledCampaigns,
};
