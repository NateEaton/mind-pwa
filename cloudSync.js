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

  // In CloudSyncManager.js - enhance syncCurrentWeek
  async syncCurrentWeek() {
    // Define the filename for current week data
    const currentWeekFileName = "mind-diet-current-week.json";

    // Find or create the file in the cloud
    const fileInfo = await this.provider.findOrCreateFile(currentWeekFileName);
    console.log("Current week file info:", fileInfo);

    // Get local current week data
    const localData = this.dataService.loadState();

    // Ensure lastModified exists and is a number
    if (!localData.lastModified) {
      localData.lastModified = Date.now();
      console.log(
        "Added missing lastModified timestamp to local data:",
        localData.lastModified
      );
    }

    console.log(
      "Local data timestamp:",
      localData.lastModified,
      "formatted:",
      new Date(localData.lastModified).toISOString()
    );

    // Download remote data if it exists
    let remoteData = null;
    try {
      remoteData = await this.provider.downloadFile(fileInfo.id);

      // Ensure remote data has a lastModified as well
      if (remoteData && !remoteData.lastModified) {
        remoteData.lastModified = Date.now() - 10000; // Slightly older than local
        console.log(
          "Added missing lastModified timestamp to remote data:",
          remoteData.lastModified
        );
      }

      if (remoteData) {
        console.log(
          "Remote data timestamp:",
          remoteData.lastModified,
          "formatted:",
          new Date(remoteData.lastModified).toISOString()
        );
      }
    } catch (error) {
      console.warn("Could not download current week file:", error);
      // If we can't download, just upload our local copy
      await this.provider.uploadFile(fileInfo.id, localData);
      return;
    }

    if (!remoteData) {
      // No remote data exists yet, just upload local data
      console.log("No remote data found, uploading local data");
      await this.provider.uploadFile(fileInfo.id, localData);
      return;
    }

    // Compare modification timestamps to detect conflicts
    const localModified = localData.lastModified || 0;
    const remoteModified = remoteData.lastModified || 0;

    console.log(
      "Comparing timestamps - Local:",
      new Date(localModified).toISOString(),
      "Remote:",
      new Date(remoteModified).toISOString()
    );

    if (remoteModified > localModified) {
      // Remote is newer, use it but merge with current day data
      console.log("Remote data is newer, merging with local data");
      const mergedData = this.mergeCurrentWeekData(localData, remoteData);

      // Log specific counts before and after
      console.log("LOCAL food counts:", JSON.stringify(localData.weeklyCounts));
      console.log(
        "REMOTE food counts:",
        JSON.stringify(remoteData.weeklyCounts)
      );
      console.log(
        "MERGED food counts:",
        JSON.stringify(mergedData.weeklyCounts)
      );

      // Save merged data locally
      this.dataService.saveState(mergedData);

      // Upload merged data back to cloud
      console.log("Uploading merged data back to cloud");
      await this.provider.uploadFile(fileInfo.id, mergedData);
    } else if (localModified > remoteModified) {
      // Local is newer, upload it
      console.log("Local data is newer, uploading to cloud");
      await this.provider.uploadFile(fileInfo.id, localData);
    } else {
      // Same timestamp, check if content is actually different
      const localJSON = JSON.stringify(localData);
      const remoteJSON = JSON.stringify(remoteData);

      if (localJSON !== remoteJSON) {
        console.log(
          "Timestamps are equal but content differs, performing full merge"
        );
        const mergedData = this.mergeCurrentWeekData(localData, remoteData);

        // Save merged data locally
        this.dataService.saveState(mergedData);

        // Upload merged data back to cloud
        console.log(
          "Uploading merged data back to cloud after content-based merge"
        );
        await this.provider.uploadFile(fileInfo.id, mergedData);
      } else {
        console.log("Current week data already in sync (content identical)");
      }
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

  async syncHistory() {
    const historyFileName = "mind-diet-history.json";

    // Find or create the file in the cloud
    const fileInfo = await this.provider.findOrCreateFile(historyFileName);

    // Get local history data
    const localHistory = await this.dataService.getAllWeekHistory();

    // Download remote history if it exists
    let remoteHistory = [];
    try {
      const remoteData = await this.provider.downloadFile(fileInfo.id);
      if (remoteData && Array.isArray(remoteData.history)) {
        remoteHistory = remoteData.history;
      }
    } catch (error) {
      console.warn("Could not download history file:", error);
      // If we can't download, just upload our local copy
      await this.provider.uploadFile(fileInfo.id, { history: localHistory });
      this.lastHistorySyncTimestamp = Date.now();
      return;
    }

    if (remoteHistory.length === 0) {
      // No remote history exists yet, just upload local history
      await this.provider.uploadFile(fileInfo.id, { history: localHistory });
      this.lastHistorySyncTimestamp = Date.now();
      return;
    }

    // Merge histories by week key
    const mergedHistory = this.mergeHistoryData(localHistory, remoteHistory);

    // If there were changes, save locally and upload
    if (mergedHistory.changed) {
      // Save merged history locally
      await this.dataService.clearHistoryStore();
      for (const weekData of mergedHistory.data) {
        await this.dataService.saveWeekHistory(weekData);
      }

      // Upload merged history
      await this.provider.uploadFile(fileInfo.id, {
        history: mergedHistory.data,
      });
    }

    this.lastHistorySyncTimestamp = Date.now();
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
}

export default CloudSyncManager;
