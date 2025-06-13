/**
 * History Merge Strategy
 *
 * Handles merging of historical weekly data between local and remote sources.
 * Uses timestamp-based conflict resolution with data validation and cleanup.
 */

import { logger } from "../../logger.js";

export class HistoryMergeStrategy {
  constructor(dataService) {
    this.dataService = dataService;
  }

  /**
   * Merge history data from local and remote sources
   * @param {Array} localHistory - Local history array
   * @param {Array} remoteHistory - Remote history array
   * @returns {Object} Object with merged data and change flag
   */
  mergeHistoryData(localHistory, remoteHistory) {
    logger.info("Starting history merge process");
    logger.info(`Local history: ${localHistory.length} items`);
    logger.info(`Remote history: ${remoteHistory.length} items`);

    // Validate both arrays and create safe copies
    const validatedLocal = this.validateHistoryArray(localHistory, "local");
    const validatedRemote = this.validateHistoryArray(remoteHistory, "remote");

    // Create a map of weeks by start date for easy lookup
    const weekMap = new Map();

    // Process all local history first - ensure structure is valid
    this.processLocalHistory(validatedLocal, weekMap);

    // Track if anything changed
    let changed = false;

    // Process remote history, overwriting local only if newer
    changed = this.processRemoteHistory(validatedRemote, weekMap) || changed;

    // Convert map back to array and sort by date (newest first)
    const mergedData = this.convertMapToSortedArray(weekMap);

    logger.info(
      `Merge complete. Result has ${mergedData.length} weeks, changed: ${changed}`
    );

    // Do a final validation to ensure all weeks have the required structure
    const validatedData = this.finalValidation(mergedData);

    if (validatedData.length !== mergedData.length) {
      logger.warn(
        `Filtered out ${
          mergedData.length - validatedData.length
        } invalid history items`
      );
      changed = true;
    }

    return {
      data: validatedData,
      changed: changed || validatedData.length !== localHistory.length,
    };
  }

  /**
   * Validate and normalize history array
   * @param {Array} history - History array to validate
   * @param {string} source - Source name for logging
   * @returns {Array} Validated history array
   */
  validateHistoryArray(history, source) {
    if (!Array.isArray(history)) {
      logger.warn(`${source} history is not an array, using empty array`);
      return [];
    }
    return history;
  }

  /**
   * Process local history data into week map
   * @param {Array} localHistory - Local history array
   * @param {Map} weekMap - Week map to populate
   */
  processLocalHistory(localHistory, weekMap) {
    localHistory.forEach((week, index) => {
      // Skip if week is missing a start date
      if (!week.weekStartDate) {
        logger.warn(
          `Local history item at index ${index} missing weekStartDate, skipping`,
          week
        );
        return;
      }

      // Log week data for debugging
      logger.info(`Local week ${week.weekStartDate}:`, {
        hasTotals: !!week.totals,
        hasTargets: !!week.targets,
        updatedAt: week.metadata?.updatedAt || 0,
      });

      // Ensure structure is valid
      this.ensureWeekStructure(week);

      weekMap.set(week.weekStartDate, {
        source: "local",
        data: week,
        updatedAt: week.metadata.updatedAt || 0,
      });
    });
  }

  /**
   * Process remote history data, merging into week map
   * @param {Array} remoteHistory - Remote history array
   * @param {Map} weekMap - Week map to update
   * @returns {boolean} Whether any changes were made
   */
  processRemoteHistory(remoteHistory, weekMap) {
    let changed = false;

    remoteHistory.forEach((week, index) => {
      // Skip if week is missing a start date
      if (!week.weekStartDate) {
        logger.warn(
          `Remote history item at index ${index} missing weekStartDate, skipping`,
          week
        );
        return;
      }

      // Log week data for debugging
      logger.info(`Remote week ${week.weekStartDate}:`, {
        hasTotals: !!week.totals,
        hasTargets: !!week.targets,
        updatedAt: week.metadata?.updatedAt || 0,
      });

      // Ensure structure is valid
      this.ensureWeekStructure(week);

      const existingWeek = weekMap.get(week.weekStartDate);

      if (!existingWeek) {
        // New week from remote, add it
        logger.info(`New week found in remote data: ${week.weekStartDate}`);
        weekMap.set(week.weekStartDate, {
          source: "remote",
          data: week,
          updatedAt: week.metadata.updatedAt || 0,
        });
        changed = true;
      } else {
        // Week exists in both - compare timestamps and use newer
        const remoteUpdatedAt = week.metadata?.updatedAt || 0;

        if (remoteUpdatedAt > existingWeek.updatedAt) {
          // Remote is newer
          logger.info(
            `Newer version found for week ${week.weekStartDate}: remote (${remoteUpdatedAt}) > local (${existingWeek.updatedAt})`
          );
          weekMap.set(week.weekStartDate, {
            source: "remote",
            data: week,
            updatedAt: remoteUpdatedAt,
          });
          changed = true;
        } else {
          logger.info(
            `Using local version for week ${week.weekStartDate}: local (${existingWeek.updatedAt}) >= remote (${remoteUpdatedAt})`
          );
        }
      }
    });

    return changed;
  }

  /**
   * Ensure week data has proper structure
   * @param {Object} week - Week data object
   */
  ensureWeekStructure(week) {
    // Ensure totals exists
    if (!week.totals) {
      logger.warn(
        `Week ${week.weekStartDate} missing totals, adding empty object`
      );
      week.totals = {};
    }

    // Ensure metadata exists
    if (!week.metadata) {
      week.metadata = { updatedAt: this.dataService.getCurrentTimestamp() };
    } else if (!week.metadata.updatedAt) {
      week.metadata.updatedAt = this.dataService.getCurrentTimestamp();
    }
  }

  /**
   * Convert week map to sorted array
   * @param {Map} weekMap - Week map
   * @returns {Array} Sorted array of weeks
   */
  convertMapToSortedArray(weekMap) {
    return Array.from(weekMap.values())
      .map((item) => item.data)
      .sort((a, b) => {
        return new Date(b.weekStartDate) - new Date(a.weekStartDate);
      });
  }

  /**
   * Final validation of merged data
   * @param {Array} mergedData - Merged data array
   * @returns {Array} Validated data array
   */
  finalValidation(mergedData) {
    return mergedData.filter((week) => {
      if (!week.weekStartDate) {
        logger.warn("Filtering out history item missing weekStartDate", week);
        return false;
      }

      // Ensure totals exists
      if (!week.totals) {
        logger.warn(
          `Week ${week.weekStartDate} missing totals, adding empty object`
        );
        week.totals = {};
      }

      // Ensure metadata exists
      if (!week.metadata) {
        week.metadata = { updatedAt: this.dataService.getCurrentTimestamp() };
      }

      return true;
    });
  }
}
