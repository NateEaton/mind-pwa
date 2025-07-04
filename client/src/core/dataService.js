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

/**
 * MIND Diet Tracker Data Service
 *
 * A dedicated module that handles all data operations including:
 * - IndexedDB operations for history data
 * - LocalStorage operations for current state
 * - Date utilities
 * - Import/Export functionality
 * - User preferences
 * - Data structure normalization
 */

import logger from "./logger.js";
import dateUtils from "../utils/dateUtils.js";

// Constants
const DB_NAME = "MindDietTrackerDB";
const DB_VERSION = 2;
const STORES = {
  HISTORY: "weeklyHistory",
  PREFERENCES: "userPreferences",
  SYNC_LOG: "syncLog",
};
const LOCAL_STORAGE_KEY = "mindTrackerState";

// Schema version and structure
// In dataService.js - Update the SCHEMA object with correct structure
// Find this section near the top of the file

// Schema version and structure
const SCHEMA = {
  VERSION: 3, // Increment schema version due to significant model change
  CURRENT_STATE: {
    currentDayDate: String, // YYYY-MM-DD
    currentWeekStartDate: String, // YYYY-MM-DD (Sunday or Monday based on preference)
    selectedTrackerDate: String, // YYYY-MM-DD, the date being viewed/edited in tracker
    dailyCounts: Object, // { "YYYY-MM-DD": { foodGroupId: count, ... }, ... }
    weeklyCounts: Object, // { foodGroupId: totalCountForWeek, ... }
    lastModified: Number, // Timestamp
    metadata: {
      schemaVersion: Number,
      deviceId: String,
      currentWeekDirty: Boolean, // Legacy field for backward compatibility
      historyDirty: Boolean,
      dateResetPerformed: Boolean,
      dateResetType: String, // "DAILY" or "WEEKLY"
      dateResetTimestamp: Number,
      weekStartDay: String, // "Sunday" or "Monday"
      dailyTotalsUpdatedAt: Number,
      dailyTotalsDirty: Boolean,
      dailyResetTimestamp: Number,
      weeklyTotalsUpdatedAt: Number,
      weeklyTotalsDirty: Boolean,
      weeklyResetTimestamp: Number,
      previousWeekStartDate: String,
      // For sync after reset
      pendingDateReset: Boolean,
      remoteDateWas: String,
      // Fresh install detection
      isFreshInstall: Boolean,
    },
  },
  HISTORY: {
    id: String, // uuid
    weekStartDate: String, // Primary key
    weekEndDate: String,
    dailyBreakdown: Object, // { "YYYY-MM-DD": { foodGroupId: count, ... }, ... } for the 7 days of this week
    totals: Object, // Summed weekly totals { foodGroupId: totalCount, ... }
    targets: Object,
    metadata: {
      createdAt: Number, // Timestamp
      updatedAt: Number, // Timestamp
      schemaVersion: Number,
      deviceInfo: String,
      syncStatus: String, // 'local', 'synced', 'conflict', 'imported'
      mergedAfterReset: Boolean,
      weekStartDay: String, // "Sunday" or "Monday" at the time of archival
    },
  },
  PREFERENCES: {
    id: String, // Preference key
    value: Object, // Preference value
    metadata: {
      createdAt: Number,
      updatedAt: Number,
    },
  },
};

// Private module state
let _db = null;
let _isInitialized = false;
let _deviceId = null;

/**
 * Generate a UUID for record identification
 * @returns {string} A UUID v4 string
 */
function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get device information for metadata
 * @returns {string} JSON string of device information
 */
function getDeviceInfo() {
  try {
    const info = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      devicePixelRatio: window.devicePixelRatio || 1,
    };
    return JSON.stringify(info);
  } catch (error) {
    logger.warn("Could not get complete device info:", error);
    return JSON.stringify({ userAgent: navigator.userAgent || "unknown" });
  }
}

/**
 * Get or create a unique device ID
 * @returns {string} Device ID
 */
function getDeviceId() {
  if (_deviceId) return _deviceId;

  let deviceId = localStorage.getItem("mindTrackerDeviceId");
  if (!deviceId) {
    deviceId = generateUUID();
    localStorage.setItem("mindTrackerDeviceId", deviceId);
  }

  _deviceId = deviceId;
  return deviceId;
}

// getWeekStartDate moved to dateUtils.js - proxy function for compatibility
function getWeekStartDate(d, startDayPref = "Sunday") {
  return dateUtils.getWeekStartDate(d, startDayPref);
}

// getWeekEndDate moved to dateUtils.js - proxy function for compatibility
function getWeekEndDate(weekStartDate) {
  return dateUtils.getWeekEndDate(weekStartDate);
}

// getTodayDateString moved to dateUtils.js - proxy function for compatibility
function getTodayDateString() {
  return dateUtils.formatDateToYYYYMMDD(getCurrentDate());
}

/**
 * Initialize the database connection
 * @returns {Promise<IDBDatabase>} Promise resolving to the database connection
 */
