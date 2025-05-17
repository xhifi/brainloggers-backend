/**
 * @module CampaignScheduler
 * @description Scheduler for campaign-related tasks using node-cron
 */
const cron = require("node-cron");
const logger = require("../../services/logger.service");
const campaignService = require("../../services/campaign.service");
const campaignSenderService = require("../../services/campaign-sender.service");
const queueService = require("../../services/queue.service");
const { QUEUE_NAMES } = require("../../config");

// Default schedule: every 5 minutes
const DEFAULT_SCHEDULE = "*/5 * * * *";

/**
 * Start the campaign scheduler
 * @param {string} schedule - Cron schedule expression (defaults to every 5 minutes)
 * @returns {Object} cron task that was started
 */
function start(schedule = DEFAULT_SCHEDULE) {
  logger.info(`[Campaign Scheduler] Starting with schedule: ${schedule}`);

  // Create a scheduled task that runs according to the cron schedule
  const task = cron.schedule(schedule, async () => {
    logger.info("[Campaign Scheduler] Running scheduled campaign check...");

    try {
      // Find all campaigns that are scheduled to run now
      const campaignsToRun = await campaignService.findScheduledCampaigns();

      if (campaignsToRun.length === 0) {
        logger.info("[Campaign Scheduler] No campaigns scheduled to run at this time.");
        return;
      }
      logger.info(`[Campaign Scheduler] Found ${campaignsToRun.length} campaigns to process.`);

      // Process each due campaign directly with the campaign sender service
      for (const campaign of campaignsToRun) {
        logger.info(`[Campaign Scheduler] Processing scheduled campaign: ${campaign.id}`);

        try {
          // Process the campaign using our campaign sender service
          const result = await campaignSenderService.processCampaign(campaign.id);

          logger.info(`[Campaign Scheduler] Successfully processed campaign ${campaign.id}`, {
            status: result.status,
            recipientCount: result.recipientCount,
          });
        } catch (campaignError) {
          logger.error(`[Campaign Scheduler] Error processing campaign ${campaign.id}:`, campaignError);
          // Continue with other campaigns even if one fails
        }
      }

      logger.info("[Campaign Scheduler] Finished processing scheduled campaigns.");
    } catch (error) {
      logger.error(`[Campaign Scheduler] Error in scheduler: ${error.message}`);
      // Don't crash the scheduler on errors - we'll try again next time
    }
  });

  // Start the scheduler
  task.start();
  logger.info("[Campaign Scheduler] Scheduler started successfully.");

  return task;
}

/**
 * Stop the campaign scheduler
 * @param {Object} task - The cron task to stop
 */
function stop(task) {
  if (task) {
    task.stop();
    logger.info("[Campaign Scheduler] Scheduler stopped.");
  } else {
    logger.warn("[Campaign Scheduler] Cannot stop: No task was provided.");
  }
}

module.exports = {
  start,
  stop,
};
