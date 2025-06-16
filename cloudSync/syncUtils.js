/**
 * MIND Diet Tracker PWA
 * Copyright (c) 2024
 *
 * Utility functions for cloud sync operations
 */

import { logger } from "../logger.js";

// Timestamp Utilities
export function getCurrentTimestamp() {
  return new Date().toISOString();
}

export function isTimestampValid(timestamp) {
  try {
    const date = new Date(timestamp);
    return !isNaN(date.getTime());
  } catch (e) {
    return false;
  }
}

export function compareTimestamps(timestamp1, timestamp2) {
  const date1 = new Date(timestamp1);
  const date2 = new Date(timestamp2);
  return date1.getTime() - date2.getTime();
}

// Change Detection Utilities
export function analyzeDirtyFlags(metadata) {
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

export function shouldSyncCurrent(metadata, alwaysCheckCloudChanges = true) {
  const flags = analyzeDirtyFlags(metadata);

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

export function shouldSyncHistory(metadata, alwaysCheckCloudChanges = true) {
  const flags = analyzeDirtyFlags(metadata);

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

export function compareRevisionInfo(
  localMetadata,
  remoteMetadata,
  providerType
) {
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
}

export function extractRevisionInfo(fileInfo, providerType) {
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
}

export function determineSyncNeeds(
  localFlags,
  remoteChanges,
  alwaysCheck = true
) {
  const syncCurrent = shouldSyncCurrent({ ...localFlags }, alwaysCheck);
  const syncHistory = shouldSyncHistory({ ...localFlags }, alwaysCheck);

  return {
    syncCurrent,
    syncHistory,
    remoteChanges,
    localFlags,
  };
}

export function buildLocalChangeReason(flags) {
  const reasons = [];

  if (flags.dailyTotalsDirty) reasons.push("daily totals modified");
  if (flags.weeklyTotalsDirty) reasons.push("weekly totals modified");
  if (flags.historyDirty) reasons.push("history modified");
  if (flags.dateResetPerformed) {
    reasons.push(`${flags.dateResetType.toLowerCase()} reset performed`);
  }

  return reasons.join(", ") || "no local changes";
}

export function shouldUpload(options) {
  const {
    localFlags,
    remoteChanges,
    alwaysCheck = true,
    forceUpload = false,
  } = options;

  if (forceUpload) return true;

  const syncNeeds = determineSyncNeeds(localFlags, remoteChanges, alwaysCheck);
  return syncNeeds.syncCurrent || syncNeeds.syncHistory;
}

export function logSyncDecision(syncNeeds, metadata) {
  const localReason = buildLocalChangeReason(syncNeeds.localFlags);
  const remoteReason = syncNeeds.remoteChanges.hasChanged
    ? `remote file changed (${syncNeeds.remoteChanges.reason})`
    : "no remote changes";

  logger.info("Sync decision:", {
    syncCurrent: syncNeeds.syncCurrent,
    syncHistory: syncNeeds.syncHistory,
    localReason,
    remoteReason,
    metadata: {
      lastSync: metadata?.lastSync,
      lastModified: metadata?.lastModified,
    },
  });
}

// Validation Utilities
export function validateSyncData(data) {
  if (!data || typeof data !== "object") {
    return false;
  }

  // Check required fields
  const requiredFields = ["timestamp", "version", "data"];
  for (const field of requiredFields) {
    if (!(field in data)) {
      return false;
    }
  }

  // Validate timestamp
  if (!isTimestampValid(data.timestamp)) {
    return false;
  }

  // Validate version
  if (
    typeof data.version !== "string" ||
    !data.version.match(/^\d+\.\d+\.\d+$/)
  ) {
    return false;
  }

  // Validate data structure
  if (!Array.isArray(data.data)) {
    return false;
  }

  return true;
}

export function validateMergeResult(result) {
  if (!result || typeof result !== "object") {
    return false;
  }

  // Check required fields
  const requiredFields = ["success", "data", "conflicts"];
  for (const field of requiredFields) {
    if (!(field in result)) {
      return false;
    }
  }

  // Validate success flag
  if (typeof result.success !== "boolean") {
    return false;
  }

  // Validate data
  if (!Array.isArray(result.data)) {
    return false;
  }

  // Validate conflicts
  if (!Array.isArray(result.conflicts)) {
    return false;
  }

  return true;
}

export function hasValidFileMetadata(fileMetadata, providerType) {
  if (!fileMetadata) return false;

  if (providerType === "dropbox") {
    return typeof fileMetadata.rev === "string" && fileMetadata.rev.length > 0;
  } else {
    // Google Drive
    return (
      typeof fileMetadata.headRevisionId === "string" &&
      fileMetadata.headRevisionId.length > 0 &&
      typeof fileMetadata.version === "string" &&
      fileMetadata.version.length > 0
    );
  }
}

// Sync Utilities
export function generateSyncId() {
  return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function isNetworkAvailable() {
  return navigator.onLine;
}

export function getSyncStatus() {
  return {
    lastSync: localStorage.getItem("lastSyncTimestamp"),
    isSyncing: localStorage.getItem("isSyncing") === "true",
    hasPendingChanges: localStorage.getItem("hasPendingChanges") === "true",
  };
}

export function updateSyncStatus(status) {
  if (status.lastSync) {
    localStorage.setItem("lastSyncTimestamp", status.lastSync);
  }
  if (typeof status.isSyncing === "boolean") {
    localStorage.setItem("isSyncing", status.isSyncing.toString());
  }
  if (typeof status.hasPendingChanges === "boolean") {
    localStorage.setItem(
      "hasPendingChanges",
      status.hasPendingChanges.toString()
    );
  }
}

export function clearSyncStatus() {
  localStorage.removeItem("lastSyncTimestamp");
  localStorage.removeItem("isSyncing");
  localStorage.removeItem("hasPendingChanges");
}

export function getSyncError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    };
  }
  return {
    message: String(error),
    timestamp: new Date().toISOString(),
  };
}

export function logSyncError(error, context = {}) {
  const errorInfo = getSyncError(error);
  console.error("Sync Error:", {
    ...errorInfo,
    context,
  });
  // Could add error reporting service integration here
}

export function retryWithBackoff(
  operation,
  maxRetries = 3,
  initialDelay = 1000
) {
  return new Promise((resolve, reject) => {
    let retries = 0;

    function attempt() {
      operation()
        .then(resolve)
        .catch((error) => {
          retries++;
          if (retries >= maxRetries) {
            reject(error);
            return;
          }

          const delay = initialDelay * Math.pow(2, retries - 1);
          setTimeout(attempt, delay);
        });
    }

    attempt();
  });
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
