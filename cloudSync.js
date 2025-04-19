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
    // Check if we've had a week transition since last sync
    const currentState = this.dataService.loadState();
    const currentWeekStart = currentState.currentWeekStartDate;

    // If we don't have a record of the last synced week, sync is needed
    if (!this.lastSyncedWeek) {
      this.lastSyncedWeek = currentWeekStart;
      return true;
    }

    // If the current week has changed since last sync, sync history
    if (this.lastSyncedWeek !== currentWeekStart) {
      this.lastSyncedWeek = currentWeekStart;
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
        return fileModifiedTime > this.lastHistorySyncTimestamp;
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

      // Get local history data
      const localHistory = await this.dataService.getAllWeekHistory();
      console.log("Local history for sync:", {
        count: localHistory.length,
        firstItem: localHistory.length > 0 ? localHistory[0] : null,
      });

      // Always use direct upload approach
      const historyPackage = { history: localHistory };
      await this.provider.uploadFile(fileInfo.id, historyPackage);
      this.lastHistorySyncTimestamp = Date.now();
      console.log("Successfully uploaded history data to server");

      return;
    } catch (error) {
      console.error("Error in history sync:", error);
      throw error;
    }
  }

  mergeHistoryData(localHistory, remoteHistory) {
    // Create a map of weeks by start date for easy lookup
    const weekMap = new Map();

    // Process all local history first
    localHistory.forEach((week) => {
      weekMap.set(week.weekStartDate, {
        source: "local",
        data: week,
        updatedAt: week.metadata?.updatedAt || 0,
      });
    });

    // Track if anything changed
    let changed = false;

    // Process remote history, overwriting local only if newer
    remoteHistory.forEach((week) => {
      const existingWeek = weekMap.get(week.weekStartDate);

      if (!existingWeek) {
        // New week from remote, add it
        weekMap.set(week.weekStartDate, {
          source: "remote",
          data: week,
          updatedAt: week.metadata?.updatedAt || 0,
        });
        changed = true;
      } else {
        // Week exists in both - compare timestamps and use newer
        const remoteUpdatedAt = week.metadata?.updatedAt || 0;

        if (remoteUpdatedAt > existingWeek.updatedAt) {
          // Remote is newer
          weekMap.set(week.weekStartDate, {
            source: "remote",
            data: week,
            updatedAt: remoteUpdatedAt,
          });
          changed = true;
        }
      }
    });

    // Convert map back to array and sort by date (newest first)
    const mergedData = Array.from(weekMap.values())
      .map((item) => item.data)
      .sort((a, b) => {
        return new Date(b.weekStartDate) - new Date(a.weekStartDate);
      });

    return {
      data: mergedData,
      changed: changed || mergedData.length !== localHistory.length,
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
}

export default CloudSyncManager;
