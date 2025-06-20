/**
 * MIND Diet Tracker PWA
 * Copyright (c) 2024
 *
 * Merge Strategies
 * Handles merging of data between local and remote sources
 */

import { logger } from "../core/logger.js";

/**
 * Current Week Merge Strategy
 * Handles complex merge logic for current week data including:
 * - Fresh install scenarios
 * - Weekly reset handling
 * - Timestamp-based conflict resolution
 * - Date reset detection
 */
export class CurrentWeekMergeStrategy {
  constructor(dataService) {
    this.dataService = dataService;
    this.pendingArchiveMerge = null;
  }

  mergeCurrentWeekData(localData, remoteData) {
    logger.info("Merging current week data:");
    logger.debug("LOCAL data:", {
      dayDate: localData.currentDayDate,
      weekStartDate: localData.currentWeekStartDate,
      lastModified: localData.lastModified,
      dailyUpdatedAt: localData.metadata?.dailyTotalsUpdatedAt,
      weeklyUpdatedAt: localData.metadata?.weeklyTotalsUpdatedAt,
      dailyResetAt: localData.metadata?.dailyResetTimestamp,
      weeklyResetAt: localData.metadata?.weeklyResetTimestamp,
      previousWeekStartDate: localData.metadata?.previousWeekStartDate,
      dateResetType: localData.metadata?.dateResetType,
    });

    logger.debug("REMOTE data:", {
      dayDate: remoteData.currentDayDate,
      weekStartDate: remoteData.currentWeekStartDate,
      lastModified: remoteData.lastModified,
      dailyUpdatedAt: remoteData.metadata?.dailyTotalsUpdatedAt,
      weeklyUpdatedAt: remoteData.metadata?.weeklyTotalsUpdatedAt,
    });

    // Check system date vs remote date
    const todayStr = this.dataService.getTodayDateString();
    const remoteDateStr = remoteData.currentDayDate;
    const needsDateReset = todayStr !== remoteDateStr;

    logger.trace(
      `System date: ${todayStr}, Remote date: ${remoteDateStr}, Needs reset: ${needsDateReset}`
    );

    // Extract timestamps for comparison
    const now = Date.now();

    // Local timestamps (update and reset)
    // Ensure local UpdatedAt timestamps default to 0 if not present, NOT to localData.lastModified
    const localDailyUpdatedAt = localData.metadata?.dailyTotalsUpdatedAt || 0;
    const localWeeklyUpdatedAt = localData.metadata?.weeklyTotalsUpdatedAt || 0;
    const localDailyResetTimestamp =
      localData.metadata?.dailyResetTimestamp || 0;
    const localWeeklyResetTimestamp =
      localData.metadata?.weeklyResetTimestamp || 0;

    // Remote timestamps
    const remoteDailyUpdatedAt =
      remoteData.metadata?.dailyTotalsUpdatedAt || remoteData.lastModified || 0;
    const remoteWeeklyUpdatedAt =
      remoteData.metadata?.weeklyTotalsUpdatedAt ||
      remoteData.lastModified ||
      0;

    // Check for reset conditions
    const dailyResetPerformed =
      localDailyResetTimestamp > 0 &&
      (localData.metadata?.dateResetType === "DAILY" ||
        localData.metadata?.dateResetType === "WEEKLY"); // Weekly reset also resets daily

    const weeklyResetPerformed =
      localWeeklyResetTimestamp > 0 &&
      localData.metadata?.dateResetType === "WEEKLY";

    logger.trace("Reset status:", {
      dailyReset: dailyResetPerformed,
      weeklyReset: weeklyResetPerformed,
      previousWeekStartDate: localData.metadata?.previousWeekStartDate,
    });

    // CRITICAL FIRST CHECK: Special case for fresh installs - prefer remote data
    if (localData.metadata?.isFreshInstall) {
      return this.handleFreshInstallMerge(localData, remoteData);
    }

    // Special weekly reset handling
    if (weeklyResetPerformed) {
      return this.handleWeeklyResetMerge(
        localData,
        remoteData,
        localWeeklyResetTimestamp,
        remoteDailyUpdatedAt,
        remoteWeeklyUpdatedAt,
        now
      );
    }

    // Normal merge cases
    return this.handleNormalMerge(
      localData,
      remoteData,
      localDailyUpdatedAt,
      localWeeklyUpdatedAt,
      localDailyResetTimestamp,
      remoteDailyUpdatedAt,
      remoteWeeklyUpdatedAt,
      dailyResetPerformed,
      needsDateReset,
      remoteDateStr,
      now
    );
  }

