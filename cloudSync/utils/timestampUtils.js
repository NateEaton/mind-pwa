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
 * CloudSync Timestamp Utilities
 * Extracted from CloudSyncManager to centralize timestamp-related logic
 */
export const TimestampUtils = {
  /**
   * Compare two timestamps to determine which is newer
   * @param {number} timestamp1 - First timestamp to compare
   * @param {number} timestamp2 - Second timestamp to compare
   * @returns {boolean} True if timestamp1 is newer than timestamp2
   */
  isNewerTimestamp(timestamp1, timestamp2) {
    const ts1 = timestamp1 || 0;
    const ts2 = timestamp2 || 0;
    return ts1 > ts2;
  },

  /**
   * Get effective timestamp from metadata with fallback
   * Handles the logic where if no specific timestamp exists, falls back to general lastModified
   * @param {Object} metadata - Metadata object containing timestamps
   * @param {string} timestampField - Field name for specific timestamp (e.g., 'dailyTotalsUpdatedAt')
   * @param {number} fallbackTimestamp - Fallback timestamp (usually lastModified)
   * @returns {number} Effective timestamp
   */
  getEffectiveTimestamp(metadata, timestampField, fallbackTimestamp = 0) {
    if (!metadata) return fallbackTimestamp || 0;
    return metadata[timestampField] || fallbackTimestamp || 0;
  },

  /**
   * Create timestamp metadata object for sync operations
   * @param {number} dailyUpdated - Timestamp for daily totals update
   * @param {number} weeklyUpdated - Timestamp for weekly totals update
   * @param {number} baseTimestamp - Base timestamp (usually Date.now())
   * @returns {Object} Metadata object with timestamp fields
   */
  createTimestampMetadata(
    dailyUpdated,
    weeklyUpdated,
    baseTimestamp = Date.now()
  ) {
    return {
      lastModified: baseTimestamp,
      dailyTotalsUpdatedAt: dailyUpdated || baseTimestamp,
      weeklyTotalsUpdatedAt: weeklyUpdated || baseTimestamp,
    };
  },

  /**
   * Extract timestamps from local data for merge comparison
   * Handles the logic where local timestamps default to 0 if not present (NOT to lastModified)
   * @param {Object} localData - Local state data
   * @returns {Object} Object containing extracted timestamps
   */
  extractLocalTimestamps(localData) {
    const metadata = localData.metadata || {};

    return {
      dailyUpdatedAt: metadata.dailyTotalsUpdatedAt || 0,
      weeklyUpdatedAt: metadata.weeklyTotalsUpdatedAt || 0,
      dailyResetTimestamp: metadata.dailyResetTimestamp || 0,
      weeklyResetTimestamp: metadata.weeklyResetTimestamp || 0,
    };
  },

  /**
   * Extract timestamps from remote data for merge comparison
   * Handles the logic where remote timestamps fall back to lastModified
   * @param {Object} remoteData - Remote state data
   * @returns {Object} Object containing extracted timestamps
   */
  extractRemoteTimestamps(remoteData) {
    const metadata = remoteData.metadata || {};
    const fallback = remoteData.lastModified || 0;

    return {
      dailyUpdatedAt: metadata.dailyTotalsUpdatedAt || fallback,
      weeklyUpdatedAt: metadata.weeklyTotalsUpdatedAt || fallback,
    };
  },

  /**
   * Check if a date reset was performed based on metadata
   * @param {Object} metadata - Local metadata object
   * @param {string} resetType - Type of reset to check ('DAILY' or 'WEEKLY')
   * @returns {boolean} True if the specified reset was performed
   */
  wasResetPerformed(metadata, resetType) {
    if (!metadata) return false;

    const resetTimestamp =
      resetType === "WEEKLY"
        ? metadata.weeklyResetTimestamp
        : metadata.dailyResetTimestamp;

    const resetTypeMatches =
      resetType === "WEEKLY"
        ? metadata.dateResetType === "WEEKLY"
        : metadata.dateResetType === "DAILY" ||
          metadata.dateResetType === "WEEKLY"; // Weekly reset also resets daily

    return resetTimestamp > 0 && resetTypeMatches;
  },

  /**
   * Check if a reset timestamp is newer than a remote update timestamp
   * @param {number} resetTimestamp - Local reset timestamp
   * @param {number} remoteUpdateTimestamp - Remote update timestamp
   * @returns {boolean} True if reset is newer than remote update
   */
  isResetNewerThanRemote(resetTimestamp, remoteUpdateTimestamp) {
    return resetTimestamp > 0 && resetTimestamp > (remoteUpdateTimestamp || 0);
  },

  /**
   * Determine which timestamp is more recent between two dates
   * Extracted from getMostRecentDate method in CloudSyncManager
   * @param {string|Date} date1 - First date (string or Date object)
   * @param {string|Date} date2 - Second date (string or Date object)
   * @returns {string|Date|null} The more recent date, or null if both are invalid
   */
  getMostRecentDate(date1, date2) {
    try {
      if (!date1 && !date2) return null;
      if (!date1) return date2;
      if (!date2) return date1;

      const d1 = typeof date1 === "string" ? new Date(date1) : date1;
      const d2 = typeof date2 === "string" ? new Date(date2) : date2;

      if (isNaN(d1.getTime()) && isNaN(d2.getTime())) return null;
      if (isNaN(d1.getTime())) return date2;
      if (isNaN(d2.getTime())) return date1;

      return d1 >= d2 ? date1 : date2;
    } catch (error) {
      logger.warn("Error comparing dates:", error);
      return null;
    }
  },

  /**
   * Check if date reset is needed based on system date vs remote date
   * @param {string} localDateStr - Local/system date string (YYYY-MM-DD)
   * @param {string} remoteDateStr - Remote date string (YYYY-MM-DD)
   * @returns {boolean} True if date reset is needed
   */
  needsDateReset(localDateStr, remoteDateStr) {
    if (!localDateStr || !remoteDateStr) return false;
    return localDateStr !== remoteDateStr;
  },

  /**
   * Create fresh install timestamp metadata
   * Sets timestamps to old values to ensure cloud data wins initially
   * @param {number} deviceId - Device ID from local metadata
   * @param {string} weekStartDay - Week start day preference
   * @returns {Object} Metadata object for fresh install
   */
  createFreshInstallMetadata(deviceId, weekStartDay) {
    const oldTimestamp = new Date("2020-01-01").getTime(); // Very old timestamp

    return {
      deviceId,
      weekStartDay,
      isFreshInstall: false, // Will be set false after first merge
      dailyTotalsUpdatedAt: oldTimestamp,
      weeklyTotalsUpdatedAt: oldTimestamp,
      lastModified: Date.now(),
      dailyTotalsDirty: false,
      weeklyTotalsDirty: false,
      currentWeekDirty: false,
    };
  },

  /**
   * Update metadata timestamps after successful merge
   * @param {Object} existingMetadata - Existing metadata object
   * @param {Object} timestamps - Object containing new timestamps
   * @param {number} timestamps.dailyUpdated - New daily updated timestamp
   * @param {number} timestamps.weeklyUpdated - New weekly updated timestamp
   * @returns {Object} Updated metadata object
   */
  updateMetadataTimestamps(existingMetadata, timestamps) {
    return {
      ...existingMetadata,
      lastModified: Date.now(),
      dailyTotalsUpdatedAt: timestamps.dailyUpdated,
      weeklyTotalsUpdatedAt: timestamps.weeklyUpdated,
      dailyTotalsDirty: false,
      weeklyTotalsDirty: false,
      currentWeekDirty: false,
    };
  },
};

export default TimestampUtils;
