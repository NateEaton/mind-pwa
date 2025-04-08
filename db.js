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


const DB_NAME = 'MindDietHistoryDB';
const STORE_NAME = 'weeklyHistory';
const DB_VERSION = 1;

let db;

// --- Helper Functions ---
// *** RENAMED function and UPDATED default logic to Sunday start ***
// startDay: 'Sunday' or 'Monday' - parameter added for future use, defaults to Sunday
function getWeekStartDate(d, startDay = 'Sunday') { // Default to Sunday
  d = new Date(d);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  let diff;

  if (startDay === 'Sunday') {
      // If Sunday is the start day, the difference is just the current date's day number
      diff = d.getDate() - day;
  } else { // Default to Monday logic if not Sunday (for future use or if called explicitly)
      // Original Monday logic:
      // Adjust when day is Sunday (0) to go back to the previous Monday (-6 days)
      // Otherwise, go back (day - 1) days to get to Monday
      diff = d.getDate() - day + (day === 0 ? -6 : 1);
  }

  const weekStart = new Date(d.setDate(diff));
  weekStart.setHours(0, 0, 0, 0); // Set to midnight

  // Format using local components (Corrected previously)
  const year = weekStart.getFullYear();
  const month = String(weekStart.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(weekStart.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`; // Return local YYYY-MM-DD
}


function initDB() {
  return new Promise((resolve, reject) => {
    if (db) {
      console.log("DB already initialized");
      return resolve(db);
    }

    console.log("Opening database...");
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("Database error:", event.target.errorCode);
      reject("Database error: " + event.target.errorCode);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("Database opened successfully:", db);
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      console.log("Upgrading database...");
      const tempDb = event.target.result;
      if (!tempDb.objectStoreNames.contains(STORE_NAME)) {
        tempDb.createObjectStore(STORE_NAME, { keyPath: 'weekStartDate' });
        console.log("Object store created:", STORE_NAME);
      }
    };
  });
}

async function saveWeekHistory(weekData) {
  await ensureDB();
  return new Promise((resolve, reject) => {
    // Check if db is actually available after ensureDB (paranoia check)
    if (!db) {
        return reject(new Error("Database connection not available for save operation."));
    }
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(weekData);

    request.onsuccess = () => {
      console.log("Week data saved successfully:", weekData.weekStartDate);
      resolve();
    };
    request.onerror = (event) => {
      console.error("Error saving week data:", event.target.error);
      reject("Error saving week data: " + event.target.error);
    };
     transaction.oncomplete = () => {
        console.log("Save transaction completed for store '" + STORE_NAME + "'.");
    };
    transaction.onerror = (event) => {
        console.error("Error during save transaction:", event.target.error);
        reject("Transaction error during save: " + event.target.error);
    };
  });
}

async function getWeekHistory(weekStartDate) {
  await ensureDB();
  return new Promise((resolve, reject) => {
    // Check if db is actually available after ensureDB (paranoia check)
    if (!db) {
        return reject(new Error("Database connection not available for get operation."));
    }
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(weekStartDate);

    request.onsuccess = (event) => {
      resolve(event.target.result); // Returns the record or undefined
    };
    request.onerror = (event) => {
      console.error("Error fetching week data:", event.target.error);
      reject("Error fetching week data: " + event.target.error);
    };
  });
}

async function getAllWeekHistory() {
  await ensureDB();
  return new Promise((resolve, reject) => {
    // Check if db is actually available after ensureDB (paranoia check)
    if (!db) {
        return reject(new Error("Database connection not available for getAll operation."));
    }
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll(); // Get all records

    request.onsuccess = (event) => {
      // Sort by week start date, descending (most recent first)
      const sortedResults = event.target.result.sort((a, b) => {
        return new Date(b.weekStartDate) - new Date(a.weekStartDate);
      });
      resolve(sortedResults);
    };
    request.onerror = (event) => {
      console.error("Error fetching all week data:", event.target.error);
      reject("Error fetching all week data: " + event.target.error);
    };
  });
}

// *** ADDED clearHistoryStore function (Required for Import) ***
async function clearHistoryStore() {
  await ensureDB(); // Make sure the DB connection is ready
  return new Promise((resolve, reject) => {
    // Check if db is actually available after ensureDB (paranoia check)
    if (!db) {
        return reject(new Error("Database connection not available for clear operation."));
    }
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear(); // The command to clear all data in the object store

    request.onsuccess = () => {
      console.log("Object store '" + STORE_NAME + "' cleared successfully.");
      resolve(); // Signal success
    };

    request.onerror = (event) => {
      console.error("Error clearing object store '" + STORE_NAME + "':", event.target.error);
      reject("Error clearing history store: " + event.target.error); // Signal failure
    };

    transaction.oncomplete = () => {
        console.log("Clear transaction completed for store '" + STORE_NAME + "'.");
    };
    transaction.onerror = (event) => {
        // This catches errors on the transaction level, though request.onerror is usually sufficient
        console.error("Error during clear transaction:", event.target.error);
        reject("Transaction error during clear: " + event.target.error);
    };
  });
}


// Ensure the database is initialized before any operations
async function ensureDB() {
  if (!db) {
    console.log("ensureDB: DB not initialized, calling initDB...");
    try {
        db = await initDB();
        if (!db) throw new Error("initDB resolved but DB object still null");
        console.log("ensureDB: DB initialization seems successful.");
    } catch (error) {
         console.error("ensureDB: Failed to initialize DB:", error);
         // Re-throw the error so calling functions know it failed
         throw new Error(`Database initialization failed in ensureDB: ${error.message || error}`);
    }
  }
   // Add a final check even if db was thought to be initialized previously
   if (!db) {
       throw new Error("DB object not available even after ensureDB logic.");
   }
}

// Make getWeekStartDate available outside the module if needed elsewhere (less common now)
// window.getWeekStartDate = getWeekStartDate; // *** UPDATED/COMMENTED OUT GLOBAL EXPOSURE ***
window.saveWeekHistory = saveWeekHistory; // Still exposed for potential debugging? Prefer module imports.
window.getWeekHistory = getWeekHistory;
window.getAllWeekHistory = getAllWeekHistory;

// Export functions for use in app.js
export {
  initDB,
  db, // Export the db instance itself if needed elsewhere
  saveWeekHistory,
  getWeekHistory,
  getAllWeekHistory,
  getWeekStartDate, // *** UPDATED EXPORT NAME ***
  clearHistoryStore // Ensure this is exported
};
