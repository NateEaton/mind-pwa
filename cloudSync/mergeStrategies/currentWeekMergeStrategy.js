/**
 * Current Week Merge Strategy
 *
 * Handles complex merge logic for current week data including:
 * - Fresh install scenarios
 * - Weekly reset handling
 * - Timestamp-based conflict resolution
 * - Date reset detection
 */

import { logger } from "../../logger.js";

export class CurrentWeekMergeStrategy {
  constructor(dataService) {
    this.dataService = dataService;
    this.pendingArchiveMerge = null;
  }

  /**
   * Fixed merge implementation that correctly handles weekly resets
   * @param {Object} localData - The local state data
   * @param {Object} remoteData - The remote state data from cloud
   * @returns {Object} The merged data
   */
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

  /**
   * Handle merge for fresh install scenarios
   * @param {Object} localData - Local state data
   * @param {Object} remoteData - Remote state data
   * @returns {Object} Merged data for fresh install
   */
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

  /**
   * Handle merge for weekly reset scenarios
   * @param {Object} localData - Local state data
   * @param {Object} remoteData - Remote state data
   * @param {number} localWeeklyResetTimestamp - Local weekly reset timestamp
   * @param {number} remoteDailyUpdatedAt - Remote daily updated timestamp
   * @param {number} remoteWeeklyUpdatedAt - Remote weekly updated timestamp
   * @param {number} now - Current timestamp
   * @returns {Object} Merged data for weekly reset
   */
  handleWeeklyResetMerge(
    localData,
    remoteData,
    localWeeklyResetTimestamp,
    remoteDailyUpdatedAt,
    remoteWeeklyUpdatedAt,
    now
  ) {
    logger.info("WEEKLY RESET detected - this is a new week");

    // Check if remote data is from the previous week
    const localWeekStartDate = new Date(
      localData.currentWeekStartDate + "T00:00:00"
    );
    const remoteWeekStartDate = new Date(
      remoteData.currentWeekStartDate + "T00:00:00"
    );

    // If remote week start date is before local, it's from the previous week
    const remoteIsFromPreviousWeek = remoteWeekStartDate < localWeekStartDate;
    const remoteIsFromSameWeek =
      remoteWeekStartDate.getTime() === localWeekStartDate.getTime();

    // Schedule merge with archived previous week if needed
    if (remoteIsFromPreviousWeek && localData.metadata?.previousWeekStartDate) {
      logger.info(
        "Remote data is from previous week - scheduling archive merge"
      );

      // Schedule merge with archived previous week
      this.scheduleArchiveMerge(
        localData.metadata.previousWeekStartDate,
        remoteData.weeklyCounts
      );
    }

    // If remote is from the same new week and has newer data, use it
    if (
      remoteIsFromSameWeek &&
      remoteWeeklyUpdatedAt > localWeeklyResetTimestamp
    ) {
      logger.info(
        "Remote data is from same new week and newer than local reset - using remote data"
      );

      // Use remote data but keep local reset metadata
      const mergedData = {
        ...localData,
        weeklyCounts: { ...remoteData.weeklyCounts },
        dailyCounts: { ...remoteData.dailyCounts },
        lastModified: now,
        metadata: {
          ...localData.metadata,
          weeklyTotalsUpdatedAt: remoteWeeklyUpdatedAt,
          dailyTotalsUpdatedAt:
            remoteDailyUpdatedAt > localWeeklyResetTimestamp
              ? remoteDailyUpdatedAt
              : localData.metadata.dailyTotalsUpdatedAt,
          weeklyTotalsDirty: false,
          dailyTotalsDirty: false,
          currentWeekDirty: false,
        },
      };

      return mergedData;
    }

    // Otherwise use local zeroed state (weekly reset is newer than remote data)
    logger.info("Weekly reset: Using local (zeroed) state for new week");
    const mergedData = {
      ...localData,
      lastModified: now,
      metadata: {
        ...localData.metadata,
        dailyTotalsDirty: false,
        weeklyTotalsDirty: false,
        currentWeekDirty: false,
      },
    };

    return mergedData;
  }

  /**
   * Handle normal merge cases using timestamp comparison
   * @param {Object} localData - Local state data
   * @param {Object} remoteData - Remote state data
   * @param {number} localDailyUpdatedAt - Local daily updated timestamp
   * @param {number} localWeeklyUpdatedAt - Local weekly updated timestamp
   * @param {number} localDailyResetTimestamp - Local daily reset timestamp
   * @param {number} remoteDailyUpdatedAt - Remote daily updated timestamp
   * @param {number} remoteWeeklyUpdatedAt - Remote weekly updated timestamp
   * @param {boolean} dailyResetPerformed - Whether daily reset was performed
   * @param {boolean} needsDateReset - Whether date reset is needed
   * @param {string} remoteDateStr - Remote date string
   * @param {number} now - Current timestamp
   * @returns {Object} Merged data for normal cases
   */
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
    // Normal merge cases - prepare merged data structure
    let mergedData = {
      currentDayDate: localData.currentDayDate, // Always preserve local date
      currentWeekStartDate: localData.currentWeekStartDate,
      // We'll fill these based on timestamps
      dailyCounts: {},
      weeklyCounts: {},
      lastModified: now, // Update overall timestamp
      metadata: {
        // Combine metadata but we'll update timestamps later
        ...(remoteData.metadata || {}),
        ...(localData.metadata || {}),
        schemaVersion:
          localData.metadata?.schemaVersion ||
          remoteData.metadata?.schemaVersion ||
          1,
        deviceId: localData.metadata?.deviceId,
      },
    };

