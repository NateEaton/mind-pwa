// cloudSync.js

import GoogleDriveProvider from "./cloudProviders/googleDriveProvider.js";
import DropboxProvider from "./cloudProviders/dropboxProvider.js";

export class CloudSyncManager {
  constructor(dataService, stateManager, onSyncComplete, onSyncError) {
    this.dataService = dataService;
    this.stateManager = stateManager;
    this.onSyncComplete = onSyncComplete || (() => {});
    this.onSyncError = onSyncError || console.error;
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
      console.warn(
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

      console.log(
        "Sync determination metadata:",
        JSON.stringify(metadata, null, 2)
      );

      // Check dirty flags
      const currentWeekDirty = metadata.currentWeekDirty || false;
      const historyDirty = metadata.historyDirty || false;

      // Check if reset was performed
      const dateResetPerformed = metadata.dateResetPerformed || false;
      const dateResetType = metadata.dateResetType || null;

      // Always check for cloud changes regardless of dirty flags
      const alwaysCheckCloudChanges = true;

      // Sync current week if:
      // 1. It's dirty
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

      console.log("Sync determination:", {
        syncCurrent,
        syncHistory,
        currentWeekDirty,
        historyDirty,
        dateResetPerformed,
        dateResetType,
        alwaysCheckCloudChanges,
        metadata,
      });

      return { syncCurrent, syncHistory };
    } catch (error) {
      console.error("Error determining what to sync:", error);
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

      // Update metadata
      metadata[flagName] = false;

      // Clear the fresh install flag if this was a data sync
      if (flagName === "currentWeekDirty") {
        metadata.isFreshInstall = false;
      }

      // Save updated state
      currentState.metadata = metadata;
      this.dataService.saveState(currentState);

      console.log(`Cleared ${flagName} flag`);
    } catch (error) {
      console.warn(`Failed to clear ${flagName} flag:`, error);
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

      console.log("Cleared date reset flags");
    } catch (error) {
      console.warn("Failed to clear date reset flags:", error);
    }
  }

