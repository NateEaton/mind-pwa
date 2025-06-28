/**
 * MIND Diet Tracker PWA
 * Copyright (c) 2024
 *
 * Cloud Sync Manager
 * Handles synchronization between local data and cloud storage
 * Dependencies:
 * - Google Drive Provider
 * - Dropbox Provider
 */

import GoogleDriveProvider from "../cloudProviders/googleDriveProvider.js";
import DropboxProvider from "../cloudProviders/dropboxProvider.js";
import logger from "../core/logger.js";
import {
  getCurrentTimestamp,
  isTimestampValid,
  compareTimestamps,
  validateSyncData,
  validateMergeResult,
  generateSyncId,
  isNetworkAvailable,
  getSyncStatus,
  updateSyncStatus,
  clearSyncStatus,
  getSyncError,
  logSyncError,
  retryWithBackoff,
  debounce,
  throttle,
} from "./syncUtils.js";
import { SyncOperationHandler } from "./syncOperationHandler.js";

/**
 * Manages cloud synchronization for the application
 */
export class CloudSyncManager {
  constructor(
    dataService,
    stateManager,
    uiRenderer,
    onSyncComplete,
    onSyncError
  ) {
    this.dataService = dataService;
    this.stateManager = stateManager;
    this.uiRenderer = uiRenderer;
    this.onSyncComplete = onSyncComplete || (() => {});
    this.onSyncError = onSyncError || logger.error;
    this.provider = null;
    this.isAuthenticated = false;
    this.lastSyncTimestamp = 0;
    this.syncInProgress = false;
    this.syncInterval = null;
    this.autoSyncEnabled = false;

    // Initialize sync operation handler
    this.syncOperationHandler = new SyncOperationHandler(
      dataService,
      this.provider
    );
  }