async function initDatabase() {
  if (_db) {
    return _db; // Return existing connection if available
  }

  return new Promise((resolve, reject) => {
    try {
      logger.info("Opening database...");
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        const error = new Error(
          `Database error: ${event.target.errorCode || "unknown error"}`
        );
        logger.error(error);
        reject(error);
      };

      request.onsuccess = (event) => {
        _db = event.target.result;
        logger.info(
          "Database opened successfully:",
          DB_NAME,
          "version",
          _db.version
        );

        // Set up error handler for the database connection
        _db.onerror = (event) => {
          logger.error("Database error:", event.target.errorCode);
        };

        resolve(_db);
      };

      request.onupgradeneeded = (event) => {
        logger.info(
          `Upgrading database from version ${event.oldVersion} to ${event.newVersion}`
        );
        const db = event.target.result;

        // Handle database structure upgrades based on old version
        if (event.oldVersion < 1) {
          // Create history store (if upgrading from no db or version 0)
          if (!db.objectStoreNames.contains(STORES.HISTORY)) {
            const historyStore = db.createObjectStore(STORES.HISTORY, {
              keyPath: "weekStartDate",
            });
            historyStore.createIndex("updatedAt", "metadata.updatedAt", {
              unique: false,
            });
            logger.debug(`Object store created: ${STORES.HISTORY}`);
          }
        }

        if (event.oldVersion < 2) {
          // Add preferences store in version 2
          if (!db.objectStoreNames.contains(STORES.PREFERENCES)) {
            const prefsStore = db.createObjectStore(STORES.PREFERENCES, {
              keyPath: "id",
            });
            logger.debug(`Object store created: ${STORES.PREFERENCES}`);
          }

          // Add sync log store in version 2
          if (!db.objectStoreNames.contains(STORES.SYNC_LOG)) {
            const syncStore = db.createObjectStore(STORES.SYNC_LOG, {
              keyPath: "id",
              autoIncrement: true,
            });
            syncStore.createIndex("timestamp", "timestamp", { unique: false });
            syncStore.createIndex("recordType", "recordType", {
              unique: false,
            });
            logger.debug(`Object store created: ${STORES.SYNC_LOG}`);
          }
        }
      };
    } catch (error) {
      logger.error("Error during database initialization:", error);
      reject(error);
    }
  });
}

/**
 * Ensure the database is initialized
 * @returns {Promise<IDBDatabase>} Promise resolving to the database connection
 */
async function ensureDatabase() {
  if (!_db) {
    _db = await initDatabase();
    if (!_db) {
      throw new Error("Failed to initialize database");
    }
  }
  return _db;
}

/**
 * Run a database operation with error handling and connection assurance
 * @param {string} storeName - The object store to use
 * @param {string} mode - The transaction mode ('readonly' or 'readwrite')
 * @param {Function} operation - The operation to perform with the store
 * @returns {Promise<any>} Promise resolving to the operation result
 */
async function dbOperation(storeName, mode, operation) {
  await ensureDatabase();

  return new Promise((resolve, reject) => {
    try {
      const transaction = _db.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);

      transaction.oncomplete = () => {
        logger.debug(`Transaction completed for store '${storeName}'`);
      };

      transaction.onerror = (event) => {
        const error = new Error(
          `Transaction error for store '${storeName}': ${event.target.error}`
        );
        logger.error(error);
        reject(error);
      };

      // Execute the operation with the store
      operation(store, transaction, resolve, reject);
    } catch (error) {
      logger.error(
        `Unexpected error in dbOperation(${storeName}, ${mode}):`,
        error
      );
      reject(error);
    }
  });
}

/**
 * Normalize week data into a standard history record format
 * @param {Object} weekData - Base week data (must contain weekStartDate)
 * @param {Object} [options] - Additional options
 * @param {Object} [options.existingRecord] - Existing record for this week if any
 * @param {Object} [options.foodGroups] - Food groups configuration to build targets
 * @param {Object} [options.importInfo] - Information about an import if this is from import
 * @param {string} [options.weekStartDay="Sunday"] - The week start day setting for this record
 * @returns {Object} Normalized history record
 */
function normalizeWeekData(weekData, options = {}) {
  const now = getCurrentTimestamp();
  const weekStartDate = weekData.weekStartDate;
  if (!weekStartDate) {
    logger.error("normalizeWeekData: weekStartDate is required.", weekData);
    throw new Error("weekStartDate is required for normalizing week data.");
  }
  const existingRecord = options.existingRecord || null;
  const weekStartDayPref = options.weekStartDay || "Sunday"; // Get from options or default

  let targets = weekData.targets || {};
  if (
    Object.keys(targets).length === 0 &&
    options.foodGroups &&
    Array.isArray(options.foodGroups)
  ) {
    options.foodGroups.forEach((group) => {
      targets[group.id] = {
        target: group.target,
        frequency: group.frequency,
        type: group.type,
        unit: group.unit,
        // Optionally store name for historical context if foodGroups config changes
        name: group.name,
      };
    });
  }

  const metadata = {
    createdAt: existingRecord?.metadata?.createdAt || now,
    updatedAt: options.updatedAt || now,
    schemaVersion: SCHEMA.VERSION,
    deviceInfo: getDeviceInfo(),
    deviceId: getDeviceId(),
    syncStatus: options.importInfo ? "imported" : options.syncStatus || "local",
    weekStartDay: weekStartDayPref, // Store the week start day setting
    mergedAfterReset:
      existingRecord?.metadata?.mergedAfterReset ||
      weekData.metadata?.mergedAfterReset ||
      false,
  };

  if (options.importInfo) {
    metadata.importedFrom = options.importInfo.deviceId || "unknown";
    metadata.importTimestamp = options.importInfo.timestamp || now;
  }

  // Ensure totals is an object
  const totals = weekData.totals || weekData.weeklyCounts || {};
  // Ensure dailyBreakdown is an object if provided, otherwise default to empty
  const dailyBreakdown = weekData.dailyBreakdown || {};

  return {
    id: existingRecord?.id || weekData.id || generateUUID(),
    weekStartDate: weekStartDate,
    weekEndDate: getWeekEndDate(weekStartDate), // Recalculate based on actual weekStartDate
    dailyBreakdown: dailyBreakdown, // New: store the daily breakdown
    totals: totals, // Still store summed weekly totals
    targets: targets,
    metadata: metadata,
  };
}

