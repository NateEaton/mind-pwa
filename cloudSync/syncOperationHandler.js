/**
 * MIND Diet Tracker PWA
 * Copyright (c) 2024
 *
 * Sync Operation Handler
 * Handles sync operations and coordinates between services
 */

import { logger } from "../logger.js";
import { ChangeDetectionService } from "./changeDetectionService.js";
import { FileMetadataManager } from "./fileMetadataManager.js";
import { MergeCoordinator } from "./mergeCoordinator.js";
import {
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

/**
 * Handles sync operations for cloud synchronization
 * Manages the coordination between change detection, metadata, and merge operations
 */
export class SyncOperationHandler {
  constructor(dataService, provider) {
    this.dataService = dataService;
    this.provider = provider;
    this.changeDetectionService = new ChangeDetectionService({ logger });
    this.fileMetadataManager = new FileMetadataManager(dataService);
    this.mergeCoordinator = new MergeCoordinator(dataService);
    this.syncInProgress = false;
  }

  /**
   * Sync current week data
   * @returns {Promise<Object>} Result information
   */
  async syncCurrentWeek() {
    try {
      if (this.syncInProgress) {
        logger.info("Sync already in progress, skipping");
        return { skipped: true };
      }

      this.syncInProgress = true;
      const currentWeekFileName = "mind-diet-current-week.json";

      // Get local data and check for changes
      const localData = this.dataService.loadState();
      const hasLocalChanges =
        localData.metadata?.currentWeekDirty ||
        localData.metadata?.dailyTotalsDirty ||
        localData.metadata?.weeklyTotalsDirty ||
        false;
      const isFreshInstall = localData.metadata?.isFreshInstall || false;

      // Check if file exists in cloud
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

      // Create file if needed
      if (!cloudFileExists && (hasLocalChanges || !isFreshInstall)) {
        try {
          fileInfo = await this.provider.findOrCreateFile(currentWeekFileName);
          logger.info("Created new current week file:", fileInfo);
        } catch (fileError) {
          logger.error("Error creating cloud file:", fileError);
          throw new Error(`Failed to create cloud file: ${fileError.message}`);
        }
      }

      // If no file info, we can't proceed
      if (!fileInfo || !fileInfo.id) {
        logger.info("No cloud file exists or needs to be created yet");
        return {
          noChanges: true,
          uploaded: false,
          downloaded: false,
        };
      }

      // Check if file has changed
      const hasFileChanged = await this.fileMetadataManager.checkIfFileChanged(
        currentWeekFileName,
        fileInfo.id,
        this.provider
      );

      // Determine sync needs
      const syncNeeds = this.changeDetectionService.determineSyncNeeds(
        localData.metadata,
        { hasChanged: hasFileChanged, reason: "remote changes" },
        cloudFileExists
      );

      // If no changes needed, skip sync
      if (!syncNeeds.syncCurrent) {
        logger.info("No changes detected, skipping sync");
        return {
          noChanges: true,
          uploaded: false,
          downloaded: false,
        };
      }

      let remoteData = null;
      let needsUpload = false;

      // Download if needed
      if (hasFileChanged) {
        try {
          remoteData = await this.provider.downloadFile(fileInfo.id);
          logger.info("Successfully downloaded data from server");
        } catch (downloadError) {
          logger.error("Error downloading from cloud:", downloadError);
          return {
            error: downloadError.message,
            uploaded: false,
            downloaded: false,
          };
        }
      }

      // Merge data if needed
      let dataToUpload = localData;
      if (remoteData) {
        try {
          dataToUpload = await this.mergeCoordinator.mergeCurrentWeekData(
            localData,
            remoteData
          );
          logger.info("Successfully merged data");
        } catch (mergeError) {
          logger.error("Error merging data:", mergeError);
          return {
            error: mergeError.message,
            uploaded: false,
            downloaded: true,
          };
        }
      }

      // Determine if upload is needed
      const uploadDecision = this.changeDetectionService.shouldUpload({
        hasLocalChanges: syncNeeds.hasLocalChanges,
        isFreshInstall,
        cloudFileExists,
        hasDataToSync: true,
      });

      needsUpload = uploadDecision.shouldUpload;

      // Upload if needed
      if (needsUpload) {
        try {
          logger.info("Uploading data to cloud");
          const uploadResult = await this.provider.uploadFile(
            fileInfo.id,
            dataToUpload
          );
          logger.info("Successfully uploaded data to server");

          // Store file metadata after upload
          await this.fileMetadataManager.storeFileMetadata(
            currentWeekFileName,
            uploadResult
          );

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
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Sync history data
   * @returns {Promise<Array>} List of weeks that need syncing
   */
  async syncHistory() {
    try {
      const historyIndexFileName = "mind-diet-history-index.json";

      // Find or create the index file
      const fileInfo = await this.provider.findOrCreateFile(
        historyIndexFileName
      );
      logger.info("History index file info:", fileInfo);

      // Get local history data
      const localHistory = await this.dataService.getAllWeekHistory();
      const historyDirty =
        (await this.dataService.loadState()).metadata?.historyDirty || false;
      logger.info("Local history state:", {
        weekCount: localHistory.length,
        historyDirty,
      });

      // Check if index file has changed
      const hasFileChanged = await this.fileMetadataManager.checkIfFileChanged(
        historyIndexFileName,
        fileInfo.id,
        this.provider
      );
      logger.info("History index change status:", {
        hasFileChanged,
        fileId: fileInfo.id,
      });

      // If file hasn't changed and no local changes, skip
      if (!hasFileChanged && !historyDirty && localHistory.length > 0) {
        logger.info(
          "History index hasn't changed and no local changes, skipping sync entirely"
        );
        await this.fileMetadataManager.storeFileMetadata(
          historyIndexFileName,
          fileInfo
        );
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
      logger.info("Local history index:", localIndex);

      // Download remote index
      logger.info("Downloading remote index...");
      const remoteIndex = await this.provider.downloadFile(fileInfo.id);
      logger.info("Remote history index:", remoteIndex);

      // Store file metadata
      await this.fileMetadataManager.storeFileMetadata(
        historyIndexFileName,
        fileInfo
      );

      // If remote index exists, compare with local history
      if (remoteIndex && Object.keys(remoteIndex).length > 0) {
        logger.info("Remote index found, comparing with local history");

        // Combine local and remote weeks, removing duplicates
        const allWeeks = [...localIndex.weeks, ...(remoteIndex.weeks || [])];
        logger.debug("All weeks before deduplication:", allWeeks.length);

        // Deduplicate weeks, keeping the most recent version
        const uniqueWeeks = allWeeks.reduce((acc, week) => {
          const existing = acc.find(
            (w) => w.weekStartDate === week.weekStartDate
          );
          if (!existing || week.updatedAt > existing.updatedAt) {
            return [
              ...acc.filter((w) => w.weekStartDate !== week.weekStartDate),
              week,
            ];
          }
          return acc;
        }, []);
        logger.debug("Unique weeks after deduplication:", uniqueWeeks.length);

        // Update the index with deduplicated weeks
        localIndex.weeks = uniqueWeeks;
      }

      // Upload the updated index
      logger.info("Uploading to Dropbox file ID:", fileInfo.id);
      const content = localIndex;
      logger.debug("Content size:", JSON.stringify(content).length);
      await this.provider.uploadFile(fileInfo.id, content);
      logger.info("Upload successful:", historyIndexFileName);

      // Get the updated file info
      const updatedFileInfo = await this.provider.getFileMetadata(fileInfo.id);
      logger.info(
        "Full fileInfo for",
        historyIndexFileName + ":",
        updatedFileInfo
      );

      // Store the updated metadata
      await this.fileMetadataManager.storeFileMetadata(
        historyIndexFileName,
        updatedFileInfo
      );

      // Return weeks that need syncing
      const weeksToSync = [];

      // Check for weeks that need uploading (local changes)
      const weeksToUpload = localHistory
        .filter((week) => {
          // Include week if it's dirty or doesn't exist in remote
          const remoteWeek = remoteIndex?.weeks?.find(
            (w) => w.weekStartDate === week.weekStartDate
          );
          return !remoteWeek || week.metadata?.updatedAt > remoteWeek.updatedAt;
        })
        .map((week) => ({
          weekStartDate: week.weekStartDate,
          direction: "upload",
        }));

      // Check for weeks that need downloading (remote changes)
      if (remoteIndex?.weeks) {
        const weeksToDownload = remoteIndex.weeks
          .filter((remoteWeek) => {
            // Include week if it doesn't exist locally or remote is newer
            const localWeek = localHistory.find(
              (w) => w.weekStartDate === remoteWeek.weekStartDate
            );
            return (
              !localWeek ||
              remoteWeek.updatedAt > (localWeek.metadata?.updatedAt || 0)
            );
          })
          .map((week) => ({
            weekStartDate: week.weekStartDate,
            direction: "download",
          }));

        weeksToSync.push(...weeksToDownload);
      }

      weeksToSync.push(...weeksToUpload);

      logger.info("Weeks to sync:", weeksToSync);

      // Sync each week that needs syncing
      let syncSuccessCount = 0;
      for (const weekInfo of weeksToSync) {
        try {
          const success = await this.syncWeek(
            weekInfo.weekStartDate,
            weekInfo.direction
          );
          if (success) {
            syncSuccessCount++;
          }
        } catch (error) {
          logger.error(`Error syncing week ${weekInfo.weekStartDate}:`, error);
        }
      }

      logger.info(
        `Synced ${syncSuccessCount} out of ${weeksToSync.length} weeks`
      );
      return weeksToSync;
    } catch (error) {
      logger.error("Error in syncHistory:", error);
      throw error;
    }
  }

  /**
   * Sync a specific week
   * @param {string} weekStartDate - The week start date
   * @param {string} direction - The sync direction ("upload" or "download")
   * @returns {Promise<boolean>} Success status
   */
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
        const hasFileChanged =
          await this.fileMetadataManager.checkIfFileChanged(
            weekFileName,
            fileInfo.id,
            this.provider
          );

        // If uploading and remote file exists but hasn't changed,
        // compare timestamps to determine if upload is needed
        if (!hasFileChanged) {
          const storedMetadata =
            await this.fileMetadataManager.getStoredFileMetadata(weekFileName);
          if (
            storedMetadata &&
            localWeek.metadata &&
            storedMetadata.lastModified >= localWeek.metadata.updatedAt &&
            !(await this.dataService.loadState()).metadata?.historyDirty
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

        // Store metadata after upload
        await this.fileMetadataManager.storeFileMetadata(
          weekFileName,
          uploadResult || fileInfo
        );

        syncSuccessful = true;
      } else {
        // download
        // Check if local week already exists with same or newer timestamp
        const localWeek = await this.dataService.getWeekHistory(weekStartDate);
        if (localWeek) {
          // Check if we should skip download
          const hasFileChanged =
            await this.fileMetadataManager.checkIfFileChanged(
              weekFileName,
              fileInfo.id,
              this.provider
            );

          // Get the remote week's metadata to compare timestamps
          const remoteWeek = await this.provider.downloadFile(fileInfo.id);
          if (
            !remoteWeek ||
            !remoteWeek.metadata ||
            !remoteWeek.metadata.updatedAt
          ) {
            logger.warn(
              `Remote week ${weekStartDate} has no metadata, proceeding with download`
            );
          } else if (
            !hasFileChanged &&
            localWeek.metadata &&
            localWeek.metadata.updatedAt >= remoteWeek.metadata.updatedAt
          ) {
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
        await this.fileMetadataManager.storeFileMetadata(
          weekFileName,
          fileInfo
        );

        syncSuccessful = true;
      }

      return syncSuccessful;
    } catch (error) {
      logger.error(`Error syncing week ${weekStartDate}:`, error);
      return false;
    }
  }
}
