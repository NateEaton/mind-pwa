// cloudSync.js

import GoogleDriveProvider from "./cloudProviders/googleDriveProvider.js";
import DropboxProvider from "./cloudProviders/dropboxProvider.js";

export class CloudSyncManager {
  constructor(dataService, onSyncComplete, onSyncError) {
    this.dataService = dataService;
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

  // In cloudSync.js within CloudSyncManager class
  // In cloudSync.js - Enhance determineWhatToSync function
  async determineWhatToSync() {
    try {
      // Get state to check dirty flags
      const currentState = this.dataService.loadState();
      const metadata = currentState.metadata || {};

      // Debug output to see exactly what metadata is available
      console.log(
        "Sync determination metadata:",
        JSON.stringify(metadata, null, 2)
      );

      const currentWeekDirty = metadata.currentWeekDirty || false;
      const historyDirty = metadata.historyDirty || false;

      // Check if reset was performed
      const dateResetPerformed = metadata.dateResetPerformed || false;
      const dateResetType = metadata.dateResetType || null;

      // Always sync current week if reset was performed or data is dirty
      const syncCurrent = currentWeekDirty || dateResetPerformed;

      // Always sync history if weekly reset occurred or if history is dirty
      const syncHistory =
        historyDirty || (dateResetPerformed && dateResetType === "WEEKLY");

      console.log("Sync determination:", {
        syncCurrent,
        syncHistory,
        currentWeekDirty,
        historyDirty,
        dateResetPerformed,
        dateResetType,
        metadata: metadata, // Add full metadata object for debugging
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

      // Determine what needs to be synced
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
          await this.syncCurrentWeek(force);
          syncResults.currentWeekSynced = true;

          // Clear the current week dirty flag
          await this.clearDirtyFlag("currentWeekDirty");

          // Clear date reset flags if they were set
          await this.clearDateResetFlags();
        }

        // 2. Sync history data if needed
        if (syncHistory) {
          await this.syncHistory();
          syncResults.historySynced = true;

          // Clear the history dirty flag
          await this.clearDirtyFlag("historyDirty");
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

      // Force upload if this is a fresh install (to sync from cloud)
      const isFreshInstall = localData.metadata?.isFreshInstall || false;
      if (isFreshInstall) {
        console.log("Fresh install detected - forcing sync");
        forceUpload = true;
      }

      // Debug data state
      await this.debugSyncState();

      // Ensure valid timestamps
      if (!localData.lastModified) {
        console.log("Adding missing lastModified timestamp");
        localData.lastModified = Date.now();
      }

      // Initialize metadata if missing
      if (!localData.metadata) {
        console.log("Adding missing metadata");
        localData.metadata = {
          currentWeekDirty: true, // Force dirty for first sync
          historyDirty: false,
        };
      }

      // Find or create the file in the cloud
      const fileInfo = await this.provider.findOrCreateFile(
        currentWeekFileName
      );
      console.log("Current week file info:", fileInfo);

      // First, download remote data
      console.log("Downloading remote data...");
      let remoteData = await this.provider.downloadFile(fileInfo.id);

      // Check if there's any data to sync (either counts or metadata)
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
      } else {
        console.log("No valid remote data, using local data only");

        // Force dirty flag for initial upload
        if (
          hasDataToSync &&
          (!dataToUpload.metadata || !dataToUpload.metadata.currentWeekDirty)
        ) {
          if (!dataToUpload.metadata) dataToUpload.metadata = {};
          dataToUpload.metadata.currentWeekDirty = true;
          console.log("Forcing dirty flag for initial data upload");
        }
      }

      // Only upload if we have data or this is a forced upload
      if (
        forceUpload ||
        hasDataToSync ||
        dataToUpload.metadata?.currentWeekDirty
      ) {
        console.log("Uploading data to cloud");
        await this.provider.uploadFile(fileInfo.id, dataToUpload);
        console.log("Successfully uploaded data to server");

        // Clear dirty flag after successful upload
        if (dataToUpload.metadata) {
          dataToUpload.metadata.currentWeekDirty = false;
          this.dataService.saveState(dataToUpload);
        }
      } else {
        console.log("No data changes detected, skipping upload");
      }

      return dataToUpload;
    } catch (error) {
      console.error("Error in current week sync:", error);
      throw error;
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

    // Special case for fresh installs - prefer remote data
    if (localData.metadata && localData.metadata.isFreshInstall) {
      console.log("Fresh install detected - using remote data and updating timestamp");
      
      // Check if remote data has actual content
      const hasRemoteData = 
        Object.keys(remoteData.dailyCounts || {}).length > 0 || 
        Object.keys(remoteData.weeklyCounts || {}).length > 0;
      
      if (hasRemoteData) {
        // Use remote data but with updated timestamps
        const mergedData = {
          ...remoteData,
          lastModified: Date.now(), // Current timestamp
          metadata: {
            ...(remoteData.metadata || {}),
            isFreshInstall: false, // Clear the fresh install flag
            currentWeekDirty: false,
            schemaVersion: localData.metadata.schemaVersion,
            deviceId: localData.metadata.deviceId,
          }
        };
        
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
      return {
        ...remoteData,
        metadata: {
          ...(remoteData.metadata || {}),
          currentWeekDirty: false,
          historyDirty: localData.metadata?.historyDirty || false,
        },
        lastModified: remoteModified + 1,
      };
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
      currentDayDate: this.getMostRecentDate(
        localData.currentDayDate,
        remoteData.currentDayDate
      ),
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

  async syncHistory(forceUpload = false) {
    console.log("=== Starting History Sync ===");

    try {
      const historyFileName = "mind-diet-history.json";

      // Find or create the file in the cloud
      const fileInfo = await this.provider.findOrCreateFile(historyFileName);
      console.log("History file info:", fileInfo);

      // Get local history data
      const localHistory = await this.dataService.getAllWeekHistory();
      console.log("Local history for sync:", {
        count: localHistory.length,
        firstDate:
          localHistory.length > 0 ? localHistory[0].weekStartDate : null,
        lastDate:
          localHistory.length > 0
            ? localHistory[localHistory.length - 1].weekStartDate
            : null,
      });

      // First, download remote history data to merge with local
      console.log("Downloading remote history data...");
      const remoteData = await this.provider.downloadFile(fileInfo.id);
      let dataToUpload = { history: localHistory };

      // If remote data exists and has history, merge with local
      if (
        remoteData &&
        remoteData.history &&
        Array.isArray(remoteData.history)
      ) {
        console.log("Remote history found, merging with local history:", {
          count: remoteData.history.length,
          firstDate:
            remoteData.history.length > 0
              ? remoteData.history[0].weekStartDate
              : null,
          lastDate:
            remoteData.history.length > 0
              ? remoteData.history[remoteData.history.length - 1].weekStartDate
              : null,
        });

        const mergeResult = this.mergeHistoryData(
          localHistory,
          remoteData.history
        );

        if (mergeResult.changed) {
          console.log("History merged with changes detected");
          dataToUpload = { history: mergeResult.data };

          // Save each history item individually to avoid key issues
          console.log("Updating local store with merged history data");
          try {
            // Instead of bulk updating, save each week one by one
            for (const weekData of mergeResult.data) {
              // Ensure the week has a valid key
              if (!weekData.weekStartDate) {
                console.warn(
                  "History item missing weekStartDate, skipping",
                  weekData
                );
                continue;
              }
              // Save individual week to the database
              await this.dataService.saveWeekHistory(weekData);
            }
          } catch (error) {
            console.error("Error saving merged history:", error);
            // Continue with the sync even if local save failed
          }
        } else {
          console.log("No changes after merging history");
        }
      } else {
        console.log("No valid remote history data, using local data only");
      }

      // Upload the (possibly merged) data
      console.log("Uploading history data to cloud...");
      await this.provider.uploadFile(fileInfo.id, dataToUpload);
      this.lastHistorySyncTimestamp = Date.now();
      console.log("Successfully uploaded history data to server");

      // Store last synced week in localStorage for persistence
      this.storeLastSyncedState();

      return dataToUpload.history;
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
}

export default CloudSyncManager;