/**
 * Save a week's history data to IndexedDB with normalized structure
 * @param {Object} weekData - The week data to save (should include weekStartDate, totals, and optionally dailyBreakdown)
 * @param {Object} [options] - Additional options (like foodGroups for targets, weekStartDay preference)
 * @returns {Promise<void>} Promise that resolves when save is complete
 */
async function saveWeekHistory(weekData, options = {}) {
  const weekStartDate = weekData.weekStartDate;
  if (!weekStartDate) {
    return Promise.reject(
      new Error("weekStartDate is required to save week history.")
    );
  }

  let existingRecord = null;
  try {
    existingRecord = await dbOperation(
      STORES.HISTORY,
      "readonly",
      (store, transaction, resolve, reject) => {
        const request = store.get(weekStartDate);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
          logger.warn(
            `Error fetching existing history record for ${weekStartDate}: ${event.target.error?.message}`
          );
          resolve(null); // Resolve with null instead of rejecting to allow overwrite/creation
        };
      }
    );
  } catch (error) {
    logger.warn(
      `Could not check for existing history record ${weekStartDate}: ${error.message}`
    );
  }

  // Pass the weekStartDay preference to normalizeWeekData
  const normalizeOptions = {
    existingRecord,
    ...options, // foodGroups, importInfo, etc.
    weekStartDay:
      options.weekStartDay || (await getPreference("weekStartDay", "Sunday")), // Get from options or preference
  };
  const normalizedRecord = normalizeWeekData(weekData, normalizeOptions);

  return dbOperation(
    STORES.HISTORY,
    "readwrite",
    (store, transaction, resolve, reject) => {
      const request = store.put(normalizedRecord);
      request.onsuccess = () => {
        logger.info("Week data saved successfully to history:", weekStartDate);
        logSyncChange(
          "history",
          existingRecord ? "update" : "create", // More specific operation
          normalizedRecord.id, // Use record ID (UUID)
          { weekStartDate: normalizedRecord.weekStartDate } // Minimal data for log
        );
        // No need to mark historyDirty in current state metadata here, stateManager will do it.
        resolve();
      };
      request.onerror = (event) => {
        logger.error(
          `Error saving week data for ${weekStartDate} to history: ${event.target.error?.message}`
        );
        reject(
          new Error(`Error saving week data: ${event.target.error?.message}`)
        );
      };
    }
  );
}

/**
 * Get a specific week's history by weekStartDate
 * @param {string} weekStartDate - The week start date (YYYY-MM-DD)
 * @returns {Promise<Object|null>} Promise resolving to the week data or null
 */
async function getWeekHistory(weekStartDate) {
  return dbOperation(
    STORES.HISTORY,
    "readonly",
    (store, transaction, resolve, reject) => {
      const request = store.get(weekStartDate);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) =>
        reject(new Error(`Error fetching week: ${event.target.error}`));
    }
  );
}

/**
 * Create a history record from imported current state data.
 * This new version handles dailyCounts -> dailyBreakdown and recalculates totals.
 * @param {Object} importedCurrentStateData - The current state data to convert (must have .currentWeekStartDate and .dailyCounts).
 * @param {Object} importInfo - appInfo from the import file (for deviceId, timestamp context).
 * @param {Array} foodGroupsConfig - The application's current food groups configuration (for building targets).
 * @param {string} [weekStartDayPrefForRecord="Sunday"] - The week start day preference to associate with this new history record.
 * @returns {Object} A properly formatted history record, or null if input is invalid.
 */