  handleFreshInstallMerge(localData, remoteData) {
    logger.info(
      "FRESH INSTALL detected by mergeCurrentWeekData - prioritizing cloud data if it exists."
    );

    const remoteHasData =
      (remoteData &&
        remoteData.weeklyCounts &&
        Object.keys(remoteData.weeklyCounts).length > 0) ||
      (remoteData &&
        remoteData.dailyCounts &&
        Object.values(remoteData.dailyCounts).some(
          (day) => Object.keys(day).length > 0
        ));

    if (remoteHasData) {
      logger.info("Fresh install: Using remote data entirely.");
      const newLocalState = {
        ...remoteData,
        metadata: {
          ...(remoteData.metadata || {}),
          deviceId: localData.metadata.deviceId,
          weekStartDay: localData.metadata.weekStartDay,
          isFreshInstall: false, // CRITICAL: Mark as not fresh
          dailyTotalsUpdatedAt:
            remoteData.metadata?.dailyTotalsUpdatedAt ||
            remoteData.lastModified ||
            Date.now(),
          weeklyTotalsUpdatedAt:
            remoteData.metadata?.weeklyTotalsUpdatedAt ||
            remoteData.lastModified ||
            Date.now(),
          lastModified: Date.now(),
          dailyTotalsDirty: false, // Start clean after taking cloud data
          weeklyTotalsDirty: false,
          currentWeekDirty: false,
        },
      };
      newLocalState.dailyCounts = newLocalState.dailyCounts || {};
      newLocalState.weeklyCounts = newLocalState.weeklyCounts || {};
      return newLocalState;
    } else {
      logger.info(
        "Fresh install: No remote data found or remote data is empty. Local (empty) state will be prepared for upload."
      );
      const updatedLocalState = { ...localData };
      if (!updatedLocalState.metadata) updatedLocalState.metadata = {};
      updatedLocalState.metadata.isFreshInstall = false; // Still mark as not fresh for next time
      // Timestamps are already sentinel/old from stateManager.initialize
      // Mark as dirty to ensure this "initial empty state" or "initial minimal state" gets uploaded.
      updatedLocalState.metadata.dailyTotalsDirty = true;
      updatedLocalState.metadata.weeklyTotalsDirty = true;
      updatedLocalState.metadata.currentWeekDirty = true;
      updatedLocalState.metadata.lastModified = Date.now(); // Reflect this decision time
      return updatedLocalState;
    }
  }

  handleWeeklyResetMerge(
    localData,
    remoteData,
    localWeeklyResetTimestamp,
    remoteDailyUpdatedAt,
    remoteWeeklyUpdatedAt,
    now
  ) {
    logger.info("WEEKLY RESET detected by mergeCurrentWeekData");

    // If remote data is newer than our reset, we need to merge it
    if (
      remoteDailyUpdatedAt > localWeeklyResetTimestamp ||
      remoteWeeklyUpdatedAt > localWeeklyResetTimestamp
    ) {
      logger.info(
        "Remote data is newer than our weekly reset - merging remote data"
      );

      // Create a new state object
      const mergedData = {
        ...localData,
        metadata: {
          ...localData.metadata,
          lastModified: now,
          dailyTotalsDirty: true,
          weeklyTotalsDirty: true,
          currentWeekDirty: true,
        },
      };

      // Merge daily counts
      this.mergeDailyCounts(
        mergedData,
        localData,
        remoteData,
        localWeeklyResetTimestamp,
        remoteDailyUpdatedAt,
        localWeeklyResetTimestamp,
        true
      );

      // Merge weekly counts
      this.mergeWeeklyCounts(
        mergedData,
        localData,
        remoteData,
        localWeeklyResetTimestamp,
        remoteWeeklyUpdatedAt
      );

      return mergedData;
    } else {
      logger.info(
        "Our weekly reset is newer than remote data - keeping local data"
      );
      return localData;
    }
  }

  handleNormalMerge(
    localData,
    remoteData,
    localDailyUpdatedAt,
    localWeeklyUpdatedAt,
    localDailyResetTimestamp,
    remoteDailyUpdatedAt,
    remoteWeeklyUpdatedAt,
    dailyResetPerformed,
    needsDateReset,
    remoteDateStr,
    now
  ) {
    logger.info("NORMAL MERGE case detected by mergeCurrentWeekData");

    // Create a new state object
    const mergedData = {
      ...localData,
      metadata: {
        ...localData.metadata,
        lastModified: now,
        dailyTotalsDirty: false,
        weeklyTotalsDirty: false,
        currentWeekDirty: false,
      },
    };

    // Merge daily counts
    this.mergeDailyCounts(
      mergedData,
      localData,
      remoteData,
      localDailyUpdatedAt,
      remoteDailyUpdatedAt,
      localDailyResetTimestamp,
      dailyResetPerformed
    );

    // Merge weekly counts
    this.mergeWeeklyCounts(
      mergedData,
      localData,
      remoteData,
      localWeeklyUpdatedAt,
      remoteWeeklyUpdatedAt
    );

    return mergedData;
  }

