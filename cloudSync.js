/*
 * MIND Diet Tracker PWA
 * Copyright (C) 2025 Nathan A. Eaton Jr.
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

import GoogleDriveProvider from "./cloudProviders/googleDriveProvider.js";
import DropboxProvider from "./cloudProviders/dropboxProvider.js";
import logger from "./logger.js";

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
  }

  async initialize(providerName = "gdrive") {
    if (providerName === "gdrive") {
      this.provider = new GoogleDriveProvider();
    } else if (providerName === "dropbox") {
      this.provider = new DropboxProvider();
    } else {
      throw new Error(`Unsupported cloud provider: ${providerName}`);
    }

    // Load sync state before initializing provider
    this.loadSyncState();

    // Initialize the provider and check if it was successful
    const initResult = await this.provider.initialize();
    if (!initResult) {
      logger.warn(
        `Provider ${providerName} initialization failed, likely due to missing config`
      );
      return false;
    }

    this.isAuthenticated = await this.provider.checkAuth();
    return this.isAuthenticated;
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

      // Check dirty flags - use both specific flags and the legacy flag
      const dailyTotalsDirty = metadata.dailyTotalsDirty || false;
      const weeklyTotalsDirty = metadata.weeklyTotalsDirty || false;
      const currentWeekDirty =
        metadata.currentWeekDirty || dailyTotalsDirty || weeklyTotalsDirty;

      const historyDirty = metadata.historyDirty || false;

      // Check if reset was performed
      const dateResetPerformed = metadata.dateResetPerformed || false;
      const dateResetType = metadata.dateResetType || null;

      // Always check for cloud changes regardless of dirty flags
      const alwaysCheckCloudChanges = true;

      // Sync current week if:
      // 1. Any count is dirty
      // 2. Date reset occurred
      // 3. We're checking for cloud changes
      const syncCurrent =
        currentWeekDirty || dateResetPerformed || alwaysCheckCloudChanges;

      // Sync history if:
      // 1. It's dirty
      // 2. Weekly reset occurred
      // 3. We're checking for cloud changes
      const syncHistory =
        historyDirty ||
        (dateResetPerformed && dateResetType === "WEEKLY") ||
        alwaysCheckCloudChanges;

      logger.info("Sync determination:", {
        syncCurrent,
        syncHistory,
        dailyTotalsDirty,
        weeklyTotalsDirty,
        currentWeekDirty,
        historyDirty,
        dateResetPerformed,
        dateResetType,
        alwaysCheckCloudChanges,
        metadata,
      });

      return { syncCurrent, syncHistory };
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
      const error = new Error("Network constraints prevented sync");
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

        try {
          await this.authenticate();
          if (!this.isAuthenticated) {
            if (this.uiRenderer) {
              this.uiRenderer.clearToasts();
              this.uiRenderer.showToast(
                "Authentication required for sync",
                "warning",
                {
                  duration: 5000,
                }
              );
            }
            const error = new Error("Authentication required");
            error.code = "AUTH_REQUIRED";
            throw error;
          }
          // Clear auth toast on success - will be replaced by sync toast if needed
          if (this.uiRenderer) {
            this.uiRenderer.clearToasts();
          }
        } catch (authError) {
          logger.error("Authentication failed:", authError);
          if (this.uiRenderer) {
            this.uiRenderer.clearToasts();
            this.uiRenderer.showToast(
              `Authentication error: ${authError.message}`,
              "error",
              {
                duration: 5000,
              }
            );
          }
          const error = new Error(
            `Authentication failed: ${authError.message}`
          );
          error.code = "AUTH_FAILED";
          error.originalError = authError;
          throw error;
        }
      }

      // Always determine what needs to be synced
      const { syncCurrent, syncHistory } = await this.determineWhatToSync();

      // Check if we actually have work to do before showing any toast
      const localData = this.dataService.loadState();
      const hasLocalChanges =
        localData.metadata?.currentWeekDirty ||
        localData.metadata?.historyDirty ||
        localData.metadata?.dailyTotalsDirty ||
        localData.metadata?.weeklyTotalsDirty;

      let syncResults = { currentWeekSynced: false, historySynced: false };
      let workWasDone = false;

      // Show toast if:
      // 1. Not silent (manual sync) - always show toast
      // 2. Silent (auto sync) but we have local changes that need syncing
      const shouldShowToast = !silent || hasLocalChanges;

      if (shouldShowToast && this.uiRenderer) {
        this.uiRenderer.showToast("Synchronizing data with cloud...", "info", {
          isPersistent: true,
          showSpinner: true,
        });
      }

      // Now proceed with actual sync
      try {
        // 1. Sync current week data if needed
        if (syncCurrent) {
          try {
            const currentWeekResult = (await this.syncCurrentWeek()) || {};
            syncResults.currentWeekSynced = !currentWeekResult.noChanges;

            // Track if actual work was done (uploaded or downloaded)
            if (currentWeekResult.uploaded || currentWeekResult.downloaded) {
              workWasDone = true;
            }

            // Clear the current week dirty flags
            await this.clearDirtyFlag("currentWeekDirty");

            // Clear date reset flags if they were set
            await this.clearDateResetFlags();
          } catch (weekError) {
            logger.error("Error syncing current week:", weekError);
            syncResults.currentWeekError = weekError.message;
          }
        }

        // 2. Sync history data if needed
        if (syncHistory) {
          try {
            const historyResult = (await this.syncHistory()) || {};
            syncResults.historySynced =
              historyResult && historyResult.syncedCount > 0;

            // Track if actual work was done
            if (syncResults.historySynced) {
              workWasDone = true;
            }

            // Clear the history dirty flag
            await this.clearDirtyFlag("historyDirty");
          } catch (historyError) {
            logger.error("Error syncing history:", historyError);
            syncResults.historyError = historyError.message;
          }
        }

        // 3. Execute any pending archive merges after the main sync operations
        if (this.pendingArchiveMerge) {
          logger.info("Executing pending archive merge after sync");
          try {
            await this.executePendingArchiveMerge();
          } catch (archiveError) {
            logger.warn(
              "Error executing archive merge, but continuing sync:",
              archiveError
            );
            // Don't let archive merge failure fail the entire sync
          }
        }

        this.lastSyncTimestamp = this.dataService.getCurrentTimestamp();

        // Show completion toast if work was done OR if this was a manual sync
        if ((workWasDone || !silent) && this.uiRenderer) {
          this.uiRenderer.clearToasts(); // Clear the persistent "Synchronizing..." toast
          this.uiRenderer.showToast(
            "Data synchronized successfully!",
            "success",
            {
              duration: 2000,
            }
          );
        } else if (this.uiRenderer) {
          // Clear the sync toast even if no work was done (for cases where toast was shown)
          this.uiRenderer.clearToasts();
        }

        this.onSyncComplete({
          timestamp: this.lastSyncTimestamp,
          ...syncResults,
        });

        return syncResults;
      } catch (syncError) {
        logger.error("Sync operation failed:", syncError);
        const error = new Error(`Sync failed: ${syncError.message}`);
        error.code = "SYNC_OPERATION_FAILED";
        error.originalError = syncError;
        throw error;
      }
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
   * Sync current week data with improved empty response handling
   * @returns {Promise<Object>} Result information
   */
  async syncCurrentWeek() {
    try {
      // Define the filename for current week data
      const currentWeekFileName = "mind-diet-current-week.json";

      // First, check if we have actual data to sync
      const localData = this.dataService.loadState();
      const hasLocalChanges =
        localData.metadata?.currentWeekDirty ||
        localData.metadata?.dailyTotalsDirty ||
        localData.metadata?.weeklyTotalsDirty ||
        false;
      const isFreshInstall = localData.metadata?.isFreshInstall || false;

      // Check if file exists in cloud first without creating it
      let fileInfo;
      let cloudFileExists = false;
      try {
        const searchResult = await this.provider.searchFile(
          currentWeekFileName
        );
        if (searchResult) {
          fileInfo = searchResult;
          cloudFileExists = true;
          logger.info("Found existing current week file:", fileInfo);
        }
      } catch (searchError) {
        logger.warn("Error searching for cloud file:", searchError);
      }

      // Only create file if:
      // 1. We have local changes to sync, or
      // 2. We couldn't find an existing file and need to establish sync
      if (!cloudFileExists && (hasLocalChanges || !isFreshInstall)) {
        try {
          fileInfo = await this.provider.findOrCreateFile(currentWeekFileName);
          logger.info("Created new current week file:", fileInfo);
        } catch (fileError) {
          logger.error("Error creating cloud file:", fileError);
          throw new Error(`Failed to create cloud file: ${fileError.message}`);
        }
      }

      // If we still don't have file info, we can't proceed
      if (!fileInfo || !fileInfo.id) {
        logger.info("No cloud file exists or needs to be created yet");
        return {
          noChanges: true,
          uploaded: false,
          downloaded: false,
        };
      }

      // Check if file has changed in cloud
      let hasFileChanged = true;

      // Download remote data when:
      // 1. We have local changes to merge, or
      // 2. Cloud file exists and has changed since last sync
      let remoteData = null;
      if (hasLocalChanges || (cloudFileExists && hasFileChanged)) {
        try {
          logger.info("Downloading remote data...");
          remoteData = await this.provider.downloadFile(fileInfo.id);

          // Important: handle the case where download returns empty data
          if (
            remoteData === null ||
            (typeof remoteData === "object" &&
              Object.keys(remoteData).length === 0)
          ) {
            logger.info(
              "Remote file exists but contains no data or empty object"
            );
            remoteData = null;
          } else {
            cloudFileExists = true;
            logger.info("Remote data downloaded successfully");
          }
        } catch (downloadError) {
          logger.warn("Error downloading remote data:", downloadError);
          // Continue with local data
        }
      }

      // Check if there's any local data to sync
      const hasDataToSync =
        Object.keys(localData.dailyCounts || {}).length > 0 ||
        Object.keys(localData.weeklyCounts || {}).length > 0;

      logger.info("Has data to sync:", hasDataToSync);

      // If remote data exists and is valid, merge with local
      let dataToUpload = localData;

      if (remoteData && this.validateData(remoteData, "current")) {
        logger.info("Remote data found, merging with local data");
        dataToUpload = this.mergeCurrentWeekData(localData, remoteData);

        // Update local store with merged data
        logger.info("Updating local store with merged data");
        this.dataService.saveState(dataToUpload);

        // Update state manager with merged data to ensure consistency
        logger.info("Reloading state manager after cloud sync merge");
        if (
          this.stateManager &&
          typeof this.stateManager.reload === "function"
        ) {
          // Skip automatic recalculation in reload - we'll do it manually for proper sequencing
          await this.stateManager.reload(true);

          // Ensure weekly totals are consistent after cloud sync merge

          if (typeof this.stateManager.recalculateWeeklyTotals === "function") {
            this.stateManager.recalculateWeeklyTotals();
            logger.info("Recalculated weekly totals after cloud sync merge");
          }
        }

        // Store file metadata after download
        await this.storeFileMetadata(currentWeekFileName, fileInfo);
      } else {
        logger.info("No valid remote data available");

        // IMPORTANT CHANGE: Only force dirty flag if this is not a fresh install
        // or if we're certain the cloud file doesn't exist
        if (hasDataToSync && (!isFreshInstall || !cloudFileExists)) {
          if (!dataToUpload.metadata) dataToUpload.metadata = {};

          // If it's a fresh install, only set dirty if we're certain the cloud file doesn't exist
          if (isFreshInstall) {
            if (!cloudFileExists) {
              dataToUpload.metadata.currentWeekDirty = true;
              dataToUpload.metadata.dailyTotalsDirty = true;
              dataToUpload.metadata.weeklyTotalsDirty = true;
              logger.info(
                "Forcing dirty flag - fresh install with no cloud data"
              );
            } else {
              logger.info(
                "Fresh install with possible cloud data - not forcing dirty flag"
              );
            }
          } else {
            dataToUpload.metadata.currentWeekDirty = true;
            dataToUpload.metadata.dailyTotalsDirty = true;
            dataToUpload.metadata.weeklyTotalsDirty = true;
            logger.info(
              "Forcing dirty flag for data upload - not fresh install"
            );
          }
        }
      }

      // Determine whether to upload
      const needsUpload =
        hasLocalChanges ||
        dataToUpload.metadata?.currentWeekDirty ||
        dataToUpload.metadata?.dailyTotalsDirty ||
        dataToUpload.metadata?.weeklyTotalsDirty;

      // For fresh installs, we should be more cautious about uploading
      const shouldSkipUploadForFreshInstall =
        isFreshInstall && cloudFileExists && cloudFileExists;

      if (shouldSkipUploadForFreshInstall) {
        logger.info("Fresh install with existing cloud data - skipping upload");
        return { downloaded: true, uploaded: false, freshInstallSkipped: true };
      }

      if (needsUpload) {
        try {
          logger.info("Uploading data to cloud");
          const uploadResult = await this.provider.uploadFile(
            fileInfo.id,
            dataToUpload
          );
          logger.info("Successfully uploaded data to server");

          // Store file metadata after upload
          await this.storeFileMetadata(currentWeekFileName, uploadResult);

          // Clear dirty flag after successful upload
          if (dataToUpload.metadata) {
            dataToUpload.metadata.currentWeekDirty = false;
            dataToUpload.metadata.dailyTotalsDirty = false;
            dataToUpload.metadata.weeklyTotalsDirty = false;
            this.dataService.saveState(dataToUpload);
          }

          return { downloaded: !!remoteData, uploaded: true };
        } catch (uploadError) {
          logger.error("Error uploading to cloud:", uploadError);
          return {
            error: uploadError.message,
            downloaded: !!remoteData,
            uploaded: false,
          };
        }
      } else {
        logger.info("No data changes detected, skipping upload");
        return { downloaded: !!remoteData, uploaded: false };
      }
    } catch (error) {
      logger.error("Error in current week sync:", error);
      return { error: error.message, uploaded: false, downloaded: false };
    }
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

    // Special weekly reset handling
    if (weeklyResetPerformed) {
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
      if (
        remoteIsFromPreviousWeek &&
        localData.metadata?.previousWeekStartDate
      ) {
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

    // ----- Weekly Counts Merge Logic -----
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

  // Add these methods to the CloudSyncManager class in cloudSync.js

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
   */
  async executePendingArchiveMerge() {
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
    try {
      const d1 = new Date(date1);
      const d2 = new Date(date2);
      return d1 > d2 ? date1 : date2;
    } catch (e) {
      // If dates are invalid, return the first one
      return date1;
    }
  }

  async checkIfHistorySyncNeeded() {
    // Always log the current decision factors for debugging
    const currentState = this.dataService.loadState();
    const currentWeekStart = currentState.currentWeekStartDate;

    logger.info("Checking if history sync needed:", {
      currentWeekStart,
      lastSyncedWeek: this.lastSyncedWeek,
      lastHistorySyncTimestamp: this.lastHistorySyncTimestamp || "never",
      historyLength: (await this.dataService.getAllWeekHistory()).length,
    });

    // If we don't have a record of the last synced week, sync is needed
    if (!this.lastSyncedWeek) {
      logger.info("No record of last synced week, sync needed");
      this.lastSyncedWeek = currentWeekStart;
      return true;
    }

    // If the current week has changed since last sync, sync history
    if (this.lastSyncedWeek !== currentWeekStart) {
      logger.info(
        `Week transition detected: ${this.lastSyncedWeek} -> ${currentWeekStart}, sync needed`
      );
      this.lastSyncedWeek = currentWeekStart;
      return true;
    }

    // Check if local history data has been updated since last sync
    if (currentState.metadata && currentState.metadata.historyUpdated) {
      logger.info("History updated flag detected, sync needed");
      // Clear the flag after detecting it
      delete currentState.metadata.historyUpdated;
      this.dataService.saveState(currentState);
      return true;
    }

    // Otherwise, check if the history file has been modified
    const historyFileName = "mind-diet-history.json";
    try {
      const fileInfo = await this.provider.findOrCreateFile(historyFileName);
      // If we have a record of when we last synced history
      if (this.lastHistorySyncTimestamp) {
        const fileModifiedTime = new Date(fileInfo.modifiedTime).getTime();
        // If file has been modified since our last sync, we need to sync again
        const needsSync = fileModifiedTime > this.lastHistorySyncTimestamp;
        logger.info(
          `Cloud file modified: ${new Date(
            fileModifiedTime
          ).toISOString()}, Last sync: ${new Date(
            this.lastHistorySyncTimestamp
          ).toISOString()}, Needs sync: ${needsSync}`
        );
        return needsSync;
      }
    } catch (error) {
      logger.warn("Error checking history file:", error);
    }

    // Default to needing sync if we can't determine
    return true;
  }

  async syncHistoryIndex() {
    try {
      const historyIndexFileName = "mind-diet-history-index.json";

      // Find or create the index file
      const fileInfo = await this.provider.findOrCreateFile(
        historyIndexFileName
      );

      // Get local history data for use in potential syncing
      const localHistory = await this.dataService.getAllWeekHistory();
      const historyDirty =
        (await this.dataService.loadState()).metadata?.historyDirty || false;

      // Check if index file has changed in the cloud
      const hasFileChanged = await this.checkIfFileChanged(
        historyIndexFileName,
        fileInfo.id
      );

      // If file hasn't changed and no local changes, skip the entire process
      if (!hasFileChanged && !historyDirty && localHistory.length > 0) {
        logger.info(
          "History index hasn't changed and no local changes, skipping sync entirely"
        );
        // Update last check time in metadata
        await this.storeFileMetadata(historyIndexFileName, fileInfo);
        return [];
      }

      // Create local index
      const localIndex = {
        lastUpdated: Date.now(),
        weeks: localHistory.map((week) => ({
          weekStartDate: week.weekStartDate,
          updatedAt: week.metadata?.updatedAt || 0,
        })),
      };

      // If we have local changes but no remote changes, just upload without downloading
      if (!hasFileChanged && historyDirty) {
        logger.info(
          "Local history changes detected but no cloud changes - uploading without merging"
        );
        const uploadResult = await this.provider.uploadFile(
          fileInfo.id,
          localIndex
        );
        await this.storeFileMetadata(historyIndexFileName, uploadResult);

        // Return week data that needs uploading (all local weeks)
        return localHistory.map((week) => ({
          weekStartDate: week.weekStartDate,
          direction: "upload",
        }));
      }

      // If we reach here, we need to download and potentially merge
      logger.info("Downloading remote index...");
      const remoteIndex = await this.provider.downloadFile(fileInfo.id);

      // Store metadata after successful download
      await this.storeFileMetadata(historyIndexFileName, fileInfo);

      let indexToUpload = localIndex;
      let weeksToSync = [];

      // If remote index exists, merge and determine which weeks need syncing
      if (
        remoteIndex &&
        remoteIndex.weeks &&
        Array.isArray(remoteIndex.weeks)
      ) {
        logger.info("Remote index found, comparing with local history");

        // Create a map of weeks by start date for easier lookup
        const localWeekMap = new Map();
        localIndex.weeks.forEach((week) => {
          localWeekMap.set(week.weekStartDate, week);
        });

        const remoteWeekMap = new Map();
        remoteIndex.weeks.forEach((week) => {
          remoteWeekMap.set(week.weekStartDate, week);
        });

        // Find weeks that need downloading (remote exists but local doesn't, or remote is newer)
        for (const [weekStart, remoteWeek] of remoteWeekMap.entries()) {
          const localWeek = localWeekMap.get(weekStart);
          if (!localWeek) {
            // Week exists in remote but not local - mark for download
            logger.info(
              `Week ${weekStart} exists in cloud but not locally - adding to download queue`
            );
            weeksToSync.push({
              weekStartDate: weekStart,
              direction: "download",
            });
          } else if (remoteWeek.updatedAt > localWeek.updatedAt) {
            // Remote is newer than local - mark for download
            logger.info(
              `Remote week ${weekStart} is newer (${remoteWeek.updatedAt} > ${localWeek.updatedAt}) - adding to download queue`
            );
            weeksToSync.push({
              weekStartDate: weekStart,
              direction: "download",
            });
          }
        }

        // Find weeks that need uploading (local exists but remote doesn't, or local is newer)
        for (const [weekStart, localWeek] of localWeekMap.entries()) {
          const remoteWeek = remoteWeekMap.get(weekStart);
          if (!remoteWeek) {
            // Week exists in local but not remote - mark for upload
            logger.info(
              `Week ${weekStart} exists locally but not in cloud - adding to upload queue`
            );
            weeksToSync.push({
              weekStartDate: weekStart,
              direction: "upload",
            });
          } else if (localWeek.updatedAt > remoteWeek.updatedAt) {
            // Local is newer than remote - mark for upload
            logger.info(
              `Local week ${weekStart} is newer (${localWeek.updatedAt} > ${remoteWeek.updatedAt}) - adding to upload queue`
            );
            weeksToSync.push({
              weekStartDate: weekStart,
              direction: "upload",
            });
          }
        }

        // Merge the index data
        const mergedWeeks = [];

        // Include all weeks from both sources, using the more up-to-date information
        const allWeekStarts = new Set([
          ...localIndex.weeks.map((w) => w.weekStartDate),
          ...remoteIndex.weeks.map((w) => w.weekStartDate),
        ]);

        allWeekStarts.forEach((weekStart) => {
          const localWeek = localWeekMap.get(weekStart);
          const remoteWeek = remoteWeekMap.get(weekStart);

          if (localWeek && remoteWeek) {
            // Both exist, use the newer one
            mergedWeeks.push(
              localWeek.updatedAt >= remoteWeek.updatedAt
                ? localWeek
                : remoteWeek
            );
          } else {
            // Only one exists
            mergedWeeks.push(localWeek || remoteWeek);
          }
        });

        // Create the merged index
        indexToUpload = {
          lastUpdated: Date.now(),
          weeks: mergedWeeks,
        };
      } else {
        logger.info(
          "No remote index found or it's invalid - will create new index"
        );
        // Since we're creating a new index, mark all local weeks for upload
        localIndex.weeks.forEach((week) => {
          weeksToSync.push({
            weekStartDate: week.weekStartDate,
            direction: "upload",
          });
        });
      }

      // Only upload if there are weeks to sync or we have changes
      if (weeksToSync.length > 0 || historyDirty) {
        // Upload the index
        const uploadResult = await this.provider.uploadFile(
          fileInfo.id,
          indexToUpload
        );
        logger.info("History index synced successfully");

        // Store metadata after successful operation
        await this.storeFileMetadata(historyIndexFileName, uploadResult);
      } else {
        logger.info("No history changes detected, skipping index upload");
      }

      // Return the list of weeks that need syncing
      return weeksToSync;
    } catch (error) {
      logger.error("Error in history index sync:", error);
      throw error;
    }
  }

  async syncWeek(weekStartDate, direction) {
    logger.info(`=== Syncing week ${weekStartDate} (${direction}) ===`);

    try {
      const weekFileName = `mind-diet-week-${weekStartDate}.json`;

      // Find or create the week file
      const fileInfo = await this.provider.findOrCreateFile(weekFileName);

      let syncSuccessful = false;

      if (direction === "upload") {
        // Get the local week data
        const localWeek = await this.dataService.getWeekHistory(weekStartDate);

        if (!localWeek) {
          logger.warn(`Local week ${weekStartDate} not found for upload`);
          return false;
        }

        // Check if file has changed before uploading
        const hasFileChanged = await this.checkIfFileChanged(
          weekFileName,
          fileInfo.id
        );

        // If uploading and remote file exists but hasn't changed,
        // compare timestamps to determine if upload is needed
        if (!hasFileChanged) {
          const storedMetadata = await this.getStoredFileMetadata(weekFileName);
          // Modified condition to ensure newly archived weeks are uploaded
          if (
            storedMetadata &&
            localWeek.metadata &&
            storedMetadata.lastModified >= localWeek.metadata.updatedAt &&
            !this.dataService.loadState().metadata.historyDirty // Add this check
          ) {
            logger.info(
              `Week ${weekStartDate} has no changes, skipping upload`
            );
            return true;
          }
        }

        // Upload to cloud
        const uploadResult = await this.provider.uploadFile(
          fileInfo.id,
          localWeek
        );
        logger.debug(`Week ${weekStartDate} uploaded successfully`);

        // Store metadata after upload - IMPORTANT: skip verification download
        await this.storeFileMetadata(weekFileName, uploadResult || fileInfo);

        syncSuccessful = true;
      } else {
        // download
        // Check if local week already exists with same or newer timestamp
        const localWeek = await this.dataService.getWeekHistory(weekStartDate);
        if (localWeek) {
          // Check if we should skip download
          const hasFileChanged = await this.checkIfFileChanged(
            weekFileName,
            fileInfo.id
          );
          if (!hasFileChanged) {
            logger.info(
              `Week ${weekStartDate} has no changes, skipping download`
            );
            return true;
          }
        }

        // Download the remote week data
        const remoteWeek = await this.provider.downloadFile(fileInfo.id);

        if (!remoteWeek || !remoteWeek.weekStartDate) {
          logger.warn(`Remote week ${weekStartDate} not found or invalid`);
          return false;
        }

        // Save to local database
        await this.dataService.saveWeekHistory(remoteWeek, {
          syncStatus: "synced",
        });
        logger.info(`Week ${weekStartDate} downloaded successfully`);

        // Store metadata after download
        await this.storeFileMetadata(weekFileName, fileInfo);

        // Update local state if history data changed
        const historyData = await this.dataService.getAllWeekHistory();
        if (this.stateManager) {
          this.stateManager.dispatch({
            type: this.stateManager.ACTION_TYPES.SET_HISTORY,
            payload: { history: historyData },
          });
        }

        syncSuccessful = true;
      }

      // If sync was successful, update the index file too
      if (syncSuccessful) {
        try {
          // Get the index file
          const indexFileName = "mind-diet-history-index.json";
          const indexFileInfo = await this.provider.findOrCreateFile(
            indexFileName
          );

          // Check if index has changed before updating it
          const hasIndexChanged = await this.checkIfFileChanged(
            indexFileName,
            indexFileInfo.id
          );

          // Download current index if needed
          let indexData;
          if (hasIndexChanged) {
            indexData = await this.provider.downloadFile(indexFileInfo.id);
          } else {
            // Use cached index data if possible
            const storedMetadata = await this.getStoredFileMetadata(
              indexFileName
            );
            if (storedMetadata && storedMetadata.indexData) {
              indexData = storedMetadata.indexData;
            } else {
              indexData = await this.provider.downloadFile(indexFileInfo.id);
            }
          }

          // If no valid index exists, create a new one
          if (
            !indexData ||
            !indexData.weeks ||
            !Array.isArray(indexData.weeks)
          ) {
            indexData = {
              lastUpdated: Date.now(),
              weeks: [],
            };
          }

          // Get the week we just synced
          const syncedWeek = await this.dataService.getWeekHistory(
            weekStartDate
          );

          if (syncedWeek) {
            // Find if this week is already in the index
            const weekIndex = indexData.weeks.findIndex(
              (w) => w.weekStartDate === weekStartDate
            );

            const weekEntry = {
              weekStartDate: weekStartDate,
              updatedAt:
                syncedWeek.metadata?.updatedAt ||
                this.dataService.getCurrentTimestamp(),
            };

            if (weekIndex >= 0) {
              // Update existing entry
              indexData.weeks[weekIndex] = weekEntry;
            } else {
              // Add new entry
              indexData.weeks.push(weekEntry);
            }

            // Update the index file
            const uploadResult = await this.provider.uploadFile(
              indexFileInfo.id,
              indexData
            );

            // Store metadata after index update
            const metadataToStore = {
              ...(uploadResult || indexFileInfo),
              indexData: indexData, // Cache the index data
            };
            await this.storeFileMetadata(indexFileName, metadataToStore);

            logger.debug(`Updated history index for week ${weekStartDate}`);
          }
        } catch (indexError) {
          logger.warn(
            `Error updating index after week sync: ${indexError.message}`
          );
          // Don't fail the sync if index update fails
        }
      }

      return syncSuccessful;
    } catch (error) {
      logger.error(`Error syncing week ${weekStartDate}:`, error);
      return false;
    }
  }

  async syncHistory() {
    try {
      // First sync the index to determine which weeks need syncing
      const weeksToSync = await this.syncHistoryIndex();

      logger.info(`Found ${weeksToSync.length} weeks that need syncing`);

      if (weeksToSync.length === 0) {
        logger.info("No history weeks need syncing");
        return true;
      }

      // Sync each week
      let syncSuccessCount = 0;

      for (const weekInfo of weeksToSync) {
        const success = await this.syncWeek(
          weekInfo.weekStartDate,
          weekInfo.direction
        );

        if (success) {
          syncSuccessCount++;
        }
      }

      logger.info(
        `Synced ${syncSuccessCount} out of ${weeksToSync.length} weeks`
      );

      // Update the last sync timestamp
      this.lastHistorySyncTimestamp = this.dataService.getCurrentTimestamp();
      this.storeLastSyncedState();

      // Clear the history dirty flag after successful sync
      await this.clearDirtyFlag("historyDirty");

      return {
        success: true,
        syncedCount: syncSuccessCount,
      };
    } catch (error) {
      logger.error("Error in history sync:", error);
      throw error;
    }
  }

  mergeHistoryData(localHistory, remoteHistory) {
    logger.info("Starting history merge process");
    logger.info(`Local history: ${localHistory.length} items`);
    logger.info(`Remote history: ${remoteHistory.length} items`);

    // Validate both arrays and create safe copies
    if (!Array.isArray(localHistory)) {
      logger.warn("Local history is not an array, using empty array");
      localHistory = [];
    }
    if (!Array.isArray(remoteHistory)) {
      logger.warn("Remote history is not an array, using empty array");
      remoteHistory = [];
    }

    // Create a map of weeks by start date for easy lookup
    const weekMap = new Map();

    // Process all local history first - ensure structure is valid
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

      // Ensure totals exists
      if (!week.totals) {
        logger.warn(
          `Local week ${week.weekStartDate} missing totals, adding empty object`
        );
        week.totals = {};
      }

      // Ensure metadata exists
      if (!week.metadata) {
        week.metadata = { updatedAt: this.dataService.getCurrentTimestamp() };
      } else if (!week.metadata.updatedAt) {
        week.metadata.updatedAt = this.dataService.getCurrentTimestamp();
      }

      weekMap.set(week.weekStartDate, {
        source: "local",
        data: week,
        updatedAt: week.metadata.updatedAt || 0,
      });
    });

    // Track if anything changed
    let changed = false;

    // Process remote history, overwriting local only if newer
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

      // Ensure totals exists
      if (!week.totals) {
        logger.warn(
          `Remote week ${week.weekStartDate} missing totals, adding empty object`
        );
        week.totals = {};
      }

      // Ensure metadata exists
      if (!week.metadata) {
        week.metadata = { updatedAt: this.dataService.getCurrentTimestamp() };
      } else if (!week.metadata.updatedAt) {
        week.metadata.updatedAt = this.dataService.getCurrentTimestamp();
      }

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

    // Convert map back to array and sort by date (newest first)
    const mergedData = Array.from(weekMap.values())
      .map((item) => item.data)
      .sort((a, b) => {
        return new Date(b.weekStartDate) - new Date(a.weekStartDate);
      });

    logger.info(
      `Merge complete. Result has ${mergedData.length} weeks, changed: ${changed}`
    );

    // Do a final validation to ensure all weeks have the required structure
    const validatedData = mergedData.filter((week) => {
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

  startAutoSync(intervalMinutes = 15) {
    // Stop any existing auto-sync
    this.stopAutoSync();

    // Convert minutes to milliseconds
    const interval = intervalMinutes * 60 * 1000;

    // Start a new auto-sync timer
    this.autoSyncTimer = setInterval(() => {
      if (navigator.onLine) {
        this.sync().catch((error) => {
          logger.warn("Auto-sync failed:", error);
        });
      }
    }, interval);

    logger.info(`Auto-sync started, interval: ${intervalMinutes} minutes`);
  }

  stopAutoSync() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
      logger.info("Auto-sync stopped");
    }
  }

  checkNetworkConstraints() {
    // Check if online
    if (!navigator.onLine) {
      return false;
    }

    // Check Wi-Fi only constraint if applicable
    const syncWifiOnly = this.syncWifiOnly || false;

    if (syncWifiOnly) {
      // Try to detect connection type
      if ("connection" in navigator) {
        const connection = navigator.connection;
        if (connection && connection.type) {
          // Only proceed if on wifi
          return connection.type === "wifi";
        }
      }
    }

    // If no constraints or can't detect, allow sync
    return true;
  }

  // Add this to CloudSyncManager
  validateData(data, type = "current") {
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
      const missingFields = requiredFields.filter((field) => !(field in data));

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

  /**
   * Check if a cloud file has changed by comparing revision/ETag
   * @param {string} fileName - The file name to check
   * @param {string} fileId - The file ID in the cloud
   * @returns {Promise<boolean>} True if file has changed, false if unchanged
   */
  async checkIfFileChanged(fileName, fileId) {
    try {
      // Skip check if no provider or not authenticated
      if (!this.provider || !this.isAuthenticated) {
        return true; // Assume changed if we can't check
      }

      // Get file info from the cloud
      const fileInfo = await this.provider.getFileMetadata(fileId);

      // If file doesn't exist or we couldn't get metadata, assume changed
      if (!fileInfo) {
        logger.info(`File ${fileName} not found or metadata unavailable`);
        return true;
      }

      // Get locally stored metadata
      const storedMetadata = await this.getStoredFileMetadata(fileName);

      if (!storedMetadata) {
        // No stored metadata, assume file has changed
        logger.info(`No stored metadata for ${fileName}, assuming changed`);
        return true;
      }

      let hasChanged = false;
      let revisionInfo = "";

      // Check based on provider type
      if (this.provider.constructor.name.includes("Dropbox")) {
        // Dropbox uses rev property
        hasChanged = fileInfo.rev !== storedMetadata.rev;
        revisionInfo = `rev ${fileInfo.rev} vs stored ${storedMetadata.rev}`;
      } else {
        // Google Drive - try different ways to detect changes in priority order
        if (fileInfo.headRevisionId && storedMetadata.headRevisionId) {
          // Best - compare head revision IDs
          hasChanged =
            fileInfo.headRevisionId !== storedMetadata.headRevisionId;
          revisionInfo = `headRevisionId ${fileInfo.headRevisionId} vs stored ${storedMetadata.headRevisionId}`;
        } else if (fileInfo.version && storedMetadata.version) {
          // Next best - compare version numbers
          hasChanged = fileInfo.version !== storedMetadata.version;
          revisionInfo = `version ${fileInfo.version} vs stored ${storedMetadata.version}`;
        } else if (fileInfo.md5Checksum && storedMetadata.md5Checksum) {
          // Fallback - compare content checksums
          hasChanged = fileInfo.md5Checksum !== storedMetadata.md5Checksum;
          revisionInfo = `md5Checksum ${fileInfo.md5Checksum} vs stored ${storedMetadata.md5Checksum}`;
        } else {
          // If no reliable indicators, assume changed
          hasChanged = true;
          revisionInfo = "no reliable revision indicators available";
        }
      }

      logger.debug(`File ${fileName}: ${revisionInfo}, changed: ${hasChanged}`);
      return hasChanged;
    } catch (error) {
      logger.warn(`Error checking if file ${fileName} changed:`, error);
      // If error occurs, assume file has changed to be safe
      return true;
    }
  }

  /**
   * Store file metadata after sync
   * @param {string} fileName - The file name used as key
   * @param {Object} fileInfo - The file info returned from provider
   * @returns {Promise<void>}
   */
  async storeFileMetadata(fileName, fileInfo) {
    try {
      if (!fileInfo) return;

      // Log the full fileInfo to debug
      logger.info(`Full fileInfo for ${fileName}:`, fileInfo);

      const metadata = {
        fileName,
        lastChecked: Date.now(),
      };

      // Store provider-specific revision info
      if (this.provider.constructor.name.includes("Dropbox")) {
        // Dropbox uses rev
        const rev =
          fileInfo.rev ||
          fileInfo.result?.rev ||
          (fileInfo[".tag"] === "file" && fileInfo.rev);

        metadata.rev = rev;
        logger.info(`Storing Dropbox rev for ${fileName}: ${metadata.rev}`);
      } else {
        // For Google Drive - store all available revision indicators
        metadata.headRevisionId =
          fileInfo.headRevisionId || fileInfo.result?.headRevisionId;
        metadata.version = fileInfo.version || fileInfo.result?.version;
        metadata.md5Checksum =
          fileInfo.md5Checksum || fileInfo.result?.md5Checksum;

        logger.info(
          `Storing Google Drive headRevisionId for ${fileName}: ${metadata.headRevisionId}`
        );
        logger.info(
          `Storing Google Drive version for ${fileName}: ${metadata.version}`
        );
        logger.info(
          `Storing Google Drive md5Checksum for ${fileName}: ${metadata.md5Checksum}`
        );
      }

      // Save in preferences
      await this.dataService.savePreference(
        `file_metadata_${fileName}`,
        metadata
      );
      logger.info(`Stored metadata for ${fileName}:`, metadata);
    } catch (error) {
      logger.warn(`Error storing file metadata for ${fileName}:`, error);
    }
  }

  /**
   * Get stored file metadata
   * @param {string} fileName - The file name to get metadata for
   * @returns {Promise<Object|null>} The stored metadata or null
   */
  async getStoredFileMetadata(fileName) {
    return this.dataService.getPreference(`file_metadata_${fileName}`, null);
  }
}

export default CloudSyncManager;
