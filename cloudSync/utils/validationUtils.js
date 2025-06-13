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

import logger from "../../logger.js";

/**
 * CloudSync Validation Utilities
 * Extracted from CloudSyncManager to centralize validation logic
 */
export const ValidationUtils = {
  /**
   * Validate sync data structure and content
   * Extracted from validateData method in CloudSyncManager
   * @param {Object} data - The data to validate
   * @param {string} type - Type of data ("current" or "history")
   * @returns {boolean} True if data is valid
   */
  validateSyncData(data, type = "current") {
    try {
      if (!data || typeof data !== "object") {
        logger.warn(`Invalid ${type} data: not an object`);
        return false;
      }

      if (type === "current") {
        // Validate current week data structure
        if (!data.currentDayDate || !data.currentWeekStartDate) {
          logger.warn("Invalid current data: missing date fields");
          return false;
        }

        // Validate required data structures exist
        if (!data.dailyCounts || !data.weeklyCounts) {
          logger.warn("Invalid current data: missing count structures");
          return false;
        }

        // Check if data structures are objects
        if (
          typeof data.dailyCounts !== "object" ||
          typeof data.weeklyCounts !== "object"
        ) {
          logger.warn("Invalid current data: count structures not objects");
          return false;
        }
      } else if (type === "history") {
        // Validate history data structure
        if (!Array.isArray(data)) {
          logger.warn("Invalid history data: not an array");
          return false;
        }

        // Validate each history entry
        for (const week of data) {
          if (!week.weekStartDate || !week.totals) {
            logger.warn("Invalid history entry: missing required fields");
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      logger.error(`Error validating ${type} data:`, error);
      return false;
    }
  },

  /**
   * Check if data has valid metadata structure
   * @param {Object} data - Data object to check
   * @returns {boolean} True if metadata is valid
   */
  hasValidMetadata(data) {
    if (!data || typeof data !== "object") return false;

    const metadata = data.metadata;
    if (!metadata || typeof metadata !== "object") return false;

    // Check for essential metadata fields
    return (
      typeof metadata.deviceId !== "undefined" &&
      typeof metadata.weekStartDay !== "undefined"
    );
  },

  /**
   * Check if data contains actual sync-worthy content
   * @param {Object} data - Data to check for content
   * @returns {boolean} True if data has content worth syncing
   */
  hasDataToSync(data) {
    if (!data || typeof data !== "object") return false;

    // Check daily counts
    const dailyCounts = data.dailyCounts || {};
    const hasDailyData = Object.keys(dailyCounts).length > 0;

    // Check weekly counts
    const weeklyCounts = data.weeklyCounts || {};
    const hasWeeklyData = Object.keys(weeklyCounts).length > 0;

    // Check if any daily data has actual values
    const hasNonEmptyDaily = Object.values(dailyCounts).some(
      (day) => day && Object.keys(day).length > 0
    );

    return hasWeeklyData || hasNonEmptyDaily;
  },

  /**
   * Check if remote data has meaningful content
   * Used to determine if cloud data should take precedence in fresh installs
   * @param {Object} remoteData - Remote data to check
   * @returns {boolean} True if remote data has meaningful content
   */
  remoteHasData(remoteData) {
    if (!remoteData || typeof remoteData !== "object") return false;

    // Check weekly counts
    const hasWeeklyCounts =
      remoteData.weeklyCounts &&
      Object.keys(remoteData.weeklyCounts).length > 0;

    // Check daily counts for non-empty days
    const hasNonEmptyDailyCounts =
      remoteData.dailyCounts &&
      Object.values(remoteData.dailyCounts).some(
        (day) => day && Object.keys(day).length > 0
      );

    return hasWeeklyCounts || hasNonEmptyDailyCounts;
  },

  /**
   * Determine if provider is Dropbox based on constructor name
   * @param {Object} provider - Cloud provider instance
   * @returns {boolean} True if provider is Dropbox
   */
  isDropboxProvider(provider) {
    if (!provider) return false;
    return provider.constructor.name.includes("Dropbox");
  },

  /**
   * Determine if provider is Google Drive based on constructor name
   * @param {Object} provider - Cloud provider instance
   * @returns {boolean} True if provider is Google Drive
   */
  isGoogleDriveProvider(provider) {
    if (!provider) return false;
    return !this.isDropboxProvider(provider); // Assume non-Dropbox is Google Drive
  },

  /**
   * Validate that local changes exist based on dirty flags
   * @param {Object} metadata - Metadata object to check
   * @returns {boolean} True if there are local changes requiring sync
   */
  hasLocalChanges(metadata) {
    if (!metadata || typeof metadata !== "object") return false;

    return !!(
      metadata.currentWeekDirty ||
      metadata.historyDirty ||
      metadata.dailyTotalsDirty ||
      metadata.weeklyTotalsDirty
    );
  },

  /**
   * Check if this is a fresh install scenario
   * @param {Object} metadata - Metadata object to check
   * @returns {boolean} True if this is a fresh install
   */
  isFreshInstall(metadata) {
    if (!metadata || typeof metadata !== "object") return false;
    return !!metadata.isFreshInstall;
  },

  /**
   * Validate file metadata for change detection
   * @param {Object} fileMetadata - File metadata from cloud provider
   * @param {string} providerType - Type of provider ("dropbox" or "gdrive")
   * @returns {boolean} True if metadata has required revision info
   */
  hasValidFileMetadata(fileMetadata, providerType) {
    if (!fileMetadata || typeof fileMetadata !== "object") return false;

    if (providerType === "dropbox") {
      return !!fileMetadata.rev;
    } else {
      // Google Drive - check for any revision indicator
      return !!(
        fileMetadata.headRevisionId ||
        fileMetadata.version ||
        fileMetadata.md5Checksum
      );
    }
  },

  /**
   * Validate sync operation results
   * @param {Object} result - Sync operation result object
   * @returns {boolean} True if result is valid
   */
  isValidSyncResult(result) {
    if (!result || typeof result !== "object") return false;

    // Check for expected result structure
    const hasValidFlags =
      typeof result.uploaded === "boolean" &&
      typeof result.downloaded === "boolean";

    // Allow for error results
    const hasError = typeof result.error === "string";

    return hasValidFlags || hasError;
  },

  /**
   * Check if week start dates indicate different weeks
   * @param {string} weekStartDate1 - First week start date (YYYY-MM-DD)
   * @param {string} weekStartDate2 - Second week start date (YYYY-MM-DD)
   * @returns {boolean} True if dates represent different weeks
   */
  isDifferentWeek(weekStartDate1, weekStartDate2) {
    if (!weekStartDate1 || !weekStartDate2) return true;
    return weekStartDate1 !== weekStartDate2;
  },

  /**
   * Validate that date strings are in correct format
   * @param {string} dateStr - Date string to validate (YYYY-MM-DD)
   * @returns {boolean} True if date string is valid
   */
  isValidDateString(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return false;

    // Check format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;

    // Check if it's a valid date
    const date = new Date(dateStr + "T00:00:00");
    return !isNaN(date.getTime());
  },
};

export default ValidationUtils;