  mergeDailyCounts(
    mergedData,
    localData,
    remoteData,
    localDailyUpdatedAt,
    remoteDailyUpdatedAt,
    localDailyResetTimestamp,
    dailyResetPerformed
  ) {
    // Initialize dailyCounts if needed
    mergedData.dailyCounts = mergedData.dailyCounts || {};

    // Process each day in remote data
    Object.entries(remoteData.dailyCounts || {}).forEach(
      ([date, remoteDay]) => {
        const localDay = localData.dailyCounts?.[date] || {};

        // If we've done a daily reset, only take remote data for the current day
        if (
          dailyResetPerformed &&
          date === this.dataService.getTodayDateString()
        ) {
          mergedData.dailyCounts[date] = { ...remoteDay };
          mergedData.metadata.dailyTotalsDirty = true;
          return;
        }

        // For each food group in the remote day
        Object.entries(remoteDay).forEach(([groupId, remoteCount]) => {
          const localCount = localDay[groupId] || 0;

          // If remote is newer, use it
          if (remoteDailyUpdatedAt > localDailyUpdatedAt) {
            mergedData.dailyCounts[date] = mergedData.dailyCounts[date] || {};
            mergedData.dailyCounts[date][groupId] = remoteCount;
            mergedData.metadata.dailyTotalsDirty = true;
          }
          // If local is newer, keep it
          else if (localDailyUpdatedAt > remoteDailyUpdatedAt) {
            mergedData.dailyCounts[date] = mergedData.dailyCounts[date] || {};
            mergedData.dailyCounts[date][groupId] = localCount;
          }
          // If same timestamp, take the higher count
          else {
            mergedData.dailyCounts[date] = mergedData.dailyCounts[date] || {};
            mergedData.dailyCounts[date][groupId] = Math.max(
              localCount,
              remoteCount
            );
            if (remoteCount > localCount) {
              mergedData.metadata.dailyTotalsDirty = true;
            }
          }
        });
      }
    );

    // Process any days that only exist in local data
    Object.entries(localData.dailyCounts || {}).forEach(([date, localDay]) => {
      if (!remoteData.dailyCounts?.[date]) {
        mergedData.dailyCounts[date] = { ...localDay };
      }
    });
  }

  mergeWeeklyCounts(
    mergedData,
    localData,
    remoteData,
    localWeeklyUpdatedAt,
    remoteWeeklyUpdatedAt
  ) {
    // Initialize weeklyCounts if needed
    mergedData.weeklyCounts = mergedData.weeklyCounts || {};

    // Process each food group in remote weekly counts
    Object.entries(remoteData.weeklyCounts || {}).forEach(
      ([groupId, remoteCount]) => {
        const localCount = localData.weeklyCounts?.[groupId] || 0;

        // If remote is newer, use it
        if (remoteWeeklyUpdatedAt > localWeeklyUpdatedAt) {
          mergedData.weeklyCounts[groupId] = remoteCount;
          mergedData.metadata.weeklyTotalsDirty = true;
        }
        // If local is newer, keep it
        else if (localWeeklyUpdatedAt > remoteWeeklyUpdatedAt) {
          mergedData.weeklyCounts[groupId] = localCount;
        }
        // If same timestamp, take the higher count
        else {
          mergedData.weeklyCounts[groupId] = Math.max(localCount, remoteCount);
          if (remoteCount > localCount) {
            mergedData.metadata.weeklyTotalsDirty = true;
          }
        }
      }
    );

    // Process any food groups that only exist in local data
    Object.entries(localData.weeklyCounts || {}).forEach(
      ([groupId, localCount]) => {
        if (!(groupId in (remoteData.weeklyCounts || {}))) {
          mergedData.weeklyCounts[groupId] = localCount;
        }
      }
    );
  }

  scheduleArchiveMerge(weekStartDate, remoteWeeklyCounts) {
    this.pendingArchiveMerge = {
      weekStartDate,
      remoteWeeklyCounts,
    };
  }

  getPendingArchiveMerge() {
    return this.pendingArchiveMerge;
  }

  clearPendingArchiveMerge() {
    this.pendingArchiveMerge = null;
  }
}

/**
 * History Merge Strategy
 * Handles merging of historical weekly data between local and remote sources.
 * Uses timestamp-based conflict resolution with data validation and cleanup.
 */
export class HistoryMergeStrategy {
  constructor(dataService) {
    this.dataService = dataService;
  }

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

  validateHistoryArray(history, source) {
    if (!Array.isArray(history)) {
      logger.warn(`${source} history is not an array, using empty array`);
      return [];
    }
    return history;
  }

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

  convertMapToSortedArray(weekMap) {
    return Array.from(weekMap.values())
      .map((entry) => entry.data)
      .sort((a, b) => {
        // Sort by weekStartDate in descending order (newest first)
        return b.weekStartDate.localeCompare(a.weekStartDate);
      });
  }

  finalValidation(mergedData) {
    return mergedData.filter((week) => {
      // Ensure each week has the required structure
      if (!week.weekStartDate || !week.totals || !week.metadata) {
        logger.warn(`Filtering out invalid week in final validation:`, week);
        return false;
      }
      return true;
    });
  }
}

/**
 * Archive Merge Strategy
 * Handles merging remote data into archived weeks using maximum value selection.
 * This strategy is used when remote data from a previous week needs to be merged
 * into already archived local data.
 */
export class ArchiveMergeStrategy {
  constructor(dataService, stateManager) {
    this.dataService = dataService;
    this.stateManager = stateManager;
  }

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