function createHistoryFromCurrentState(
  importedCurrentStateData,
  importInfo,
  foodGroupsConfig,
  weekStartDayPrefForRecord = "Sunday"
) {
  if (
    !importedCurrentStateData ||
    !importedCurrentStateData.currentWeekStartDate ||
    typeof importedCurrentStateData.dailyCounts !== "object"
  ) {
    logger.error(
      "dataService.createHistoryFromCurrentState: Missing required fields (currentWeekStartDate, dailyCounts) in importedCurrentStateData.",
      importedCurrentStateData
    );
    // throw new Error("Invalid data for creating history from current state."); // Or return null
    return null;
  }

  // The dailyCounts from the imported currentState become the dailyBreakdown for the history record.
  // Filter to ensure only the 7 days of that specific week are included.
  const dailyBreakdownForHistory = {};
  const weekStartDate = importedCurrentStateData.currentWeekStartDate;
  const startDateObj = new Date(weekStartDate + "T00:00:00");

  for (let i = 0; i < 7; i++) {
    const dayToProcess = new Date(startDateObj);
    dayToProcess.setDate(startDateObj.getDate() + i);

    // Use a local formatter or appUtils if dataService doesn't have a direct formatter for specific dates
    const year = dayToProcess.getFullYear();
    const month = String(dayToProcess.getMonth() + 1).padStart(2, "0");
    const day = String(dayToProcess.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;

    if (importedCurrentStateData.dailyCounts.hasOwnProperty(dateStr)) {
      dailyBreakdownForHistory[dateStr] = {
        ...(importedCurrentStateData.dailyCounts[dateStr] || {}),
      };
    } else {
      dailyBreakdownForHistory[dateStr] = {}; // Ensure all 7 days exist
    }
  }
  logger.debug(
    "createHistoryFromCurrentState: Created dailyBreakdownForHistory:",
    JSON.parse(JSON.stringify(dailyBreakdownForHistory))
  );

  // Recalculate totals based on this dailyBreakdown
  const newTotals = {};
  for (const dateKey in dailyBreakdownForHistory) {
    if (dailyBreakdownForHistory.hasOwnProperty(dateKey)) {
      const dayData = dailyBreakdownForHistory[dateKey];
      for (const foodId in dayData) {
        if (dayData.hasOwnProperty(foodId)) {
          newTotals[foodId] = (newTotals[foodId] || 0) + (dayData[foodId] || 0);
        }
      }
    }
  }
  logger.debug(
    "createHistoryFromCurrentState: Recalculated newTotals:",
    JSON.parse(JSON.stringify(newTotals))
  );

  const weekDataForNormalization = {
    weekStartDate: importedCurrentStateData.currentWeekStartDate, // From the imported state
    dailyBreakdown: dailyBreakdownForHistory,
    totals: newTotals,
    id: generateUUID(), // Generate a new ID for this new history record
    metadata: {
      // Pass relevant metadata from importInfo
      syncStatus: "imported",
      createdAt: importInfo?.exportTimestamp || getCurrentTimestamp(), // Use export time as creation time if available
      // updatedAt will be set by normalizeWeekData or saveWeekHistory
      // deviceId & deviceInfo will be set by normalizeWeekData to current device
    },
  };

  // Normalize to full history record structure
  // normalizeWeekData will build targets using foodGroupsConfig and set other metadata
  return normalizeWeekData(weekDataForNormalization, {
    foodGroups: foodGroupsConfig,
    importInfo: importInfo, // Pass original appInfo for context if normalizeWeekData uses it
    weekStartDay: weekStartDayPrefForRecord, // Associate this preference with the record
    updatedAt: importInfo?.exportTimestamp || getCurrentTimestamp(), // Ensure updatedAt reflects import time or original export
  });
}

/**
 * Get all week history data, sorted by date (newest first)
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Maximum number of records to return
 * @param {number} [options.offset] - Number of records to skip
 * @returns {Promise<Array>} Promise resolving to an array of week history objects
 */
async function getAllWeekHistory(options = {}) {
  return dbOperation(
    STORES.HISTORY,
    "readonly",
    (store, transaction, resolve, reject) => {
      const request = store.getAll();

      request.onsuccess = (event) => {
        // Get all records
        let results = event.target.result;

        // Sort by week start date, descending (most recent first)
        results = results.sort((a, b) => {
          return new Date(b.weekStartDate) - new Date(a.weekStartDate);
        });

        // Apply pagination if options are provided
        if (options.offset || options.limit) {
          const offset = options.offset || 0;
          const limit = options.limit || results.length;
          results = results.slice(offset, offset + limit);
        }

        resolve(results);
      };

      request.onerror = (event) => {
        reject(
          new Error(`Error fetching all week data: ${event.target.error}`)
        );
      };
    }
  );
}

/**
 * Clear all history data from the store
 * @returns {Promise<void>} Promise that resolves when clear is complete
 */
async function clearHistoryStore() {
  return dbOperation(
    STORES.HISTORY,
    "readwrite",
    (store, transaction, resolve, reject) => {
      const request = store.clear();

      request.onsuccess = () => {
        logger.info(`Object store '${STORES.HISTORY}' cleared successfully.`);

        // Log the massive change for sync purposes
        logSyncChange("history", "clear", "all", null);

        resolve();
      };

      request.onerror = (event) => {
        reject(
          new Error(
            `Error clearing object store '${STORES.HISTORY}': ${event.target.error}`
          )
        );
      };
    }
  );
}

/**
 * Save a user preference
 * @param {string} key - The preference key
 * @param {any} value - The preference value
 * @returns {Promise<void>} Promise that resolves when save is complete
 */
async function savePreference(key, value) {
  if (!key) throw new Error("Preference key is required");

  const now = getCurrentTimestamp();

  // Get existing preference record if it exists
  let existingPref = null;
  try {
    existingPref = await dbOperation(
      STORES.PREFERENCES,
      "readonly",
      (store, transaction, resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) =>
          reject(new Error(`Error fetching preference: ${event.target.error}`));
      }
    );
  } catch (error) {
    logger.warn(`Could not check for existing preference: ${error.message}`);
  }

  // Create normalized preference structure
  const normalizedPref = {
    id: key,
    value: value,
    metadata: {
      createdAt: existingPref?.metadata?.createdAt || now,
      updatedAt: now,
      deviceId: getDeviceId(),
    },
  };

  // Save the preference
  return dbOperation(
    STORES.PREFERENCES,
    "readwrite",
    (store, transaction, resolve, reject) => {
      const request = store.put(normalizedPref);

      request.onsuccess = () => {
        logger.debug(`Preference '${key}' saved successfully.`);

        // Log the change for future sync
        logSyncChange("preference", "update", key, { key, value });

        resolve();
      };

      request.onerror = (event) => {
        reject(
          new Error(`Error saving preference '${key}': ${event.target.error}`)
        );
      };
    }
  );
}

