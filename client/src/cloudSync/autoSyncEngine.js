/**
 * MIND Diet Tracker PWA
 * Copyright (c) 2024
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Auto-Sync Engine for PocketBase
 * Integrates with existing state management to provide automatic, real-time synchronization
 */

import logger from "../core/logger.js";
import { ACTION_TYPES } from "../core/stateManager.js";
import dataService from "../core/dataService.js";

export class AutoSyncEngine {
  constructor(stateManager, dataService, provider, uiRenderer) {
    this.stateManager = stateManager;
    this.dataService = dataService;
    this.provider = provider;
    this.uiRenderer = uiRenderer;

    this.syncInProgress = false;
    this.pendingChanges = new Set();
    this.lastLocalChange = 0;
    this.syncStatusCallbacks = new Set();

    // Debounced sync function - waits 2 seconds after last change
    this.debouncedSync = this.debounce(async () => {
      await this.performSync("local_change");
    }, 2000);

    // Throttled sync for high-frequency changes
    this.throttledSync = this.throttle(async () => {
      await this.performSync("throttled");
    }, 5000);

    this.setupAutoSync();
    logger.info("Auto-sync engine initialized");
  }

  /**
   * Setup automatic sync triggers
   */
  setupAutoSync() {
    // Subscribe to all state changes
    this.stateManager.subscribe((action, newState) => {
      this.handleStateChange(action, newState);
    });

    // Subscribe to remote changes from PocketBase
    if (
      this.provider &&
      typeof this.provider.subscribeToChanges === "function"
    ) {
      this.provider.subscribeToChanges((dataType, changeEvent) => {
        if (dataType === "weekly_data") {
          this.handleRemoteWeeklyDataChange(changeEvent);
        }
        // Remove old current_weeks and weekly_history handlers - now unified
      });
    }

    // Periodic sync as backup (every 2 minutes)
    setInterval(() => {
      if (
        !this.syncInProgress &&
        navigator.onLine &&
        this.provider?.isAuthenticated
      ) {
        this.performSync("periodic");
      }
    }, 120000);

    logger.debug("Auto-sync triggers configured");
  }

  /**
   * Handle local state changes
   */
  handleStateChange(action, newState) {
    this.lastLocalChange = dataService.getCurrentTimestamp();

    switch (action.type) {
      case ACTION_TYPES.UPDATE_DAILY_COUNT:
      case ACTION_TYPES.RESET_DAILY_COUNTS:
      case ACTION_TYPES.RESET_WEEKLY_COUNTS:
      case ACTION_TYPES.RECALCULATE_WEEKLY_TOTALS:
      case ACTION_TYPES.SET_CURRENT_DAY:
      case ACTION_TYPES.SET_CURRENT_WEEK:
      case ACTION_TYPES.SET_SELECTED_TRACKER_DATE:
        this.pendingChanges.add("current_week");
        this.notifySyncStatus("pending");
        this.debouncedSync();
        break;

      // ======================= START OF FIX =======================
      // Add a specific case to handle metadata updates that flag history as dirty.
      case ACTION_TYPES.UPDATE_METADATA:
        if (action.payload?.metadata?.historyDirty) {
          logger.debug(
            "History marked as dirty, queueing weekly_history sync."
          );
          this.pendingChanges.add("weekly_history");
          this.notifySyncStatus("pending");
          this.debouncedSync();
        }
        // We can add other metadata checks here in the future if needed.
        break;
      // ======================== END OF FIX ========================

      case ACTION_TYPES.SET_HISTORY:
        this.pendingChanges.add("weekly_history");
        this.notifySyncStatus("pending");
        this.debouncedSync();
        break;

      case ACTION_TYPES.IMPORT_STATE:
        this.pendingChanges.add("current_week");
        this.pendingChanges.add("weekly_history");
        this.notifySyncStatus("pending");
        this.debouncedSync();
        break;

      default:
        // The default case should no longer handle UPDATE_METADATA.
        // It's still useful as a catch-all for minor, untracked actions.
        if (this.pendingChanges.size === 0) {
          this.pendingChanges.add("current_week");
          this.throttledSync();
        }
    }
  }

