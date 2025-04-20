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

    await this.provider.initialize();
    this.isAuthenticated = await this.provider.checkAuth();
    return this.isAuthenticated;
  }

  async authenticate() {
    if (!this.provider) throw new Error("No cloud provider initialized");
    this.isAuthenticated = await this.provider.authenticate();
    return this.isAuthenticated;
  }

  async sync() {
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

      // Now proceed with actual sync
      try {
        // 1. Download and merge current week file
        await this.syncCurrentWeek();

        // 2. Sync history file if needed
        const needsHistorySync = await this.checkIfHistorySyncNeeded();
        if (needsHistorySync) {
          await this.syncHistory();
        }

        this.lastSyncTimestamp = Date.now();
        this.onSyncComplete({
          timestamp: this.lastSyncTimestamp,
          historySynced: needsHistorySync,
        });

        return true;
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

      // Find or create the file in the cloud
      const fileInfo = await this.provider.findOrCreateFile(
        currentWeekFileName
      );
      console.log("Current week file info:", fileInfo);

      // Get local current week data
      const localData = this.dataService.loadState();

      // Ensure valid timestamps
      if (!localData.lastModified) {
        console.log("Adding missing lastModified timestamp");
        localData.lastModified = Date.now();
      }

      // First, download remote data
      console.log("Downloading remote data...");
      let remoteData = await this.provider.downloadFile(fileInfo.id);

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
      }

      // Upload the (possibly merged) data
      await this.provider.uploadFile(fileInfo.id, dataToUpload);
      console.log("Successfully uploaded data to server");

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
      lastModifiedDate: new Date(localData.lastModified).toISOString(),
    });
    console.log("REMOTE data:", {
      dayDate: remoteData.currentDayDate,
      weekStartDate: remoteData.currentWeekStartDate,
      lastModified: remoteData.lastModified,
      lastModifiedDate: new Date(remoteData.lastModified).toISOString(),
    });

    // Simple merge strategy:
    // 1. Use the more recent current day/week dates
    // 2. For food counts, take the maximum value for each food group

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
      // Merge counts with a "max wins" strategy
      dailyCounts: {},
      weeklyCounts: {},
      // Use the most recent timestamp + 1 to indicate it's been merged
      lastModified:
        Math.max(localData.lastModified || 0, remoteData.lastModified || 0) + 1,
    };

    // Merge all food groups using max value
    const allDailyFoodGroups = new Set([
      ...Object.keys(localData.dailyCounts || {}),
      ...Object.keys(remoteData.dailyCounts || {}),
    ]);

    const allWeeklyFoodGroups = new Set([
      ...Object.keys(localData.weeklyCounts || {}),
      ...Object.keys(remoteData.weeklyCounts || {}),
    ]);

    // Apply max value strategy for daily counts
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

    // Apply max value strategy for weekly counts
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
}

export default CloudSyncManager;