    // ----- Daily Counts Merge Logic -----
    this.mergeDailyCounts(
      mergedData,
      localData,
      remoteData,
      localDailyUpdatedAt,
      remoteDailyUpdatedAt,
      localDailyResetTimestamp,
      dailyResetPerformed
    );

    // ----- Weekly Counts Merge Logic -----
    this.mergeWeeklyCounts(
      mergedData,
      localData,
      remoteData,
      localWeeklyUpdatedAt,
      remoteWeeklyUpdatedAt
    );

    // For backward compatibility, update general dirty flag
    mergedData.metadata.currentWeekDirty =
      mergedData.metadata.dailyTotalsDirty ||
      mergedData.metadata.weeklyTotalsDirty;

    // Check if we need post-sync date reset
    if (needsDateReset) {
      mergedData.metadata.pendingDateReset = true;
      mergedData.metadata.remoteDateWas = remoteDateStr;
      logger.info("Flagged for post-sync date reset");
    }

    logger.debug("MERGED data:", {
      dayDate: mergedData.currentDayDate,
      weekStartDate: mergedData.currentWeekStartDate,
      dailyUpdatedAt: mergedData.metadata.dailyTotalsUpdatedAt,
      weeklyUpdatedAt: mergedData.metadata.weeklyTotalsUpdatedAt,
    });

    return mergedData;
  }

  /**
   * Merge daily counts using timestamp-based strategy
   * @param {Object} mergedData - Data object being built
   * @param {Object} localData - Local state data
   * @param {Object} remoteData - Remote state data
   * @param {number} localDailyUpdatedAt - Local daily updated timestamp
   * @param {number} remoteDailyUpdatedAt - Remote daily updated timestamp
   * @param {number} localDailyResetTimestamp - Local daily reset timestamp
   * @param {boolean} dailyResetPerformed - Whether daily reset was performed
   */
  mergeDailyCounts(
    mergedData,
    localData,
    remoteData,
    localDailyUpdatedAt,
    remoteDailyUpdatedAt,
    localDailyResetTimestamp,
    dailyResetPerformed
  ) {
    // Three-part analysis for daily counts
    if (remoteDailyUpdatedAt > localDailyUpdatedAt) {
      // Remote data is newer than local updates
      if (
        dailyResetPerformed &&
        localDailyResetTimestamp > remoteDailyUpdatedAt
      ) {
        // But there's been a reset since the remote update - keep local zeroed counts
        logger.info(
          "Using local daily counts (reset is newer than remote update)"
        );
        mergedData.dailyCounts = { ...localData.dailyCounts };
        mergedData.metadata.dailyTotalsUpdatedAt = localDailyUpdatedAt;
        mergedData.metadata.dailyResetTimestamp = localDailyResetTimestamp;
        mergedData.metadata.dailyTotalsDirty = false;
      } else {
        // No reset or reset is older than remote data - use remote data
        logger.info("Using remote daily counts (newer than local update)");
        mergedData.dailyCounts = { ...remoteData.dailyCounts };
        mergedData.metadata.dailyTotalsUpdatedAt = remoteDailyUpdatedAt;
        mergedData.metadata.dailyTotalsDirty = false;
      }
    } else {
      // Local update is newer than remote - keep local data
      logger.info("Using local daily counts (newer than remote update)");
      mergedData.dailyCounts = { ...localData.dailyCounts };
      mergedData.metadata.dailyTotalsUpdatedAt = localDailyUpdatedAt;
      mergedData.metadata.dailyTotalsDirty = false;
    }
  }

  /**
   * Merge weekly counts using timestamp-based strategy
   * @param {Object} mergedData - Data object being built
   * @param {Object} localData - Local state data
   * @param {Object} remoteData - Remote state data
   * @param {number} localWeeklyUpdatedAt - Local weekly updated timestamp
   * @param {number} remoteWeeklyUpdatedAt - Remote weekly updated timestamp
   */
  mergeWeeklyCounts(
    mergedData,
    localData,
    remoteData,
    localWeeklyUpdatedAt,
    remoteWeeklyUpdatedAt
  ) {
    // Similar three-part analysis for weekly counts
    if (remoteWeeklyUpdatedAt > localWeeklyUpdatedAt) {
      // Remote data is newer than local updates
      logger.info("Using remote weekly counts (newer than local update)");
      mergedData.weeklyCounts = { ...remoteData.weeklyCounts };
      mergedData.metadata.weeklyTotalsUpdatedAt = remoteWeeklyUpdatedAt;
      mergedData.metadata.weeklyTotalsDirty = false;
    } else {
      // Local update is newer than remote - keep local data
      logger.info("Using local weekly counts (newer than remote update)");
      mergedData.weeklyCounts = { ...localData.weeklyCounts };
      mergedData.metadata.weeklyTotalsUpdatedAt = localWeeklyUpdatedAt;
      mergedData.metadata.weeklyTotalsDirty = false;
    }
  }

  /**
   * Schedule an archive merge to be executed after the current sync completes
   * @param {string} weekStartDate - The start date of the week to merge with
   * @param {Object} remoteWeeklyCounts - The remote weekly counts to merge
   */
  scheduleArchiveMerge(weekStartDate, remoteWeeklyCounts) {
    // Store the merge task for execution after current sync completes
    this.pendingArchiveMerge = {
      weekStartDate,
      remoteWeeklyCounts,
    };
    logger.info(`Scheduled archive merge for week ${weekStartDate}`);
  }

  /**
   * Get the pending archive merge (if any)
   * @returns {Object|null} Pending archive merge data
   */
  getPendingArchiveMerge() {
    return this.pendingArchiveMerge;
  }

  /**
   * Clear the pending archive merge
   */
  clearPendingArchiveMerge() {
    this.pendingArchiveMerge = null;
  }
}
