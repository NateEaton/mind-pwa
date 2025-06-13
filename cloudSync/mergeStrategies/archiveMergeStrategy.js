/**
 * Archive Merge Strategy
 *
 * Handles merging remote data into archived weeks using maximum value selection.
 * This strategy is used when remote data from a previous week needs to be merged
 * into already archived local data.
 */

import { logger } from "../../logger.js";

export class ArchiveMergeStrategy {
  constructor(dataService, stateManager) {
    this.dataService = dataService;
    this.stateManager = stateManager;
  }

  /**
   * Execute an archive merge operation
   * @param {string} weekStartDate - The start date of the week to merge with
   * @param {Object} remoteWeeklyCounts - The remote weekly counts to merge
   * @returns {Promise<boolean>} Success status
   */
  async executeArchiveMerge(weekStartDate, remoteWeeklyCounts) {
    logger.info(`Executing archive merge for week ${weekStartDate}`);

    try {
      // Get the archived week data
      const archivedWeek = await this.dataService.getWeekHistory(weekStartDate);

      if (!archivedWeek) {
        logger.warn(`Could not find archived week ${weekStartDate} for merge`);
        return false;
      }

      // Merge totals (take maximum value for each food group)
      const mergeResult = this.mergeWeeklyTotals(
        archivedWeek.totals,
        remoteWeeklyCounts
      );

      if (!mergeResult.changed) {
        logger.info(`No changes needed for archived week ${weekStartDate}`);
        return true;
      }

      // Update the archived week with merged data
      const updatedWeek = this.updateArchivedWeek(
        archivedWeek,
        mergeResult.mergedTotals
      );

      // Save the updated archive
      await this.dataService.saveWeekHistory(updatedWeek);

      logger.info(
        `Successfully merged remote data into archived week ${weekStartDate}`
      );

      // Update the history in state manager
      await this.updateStateManagerHistory();

      return true;
    } catch (error) {
      logger.error(
        `Error during archive merge for week ${weekStartDate}:`,
        error
      );
      return false;
    }
  }

  /**
   * Merge weekly totals using maximum value strategy
   * @param {Object} localTotals - Local weekly totals
   * @param {Object} remoteTotals - Remote weekly totals
   * @returns {Object} Object with merged totals and change flag
   */
  mergeWeeklyTotals(localTotals, remoteTotals) {
    const mergedTotals = { ...localTotals };
    let changed = false;

    Object.entries(remoteTotals || {}).forEach(([groupId, remoteCount]) => {
      const localCount = mergedTotals[groupId] || 0;
      if (remoteCount > localCount) {
        mergedTotals[groupId] = remoteCount;
        changed = true;
        logger.info(
          `Updated archive total for ${groupId}: ${localCount} → ${remoteCount}`
        );
      }
    });

    return {
      mergedTotals,
      changed,
    };
  }

  /**
   * Update archived week with merged data
   * @param {Object} archivedWeek - Original archived week data
   * @param {Object} mergedTotals - Merged weekly totals
   * @returns {Object} Updated week object
   */
  updateArchivedWeek(archivedWeek, mergedTotals) {
    return {
      ...archivedWeek,
      totals: mergedTotals,
      metadata: {
        ...archivedWeek.metadata,
        updatedAt: this.dataService.getCurrentTimestamp(),
        mergedAfterReset: true,
      },
    };
  }

  /**
   * Update state manager with fresh history data
   * @returns {Promise<void>}
   */
  async updateStateManagerHistory() {
    if (!this.stateManager) {
      return;
    }

    try {
      const historyData = await this.dataService.getAllWeekHistory();
      this.stateManager.dispatch({
        type: this.stateManager.ACTION_TYPES.SET_HISTORY,
        payload: { history: historyData },
      });
    } catch (error) {
      logger.warn(
        "Failed to update state manager history after archive merge:",
        error
      );
    }
  }
}