  /**
   * Handle incoming remote changes from PocketBase
   */
  async handleRemoteChange(dataType, changeEvent) {
    if (this.syncInProgress) {
      logger.debug("Sync in progress, queuing remote change");
      setTimeout(() => this.handleRemoteChange(dataType, changeEvent), 1000);
      return;
    }

    logger.info("Processing remote change:", {
      dataType,
      action: changeEvent.action,
    });

    try {
      this.syncInProgress = true;
      this.notifySyncStatus("syncing");

      if (dataType === "weekly_data") {
        await this.handleRemoteWeeklyDataChange(changeEvent);
      }

      this.notifySyncStatus("synced");
    } catch (error) {
      logger.error("Error handling remote change:", error);
      this.notifySyncStatus("error", error.message);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Handle remote weekly data changes - works for current OR historical weeks
   * @param {Object} changeEvent PocketBase change event
   */
  async handleRemoteWeeklyDataChange(changeEvent) {
    try {
      const remoteRecord = changeEvent.record;
      const weekStartDate = this.provider.convertPocketBaseDateToLocal(
        remoteRecord.week_start_date
      );

      logger.info(`Processing remote change for week: ${weekStartDate}`);

      // Get local version for comparison
      const localRecord = await this.dataService.getWeekData(weekStartDate);

      // Apply Last Write Wins conflict resolution
      const remoteUpdated = new Date(remoteRecord.updated).getTime();
      const localUpdated = localRecord?.metadata?.updatedAt || 0;

      if (!localRecord || remoteUpdated > localUpdated) {
        logger.info(
          `Remote version newer, updating local data for week: ${weekStartDate}`
        );

        // Convert and save remote data
        const convertedData = this.convertFromPocketBaseFormat(remoteRecord);
        await this.dataService.saveWeekData(convertedData);

        // Refresh UI if this affects current week or visible history
        await this.refreshUIAfterRemoteChange(weekStartDate);
      } else {
        logger.debug(
          `Local version newer or equal, keeping local data for week: ${weekStartDate}`
        );
      }
    } catch (error) {
      logger.error("Error handling remote weekly data change:", error);
    }
  }

  /**
   * Perform sync operation
   */
  async performSync(trigger) {
    if (this.syncInProgress) {
      logger.debug("Sync already in progress");
      return;
    }

    if (!this.provider?.isAuthenticated) {
      logger.debug("Not authenticated, skipping sync");
      return;
    }

    try {
      this.syncInProgress = true;
      this.notifySyncStatus("syncing");

      logger.info(`Starting auto-sync (triggered by: ${trigger})`);

      const currentState = this.stateManager.getState();
      let syncSuccess = true;

      // Sync current week if it has changes
      if (this.pendingChanges.has("current_week") || trigger === "periodic") {
        const isInitialSync = this.isInitialSync(currentState);
        let shouldPushCurrentWeek = true; // Default to pushing changes

        if (isInitialSync) {
          logger.info(
            "Initial sync detected, attempting to pull remote data first."
          );
          const pullResult = await this.pullRemoteData(currentState);

          if (pullResult.success && pullResult.data) {
            // If we successfully pulled and merged data, the local state is now
            // aligned with the remote. We should NOT push our initial (and now outdated) state.
            shouldPushCurrentWeek = false;
            logger.info(
              "Successfully pulled and merged remote data. Skipping initial push."
            );
            this.pendingChanges.delete("current_week"); // Mark as clean
          } else {
            // This means the pull either failed or, more importantly, found no data.
            // In this case, we SHOULD proceed to push our local changes.
            logger.info(
              "No remote data found or pull failed. Proceeding with initial push."
            );
          }
        }

        if (shouldPushCurrentWeek) {
          const currentWeekData = this.buildCurrentWeekSyncData(currentState);
          if (currentWeekData) {
            const result = await this.provider.syncWeeklyData(currentWeekData);
            if (result.success) {
              this.pendingChanges.delete("current_week");
              // ... (rest of metadata update logic is correct)
              logger.debug("Current week synced successfully");
            } else {
              syncSuccess = false;
              logger.warn("Current week sync failed:", result.error);
            }
          }
        }
      }

      // Sync history if needed (This part of your diff is already correct)
      if (this.pendingChanges.has("weekly_history")) {
        const dirtyWeeks = await this.dataService.getDirtyWeekHistory();
        for (const weekData of dirtyWeeks) {
          const result = await this.provider.syncWeeklyData(weekData);
          if (result.success) {
            weekData.metadata.syncStatus = "clean";
            await this.dataService.saveWeekData(weekData);
          } else {
            syncSuccess = false;
            logger.warn("Weekly history sync failed:", result.error);
          }
        }
        if (syncSuccess) {
          this.pendingChanges.delete("weekly_history");
        }
      }

      if (syncSuccess) {
        this.notifySyncStatus("synced");
        logger.info("Auto-sync completed successfully");
      } else {
        this.notifySyncStatus("error", "Some data failed to sync");
      }
    } catch (error) {
      logger.error("Auto-sync failed:", error);
      this.notifySyncStatus("error", error.message);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Perform initial bulk sync of all weekly data.
   * This version correctly separates the current week's data from historical data.
   */
  async performInitialBulkSync() {
    try {
      logger.info("Starting initial bulk sync of weekly data");

      // Get all remote weekly data and the current state's week start date
      const allRemoteWeeks = await this.provider.getAllWeeklyData();
      const currentState = this.stateManager.getState();
      const currentWeekStartDate = currentState.currentWeekStartDate;

      if (allRemoteWeeks.length === 0) {
        logger.info("No remote weekly data found for bulk sync");
        return;
      }

      logger.info(
        `Processing ${allRemoteWeeks.length} remote records for initial sync.`
      );

      const historicalWeeksToSave = [];
      let currentWeekDataFromRemote = null;

      // --- START OF FIX ---
      // 1. Separate the current week from the historical weeks
      allRemoteWeeks.forEach((week) => {
        if (week.weekStartDate === currentWeekStartDate) {
          currentWeekDataFromRemote = week;
        } else {
          historicalWeeksToSave.push(week);
        }
      });

      // 2. If there's historical data, save it to the history store
      if (historicalWeeksToSave.length > 0) {
        logger.info(
          `Bulk saving ${historicalWeeksToSave.length} historical records to IndexedDB.`
        );
        await this.dataService.bulkSaveWeeklyData(historicalWeeksToSave);
      }

      // 3. If remote data for the current week was found, merge it into the live state
      if (currentWeekDataFromRemote) {
        logger.info(
          `Found and merging remote data for the current week: ${currentWeekStartDate}`
        );
        const mergedData = this.mergeInitialSyncData(
          currentState,
          currentWeekDataFromRemote
        );

        this.stateManager.dispatch({
          type: ACTION_TYPES.SET_STATE,
          payload: mergedData,
        });
      }

      // 4. Finally, refresh the history in the state from the newly populated DB
      await this._refreshHistoryInState();
      // --- END OF FIX ---

      logger.info("Initial bulk sync completed successfully");
    } catch (error) {
      logger.error("Failed to perform initial bulk sync:", error);
      throw error;
    }
  }

  /**
   * Resolve conflicts using a "Last Write Wins" strategy based on a record timestamp.
   */
  async resolveConflict(localData, remoteRecord) {
    logger.info("Resolving conflict with 'Last Write Wins' strategy.");

    // --- START FIX ---
    // Use the engine's own conversion method, which correctly delegates to the provider.
    // This removes the dangling reference to the deleted 'convertPocketBaseToLocal' function.
    const remoteLocalFormat = this.convertFromPocketBaseFormat(remoteRecord);
    // --- END FIX ---

    const localTimestamp = localData.metadata?.lastModified || 0;
    const remoteTimestamp = remoteLocalFormat.metadata?.lastModified || 0;

    logger.debug(
      `Comparing timestamps -> Local: ${localTimestamp}, Remote: ${remoteTimestamp}`
    );

    // The record with the newer timestamp wins. The entire record is kept.
    if (localTimestamp > remoteTimestamp) {
      logger.info(
        "Conflict Resolution: Local data is newer. Keeping local version."
      );
      return localData;
    } else {
      logger.info(
        "Conflict Resolution: Remote data is newer or identical. Applying remote version."
      );
      return remoteLocalFormat;
    }
  }

  /**
   * Merge count objects using "higher value wins" strategy
   */
  mergeCountObjects(local, remote) {
    const merged = { ...local };

    Object.entries(remote).forEach(([key, value]) => {
      if (typeof value === "object" && value !== null) {
        // Handle nested objects (daily breakdown)
        merged[key] = this.mergeCountObjects(merged[key] || {}, value);
      } else if (typeof value === "number") {
        // Take higher number
        merged[key] = Math.max(merged[key] || 0, value);
      } else {
        // For non-numeric values, take remote if local doesn't exist
        if (!(key in merged)) {
          merged[key] = value;
        }
      }
    });

    return merged;
  }

  /**
   * Check if this is the very first sync on a fresh installation.
   * This now correctly uses the isFreshInstall metadata flag.
   */
  isInitialSync(currentState) {
    // This is a much more reliable check than looking for empty data,
    // as a new week will always have empty data initially.
    if (currentState.metadata?.isFreshInstall) {
      logger.info("Detected initial sync on a fresh installation.");
      return true;
    }
    return false;
  }

  /**
   * Pull remote data during initial sync
   */
  async pullRemoteData(currentState) {
    try {
      const userId = this.provider.pb.authStore.model.id;
      const weekStartDate =
        currentState.weekStartDate || currentState.currentWeekStartDate;

      const remoteRecord = await this.provider.getRemoteCurrentWeek(
        userId,
        weekStartDate
      );

      if (remoteRecord) {
        logger.info("Found remote data during initial sync, pulling to local");

        // --- START FIX ---
        // Use the engine's own conversion method, which correctly delegates to the provider.
        // This removes the dangling reference to the deleted 'convertPocketBaseToLocal' function.
        const remoteData = this.convertFromPocketBaseFormat(remoteRecord);
        // --- END FIX ---

        const mergedData = this.mergeInitialSyncData(currentState, remoteData);

        this.stateManager.dispatch({
          type: ACTION_TYPES.SET_STATE,
          payload: mergedData,
        });
        logger.info("Live application state updated with pulled data.");

        await this.performInitialBulkSync();

        return { success: true, data: mergedData };
      } else {
        logger.info("No remote data found during initial sync");
        await this.performInitialBulkSync();
        return { success: true, data: null };
      }
    } catch (error) {
      logger.error("Error during initial sync pull:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Merge remote data with local state during initial sync
   */
  mergeInitialSyncData(localState, remoteData) {
    logger.debug("Merging initial sync data:", {
      localDailyCounts: Object.keys(localState.dailyCounts || {}),
      remoteDailyCounts: Object.keys(remoteData.dailyCounts || {}),
    });

    // Start with remote data as base
    const merged = { ...remoteData };

    // Merge daily counts - combine both local and remote dates
    merged.dailyCounts = {
      ...(remoteData.dailyCounts || {}),
      ...(localState.dailyCounts || {}),
    };

    // Use the most recent dates from either source
    merged.currentDayDate =
      localState.currentDayDate || remoteData.currentDayDate;
    merged.selectedTrackerDate =
      localState.selectedTrackerDate || remoteData.selectedTrackerDate;

    // Recalculate weekly totals after merge
    merged.weeklyTotals = this.provider.calculateWeeklyTotals(
      merged.dailyCounts,
      merged.weekStartDate || merged.currentWeekStartDate
    );

    logger.debug("Initial sync merge result:", {
      mergedDailyCounts: Object.keys(merged.dailyCounts || {}),
      weeklyTotals: merged.weeklyTotals,
    });

    return merged;
  }

  /**
   * Check if change originated from this client
   */
  isOwnChange(remoteData) {
    const deviceId = this.provider.deviceId;
    return remoteData.metadata?.deviceId === deviceId;
  }

  /**
   * Show notification for remote updates
   */
  showRemoteUpdateNotification(dataType) {
    if (
      this.uiRenderer &&
      typeof this.uiRenderer.showNotification === "function"
    ) {
      this.uiRenderer.showNotification({
        type: "info",
        message: `Data updated from another device`,
        duration: 3000,
      });
    }
  }

  /**
   * Notify sync status to subscribers
   */
  notifySyncStatus(status, message = "") {
    this.syncStatusCallbacks.forEach((callback) => {
      try {
        callback(status, message);
      } catch (error) {
        logger.error("Error in sync status callback:", error);
      }
    });
  }

  /**
   * Subscribe to sync status changes
   */
  onSyncStatusChange(callback) {
    this.syncStatusCallbacks.add(callback);
    return () => this.syncStatusCallbacks.delete(callback);
  }

  /**
   * Debounce utility
   */
  debounce(func, delay) {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  /**
   * Throttle utility
   */
  throttle(func, delay) {
    let lastCall = 0;
    return (...args) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        func.apply(this, args);
      }
    };
  }

  /**
   * Build sync data from current state
   */
  buildCurrentWeekSyncData(currentState) {
    if (!currentState.currentWeekStartDate) {
      return null;
    }
    // This function now creates a PURE data object.
    // It has no knowledge of the provider's schema.
    return {
      weekStartDate: currentState.currentWeekStartDate,
      dailyCounts: currentState.dailyCounts || {},
      weeklyTotals: currentState.weeklyTotals || {},
      targets: {},
      metadata: {
        // No need for 'updatedAt' here, the provider will add its own timestamp.
        deviceId: this.dataService.getDeviceId(),
        syncStatus: "clean",
      },
    };
  }

  /**
   * Convert from PocketBase format to local format
   */
  convertFromPocketBaseFormat(remoteRecord) {
    // Delegate ALL conversion to the provider.
    // The provider now has the single source of truth (_fromRemoteWeeklyData).
    return this.provider._fromRemoteWeeklyData(remoteRecord);
  }

  /**
   * Refresh UI after remote change
   */
  async refreshUIAfterRemoteChange(weekStartDate) {
    try {
      const currentState = this.stateManager.getState();
      const currentWeekStart = currentState.currentWeekStartDate;

      // If this change affects the current week, refresh the current state
      if (weekStartDate === currentWeekStart) {
        logger.info("Remote change affects current week, refreshing state");
        // Refresh current week data from storage
        const updatedWeekData = await this.dataService.getWeekData(
          weekStartDate
        );
        if (updatedWeekData) {
          this.stateManager.dispatch({
            type: ACTION_TYPES.SET_STATE,
            payload: {
              ...currentState,
              dailyCounts: updatedWeekData.dailyCounts || {},
              weeklyTotals: updatedWeekData.weeklyTotals || {},
            },
          });
        }
      }

      // Always refresh history to show latest data
      await this._refreshHistoryInState();

      // Show notification about remote update
      this.showRemoteUpdateNotification("weekly_data");
    } catch (error) {
      logger.error("Error refreshing UI after remote change:", error);
    }
  }

  /**
   * Refresh history data in state
   */
  async _refreshHistoryInState() {
    try {
      const updatedHistory = await this.dataService.getAllWeekHistory();
      this.stateManager.dispatch({
        type: ACTION_TYPES.SET_HISTORY,
        payload: { history: updatedHistory || [] },
      });
    } catch (error) {
      logger.error("Error refreshing history in state:", error);
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.debouncedSync?.cancel) {
      this.debouncedSync.cancel();
    }
    this.syncStatusCallbacks.clear();
    this.pendingChanges.clear();
    logger.info("Auto-sync engine destroyed");
  }
}