  /**
   * Initialize cloud sync
   * @returns {Promise<void>}
   */
  async initialize(providerName = "gdrive") {
    if (providerName === "gdrive") {
      this.provider = new GoogleDriveProvider();
    } else if (providerName === "dropbox") {
      this.provider = new DropboxProvider();
    } else {
      throw new Error(`Unsupported cloud provider: ${providerName}`);
    }

    // Initialize the provider and check if it was successful
    const initResult = await this.provider.initialize();
    if (!initResult) {
      logger.warn(
        `Provider ${providerName} initialization failed, likely due to missing config`
      );
      return false;
    }

    // Initialize sync operation handler with the provider
    this.syncOperationHandler = new SyncOperationHandler(
      this.dataService,
      this.provider
    );

    // First, check if we have a valid access token.
    this.isAuthenticated = await this.provider.checkAuth();

    if (this.isAuthenticated) {
      logger.info(
        `Auth check successful with stored access token for ${providerName}.`
      );
      return true;
    }

    // If not authenticated, check if we have a refresh token to try.
    logger.info(
      `Stored access token is invalid or missing. Checking for a refresh token...`
    );
    const refreshToken = localStorage.getItem(`${providerName}_refresh_token`);

    if (refreshToken) {
      logger.info(
        `Found refresh token for ${providerName}. Attempting to refresh session proactively.`
      );

      // Try refresh with retry logic
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const refreshSuccess = await this.provider.refreshToken();
          if (refreshSuccess) {
            logger.info(
              `Proactive token refresh successful for ${providerName} on attempt ${attempt}.`
            );
            this.isAuthenticated = true;
            return true;
          }
        } catch (error) {
          logger.warn(`Refresh attempt ${attempt} failed:`, error);
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
          }
        }
      }

      // All attempts failed
      logger.warn(
        `All refresh attempts failed for ${providerName}. User must re-authenticate.`
      );
      this.provider.clearStoredAuth();
      return false;
    }

    // If we reach here, there's no valid access token and no refresh token.
    logger.info(
      `No valid session found for ${providerName}. User is not authenticated.`
    );
    return false;
  }

  /**
   * Enable auto-sync
   * @param {number} intervalMinutes - Sync interval in minutes
   */
  enableAutoSync(intervalMinutes = 15) {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    this.syncInterval = setInterval(() => {
      this.sync(true);
    }, intervalMinutes * 60 * 1000);
    this.autoSyncEnabled = true;
    logger.info(`Auto-sync enabled every ${intervalMinutes} minutes`);
  }

  /**
   * Disable auto-sync
   */
  disableAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.autoSyncEnabled = false;
    logger.info("Auto-sync disabled");
  }

  /**
   * Check if auto-sync is enabled
   * @returns {boolean}
   */
  isAutoSyncEnabled() {
    return this.autoSyncEnabled;
  }

  /**
   * Get last sync time
   * @returns {Date|null}
   */
  getLastSyncTime() {
    return this.lastSyncTimestamp ? new Date(this.lastSyncTimestamp) : null;
  }

  /**
   * Sync data between local device and cloud
   * @param {boolean} silent - Whether to show notifications
   * @returns {Promise<Object|boolean>} Sync results or false if sync failed
   */
  async sync(silent = false) {
    if (this.syncInProgress) {
      logger.info("Sync already in progress, skipping");
      return false;
    }

    // Check network constraints
    if (!this.checkNetworkConstraints()) {
      const error = new Error("'Sync only on Wi-Fi' is enabled.");
      error.code = "NETWORK_CONSTRAINT";
      this.onSyncError(error);
      return false;
    }

    try {
      this.syncInProgress = true;
      logger.info("Starting sync process");

      // Check if we're authenticated
      if (!this.isAuthenticated) {
        logger.info("Not authenticated, attempting authentication");

        // Show authentication toast
        if (this.uiRenderer) {
          this.uiRenderer.showToast(
            "Authenticating with cloud service...",
            "info",
            {
              isPersistent: true,
              showSpinner: true,
            }
          );
        }

        this.isAuthenticated = await this.provider.authenticate();
        if (!this.isAuthenticated) {
          throw new Error("Authentication failed");
        }
      }

      // Show sync toast
      if (this.uiRenderer) {
        this.uiRenderer.showToast(
          silent ? "Auto-syncing data..." : "Synchronizing data...",
          "info",
          {
            isPersistent: true,
            showSpinner: true,
          }
        );
      }

      // Determine what needs to be synced
      const syncNeeds =
        await this.syncOperationHandler.changeDetectionService.determineSyncNeeds(
          await this.syncOperationHandler.changeDetectionService.analyzeDirtyFlags(
            this.dataService.loadState().metadata || {}
          ),
          null,
          true
        );

      let workWasDone = false;
      const syncResults = {};

      // Sync current week if needed
      if (syncNeeds.syncCurrent) {
        logger.info("Syncing current week...");
        const currentWeekResult =
          await this.syncOperationHandler.syncCurrentWeek();
        if (currentWeekResult) {
          workWasDone = true;
          syncResults.currentWeekSynced = true;
        }
      }

      // Sync history if needed
      if (syncNeeds.syncHistory) {
        logger.info("Syncing history...");
        const historyResult = await this.syncOperationHandler.syncHistory();
        if (historyResult && historyResult.length > 0) {
          workWasDone = true;
          syncResults.historySynced = true;
        }
      }

      this.lastSyncTimestamp = this.dataService.getCurrentTimestamp();

      // Show completion toast if work was done OR if this was a manual sync
      if (this.uiRenderer) {
        this.uiRenderer.clearToasts(); // Clear the persistent sync toast
        if (workWasDone) {
          this.uiRenderer.showToast(
            silent
              ? "Auto-sync completed successfully!"
              : "Data synchronized successfully!",
            "success",
            {
              duration: 2000,
            }
          );
        }
      }

      this.onSyncComplete({
        timestamp: this.lastSyncTimestamp,
        ...syncResults,
      });

      return syncResults;
    } catch (error) {
      // Clear any sync toast on error
      if (this.uiRenderer) {
        this.uiRenderer.clearToasts();
      }
      this.onSyncError(error);
      return false;
    } finally {
      this.syncInProgress = false;
      logger.info("Sync process completed");
    }
  }

  /**
   * Check if sync is needed
   * @returns {Promise<boolean>}
   */
  async checkIfSyncNeeded() {
    try {
      const localData = this.dataService.loadState();
      const hasLocalChanges =
        localData.metadata?.currentWeekDirty ||
        localData.metadata?.dailyTotalsDirty ||
        localData.metadata?.weeklyTotalsDirty ||
        false;

      if (!hasLocalChanges) {
        return false;
      }

      const currentWeekFileName = "mind-diet-current-week.json";
      const fileInfo = await this.provider.searchFile(currentWeekFileName);

      if (!fileInfo) {
        return true;
      }

      return await this.syncOperationHandler.fileMetadataManager.checkIfFileChanged(
        currentWeekFileName,
        fileInfo.id,
        this.provider
      );
    } catch (error) {
      logger.error("Error checking if sync needed:", error);
      return false;
    }
  }

  /**
   * Get sync status
   * @returns {Object} Sync status information
   */
  getSyncStatus() {
    return {
      lastSyncTime: this.lastSyncTimestamp
        ? new Date(this.lastSyncTimestamp)
        : null,
      autoSyncEnabled: this.autoSyncEnabled,
      syncInProgress: this.syncInProgress,
    };
  }

  /**
   * Check network constraints for sync
   * @returns {boolean} True if sync is allowed
   */
  checkNetworkConstraints() {
    // If syncWifiOnly is true, check if we're on WiFi
    if (this.syncWifiOnly) {
      return navigator.connection?.type === "wifi";
    }
    return true;
  }

  async authenticate() {
    if (!this.provider) throw new Error("No cloud provider initialized");
    this.isAuthenticated = await this.provider.authenticate();
    return this.isAuthenticated;
  }

  async determineWhatToSync() {
    try {
      // Get state to check dirty flags
      const currentState = this.dataService.loadState();
      const metadata = currentState.metadata || {};

      logger.debug(
        "Sync determination metadata:",
        JSON.stringify(metadata, null, 2)
      );

      // Use change detection service to analyze flags and determine sync needs
      const flags =
        this.syncOperationHandler.changeDetectionService.analyzeDirtyFlags(
          metadata
        );
      const syncNeeds =
        this.syncOperationHandler.changeDetectionService.determineSyncNeeds(
          flags,
          null,
          true
        );

      // Log the sync decision
      this.syncOperationHandler.changeDetectionService.logSyncDecision(
        syncNeeds,
        metadata
      );

      return {
        syncCurrent: syncNeeds.syncCurrent,
        syncHistory: syncNeeds.syncHistory,
      };
    } catch (error) {
      logger.error("Error determining what to sync:", error);
      // Default to syncing everything if we can't determine
      return { syncCurrent: true, syncHistory: true };
    }
  }

  /**
   * Clear a specific dirty flag in state metadata
   * @param {string} flagName - Name of the flag to clear
   */
  async clearDirtyFlag(flagName) {
    try {
      // Get current state
      const currentState = this.dataService.loadState();
      const metadata = currentState.metadata || {};

      // Handle the new granular flags
      if (flagName === "currentWeekDirty") {
        // For backward compatibility, clear both specific flags
        metadata.dailyTotalsDirty = false;
        metadata.weeklyTotalsDirty = false;
        metadata.currentWeekDirty = false;
      } else if (
        flagName === "dailyTotalsDirty" ||
        flagName === "weeklyTotalsDirty"
      ) {
        // Clear the specified flag
        metadata[flagName] = false;

        // Update the general flag if both specific flags are false
        if (!metadata.dailyTotalsDirty && !metadata.weeklyTotalsDirty) {
          metadata.currentWeekDirty = false;
        }
      } else {
        // Just clear the specified flag
        metadata[flagName] = false;
      }

      // Clear the fresh install flag if this was a data sync
      if (
        flagName === "currentWeekDirty" ||
        flagName === "dailyTotalsDirty" ||
        flagName === "weeklyTotalsDirty"
      ) {
        metadata.isFreshInstall = false;
      }

      // Save updated state
      currentState.metadata = metadata;
      this.dataService.saveState(currentState);

      logger.info(`Cleared ${flagName} flag`);
    } catch (error) {
      logger.warn(`Failed to clear ${flagName} flag:`, error);
    }
  }

  /**
   * Clear date reset flags after sync
   */
  async clearDateResetFlags() {
    try {
      // Get current state
      const currentState = this.dataService.loadState();
      const metadata = currentState.metadata || {};

      // Clear reset flags
      delete metadata.dateResetPerformed;
      delete metadata.dateResetType;
      delete metadata.dateResetTimestamp;

      // Save updated state
      currentState.metadata = metadata;
      this.dataService.saveState(currentState);

      logger.info("Cleared date reset flags");
    } catch (error) {
      logger.warn("Failed to clear date reset flags:", error);
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
   * Execute a pending archive merge operation
   * @returns {Promise<boolean>} Success status
   * @deprecated Phase 2: Use mergeCoordinator.executePendingArchiveMerge() instead
   */
  async executePendingArchiveMerge() {
    // Phase 2: Delegate to merge coordinator (with fallback for compatibility)
    try {
      return await this.mergeCoordinator.executePendingArchiveMerge();
    } catch (error) {
      logger.warn("Phase 2 merge coordinator failed, using fallback:", error);
      return await this.legacyExecutePendingArchiveMerge();
    }
  }

  /**
   * Legacy archive merge implementation (Phase 2: kept as fallback)
   * @returns {Promise<boolean>} Success status
   */
  async legacyExecutePendingArchiveMerge() {
    if (!this.pendingArchiveMerge) {
      return false;
    }

    const { weekStartDate, remoteWeeklyCounts } = this.pendingArchiveMerge;
    logger.info(`Executing pending archive merge for week ${weekStartDate}`);

    try {
      // Get the archived week data
      const archivedWeek = await this.dataService.getWeekHistory(weekStartDate);

      if (!archivedWeek) {
        logger.warn(`Could not find archived week ${weekStartDate} for merge`);
        this.pendingArchiveMerge = null;
        return false;
      }

      // Merge totals (take maximum value for each food group)
      const mergedTotals = { ...archivedWeek.totals };
      let changed = false;

      Object.entries(remoteWeeklyCounts || {}).forEach(
        ([groupId, remoteCount]) => {
          const localCount = mergedTotals[groupId] || 0;
          if (remoteCount > localCount) {
            mergedTotals[groupId] = remoteCount;
            changed = true;
            logger.info(
              `Updated archive total for ${groupId}: ${localCount} → ${remoteCount}`
            );
          }
        }
      );

      if (!changed) {
        logger.info(`No changes needed for archived week ${weekStartDate}`);
        this.pendingArchiveMerge = null;
        return true;
      }

      // Update the archived week
      archivedWeek.totals = mergedTotals;
      archivedWeek.metadata.updatedAt = this.dataService.getCurrentTimestamp();
      archivedWeek.metadata.mergedAfterReset = true;

      // Save the updated archive
      await this.dataService.saveWeekHistory(archivedWeek);

      logger.info(
        `Successfully merged remote data into archived week ${weekStartDate}`
      );

      // Also update the history in state manager
      const historyData = await this.dataService.getAllWeekHistory();
      if (this.stateManager) {
        this.stateManager.dispatch({
          type: this.stateManager.ACTION_TYPES.SET_HISTORY,
          payload: { history: historyData },
        });
      }

      // Clear the pending task
      this.pendingArchiveMerge = null;
      return true;
    } catch (error) {
      logger.error(
        `Error during archive merge for week ${weekStartDate}:`,
        error
      );
      this.pendingArchiveMerge = null;
      return false;
    }
  }

  getMostRecentDate(date1, date2) {
    // Phase 1: Use extracted utility (keeping original as fallback)
    try {
      return this.timestampUtils.getMostRecentDate(date1, date2);
    } catch (error) {
      logger.warn("Error in utility method, using fallback:", error);
      // Original implementation as fallback
      try {
        const d1 = new Date(date1);
        const d2 = new Date(date2);
        return d1 > d2 ? date1 : date2;
      } catch (e) {
        // If dates are invalid, return the first one
        return date1;
      }
    }
  }

  // Add this to CloudSyncManager
  validateData(data, type = "current") {
    // Phase 1: Use extracted utility (keeping original as fallback)
    try {
      return this.validationUtils.validateSyncData(data, type);
    } catch (error) {
      logger.warn("Error in utility method, using fallback:", error);
      // Original implementation as fallback
      if (!data || typeof data !== "object") {
        logger.error(`Invalid ${type} data:`, data);
        return false;
      }

      if (type === "current") {
        // Must have these fields for current week data
        const requiredFields = [
          "currentDayDate",
          "currentWeekStartDate",
          "dailyCounts",
          "weeklyCounts",
        ];
        const missingFields = requiredFields.filter(
          (field) => !(field in data)
        );

        if (missingFields.length > 0) {
          logger.error(
            `Current week data missing required fields:`,
            missingFields
          );
          return false;
        }

        // Ensure lastModified is present
        if (!data.lastModified) {
          logger.warn(
            "Current week data missing lastModified timestamp, adding one"
          );
          data.lastModified = Date.now() - 10000; // Slightly older than "now"
        }
      }

      return true;
    }
  }

  /**
   * Store sync state in localStorage to persist between sessions
   */
  storeLastSyncedState() {
    try {
      const syncState = {
        lastSyncedWeek: this.lastSyncedWeek,
        lastHistorySyncTimestamp: this.lastHistorySyncTimestamp,
        lastSyncTimestamp: this.lastSyncTimestamp,
      };
      localStorage.setItem("cloudSyncState", JSON.stringify(syncState));
      logger.info("Stored sync state:", syncState);
    } catch (error) {
      logger.warn("Failed to store sync state:", error);
    }
  }

  /**
   * Load sync state from localStorage
   */
  loadSyncState() {
    try {
      const storedState = localStorage.getItem("cloudSyncState");
      if (storedState) {
        const syncState = JSON.parse(storedState);
        this.lastSyncedWeek = syncState.lastSyncedWeek;
        this.lastHistorySyncTimestamp = syncState.lastHistorySyncTimestamp;
        this.lastSyncTimestamp = syncState.lastSyncTimestamp;
        logger.info("Loaded sync state:", syncState);
      }
    } catch (error) {
      logger.warn("Failed to load sync state:", error);
    }
  }

  // Add this to the CloudSyncManager class in cloudSync.js
  async debugSyncState() {
    try {
      // Get local data
      const currentState = this.dataService.loadState();

      // Check metadata and dirty flags
      const metadata = currentState.metadata || {};

      logger.info("=== Sync Debug Info ===");
      logger.info("Current State:", {
        currentDayDate: currentState.currentDayDate,
        currentWeekStartDate: currentState.currentWeekStartDate,
        lastModified: currentState.lastModified,
        hasMetadata: !!currentState.metadata,
        dailyCountsSize: Object.keys(currentState.dailyCounts || {}).length,
        weeklyCountsSize: Object.keys(currentState.weeklyCounts || {}).length,
      });

      logger.info("Metadata:", {
        ...metadata,
        exists: !!metadata,
      });

      // Check data validity
      const isValid = this.validateData(currentState, "current");
      logger.info("Data validity:", isValid);

      return {
        hasData: Object.keys(currentState.weeklyCounts || {}).length > 0,
        hasMetadata: !!currentState.metadata,
        dirtyFlags: {
          currentWeekDirty: metadata.currentWeekDirty || false,
          historyDirty: metadata.historyDirty || false,
        },
        isValid,
      };
    } catch (error) {
      logger.error("Error in sync debug:", error);
      return { error: error.message };
    }
  }
}

export default CloudSyncManager;
