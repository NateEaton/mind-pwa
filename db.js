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
function getMonday(d) {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday (0)
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0); // Set to midnight
  // Replace use of toISOString()
  // return monday.toISOString().split('T')[0]; // Return YYYY-MM-DD
  // Format using local components
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(monday.getDate()).padStart(2, '0');
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
  });
}

async function getWeekHistory(weekStartDate) {
  await ensureDB();
  return new Promise((resolve, reject) => {
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

// For purge before import
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
    db = await initDB();
    if (!db) throw new Error("DB object not available even after delay");
  }
}

// Make getMonday available outside the module if needed elsewhere
window.getMonday = getMonday;
window.saveWeekHistory = saveWeekHistory;
window.getWeekHistory = getWeekHistory;
window.getAllWeekHistory = getAllWeekHistory;

// Export functions for use in app.js
export {
  initDB,
  db,
  saveWeekHistory,
  getWeekHistory,
  getAllWeekHistory,
  clearHistoryStore,
  getMonday
};