/**
 * MIND Diet Tracker PWA
 * Copyright (c) 2024
 *
 * File Metadata Manager
 * Manages metadata for cloud storage files
 */

import { logger } from "../logger.js";
import {
  getCurrentTimestamp,
  isTimestampValid,
  compareTimestamps,
  validateSyncData,
  logSyncError,
  compareRevisionInfo,
  hasValidFileMetadata,
} from "./syncUtils.js";

/**
 * Manages file metadata for cloud synchronization
 * Handles storage, retrieval, and change detection of file metadata
 */
export class FileMetadataManager {
  constructor(dataService) {
    this.dataService = dataService;
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
      if (fileInfo.rev) {
        // Dropbox uses rev
        metadata.rev = fileInfo.rev;
        logger.info(`Storing Dropbox rev for ${fileName}: ${metadata.rev}`);
      } else {
        // For Google Drive - store all available revision indicators
        metadata.headRevisionId = fileInfo.headRevisionId;
        metadata.version = fileInfo.version;
        metadata.md5Checksum = fileInfo.md5Checksum;

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

  /**
   * Check if a cloud file has changed by comparing revision/ETag
   * @param {string} fileName - The file name to check
   * @param {string} fileId - The file ID in the cloud
   * @param {Object} provider - The cloud provider instance
   * @returns {Promise<boolean>} True if file has changed, false if unchanged
   */
  async checkIfFileChanged(fileName, fileId, provider) {
    try {
      // Skip check if no provider or not authenticated
      if (!provider || !provider.isAuthenticated) {
        return true; // Assume changed if we can't check
      }

      // Get file info from the cloud
      const fileInfo = await provider.getFileMetadata(fileId);

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

      const providerType = provider.constructor.name
        .toLowerCase()
        .includes("dropbox")
        ? "dropbox"
        : "gdrive";

      const comparison = compareRevisionInfo(
        storedMetadata,
        fileInfo,
        providerType
      );

      logger.debug(
        `File ${fileName}: ${comparison.revisionInfo}, changed: ${comparison.hasChanged}`
      );
      return comparison.hasChanged;
    } catch (error) {
      logger.warn(`Error checking if file ${fileName} changed:`, error);
      // If error occurs, assume file has changed to be safe
      return true;
    }
  }

  /**
   * Validate file metadata for a specific provider
   * @param {Object} fileMetadata - File metadata to validate
   * @param {Object} provider - The cloud provider instance
   * @returns {boolean} True if metadata is valid
   */
  validateFileMetadata(fileMetadata, provider) {
    const providerType = provider.constructor.name
      .toLowerCase()
      .includes("dropbox")
      ? "dropbox"
      : "gdrive";
    return hasValidFileMetadata(fileMetadata, providerType);
  }
}