  async sync(silent = false, force = false) {
    if (this.syncInProgress) {
      console.log("Sync already in progress, skipping");
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
      console.log("Starting sync process");

      // Check if we're authenticated
      if (!this.isAuthenticated) {
        console.log("Not authenticated, attempting authentication");
        try {
          await this.authenticate();
          if (!this.isAuthenticated) {
            const error = new Error("Authentication required");
            error.code = "AUTH_REQUIRED";
            throw error;
          }
        } catch (authError) {
          console.error("Authentication failed:", authError);
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

      // Force initial sync if there's no last sync timestamp
      const isFirstSync = !this.lastSyncTimestamp;
      if (isFirstSync) {
        console.log("This appears to be the first sync, forcing upload");
        force = true;
      }

      let syncResults = { currentWeekSynced: false, historySynced: false };

      // Now proceed with actual sync
      try {
        // 1. Sync current week data if needed
        if (syncCurrent || force) {
          try {
            const currentWeekResult = (await this.syncCurrentWeek(force)) || {};
            syncResults.currentWeekSynced = !currentWeekResult.noChanges;

            // Clear the current week dirty flag
            await this.clearDirtyFlag("currentWeekDirty");

            // Clear date reset flags if they were set
            await this.clearDateResetFlags();
          } catch (weekError) {
            console.error("Error syncing current week:", weekError);
            syncResults.currentWeekError = weekError.message;
          }
        }

        // 2. Sync history data if needed
        if (syncHistory || force) {
          try {
            const historyResult = (await this.syncHistory(force)) || {};
            syncResults.historySynced =
              historyResult && historyResult.syncedCount > 0;

            // Clear the history dirty flag
            await this.clearDirtyFlag("historyDirty");
          } catch (historyError) {
            console.error("Error syncing history:", historyError);
            syncResults.historyError = historyError.message;
          }
        }

        this.lastSyncTimestamp = Date.now();
        this.onSyncComplete({
          timestamp: this.lastSyncTimestamp,
          ...syncResults,
        });

        return syncResults;
      } catch (syncError) {
        console.error("Sync operation failed:", syncError);
        const error = new Error(`Sync failed: ${syncError.message}`);
        error.code = "SYNC_OPERATION_FAILED";
        error.originalError = syncError;
        throw error;
      }
    } catch (error) {
      this.onSyncError(error);
      return false;
    } finally {
      this.syncInProgress = false;
      console.log("Sync process completed");
    }
  }

  async syncCurrentWeek(forceUpload = false) {
    console.log("=== Starting Current Week Sync ===");

    try {
      // Define the filename for current week data
      const currentWeekFileName = "mind-diet-current-week.json";

      // First, check if we have actual data to sync
      const localData = this.dataService.loadState();
      const hasLocalChanges = localData.metadata?.currentWeekDirty || false;
      const isFreshInstall = localData.metadata?.isFreshInstall || false;

      // Find or create the file in the cloud
      let fileInfo;
      try {
        fileInfo = await this.provider.findOrCreateFile(currentWeekFileName);
        console.log("Current week file info:", fileInfo);
      } catch (fileError) {
        console.error("Error finding/creating cloud file:", fileError);
        throw new Error(`Failed to access cloud file: ${fileError.message}`);
      }

      // Check if we have a valid file ID
      if (!fileInfo || !fileInfo.id) {
        console.error("Invalid file info returned from cloud provider");
        return {
          error: "Invalid file info",
          uploaded: false,
          downloaded: false,
        };
      }

      // Check if file has changed in cloud if we're not forcing upload
      let cloudFileAccessible = true;
      let cloudFileExists = false;
      let hasFileChanged = true;

      if (!forceUpload && !hasLocalChanges) {
        try {
          hasFileChanged = await this.checkIfFileChanged(
            currentWeekFileName,
            fileInfo.id
          );

          // If we got here, the file is accessible
          cloudFileAccessible = true;
          cloudFileExists = true;

          if (!hasFileChanged) {
            console.log(
              "Current week file hasn't changed in cloud, skipping sync entirely"
            );
            // Store successful check time in metadata
            await this.storeFileMetadata(currentWeekFileName, fileInfo);
            return { noChanges: true };
          }
        } catch (metadataError) {
          console.warn("Error checking file metadata:", metadataError);
          cloudFileAccessible = false;
          // We'll continue the process but note we couldn't check metadata
        }
      }

      // Download remote data only if cloud file is accessible
      let remoteData = null;
      if (cloudFileAccessible) {
        try {
          console.log("Downloading remote data...");
          remoteData = await this.provider.downloadFile(fileInfo.id);

          if (remoteData) {
            cloudFileExists = true;
          }
        } catch (downloadError) {
          console.warn("Error downloading remote data:", downloadError);
          // Continue with local data
        }
      }

      // Check if there's any local data to sync
      const hasDataToSync =
        Object.keys(localData.dailyCounts || {}).length > 0 ||
        Object.keys(localData.weeklyCounts || {}).length > 0;

      console.log("Has data to sync:", hasDataToSync);

      // If remote data exists and is valid, merge with local
      let dataToUpload = localData;

      if (remoteData && this.validateData(remoteData, "current")) {
        console.log("Remote data found, merging with local data");
        dataToUpload = this.mergeCurrentWeekData(localData, remoteData);

        // Update local store with merged data
        console.log("Updating local store with merged data");
        this.dataService.saveState(dataToUpload);

        // Store file metadata after download
        await this.storeFileMetadata(currentWeekFileName, fileInfo);
      } else {
        console.log("No valid remote data available");

        // IMPORTANT CHANGE: Only force dirty flag if this is not a fresh install
        // or if we're certain the cloud file doesn't exist
        if (hasDataToSync && (!isFreshInstall || !cloudFileExists)) {
          if (!dataToUpload.metadata) dataToUpload.metadata = {};

          // If it's a fresh install, only set dirty if we're certain the cloud file doesn't exist
          if (isFreshInstall) {
            if (!cloudFileExists) {
              dataToUpload.metadata.currentWeekDirty = true;
              console.log(
                "Forcing dirty flag - fresh install with no cloud data"
              );
            } else {
              console.log(
                "Fresh install with possible cloud data - not forcing dirty flag"
              );
            }
          } else {
            dataToUpload.metadata.currentWeekDirty = true;
            console.log(
              "Forcing dirty flag for data upload - not fresh install"
            );
          }
        }
      }

      // Determine whether to upload
      const needsUpload =
        forceUpload ||
        hasLocalChanges ||
        dataToUpload.metadata?.currentWeekDirty;

      // For fresh installs, we should be more cautious about uploading
      const shouldSkipUploadForFreshInstall =
        isFreshInstall &&
        !forceUpload &&
        cloudFileAccessible &&
        cloudFileExists;

      if (shouldSkipUploadForFreshInstall) {
        console.log("Fresh install with existing cloud data - skipping upload");
        return { downloaded: true, uploaded: false, freshInstallSkipped: true };
      }

      if (needsUpload) {
        try {
          console.log("Uploading data to cloud");
          const uploadResult = await this.provider.uploadFile(
            fileInfo.id,
            dataToUpload
          );
          console.log("Successfully uploaded data to server");

          // Store file metadata after upload
          await this.storeFileMetadata(currentWeekFileName, uploadResult);

          // Clear dirty flag after successful upload
          if (dataToUpload.metadata) {
            dataToUpload.metadata.currentWeekDirty = false;
            this.dataService.saveState(dataToUpload);
          }

          return { downloaded: !!remoteData, uploaded: true };
        } catch (uploadError) {
          console.error("Error uploading to cloud:", uploadError);
          return {
            error: uploadError.message,
            downloaded: !!remoteData,
            uploaded: false,
          };
        }
      } else {
        console.log("No data changes detected, skipping upload");
        return { downloaded: !!remoteData, uploaded: false };
      }
    } catch (error) {
      console.error("Error in current week sync:", error);
      return { error: error.message, uploaded: false, downloaded: false };
    }
  }

  mergeCurrentWeekData(localData, remoteData) {
    console.log("Merging current week data:");
    console.log("LOCAL data:", {
      dayDate: localData.currentDayDate,
      weekStartDate: localData.currentWeekStartDate,
      lastModified: localData.lastModified,
      lastModifiedDate: localData.lastModified
        ? new Date(localData.lastModified).toISOString()
        : "none",
    });
    console.log("REMOTE data:", {
      dayDate: remoteData.currentDayDate,
      weekStartDate: remoteData.currentWeekStartDate,
      lastModified: remoteData.lastModified,
      lastModifiedDate: remoteData.lastModified
        ? new Date(remoteData.lastModified).toISOString()
        : "none",
    });

    // Check system date vs remote date - NEW ADDITION
    const todayStr = this.dataService.getTodayDateString();
    const remoteDateStr = remoteData.currentDayDate;
    const needsDateReset = todayStr !== remoteDateStr;

    console.log(
      `System date: ${todayStr}, Remote date: ${remoteDateStr}, Needs reset: ${needsDateReset}`
    );

    // Special case for fresh installs - prefer remote data
    if (localData.metadata && localData.metadata.isFreshInstall) {
      console.log(
        "Fresh install detected - using remote data and updating timestamp"
      );

      // Check if remote data has actual content
      const hasRemoteData =
        Object.keys(remoteData.dailyCounts || {}).length > 0 ||
        Object.keys(remoteData.weeklyCounts || {}).length > 0;

      if (hasRemoteData) {
        let mergedData = {
          ...remoteData,
          // IMPORTANT FIX: Use system date, not remote date
          currentDayDate: todayStr,
          lastModified: Date.now(),
          metadata: {
            ...(remoteData.metadata || {}),
            isFreshInstall: false,
            currentWeekDirty: false,
            schemaVersion: localData.metadata.schemaVersion,
            deviceId: localData.metadata.deviceId,
          },
        };

        // If date has changed, mark for post-sync reset - NEW ADDITION
        if (needsDateReset) {
          mergedData.metadata.pendingDateReset = true;
          mergedData.metadata.remoteDateWas = remoteDateStr;
          console.log("Flagged for post-sync date reset");
        }

        return mergedData;
      }
    }

    // Detect week transitions
    const localWeekStart = new Date(
      localData.currentWeekStartDate + "T00:00:00"
    );
    const remoteWeekStart = new Date(
      remoteData.currentWeekStartDate + "T00:00:00"
    );
    const localIsNewer = localWeekStart > remoteWeekStart;
    const remoteIsNewer = remoteWeekStart > localWeekStart;

    // For multi-week gaps, calculate week difference
    const weekDiff = Math.round(
      Math.abs(localWeekStart - remoteWeekStart) / (7 * 24 * 60 * 60 * 1000)
    );
    const isMultiWeekGap = weekDiff > 1;

    // Check if data was reset due to new day/week
    const wasReset = localData.metadata?.dateResetPerformed || false;
    const resetType = localData.metadata?.dateResetType || null;
    const resetTimestamp = localData.metadata?.dateResetTimestamp || 0;

    // Compare core timestamps
    const localModified = localData.lastModified || 0;
    const remoteModified = remoteData.lastModified || 0;

    console.log("Analysis:", {
      weekDiff,
      isMultiWeekGap,
      localIsNewer,
      remoteIsNewer,
      wasReset,
      resetType,
      localModified,
      remoteModified,
    });

    // Handle multi-week gap scenarios
    if (isMultiWeekGap) {
      // If local week is newer and was reset, and remote hasn't been modified more recently
      if (localIsNewer && wasReset && resetTimestamp > remoteModified) {
        console.log("Multi-week gap with local reset: using local data");
        return {
          ...localData,
          lastModified: Math.max(localModified, remoteModified) + 1,
        };
      }

      // If remote week is newer than local week
      if (remoteIsNewer) {
        console.log("Multi-week gap with newer remote week: using remote data");

        // But preserve certain local metadata
        const preservedMetadata = {};
        if (localData.metadata) {
          if (localData.metadata.dateResetPerformed) {
            preservedMetadata.dateResetPerformed = false; // Clear the reset flag
          }
        }

        return {
          ...remoteData,
          metadata: {
            ...(remoteData.metadata || {}),
            ...preservedMetadata,
            currentWeekDirty: false, // Reset dirty flag
            historyDirty: localData.metadata?.historyDirty || false, // Preserve history dirty flag
          },
          lastModified: Math.max(localModified, remoteModified) + 1,
        };
      }

      // If we have a multi-week gap but neither condition above matched,
      // use the timestamp to determine which is more recent
      if (remoteModified > localModified) {
        console.log(
          "Multi-week gap with more recent remote data: using remote"
        );
        return {
          ...remoteData,
          metadata: {
            ...(remoteData.metadata || {}),
            currentWeekDirty: false,
            historyDirty: localData.metadata?.historyDirty || false,
          },
          lastModified: remoteModified + 1,
        };
      } else {
        console.log("Multi-week gap with more recent local data: using local");
        return {
          ...localData,
          lastModified: localModified + 1,
        };
      }
    }

    // For normal case (same week or single week difference)

    // If local was reset more recently than remote was modified, use local data
    if (wasReset && resetTimestamp > remoteModified) {
      console.log(
        "Local data was reset more recently than remote was modified - using local data"
      );
      return {
        ...localData,
        lastModified: Math.max(localModified, remoteModified) + 1,
      };
    }

    // If remote modified time is more recent, use remote data
    if (remoteModified > localModified) {
      console.log("Remote data is more recent than local - using remote data");
      const mergedData = {
        ...remoteData,
        // IMPORTANT: Always preserve local current day date
        currentDayDate: localData.currentDayDate || todayStr,
        metadata: {
          ...(remoteData.metadata || {}),
          currentWeekDirty: false,
          historyDirty: localData.metadata?.historyDirty || false,
        },
        lastModified: remoteModified + 1,
      };

      // If remote date differs from system date, flag for reset - NEW ADDITION
      if (needsDateReset) {
        mergedData.metadata.pendingDateReset = true;
        mergedData.metadata.remoteDateWas = remoteDateStr;
        console.log("Flagged for post-sync date reset when using remote data");
      }

      return mergedData;
    }

    // If local modified time is more recent, use local data
    if (localModified > remoteModified) {
      console.log("Local data is more recent than remote - using local data");
      return {
        ...localData,
        lastModified: localModified + 1,
      };
    }

    // If timestamps are identical, merge with preference for higher counts
    console.log(
      "Timestamps are identical - merging with preference for higher counts"
    );

    // Standard merge for same week data with identical timestamps
    const mergedData = {
      ...remoteData,
      // Keep local day if it's more recent
      currentDayDate: todayStr,
      currentWeekStartDate: this.getMostRecentDate(
        localData.currentWeekStartDate,
        remoteData.currentWeekStartDate
      ),
      // Merge counts with "max wins" strategy
      dailyCounts: {},
      weeklyCounts: {},
      // Merge metadata
      metadata: {
        ...(remoteData.metadata || {}),
        ...(localData.metadata || {}),
        currentWeekDirty: false, // Reset dirty flag
        historyDirty: localData.metadata?.historyDirty || false, // Preserve history dirty flag
      },
      // Update timestamp
      lastModified:
        Math.max(localData.lastModified || 0, remoteData.lastModified || 0) + 1,
    };

    // Delete reset flags from merged data as they've been handled
    if (mergedData.metadata) {
      delete mergedData.metadata.dateResetPerformed;
      delete mergedData.metadata.dateResetType;
      delete mergedData.metadata.dateResetTimestamp;
    }

    // Merge daily counts with max wins strategy
    const allDailyFoodGroups = new Set([
      ...Object.keys(localData.dailyCounts || {}),
      ...Object.keys(remoteData.dailyCounts || {}),
    ]);

    allDailyFoodGroups.forEach((groupId) => {
      const localCount = (localData.dailyCounts || {})[groupId] || 0;
      const remoteCount = (remoteData.dailyCounts || {})[groupId] || 0;
      mergedData.dailyCounts[groupId] = Math.max(localCount, remoteCount);

      if (localCount !== remoteCount) {
        console.log(
          `Merged daily count for ${groupId}: local=${localCount}, remote=${remoteCount}, merged=${mergedData.dailyCounts[groupId]}`
        );
      }
    });

    // Merge weekly counts with max wins strategy
    const allWeeklyFoodGroups = new Set([
      ...Object.keys(localData.weeklyCounts || {}),
      ...Object.keys(remoteData.weeklyCounts || {}),
    ]);

    allWeeklyFoodGroups.forEach((groupId) => {
      const localCount = (localData.weeklyCounts || {})[groupId] || 0;
      const remoteCount = (remoteData.weeklyCounts || {})[groupId] || 0;
      mergedData.weeklyCounts[groupId] = Math.max(localCount, remoteCount);

      if (localCount !== remoteCount) {
        console.log(
          `Merged weekly count for ${groupId}: local=${localCount}, remote=${remoteCount}, merged=${mergedData.weeklyCounts[groupId]}`
        );
      }
    });

    console.log("MERGED data:", {
      dayDate: mergedData.currentDayDate,
      weekStartDate: mergedData.currentWeekStartDate,
      lastModified: mergedData.lastModified,
      lastModifiedDate: new Date(mergedData.lastModified).toISOString(),
    });

    // Always check for date reset needs
    if (needsDateReset) {
      mergedData.metadata.pendingDateReset = true;
      mergedData.metadata.remoteDateWas = remoteDateStr;
      console.log("Flagged for post-sync date reset in standard merge");
    }

    return mergedData;
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

    console.log("Checking if history sync needed:", {
      currentWeekStart,
      lastSyncedWeek: this.lastSyncedWeek,
      lastHistorySyncTimestamp: this.lastHistorySyncTimestamp || "never",
      historyLength: (await this.dataService.getAllWeekHistory()).length,
    });

    // If we don't have a record of the last synced week, sync is needed
    if (!this.lastSyncedWeek) {
      console.log("No record of last synced week, sync needed");
      this.lastSyncedWeek = currentWeekStart;
      return true;
    }

    // If the current week has changed since last sync, sync history
    if (this.lastSyncedWeek !== currentWeekStart) {
      console.log(
        `Week transition detected: ${this.lastSyncedWeek} -> ${currentWeekStart}, sync needed`
      );
      this.lastSyncedWeek = currentWeekStart;
      return true;
    }

    // Check if local history data has been updated since last sync
    if (currentState.metadata && currentState.metadata.historyUpdated) {
      console.log("History updated flag detected, sync needed");
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
        console.log(
          `Cloud file modified: ${new Date(
            fileModifiedTime
          ).toISOString()}, Last sync: ${new Date(
            this.lastHistorySyncTimestamp
          ).toISOString()}, Needs sync: ${needsSync}`
        );
        return needsSync;
      }
    } catch (error) {
      console.warn("Error checking history file:", error);
    }

    // Default to needing sync if we can't determine
    return true;
  }

  async syncHistoryIndex() {
    console.log("=== Starting History Index Sync ===");

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
        console.log(
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
        console.log(
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
      console.log("Downloading remote index...");
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
        console.log("Remote index found, comparing with local history");

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
            console.log(
              `Week ${weekStart} exists in cloud but not locally - adding to download queue`
            );
            weeksToSync.push({
              weekStartDate: weekStart,
              direction: "download",
            });
          } else if (remoteWeek.updatedAt > localWeek.updatedAt) {
            // Remote is newer than local - mark for download
            console.log(
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
            console.log(
              `Week ${weekStart} exists locally but not in cloud - adding to upload queue`
            );
            weeksToSync.push({
              weekStartDate: weekStart,
              direction: "upload",
            });
          } else if (localWeek.updatedAt > remoteWeek.updatedAt) {
            // Local is newer than remote - mark for upload
            console.log(
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
        console.log(
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
        console.log("History index synced successfully");

        // Store metadata after successful operation
        await this.storeFileMetadata(historyIndexFileName, uploadResult);
      } else {
        console.log("No history changes detected, skipping index upload");
      }

      // Return the list of weeks that need syncing
      return weeksToSync;
    } catch (error) {
      console.error("Error in history index sync:", error);
      throw error;
    }
  }

  async syncWeek(weekStartDate, direction) {
    console.log(`=== Syncing week ${weekStartDate} (${direction}) ===`);

    try {
      const weekFileName = `mind-diet-week-${weekStartDate}.json`;

      // Find or create the week file
      const fileInfo = await this.provider.findOrCreateFile(weekFileName);

      let syncSuccessful = false;

      if (direction === "upload") {
        // Get the local week data
        const localWeek = await this.dataService.getWeekHistory(weekStartDate);

        if (!localWeek) {
          console.warn(`Local week ${weekStartDate} not found for upload`);
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
            console.log(
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
        console.log(`Week ${weekStartDate} uploaded successfully`);

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
            console.log(
              `Week ${weekStartDate} has no changes, skipping download`
            );
            return true;
          }
        }

        // Download the remote week data
        const remoteWeek = await this.provider.downloadFile(fileInfo.id);

        if (!remoteWeek || !remoteWeek.weekStartDate) {
          console.warn(`Remote week ${weekStartDate} not found or invalid`);
          return false;
        }

        // Save to local database
        await this.dataService.saveWeekHistory(remoteWeek, {
          syncStatus: "synced",
        });
        console.log(`Week ${weekStartDate} downloaded successfully`);

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
              updatedAt: syncedWeek.metadata?.updatedAt || Date.now(),
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

            console.log(`Updated history index for week ${weekStartDate}`);
          }
        } catch (indexError) {
          console.warn(
            `Error updating index after week sync: ${indexError.message}`
          );
          // Don't fail the sync if index update fails
        }
      }

      return syncSuccessful;
    } catch (error) {
      console.error(`Error syncing week ${weekStartDate}:`, error);
      return false;
    }
  }

  async syncHistory(forceUpload = false) {
    console.log("=== Starting History Sync ===");

    try {
      // First sync the index to determine which weeks need syncing
      const weeksToSync = await this.syncHistoryIndex();

      console.log(`Found ${weeksToSync.length} weeks that need syncing`);

      if (weeksToSync.length === 0) {
        console.log("No history weeks need syncing");
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

      console.log(
        `Synced ${syncSuccessCount} out of ${weeksToSync.length} weeks`
      );

      // Update the last sync timestamp
      this.lastHistorySyncTimestamp = Date.now();
      this.storeLastSyncedState();

      // Clear the history dirty flag after successful sync
      await this.clearDirtyFlag("historyDirty");

      return {
        success: true,
        syncedCount: syncSuccessCount,
      };
    } catch (error) {
      console.error("Error in history sync:", error);
      throw error;
    }
  }

  mergeHistoryData(localHistory, remoteHistory) {
    console.log("Starting history merge process");
    console.log(`Local history: ${localHistory.length} items`);
    console.log(`Remote history: ${remoteHistory.length} items`);

    // Validate both arrays and create safe copies
    if (!Array.isArray(localHistory)) {
      console.warn("Local history is not an array, using empty array");
      localHistory = [];
    }
    if (!Array.isArray(remoteHistory)) {
      console.warn("Remote history is not an array, using empty array");
      remoteHistory = [];
    }

    // Create a map of weeks by start date for easy lookup
    const weekMap = new Map();

    // Process all local history first - ensure structure is valid
    localHistory.forEach((week, index) => {
      // Skip if week is missing a start date
      if (!week.weekStartDate) {
        console.warn(
          `Local history item at index ${index} missing weekStartDate, skipping`,
          week
        );
        return;
      }

      // Log week data for debugging
      console.log(`Local week ${week.weekStartDate}:`, {
        hasTotals: !!week.totals,
        hasTargets: !!week.targets,
        updatedAt: week.metadata?.updatedAt || 0,
      });

      // Ensure totals exists
      if (!week.totals) {
        console.warn(
          `Local week ${week.weekStartDate} missing totals, adding empty object`
        );
        week.totals = {};
      }

      // Ensure metadata exists
      if (!week.metadata) {
        week.metadata = { updatedAt: Date.now() };
      } else if (!week.metadata.updatedAt) {
        week.metadata.updatedAt = Date.now();
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
        console.warn(
          `Remote history item at index ${index} missing weekStartDate, skipping`,
          week
        );
        return;
      }

      // Log week data for debugging
      console.log(`Remote week ${week.weekStartDate}:`, {
        hasTotals: !!week.totals,
        hasTargets: !!week.targets,
        updatedAt: week.metadata?.updatedAt || 0,
      });

      // Ensure totals exists
      if (!week.totals) {
        console.warn(
          `Remote week ${week.weekStartDate} missing totals, adding empty object`
        );
        week.totals = {};
      }

      // Ensure metadata exists
      if (!week.metadata) {
        week.metadata = { updatedAt: Date.now() };
      } else if (!week.metadata.updatedAt) {
        week.metadata.updatedAt = Date.now();
      }

      const existingWeek = weekMap.get(week.weekStartDate);

      if (!existingWeek) {
        // New week from remote, add it
        console.log(`New week found in remote data: ${week.weekStartDate}`);
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
          console.log(
            `Newer version found for week ${week.weekStartDate}: remote (${remoteUpdatedAt}) > local (${existingWeek.updatedAt})`
          );
          weekMap.set(week.weekStartDate, {
            source: "remote",
            data: week,
            updatedAt: remoteUpdatedAt,
          });
          changed = true;
        } else {
          console.log(
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

    console.log(
      `Merge complete. Result has ${mergedData.length} weeks, changed: ${changed}`
    );

    // Do a final validation to ensure all weeks have the required structure
    const validatedData = mergedData.filter((week) => {
      if (!week.weekStartDate) {
        console.warn("Filtering out history item missing weekStartDate", week);
        return false;
      }

      // Ensure totals exists
      if (!week.totals) {
        console.warn(
          `Week ${week.weekStartDate} missing totals, adding empty object`
        );
        week.totals = {};
      }

      // Ensure metadata exists
      if (!week.metadata) {
        week.metadata = { updatedAt: Date.now() };
      }

      return true;
    });

    if (validatedData.length !== mergedData.length) {
      console.warn(
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
          console.warn("Auto-sync failed:", error);
        });
      }
    }, interval);

    console.log(`Auto-sync started, interval: ${intervalMinutes} minutes`);
  }

  stopAutoSync() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
      console.log("Auto-sync stopped");
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
      console.error(`Invalid ${type} data:`, data);
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
        console.error(
          `Current week data missing required fields:`,
          missingFields
        );
        return false;
      }

      // Ensure lastModified is present
      if (!data.lastModified) {
        console.warn(
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
      console.log("Stored sync state:", syncState);
    } catch (error) {
      console.warn("Failed to store sync state:", error);
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
        console.log("Loaded sync state:", syncState);
      }
    } catch (error) {
      console.warn("Failed to load sync state:", error);
    }
  }

  // Add this to the CloudSyncManager class in cloudSync.js
  async debugSyncState() {
    try {
      // Get local data
      const currentState = this.dataService.loadState();

      // Check metadata and dirty flags
      const metadata = currentState.metadata || {};

      console.log("=== Sync Debug Info ===");
      console.log("Current State:", {
        currentDayDate: currentState.currentDayDate,
        currentWeekStartDate: currentState.currentWeekStartDate,
        lastModified: currentState.lastModified,
        hasMetadata: !!currentState.metadata,
        dailyCountsSize: Object.keys(currentState.dailyCounts || {}).length,
        weeklyCountsSize: Object.keys(currentState.weeklyCounts || {}).length,
      });

      console.log("Metadata:", {
        ...metadata,
        exists: !!metadata,
      });

      // Check data validity
      const isValid = this.validateData(currentState, "current");
      console.log("Data validity:", isValid);

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
      console.error("Error in sync debug:", error);
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
        console.log(`File ${fileName} not found or metadata unavailable`);
        return true;
      }

      // Get locally stored metadata
      const storedMetadata = await this.getStoredFileMetadata(fileName);

      if (!storedMetadata) {
        // No stored metadata, assume file has changed
        console.log(`No stored metadata for ${fileName}, assuming changed`);
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

      console.log(`File ${fileName}: ${revisionInfo}, changed: ${hasChanged}`);
      return hasChanged;
    } catch (error) {
      console.warn(`Error checking if file ${fileName} changed:`, error);
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
      console.log(`Full fileInfo for ${fileName}:`, fileInfo);

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
        console.log(`Storing Dropbox rev for ${fileName}: ${metadata.rev}`);
      } else {
        // For Google Drive - store all available revision indicators
        metadata.headRevisionId =
          fileInfo.headRevisionId || fileInfo.result?.headRevisionId;
        metadata.version = fileInfo.version || fileInfo.result?.version;
        metadata.md5Checksum =
          fileInfo.md5Checksum || fileInfo.result?.md5Checksum;

        console.log(
          `Storing Google Drive headRevisionId for ${fileName}: ${metadata.headRevisionId}`
        );
        console.log(
          `Storing Google Drive version for ${fileName}: ${metadata.version}`
        );
        console.log(
          `Storing Google Drive md5Checksum for ${fileName}: ${metadata.md5Checksum}`
        );
      }

      // Save in preferences
      await this.dataService.savePreference(
        `file_metadata_${fileName}`,
        metadata
      );
      console.log(`Stored metadata for ${fileName}:`, metadata);
    } catch (error) {
      console.warn(`Error storing file metadata for ${fileName}:`, error);
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
