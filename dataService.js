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
const SCHEMA = {
  VERSION: 1,
  CURRENT_STATE: {
    currentDayDate: String,
    currentWeekStartDate: String,
    dailyCounts: Object,
    weeklyCounts: Object,
    lastModified: Number, // Timestamp
  },
  HISTORY: {
    id: String, // uuid
    weekStartDate: String, // Primary key
    weekEndDate: String,
    totals: Object,
    targets: Object,
    metadata: {
      createdAt: Number, // Timestamp
      updatedAt: Number, // Timestamp
      schemaVersion: Number,
      deviceInfo: String,
      syncStatus: String, // 'local', 'synced', 'conflict'
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
    console.warn("Could not get complete device info:", error);
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

/**
 * Get the start date of the week containing the given date
 * @param {Date|string} d - The date to get the week start for
 * @param {string} startDay - Day to start the week on (default: 'Sunday')
 * @returns {string} YYYY-MM-DD formatted string of the week start date
 */
function getWeekStartDate(d, startDay = "Sunday") {
  d = d || getCurrentDate();
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  let diff;

  if (startDay === "Sunday") {
    // If Sunday is the start day, the difference is just the current date's day number
    diff = d.getDate() - day;
  } else {
    // Default to Monday logic if not Sunday (for future use or if called explicitly)
    // Adjust when day is Sunday (0) to go back to the previous Monday (-6 days)
    // Otherwise, go back (day - 1) days to get to Monday
    diff = d.getDate() - day + (day === 0 ? -6 : 1);
  }

  const weekStart = new Date(d.setDate(diff));
  weekStart.setHours(0, 0, 0, 0); // Set to midnight

  // Format using local components
  const year = weekStart.getFullYear();
  const month = String(weekStart.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(weekStart.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`; // Return local YYYY-MM-DD
}

/**
 * Get the end date of the week starting with the given date
 * @param {string} weekStartDate - The week start date (YYYY-MM-DD)
 * @returns {string} YYYY-MM-DD formatted string of the week end date
 */
function getWeekEndDate(weekStartDate) {
  const startDate = new Date(`${weekStartDate}T00:00:00`);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6); // 6 days after start = end of week

  const year = endDate.getFullYear();
  const month = String(endDate.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(endDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

/**
 * Get today's date as a YYYY-MM-DD string in local time
 * @returns {string} YYYY-MM-DD formatted string of today's date
 */
function getTodayDateString() {
  const today = getCurrentDate();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
      console.log("Opening database...");
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        const error = new Error(
          `Database error: ${event.target.errorCode || "unknown error"}`
        );
        console.error(error);
        reject(error);
      };

      request.onsuccess = (event) => {
        _db = event.target.result;
        console.log(
          "Database opened successfully:",
          DB_NAME,
          "version",
          _db.version
        );

        // Set up error handler for the database connection
        _db.onerror = (event) => {
          console.error("Database error:", event.target.errorCode);
        };

        resolve(_db);
      };

      request.onupgradeneeded = (event) => {
        console.log(
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
            console.log(`Object store created: ${STORES.HISTORY}`);
          }
        }

        if (event.oldVersion < 2) {
          // Add preferences store in version 2
          if (!db.objectStoreNames.contains(STORES.PREFERENCES)) {
            const prefsStore = db.createObjectStore(STORES.PREFERENCES, {
              keyPath: "id",
            });
            console.log(`Object store created: ${STORES.PREFERENCES}`);
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
            console.log(`Object store created: ${STORES.SYNC_LOG}`);
          }
        }
      };
    } catch (error) {
      console.error("Error during database initialization:", error);
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
        console.log(`Transaction completed for store '${storeName}'`);
      };

      transaction.onerror = (event) => {
        const error = new Error(
          `Transaction error for store '${storeName}': ${event.target.error}`
        );
        console.error(error);
        reject(error);
      };

      // Execute the operation with the store
      operation(store, transaction, resolve, reject);
    } catch (error) {
      console.error(
        `Unexpected error in dbOperation(${storeName}, ${mode}):`,
        error
      );
      reject(error);
    }
  });
}

/**
 * Save a week's history data to IndexedDB with normalized structure
 * @param {Object} weekData - The week data to save
 * @returns {Promise<void>} Promise that resolves when save is complete
 */
async function saveWeekHistory(weekData) {
  // Normalize and enhance the data structure
  const now = getCurrentTimestamp();
  const weekStartDate = weekData.weekStartDate;

  // Get the existing record if it exists
  let existingRecord = null;
  try {
    existingRecord = await dbOperation(
      STORES.HISTORY,
      "readonly",
      (store, transaction, resolve, reject) => {
        const request = store.get(weekStartDate);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) =>
          reject(
            new Error(`Error fetching existing record: ${event.target.error}`)
          );
      }
    );
  } catch (error) {
    console.warn(`Could not check for existing record: ${error.message}`);
  }

  // Create normalized record structure
  const normalizedRecord = {
    id: existingRecord?.id || generateUUID(),
    weekStartDate: weekStartDate,
    weekEndDate: getWeekEndDate(weekStartDate),
    totals: weekData.totals || {},
    targets: weekData.targets || {},
    metadata: {
      createdAt: existingRecord?.metadata?.createdAt || now,
      updatedAt: now,
      schemaVersion: SCHEMA.VERSION,
      deviceInfo: getDeviceInfo(),
      deviceId: getDeviceId(),
      syncStatus: "local",
    },
  };

  // Save the normalized record
  return dbOperation(
    STORES.HISTORY,
    "readwrite",
    (store, transaction, resolve, reject) => {
      const request = store.put(normalizedRecord);
      request.onsuccess = () => {
        console.log("Week data saved successfully:", weekStartDate);

        // Log the change for future sync
        logSyncChange(
          "history",
          "update",
          normalizedRecord.id,
          normalizedRecord
        );

        resolve();
      };
      request.onerror = (event) =>
        reject(new Error(`Error saving week data: ${event.target.error}`));
    }
  );
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
        console.log(`Object store '${STORES.HISTORY}' cleared successfully.`);

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
    console.warn(`Could not check for existing preference: ${error.message}`);
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
        console.log(`Preference '${key}' saved successfully.`);

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
    console.warn(
      `Error getting preference '${key}', returning default:`,
      error
    );
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
    console.error("Error getting all preferences:", error);
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
        console.log(`Preference '${key}' deleted successfully.`);

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
          console.log(`Sync log entry added for ${recordType} ${operation}`);
          resolve();
        };

        request.onerror = (event) => {
          console.warn(`Error logging sync change: ${event.target.error}`);
          resolve(); // Resolve anyway - sync logging is non-critical
        };
      }
    );
  } catch (error) {
    console.warn("Error logging sync change:", error);
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
    console.error("Error getting pending sync changes:", error);
    return [];
  }
}

/**
 * Load the current state from localStorage with normalized structure
 * @returns {Object} The current state object, or default state if none exists
 */
function loadState() {
  try {
    const savedState =
      JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY)) || {};
    const today = getTodayDateString();
    const currentWeekStart = getWeekStartDate(getCurrentDate());
    const now = getCurrentTimestamp();

    // Apply schema validation and normalization
    const normalizedState = {
      currentDayDate: savedState.currentDayDate || today,
      currentWeekStartDate: savedState.currentWeekStartDate || currentWeekStart,
      dailyCounts: savedState.dailyCounts || {},
      weeklyCounts: savedState.weeklyCounts || {},
      lastModified: savedState.lastModified || now,
      metadata: {
        schemaVersion: SCHEMA.VERSION,
        deviceId: getDeviceId(),
      },
    };

    console.log("Loaded state:", normalizedState);
    return normalizedState;
  } catch (error) {
    console.error("Error loading state from localStorage:", error);
    // Return a default state if there's an error
    const today = getTodayDateString();
    const currentWeekStart = getWeekStartDate(getCurrentDate());

    return {
      currentDayDate: today,
      currentWeekStartDate: currentWeekStart,
      dailyCounts: {},
      weeklyCounts: {},
      lastModified: getCurrentTimestamp(),
      metadata: {
        schemaVersion: SCHEMA.VERSION,
        deviceId: getDeviceId(),
      },
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
    // Ensure the state has a proper structure before saving
    const now = getCurrentTimestamp();

    const normalizedState = {
      currentDayDate: state.currentDayDate,
      currentWeekStartDate: state.currentWeekStartDate,
      dailyCounts: state.dailyCounts || {},
      weeklyCounts: state.weeklyCounts || {},
      lastModified: now,
      metadata: {
        schemaVersion: SCHEMA.VERSION,
        deviceId: getDeviceId(),
      },
    };

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalizedState));
    console.log("Saved state with timestamp:", now);

    // Log the change for future sync (if sync becomes a feature)
    logSyncChange("currentState", "update", "current", {
      timestamp: now,
      weekStartDate: state.currentWeekStartDate,
    }).catch((e) => console.warn("Failed to log current state change"));

    return true;
  } catch (error) {
    console.error("Error saving state to localStorage:", error);
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
    console.error("Error exporting data:", error);
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
    // Basic validation of the imported structure
    if (
      typeof importedData !== "object" ||
      importedData === null ||
      !importedData.currentState ||
      !Array.isArray(importedData.history)
    ) {
      throw new Error(
        "Invalid data structure. Required: 'currentState' object and 'history' array."
      );
    }

    // Validate schema version if present
    const importedVersion = importedData.appInfo?.schemaVersion || 0;
    if (importedVersion > SCHEMA.VERSION) {
      console.warn(
        `Importing data from newer schema version (${importedVersion} > ${SCHEMA.VERSION}). Some features may not work correctly.`
      );
    }

    // 1. Clear existing data
    console.log("Clearing existing data...");
    await clearHistoryStore();
    localStorage.removeItem(LOCAL_STORAGE_KEY);

    // 2. Restore current state with timestamp
    if (importedData.currentState) {
      // Add current metadata to the imported state
      const normalizedState = {
        ...importedData.currentState,
        lastModified: getCurrentTimestamp(),
        metadata: {
          schemaVersion: SCHEMA.VERSION,
          deviceId: getDeviceId(),
          importedFrom: importedData.appInfo?.deviceId || "unknown",
        },
      };

      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(normalizedState));
      console.log("Current state restored to localStorage.");
    } else {
      console.warn("No 'currentState' found in imported file.");
    }

    // 3. Restore history records one by one with normalization
    let importCount = 0;
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
              },
            };

            await saveWeekHistory(normalizedWeekData);
            importCount++;
          } else {
            console.warn(
              "Skipping invalid/incomplete history record during import:",
              weekData
            );
          }
        } catch (saveError) {
          console.error(
            `Error saving history week ${
              weekData.weekStartDate || "unknown"
            } during import:`,
            saveError
          );
          // Continue with other records even if one fails
        }
      }
      console.log(`${importCount} history records restored to IndexedDB.`);
    } else {
      console.log(
        "No history records found in imported data or history array is empty."
      );
    }

    // 4. Restore preferences if present
    if (
      importedData.preferences &&
      typeof importedData.preferences === "object"
    ) {
      let prefCount = 0;
      for (const [key, value] of Object.entries(importedData.preferences)) {
        try {
          await savePreference(key, value);
          prefCount++;
        } catch (prefError) {
          console.error(`Error importing preference '${key}':`, prefError);
        }
      }
      console.log(`${prefCount} preferences restored.`);
    }

    // Log the import as a sync change
    await logSyncChange("system", "import", "all", {
      timestamp: getCurrentTimestamp(),
      source: importedData.appInfo?.deviceId || "unknown",
      recordCount: {
        history: importedData.history?.length || 0,
        preferences: Object.keys(importedData.preferences || {}).length || 0,
      },
    });

    return true;
  } catch (error) {
    console.error("Error importing data:", error);
    throw new Error(`Import failed: ${error.message}`);
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
    console.log("Data service initialized successfully");
  } catch (error) {
    console.error("Failed to initialize data service:", error);
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
  console.log("Data service cleanup complete");
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
    console.error("Error getting DB stats:", error);
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
  console.log(`Test mode ENABLED with date: ${_testDate.toISOString()}`);
}

/**
 * Disable test mode and return to using real dates
 */
function disableTestMode() {
  _testModeEnabled = false;
  _testDate = null;
  console.log("Test mode DISABLED");
}

/**
 * Check if test mode is enabled
 * @returns {boolean} True if test mode is enabled
 */
function isTestModeEnabled() {
  return _testModeEnabled;
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

  // User preferences
  savePreference,
  getPreference,
  getAllPreferences,
  deletePreference,

  // Import/Export
  exportData,
  importData,

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
};
