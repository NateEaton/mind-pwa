/**
 * MIND Diet Tracker PWA
 * Copyright (c) 2024
 *
 * Merge Coordinator
 * Coordinates merge operations between local and cloud data
 */

import { logger } from "../core/logger.js";
import {
  CurrentWeekMergeStrategy,
  HistoryMergeStrategy,
  ArchiveMergeStrategy,
} from "./mergeStrategies.js";
import {
  validateMergeResult,
  getCurrentTimestamp,
  compareTimestamps,
  logSyncError,
} from "./syncUtils.js";

export class MergeCoordinator {
  constructor(dataService, stateManager) {
    this.dataService = dataService;
    this.stateManager = stateManager;

    // Initialize merge strategies
    this.currentWeekStrategy = new CurrentWeekMergeStrategy(dataService);
    this.historyStrategy = new HistoryMergeStrategy(dataService);
    this.archiveStrategy = new ArchiveMergeStrategy(dataService, stateManager);
  }

  /**
   * Merge current week data using appropriate strategy
   * @param {Object} localData - Local state data
   * @param {Object} remoteData - Remote state data
   * @returns {Object} Merged data
   */
  mergeCurrentWeekData(localData, remoteData) {
    try {
      logger.info("MergeCoordinator: Starting current week merge");
      const result = this.currentWeekStrategy.mergeCurrentWeekData(
        localData,
        remoteData
      );
      logger.info(
        "MergeCoordinator: Current week merge completed successfully"
      );
      return result;
    } catch (error) {
      logger.error("MergeCoordinator: Error in current week merge:", error);
      throw error;
    }
  }

  /**
   * Merge history data using appropriate strategy
   * @param {Array} localHistory - Local history array
   * @param {Array} remoteHistory - Remote history array
   * @returns {Object} Merge result with data and change flag
   */
  mergeHistoryData(localHistory, remoteHistory) {
    try {
      logger.info("MergeCoordinator: Starting history merge");
      const result = this.historyStrategy.mergeHistoryData(
        localHistory,
        remoteHistory
      );
      logger.info("MergeCoordinator: History merge completed successfully");
      return result;
    } catch (error) {
      logger.error("MergeCoordinator: Error in history merge:", error);
      throw error;
    }
  }

  /**
   * Execute any pending archive merge from current week strategy
   * @returns {Promise<boolean>} Success status
   */
  async executePendingArchiveMerge() {
    const pendingMerge = this.currentWeekStrategy.getPendingArchiveMerge();

    if (!pendingMerge) {
      return false;
    }

    try {
      logger.info("MergeCoordinator: Executing pending archive merge");
      const success = await this.archiveStrategy.executeArchiveMerge(
        pendingMerge.weekStartDate,
        pendingMerge.remoteWeeklyCounts
      );

      if (success) {
        this.currentWeekStrategy.clearPendingArchiveMerge();
        logger.info("MergeCoordinator: Archive merge completed successfully");
      } else {
        logger.warn("MergeCoordinator: Archive merge failed");
      }

      return success;
    } catch (error) {
      logger.error("MergeCoordinator: Error in archive merge:", error);
      this.currentWeekStrategy.clearPendingArchiveMerge();
      return false;
    }
  }

  /**
   * Check if there's a pending archive merge
   * @returns {boolean} True if there's a pending archive merge
   */
  hasPendingArchiveMerge() {
    return this.currentWeekStrategy.getPendingArchiveMerge() !== null;
  }

  /**
   * Clear any pending archive merge
   */
  clearPendingArchiveMerge() {
    this.currentWeekStrategy.clearPendingArchiveMerge();
  }
}