/**
 * Get a user preference
 * @param {string} key - The preference key
 * @param {any} defaultValue - Default value if preference doesn't exist
 * @returns {Promise<any>} Promise resolving to the preference value
 */
async function getPreference(key, defaultValue = null) {
  if (!key) throw new Error("Preference key is required");

  try {
    const result = await dbOperation(
      STORES.PREFERENCES,
      "readonly",
      (store, transaction, resolve, reject) => {
        const request = store.get(key);

        request.onsuccess = () => {
          const record = request.result;
          if (record) {
            resolve(record.value);
          } else {
            resolve(defaultValue);
          }
        };

        request.onerror = (event) => {
          reject(
            new Error(
              `Error fetching preference '${key}': ${event.target.error}`
            )
          );
        };
      }
    );

    return result;
  } catch (error) {
    logger.warn(`Error getting preference '${key}', returning default:`, error);
    return defaultValue;
  }
}

/**
 * Get all user preferences
 * @returns {Promise<Object>} Promise resolving to an object of all preferences
 */
async function getAllPreferences() {
  try {
    const records = await dbOperation(
      STORES.PREFERENCES,
      "readonly",
      (store, transaction, resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = (event) => {
          reject(
            new Error(`Error fetching all preferences: ${event.target.error}`)
          );
        };
      }
    );

    // Convert records array to key-value object
    return records.reduce((result, record) => {
      result[record.id] = record.value;
      return result;
    }, {});
  } catch (error) {
    logger.error("Error getting all preferences:", error);
    return {};
  }
}

/**
 * Delete a user preference
 * @param {string} key - The preference key
 * @returns {Promise<boolean>} Promise resolving to true if deleted, false if not found
 */
async function deletePreference(key) {
  if (!key) throw new Error("Preference key is required");

  return dbOperation(
    STORES.PREFERENCES,
    "readwrite",
    (store, transaction, resolve, reject) => {
      const request = store.delete(key);

      request.onsuccess = () => {
        logger.info(`Preference '${key}' deleted successfully.`);

        // Log the change for future sync
        logSyncChange("preference", "delete", key, null);

        resolve(true);
      };

      request.onerror = (event) => {
        reject(
          new Error(`Error deleting preference '${key}': ${event.target.error}`)
        );
      };
    }
  );
}

/**
 * Log a change for future synchronization
 * @param {string} recordType - Type of record ('history', 'preference', etc.)
 * @param {string} operation - Operation performed ('create', 'update', 'delete', 'clear')
 * @param {string} recordId - ID of the affected record
 * @param {Object} data - Optional data about the change
 * @returns {Promise<void>} Promise that resolves when logging is complete
 */
async function logSyncChange(recordType, operation, recordId, data = null) {
  try {
    const logEntry = {
      timestamp: getCurrentTimestamp(),
      recordType,
      operation,
      recordId,
      deviceId: getDeviceId(),
      data: data ? JSON.stringify(data) : null,
    };

    await dbOperation(
      STORES.SYNC_LOG,
      "readwrite",
      (store, transaction, resolve, reject) => {
        const request = store.add(logEntry);

        request.onsuccess = () => {
          logger.debug(`Sync log entry added for ${recordType} ${operation}`);
          resolve();
        };

        request.onerror = (event) => {
          logger.warn(`Error logging sync change: ${event.target.error}`);
          resolve(); // Resolve anyway - sync logging is non-critical
        };
      }
    );
  } catch (error) {
    logger.warn("Error logging sync change:", error);
    // Intentionally not rejecting - sync logging failure shouldn't block operations
  }
}

/**
 * Get pending changes for synchronization
 * @param {number} since - Timestamp to get changes since
 * @returns {Promise<Array>} Promise resolving to array of changes
 */
async function getPendingSyncChanges(since = 0) {
  try {
    return dbOperation(
      STORES.SYNC_LOG,
      "readonly",
      (store, transaction, resolve, reject) => {
        const index = store.index("timestamp");
        const range = IDBKeyRange.lowerBound(since, false);
        const request = index.getAll(range);

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = (event) => {
          reject(
            new Error(`Error fetching sync changes: ${event.target.error}`)
          );
        };
      }
    );
  } catch (error) {
    logger.error("Error getting pending sync changes:", error);
    return [];
  }
}

/**
 * Load the current state from localStorage with normalized structure
 * @returns {Object} The current state object, or default state if none exists
 */
