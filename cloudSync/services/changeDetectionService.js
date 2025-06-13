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
 * Change Detection Service
 * Handles all aspects of change detection for cloud sync operations
 */
export class ChangeDetectionService {
  constructor(dependencies) {
    this.logger = dependencies.logger || logger;
  }

  /**
   * Analyze dirty flags in metadata to determine what needs syncing
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
  }

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
  }

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
  }

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
        local: this.buildChangeReason(localFlags),
        remote: remoteChanges ? remoteChanges.reason : "not checked",
      },
    };
  }

  /**
   * Build descriptive reason for local changes
   * @param {Object} flags - Dirty flags object
   * @returns {string} Human-readable reason for local changes
   */
  buildChangeReason(flags) {
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
  }

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
    const { hasLocalChanges, isFreshInstall, cloudFileExists, hasDataToSync } =
      options;

    // Always upload if:
    // 1. We have local changes
    // 2. This is a fresh install with data to sync
    // 3. No cloud file exists but we have data to sync
    const shouldUpload =
      hasLocalChanges ||
      (isFreshInstall && hasDataToSync) ||
      (!cloudFileExists && hasDataToSync);

    return {
      shouldUpload,
      reason: this.buildUploadReason(options),
    };
  }

  /**
   * Build descriptive reason for upload decision
   * @param {Object} options - Upload decision options
   * @returns {string} Human-readable reason for upload decision
   */
  buildUploadReason(options) {
    const { hasLocalChanges, isFreshInstall, cloudFileExists, hasDataToSync } =
      options;

    if (hasLocalChanges) return "local changes detected";
    if (isFreshInstall && hasDataToSync) return "fresh install with data";
    if (!cloudFileExists && hasDataToSync) return "no cloud file exists";
    return "no upload needed";
  }

  /**
   * Log sync decision details
   * @param {Object} syncNeeds - Sync needs assessment
   * @param {Object} metadata - Current metadata
   */
  logSyncDecision(syncNeeds, metadata) {
    this.logger.info("Sync decision:", {
      syncCurrent: syncNeeds.syncCurrent,
      syncHistory: syncNeeds.syncHistory,
      hasLocalChanges: syncNeeds.hasLocalChanges,
      hasRemoteChanges: syncNeeds.hasRemoteChanges,
      reasons: syncNeeds.reason,
      metadata: {
        currentWeekDirty: metadata?.currentWeekDirty,
        historyDirty: metadata?.historyDirty,
        dailyTotalsDirty: metadata?.dailyTotalsDirty,
        weeklyTotalsDirty: metadata?.weeklyTotalsDirty,
        dateResetPerformed: metadata?.dateResetPerformed,
        dateResetType: metadata?.dateResetType,
      },
    });
  }
}
