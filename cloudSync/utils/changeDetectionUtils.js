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
 * CloudSync Change Detection Utilities
 * Extracted from CloudSyncManager to centralize change detection logic
 */
export const ChangeDetectionUtils = {
  /**
   * Analyze dirty flags in metadata to determine what needs syncing
   * Extracted from determineWhatToSync method in CloudSyncManager
   * @param {Object} metadata - Metadata object containing dirty flags
   * @returns {Object} Object describing dirty flag state
   */
  analyzeDirtyFlags(metadata) {
    if (!metadata || typeof metadata !== "object") {
      return {
        dailyTotalsDirty: false,
        weeklyTotalsDirty: false,
        currentWeekDirty: false,
        historyDirty: false,
        dateResetPerformed: false,
        dateResetType: null,
      };
    }

    // Check dirty flags - use both specific flags and the legacy flag
    const dailyTotalsDirty = metadata.dailyTotalsDirty || false;
    const weeklyTotalsDirty = metadata.weeklyTotalsDirty || false;
    const currentWeekDirty =
      metadata.currentWeekDirty || dailyTotalsDirty || weeklyTotalsDirty;

    const historyDirty = metadata.historyDirty || false;

    // Check if reset was performed
    const dateResetPerformed = metadata.dateResetPerformed || false;
    const dateResetType = metadata.dateResetType || null;

    return {
      dailyTotalsDirty,
      weeklyTotalsDirty,
      currentWeekDirty,
      historyDirty,
      dateResetPerformed,
      dateResetType,
    };
  },

  /**
   * Determine if current week data should be synced
   * @param {Object} metadata - Metadata object
   * @param {boolean} alwaysCheckCloudChanges - Whether to always check for cloud changes
   * @returns {boolean} True if current week should be synced
   */
  shouldSyncCurrent(metadata, alwaysCheckCloudChanges = true) {
    const flags = this.analyzeDirtyFlags(metadata);

    // Sync current week if:
    // 1. Any count is dirty
    // 2. Date reset occurred
    // 3. We're checking for cloud changes
    return (
      flags.currentWeekDirty ||
      flags.dateResetPerformed ||
      alwaysCheckCloudChanges
    );
  },

  /**
   * Determine if history data should be synced
   * @param {Object} metadata - Metadata object
   * @param {boolean} alwaysCheckCloudChanges - Whether to always check for cloud changes
   * @returns {boolean} True if history should be synced
   */
  shouldSyncHistory(metadata, alwaysCheckCloudChanges = true) {
    const flags = this.analyzeDirtyFlags(metadata);

    // Sync history if:
    // 1. It's dirty
    // 2. Weekly reset occurred
    // 3. We're checking for cloud changes
    return (
      flags.historyDirty ||
      (flags.dateResetPerformed && flags.dateResetType === "WEEKLY") ||
      alwaysCheckCloudChanges
    );
  },

  /**
   * Compare revision information to detect file changes
   * @param {Object} localMetadata - Locally stored file metadata
   * @param {Object} remoteMetadata - Remote file metadata from cloud
   * @param {string} providerType - Provider type ("dropbox" or "gdrive")
   * @returns {Object} Comparison result with change detection
   */
  compareRevisionInfo(localMetadata, remoteMetadata, providerType) {
    if (!localMetadata || !remoteMetadata) {
      return {
        hasChanged: true,
        reason: "missing metadata",
        revisionInfo: "metadata unavailable",
      };
    }

    let hasChanged = false;
    let revisionInfo = "";

    if (providerType === "dropbox") {
      // Dropbox uses rev property
      hasChanged = remoteMetadata.rev !== localMetadata.rev;
      revisionInfo = `rev ${remoteMetadata.rev} vs stored ${localMetadata.rev}`;
    } else {
      // Google Drive - try different ways to detect changes in priority order
      if (remoteMetadata.headRevisionId && localMetadata.headRevisionId) {
        // Best - compare head revision IDs
        hasChanged =
          remoteMetadata.headRevisionId !== localMetadata.headRevisionId;
        revisionInfo = `headRevisionId ${remoteMetadata.headRevisionId} vs stored ${localMetadata.headRevisionId}`;
      } else if (remoteMetadata.version && localMetadata.version) {
        // Next best - compare version numbers
        hasChanged = remoteMetadata.version !== localMetadata.version;
        revisionInfo = `version ${remoteMetadata.version} vs stored ${localMetadata.version}`;
      } else if (remoteMetadata.md5Checksum && localMetadata.md5Checksum) {
        // Fallback - compare content checksums
        hasChanged = remoteMetadata.md5Checksum !== localMetadata.md5Checksum;
        revisionInfo = `md5Checksum ${remoteMetadata.md5Checksum} vs stored ${localMetadata.md5Checksum}`;
      } else {
        // If no reliable indicators, assume changed
        hasChanged = true;
        revisionInfo = "no reliable revision indicators available";
      }
    }

    return {
      hasChanged,
      reason: hasChanged ? "revision mismatch" : "no change detected",
      revisionInfo,
    };
  },

  /**
   * Extract revision information from file info based on provider type
   * @param {Object} fileInfo - File info returned from cloud provider
   * @param {string} providerType - Provider type ("dropbox" or "gdrive")
   * @returns {Object} Extracted revision information
   */
  extractRevisionInfo(fileInfo, providerType) {
    if (!fileInfo) return {};

    const extracted = {
      fileName: fileInfo.name || fileInfo.fileName,
      lastChecked: Date.now(),
    };

    if (providerType === "dropbox") {
      // Dropbox uses rev
      const rev =
        fileInfo.rev ||
        fileInfo.result?.rev ||
        (fileInfo[".tag"] === "file" && fileInfo.rev);

      extracted.rev = rev;
    } else {
      // Google Drive - store all available revision indicators
      extracted.headRevisionId =
        fileInfo.headRevisionId || fileInfo.result?.headRevisionId;
      extracted.version = fileInfo.version || fileInfo.result?.version;
      extracted.md5Checksum =
        fileInfo.md5Checksum || fileInfo.result?.md5Checksum;
    }

    return extracted;
  },

  /**
   * Determine sync needs based on local and remote analysis
   * @param {Object} localFlags - Local dirty flags analysis
   * @param {Object} remoteChanges - Remote file change analysis
   * @param {boolean} alwaysCheck - Whether to always check for changes
   * @returns {Object} Combined sync needs assessment
   */
  determineSyncNeeds(localFlags, remoteChanges, alwaysCheck = true) {
    const syncCurrent = this.shouldSyncCurrent({ ...localFlags }, alwaysCheck);
    const syncHistory = this.shouldSyncHistory({ ...localFlags }, alwaysCheck);

    return {
      syncCurrent,
      syncHistory,
      hasLocalChanges: !!(
        localFlags.currentWeekDirty ||
        localFlags.historyDirty ||
        localFlags.dailyTotalsDirty ||
        localFlags.weeklyTotalsDirty
      ),
      hasRemoteChanges: remoteChanges && remoteChanges.hasChanged,
      reason: {
        local: this.buildLocalChangeReason(localFlags),
        remote: remoteChanges ? remoteChanges.reason : "not checked",
      },
    };
  },

  /**
   * Build descriptive reason for local changes
   * @param {Object} flags - Dirty flags object
   * @returns {string} Human-readable reason for local changes
   */
  buildLocalChangeReason(flags) {
    const reasons = [];

    if (flags.dailyTotalsDirty) reasons.push("daily totals changed");
    if (flags.weeklyTotalsDirty) reasons.push("weekly totals changed");
    if (flags.currentWeekDirty) reasons.push("current week data changed");
    if (flags.historyDirty) reasons.push("history data changed");
    if (flags.dateResetPerformed) {
      reasons.push(
        `${flags.dateResetType?.toLowerCase() || "date"} reset performed`
      );
    }

    return reasons.length > 0 ? reasons.join(", ") : "no local changes";
  },

  /**
   * Check if upload is needed based on various conditions
   * @param {Object} options - Options object
   * @param {boolean} options.hasLocalChanges - Whether there are local changes
   * @param {boolean} options.isFreshInstall - Whether this is a fresh install
   * @param {boolean} options.cloudFileExists - Whether cloud file exists
   * @param {boolean} options.hasDataToSync - Whether data contains content
   * @returns {Object} Upload decision and reasoning
   */
  shouldUpload(options) {
    const {
      hasLocalChanges = false,
      isFreshInstall = false,
      cloudFileExists = false,
      hasDataToSync = false,
    } = options;

    // For fresh installs, be cautious about uploading if cloud data exists
    if (isFreshInstall && cloudFileExists) {
      return {
        shouldUpload: false,
        reason: "fresh install with existing cloud data - skipping upload",
        freshInstallSkipped: true,
      };
    }

    // Normal upload conditions
    const needsUpload = hasLocalChanges || hasDataToSync;

    return {
      shouldUpload: needsUpload,
      reason: needsUpload
        ? hasLocalChanges
          ? "local changes detected"
          : "data content requires sync"
        : "no upload needed",
      freshInstallSkipped: false,
    };
  },

  /**
   * Log sync decision for debugging
   * @param {Object} syncNeeds - Sync needs object from determineSyncNeeds
   * @param {Object} metadata - Original metadata object
   */
  logSyncDecision(syncNeeds, metadata) {
    logger.info("Sync determination:", {
      syncCurrent: syncNeeds.syncCurrent,
      syncHistory: syncNeeds.syncHistory,
      hasLocalChanges: syncNeeds.hasLocalChanges,
      hasRemoteChanges: syncNeeds.hasRemoteChanges,
      localReason: syncNeeds.reason.local,
      remoteReason: syncNeeds.reason.remote,
      metadata: metadata || {},
    });
  },
};

export default ChangeDetectionUtils;