function loadState() {
  try {
    const savedStateString = localStorage.getItem(LOCAL_STORAGE_KEY);
    const savedState = savedStateString ? JSON.parse(savedStateString) : {};

    const today = getTodayDateString(); // Uses dataService.getCurrentDate()

    // Determine weekStartDay preference (default to Sunday for initial load)
    const weekStartDayPrefDefault = "Sunday";

    const currentWeekStart = getWeekStartDate(
      getCurrentDate(),
      savedState.metadata?.weekStartDay || weekStartDayPrefDefault
    );

    const isFreshInstall = !savedStateString;
    const now = getCurrentTimestamp();
    const veryOldTimestamp = new Date("2024-01-01T00:00:00").getTime(); // Ensure this is truly old

    const lastModified = isFreshInstall
      ? veryOldTimestamp
      : savedState.lastModified || now;

    // Metadata handling
    const loadedMetadata = savedState.metadata || {};
    const defaultMetadataForFreshInstall = {
      schemaVersion: SCHEMA.VERSION,
      deviceId: getDeviceId(),
      isFreshInstall: true,
      weekStartDay: weekStartDayPrefDefault,
      currentWeekDirty: false,
      historyDirty: false,
      dateResetPerformed: false,
      dateResetType: null,
      dateResetTimestamp: 0,
      dailyTotalsUpdatedAt: 0,
      dailyTotalsDirty: false,
      dailyResetTimestamp: 0,
      weeklyTotalsUpdatedAt: 0,
      weeklyTotalsDirty: false,
      weeklyResetTimestamp: 0,
      previousWeekStartDate: null,
      pendingDateReset: false,
      remoteDateWas: null,
    };

    const normalizedMetadata = isFreshInstall
      ? defaultMetadataForFreshInstall
      : {
          ...defaultMetadataForFreshInstall,
          ...loadedMetadata,
          isFreshInstall: false,
          schemaVersion: SCHEMA.VERSION,
          deviceId: getDeviceId(),
          weekStartDay: loadedMetadata.weekStartDay || weekStartDayPrefDefault,
        };

    // State normalization
    const normalizedState = {
      currentDayDate: savedState.currentDayDate || today,
      currentWeekStartDate: savedState.currentWeekStartDate || currentWeekStart,
      selectedTrackerDate: savedState.selectedTrackerDate || today,
      dailyCounts: savedState.dailyCounts || {},
      weeklyCounts: savedState.weeklyCounts || {},
      lastModified: lastModified,
      metadata: normalizedMetadata,
    };

    // Ensure an entry for selectedTrackerDate exists in dailyCounts
    if (!normalizedState.dailyCounts[normalizedState.selectedTrackerDate]) {
      normalizedState.dailyCounts[normalizedState.selectedTrackerDate] = {};
    }
    // If it's a truly fresh install and currentDayDate has no entry after above, add it.
    if (isFreshInstall && !normalizedState.dailyCounts[today]) {
      normalizedState.dailyCounts[today] = {};
    }

    logger.debug("Loaded state:", JSON.parse(JSON.stringify(normalizedState)));
    return normalizedState;
  } catch (error) {
    logger.error(
      "Error loading state from localStorage, returning default state:",
      error
    );
    const today = getTodayDateString();
    const weekStartDayPrefDefaultOnError = "Sunday"; // Consistent default
    const currentWeekStartOnError = getWeekStartDate(
      getCurrentDate(),
      weekStartDayPrefDefaultOnError
    );
    const veryOldTimestampOnError = new Date("2024-01-01T00:00:00").getTime();

    const fallbackMetadata = {
      schemaVersion: SCHEMA.VERSION,
      deviceId: getDeviceId(),
      isFreshInstall: true,
      weekStartDay: weekStartDayPrefDefaultOnError,
      currentWeekDirty: false,
      historyDirty: false,
      dateResetPerformed: false,
      dateResetType: null,
      dateResetTimestamp: 0,
      dailyTotalsUpdatedAt: 0,
      dailyTotalsDirty: false,
      dailyResetTimestamp: 0,
      weeklyTotalsUpdatedAt: 0,
      weeklyTotalsDirty: false,
      weeklyResetTimestamp: 0,
      previousWeekStartDate: null,
      pendingDateReset: false,
      remoteDateWas: null,
    };

    return {
      currentDayDate: today,
      currentWeekStartDate: currentWeekStartOnError,
      selectedTrackerDate: today,
      dailyCounts: { [today]: {} },
      weeklyCounts: {},
      lastModified: veryOldTimestampOnError,
      metadata: fallbackMetadata,
    };
  }
}

/**
 * Save the current state to localStorage with normalized structure
 * @param {Object} state - The state object to save
 * @returns {boolean} Success status
 */
function saveState(state) {
  try {
    const now = getCurrentTimestamp();

    const normalizedState = {
      currentDayDate: state.currentDayDate,
      currentWeekStartDate: state.currentWeekStartDate,
      selectedTrackerDate: state.selectedTrackerDate,
      dailyCounts: state.dailyCounts || {},
      weeklyCounts: state.weeklyCounts || {},
      lastModified: now,
      metadata: {
        ...(state.metadata || {}), // Preserve all existing metadata fields
        schemaVersion: SCHEMA.VERSION,
        deviceId: getDeviceId(),
        weekStartDay: state.metadata?.weekStartDay || "Sunday",
        // Ensure these fields are preserved
        currentWeekDirty: state.metadata?.currentWeekDirty || false,
        historyDirty: state.metadata?.historyDirty || false,
        dateResetPerformed: state.metadata?.dateResetPerformed || false,
        dateResetType: state.metadata?.dateResetType,
        dateResetTimestamp: state.metadata?.dateResetTimestamp,
        dailyTotalsUpdatedAt: state.metadata?.dailyTotalsUpdatedAt,
        dailyTotalsDirty: state.metadata?.dailyTotalsDirty || false,
        dailyResetTimestamp: state.metadata?.dailyResetTimestamp,
        weeklyTotalsUpdatedAt: state.metadata?.weeklyTotalsUpdatedAt,
        weeklyTotalsDirty: state.metadata?.weeklyTotalsDirty || false,
        weeklyResetTimestamp: state.metadata?.weeklyResetTimestamp,
        previousWeekStartDate: state.metadata?.previousWeekStartDate,
        pendingDateReset: state.metadata?.pendingDateReset || false,
        remoteDateWas: state.metadata?.remoteDateWas,
        isFreshInstall: state.metadata?.isFreshInstall || false,
      },
    };

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalizedState));
    logger.debug(
      "Saved state with timestamp:",
      now,
      "State:",
      JSON.parse(JSON.stringify(normalizedState))
    );

    logSyncChange("currentState", "update", "current", {
      timestamp: now,
      weekStartDate: state.currentWeekStartDate,
      selectedDate: state.selectedTrackerDate,
    }).catch((e) => logger.warn("Failed to log current state change:", e));

    return true;
  } catch (error) {
    logger.error("Error saving state to localStorage:", error);
    return false;
  }
}

/**
 * Export all application data to a JSON object
 * @returns {Promise<Object>} Promise resolving to the exported data object
 */
async function exportData() {
  try {
    // 1. Get current state from localStorage
    const currentState = loadState();

    // 2. Get history from IndexedDB
    const historyData = await getAllWeekHistory();

    // 3. Get all preferences
    const preferences = await getAllPreferences();

    // 3. Combine data into a single export object
    const dataToExport = {
      appInfo: {
        appName: "MIND Diet Tracker PWA",
        exportDate: getCurrentDate().toISOString(),
        exportTimestamp: getCurrentTimestamp(),
        schemaVersion: SCHEMA.VERSION,
        deviceId: getDeviceId(),
        deviceInfo: getDeviceInfo(),
      },
      currentState: currentState,
      history: historyData || [], // Ensure history is an array
      preferences: preferences || {},
    };

    return dataToExport;
  } catch (error) {
    logger.error("Error exporting data:", error);
    throw new Error(`Export failed: ${error.message}`);
  }
}

/**
 * Import data from a JSON object
 * @param {Object} importedData - The data to import
 * @returns {Promise<boolean>} Promise resolving to success status
 */
async function importData(importedData) {
  try {
    let importCount = 0;

    // Import preferences first
    if (importedData.preferences) {
      for (const [key, value] of Object.entries(importedData.preferences)) {
        try {
          await savePreference(key, value);
        } catch (prefError) {
          logger.error(`Error importing preference '${key}':`, prefError);
        }
      }
      logger.info("Preferences imported successfully");
    }

    // Import current state
    if (importedData.currentState) {
      // Ensure metadata exists
      importedData.currentState.metadata = {
        ...(importedData.currentState.metadata || {}),
        schemaVersion: SCHEMA.VERSION,
        deviceInfo: getDeviceInfo(),
        deviceId: getDeviceId(),
        lastModified: Date.now(),
      };

      // Save current state
      await saveState(importedData.currentState);
      logger.info("Current state imported successfully");
    }

    // Import history data
    if (importedData.history && importedData.history.length > 0) {
      for (const weekData of importedData.history) {
        try {
          // Validate each history record
          if (
            weekData &&
            typeof weekData.weekStartDate === "string" &&
            (typeof weekData.totals === "object" ||
              typeof weekData.totals === "undefined")
          ) {
            // Normalize the week data before saving
            const normalizedWeekData = {
              ...weekData,
              metadata: {
                ...(weekData.metadata || {}),
                updatedAt: getCurrentTimestamp(),
                schemaVersion: SCHEMA.VERSION,
                deviceInfo: getDeviceInfo(),
                deviceId: getDeviceId(),
                syncStatus: "imported",
                importedFrom: importedData.appInfo?.deviceId || "unknown",
                historyDirty: true, // Mark as dirty to ensure it gets synced
              },
            };

            await saveWeekHistory(normalizedWeekData);
            importCount++;
          } else {
            logger.warn(
              "Skipping invalid/incomplete history record during import:",
              weekData
            );
          }
        } catch (saveError) {
          logger.error(
            `Error saving history week ${
              weekData.weekStartDate || "unknown"
            } during import:`,
            saveError
          );
          // Continue with other records even if one fails
        }
      }
      logger.info(`${importCount} history records restored to IndexedDB.`);
    } else {
      logger.info(
        "No history records found in imported data or history array is empty."
      );
    }

    return { success: true, importedCount: importCount };
  } catch (error) {
    logger.error("Error during data import:", error);
    throw error;
  }
}

/**
 * Initialize the data service
 * @returns {Promise<void>} Promise that resolves when initialization is complete
 */
async function initialize() {
  if (_isInitialized) {
    return; // Already initialized
  }

  try {
    // Initialize database
    await ensureDatabase();

    // Initialize device ID
    getDeviceId();

    // Set initialized flag
    _isInitialized = true;
    logger.info("Data service initialized successfully");
  } catch (error) {
    logger.error("Failed to initialize data service:", error);
    throw error;
  }
}

/**
 * Close database connections and cleanup
 * @returns {Promise<void>} Promise that resolves when cleanup is complete
 */
async function cleanup() {
  if (_db) {
    _db.close();
    _db = null;
  }
  _isInitialized = false;
  logger.info("Data service cleanup complete");
}

/**
 * Get statistics about the database
 * @returns {Promise<Object>} Promise resolving to database statistics
 */
async function getDBStats() {
  try {
    // Get history stats
    const historyData = await getAllWeekHistory();

    // Get preference stats
    const preferences = await getAllPreferences();

    // Get sync log stats
    const syncLogs = await dbOperation(
      STORES.SYNC_LOG,
      "readonly",
      (store, transaction, resolve, reject) => {
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) =>
          reject(new Error(`Error counting sync logs: ${event.target.error}`));
      }
    );

    // Return compiled stats
    return {
      database: {
        name: DB_NAME,
        version: DB_VERSION,
        schemaVersion: SCHEMA.VERSION,
      },
      counts: {
        history: historyData.length,
        preferences: Object.keys(preferences).length,
        syncLogs: syncLogs,
      },
      device: {
        id: getDeviceId(),
        info: JSON.parse(getDeviceInfo()),
      },
      state: {
        lastModified: loadState().lastModified,
      },
    };
  } catch (error) {
    logger.error("Error getting DB stats:", error);
    return {
      error: error.message,
      database: {
        name: DB_NAME,
        version: DB_VERSION,
        schemaVersion: SCHEMA.VERSION,
      },
    };
  }
}

// Add near the top with other private module state
let _testDate = null;
let _testModeEnabled = false;

/**
 * Get current date, respecting test mode if enabled
 * @returns {Date} Current date or test date if in test mode
 */
function getCurrentDate() {
  if (_testModeEnabled && _testDate) {
    // Return a clone of the test date to prevent modification
    return new Date(_testDate.getTime());
  }
  return new Date();
}

/**
 * Get current timestamp, respecting test mode if enabled
 * @returns {number} Current timestamp in milliseconds
 */
function getCurrentTimestamp() {
  if (_testModeEnabled && _testDate) {
    return _testDate.getTime();
  }
  return Date.now();
}

/**
 * Enable test mode with a specific date
 * @param {Date|string} testDate - Date to use in test mode
 */
function enableTestMode(testDate) {
  if (testDate instanceof Date) {
    _testDate = new Date(testDate.getTime());
  } else if (typeof testDate === "string") {
    // If a date string is provided (like from a date input)
    // Make sure it's interpreted in local timezone by appending T00:00:00
    if (testDate.indexOf("T") === -1) {
      testDate = testDate + "T00:00:00";
    }
    _testDate = new Date(testDate);
  } else {
    _testDate = new Date();
  }

  _testModeEnabled = true;
  logger.info(`Test mode ENABLED with date: ${_testDate.toISOString()}`);
}

/**
 * Disable test mode and return to using real dates
 */
function disableTestMode() {
  _testModeEnabled = false;
  _testDate = null;
  logger.info("Test mode DISABLED");
}

/**
 * Check if test mode is enabled
 * @returns {boolean} True if test mode is enabled
 */
function isTestModeEnabled() {
  return _testModeEnabled;
}

/**
 * Save multiple preferences in a single transaction
 * @param {Array} preferences - Array of {key, value} objects
 * @returns {Promise<void>} Promise that resolves when all preferences are saved
 */
async function bulkSavePreferences(preferences) {
  if (!preferences || preferences.length === 0) {
    return;
  }

  return dbOperation(
    STORES.PREFERENCES,
    "readwrite",
    (store, transaction, resolve, reject) => {
      let completed = 0;
      const total = preferences.length;
      const errors = [];
      const now = getCurrentTimestamp();

      preferences.forEach(({ key, value }) => {
        // Create normalized preference structure to match savePreference
        const normalizedPref = {
          id: key,
          value: value,
          metadata: {
            createdAt: now,
            updatedAt: now,
            deviceId: getDeviceId(),
          },
        };

        const request = store.put(normalizedPref);

        request.onsuccess = () => {
          completed++;
          if (completed === total) {
            if (errors.length > 0) {
              reject(
                new Error(
                  `Failed to save ${errors.length} preferences: ${errors.join(
                    ", "
                  )}`
                )
              );
            } else {
              logger.debug(`Bulk saved ${total} preferences successfully`);
              resolve();
            }
          }
        };

        request.onerror = (event) => {
          errors.push(`${key}: ${event.target.error}`);
          completed++;
          if (completed === total) {
            reject(
              new Error(
                `Failed to save ${errors.length} preferences: ${errors.join(
                  ", "
                )}`
              )
            );
          }
        };
      });
    }
  );
}

// Export the public API
export default {
  // Core initialization
  initialize,
  cleanup,

  // Date utilities
  getWeekStartDate,
  getTodayDateString,
  getWeekEndDate,

  // LocalStorage operations
  loadState,
  saveState,

  // IndexedDB operations for history
  saveWeekHistory,
  getAllWeekHistory,
  clearHistoryStore,
  getWeekHistory,

  // User preferences
  savePreference,
  getPreference,
  getAllPreferences,
  deletePreference,

  // Import/Export
  exportData,
  importData,
  createHistoryFromCurrentState,
  getDeviceId,

  // Diagnostics
  getDBStats,

  // Future sync support
  getPendingSyncChanges,

  // Test utilities (development only)
  enableTestMode,
  disableTestMode,
  isTestModeEnabled,
  getCurrentDate,
  getCurrentTimestamp,

  // New bulk save preferences method
  bulkSavePreferences,
};

window.appDataService = {
  enableTestMode,
  getTodayDateString,
  getCurrentDate,
  getWeekStartDate,
  getAllWeekHistory,
  getPreference,
};
