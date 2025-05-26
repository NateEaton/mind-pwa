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

// Detect if we're running on the Vercel demo site
const isDemoHost = window?.location?.hostname?.includes("vercel.app");

// At the very beginning of app.js (similar to early token detection)
(function detectOAuthRedirect() {
  // Check for Dropbox token in URL hash
  if (window.location.hash.includes("access_token=")) {
    try {
      // Extract the token
      const accessToken = window.location.hash.match(/access_token=([^&]*)/)[1];

      // Store the token for later use
      localStorage.setItem("dropbox_access_token", accessToken);

      // Try to extract state parameter
      let appState = null;
      const stateMatch = window.location.hash.match(/state=([^&]*)/);

      if (stateMatch && stateMatch[1]) {
        try {
          // Decode the state parameter
          appState = JSON.parse(atob(decodeURIComponent(stateMatch[1])));
          console.log("Recovered app state from OAuth redirect:", appState);

          // Store state for use after initialization
          localStorage.setItem("dropbox_auth_state", JSON.stringify(appState));
        } catch (e) {
          console.error("Error decoding state parameter:", e);
        }
      }

      console.log("Dropbox OAuth token detected and stored");

      // Clear hash from URL to prevent reprocessing
      window.history.replaceState(
        null,
        document.title,
        window.location.pathname + window.location.search
      );
    } catch (error) {
      console.error("Error extracting OAuth token:", error);
    }
  }
})();

import dataService from "./dataService.js";
import stateManager from "./stateManager.js";
import uiRenderer from "./uiRenderer.js";
import appUtils from "./appUtils.js";
import CloudSyncManager from "./cloudSync.js";

import { createLogger, configure, LOG_LEVELS } from "./logger.js";
const logger = createLogger("app");

(function initializeLogger() {
  try {
    const storedLogLevel = localStorage.getItem("appLogLevel");

    // Initial setup using stored level or fallback to INFO
    configure({
      defaultLevel: storedLogLevel
        ? LOG_LEVELS[storedLogLevel]
        : LOG_LEVELS.INFO,
      useColors: true,
      showTimestamp: true,
      moduleConfig: {
        cloudSync: LOG_LEVELS.INFO,
        googleDriveProvider: LOG_LEVELS.INFO,
        dropboxProvider: LOG_LEVELS.INFO,
      },
    });

    logger.debug(`Logger bootstrapped with level: ${storedLogLevel || "INFO"}`);
  } catch (error) {
    console.error("Logger bootstrap failed:", error);
  }
})();

// --- Application Configuration ---
const foodGroups = [
  // Daily Positive
  {
    id: "whole_grains",
    name: "Whole Grains",
    frequency: "day",
    target: 3,
    unit: "servings",
    type: "positive",
    description:
      "Serving examples: 1 slice whole-grain bread, ½ cup cooked whole grains (oats, quinoa, brown rice), ½ cup whole-grain cereal, 3 cups popped popcorn.",
  },
  {
    id: "other_veg",
    name: "Other Vegetables",
    frequency: "day",
    target: 1,
    unit: "serving",
    type: "positive",
    description:
      "Serving examples: ½ cup cooked or 1 cup raw non-starchy vegetables (broccoli, peppers, carrots, tomatoes, zucchini, onions, etc.). Excludes potatoes.",
  },
  {
    id: "olive_oil",
    name: "Olive Oil",
    frequency: "day",
    target: 1,
    unit: "Tbsp (main oil)",
    type: "positive",
    description:
      "Use extra virgin olive oil (EVOO) as your principal oil for cooking, dressings, etc. Aim for at least 1 Tbsp use daily.",
  },

  // Weekly Positive
  {
    id: "leafy_greens",
    name: "Green Leafy Vegetables",
    frequency: "week",
    target: 6,
    unit: "servings",
    type: "positive",
    description:
      "Serving examples: 1 cup raw or ½ cup cooked leafy greens (spinach, kale, collards, romaine, arugula, etc.).",
  },
  {
    id: "nuts",
    name: "Nuts",
    frequency: "week",
    target: 5,
    unit: "servings",
    type: "positive",
    description:
      "Serving examples: ¼ cup nuts or 2 Tbsp nut butter (almonds, walnuts, pecans preferred; avoid heavily salted/sugared nuts).",
  },
  {
    id: "beans",
    name: "Beans",
    frequency: "week",
    target: 4,
    unit: "servings",
    type: "positive",
    description:
      "Serving examples: ½ cup cooked beans, lentils, or legumes (kidney, black, pinto beans, chickpeas, soybeans, etc.).",
  },
  {
    id: "berries",
    name: "Berries",
    frequency: "week",
    target: 2,
    unit: "servings",
    type: "positive",
    description:
      "Serving examples: ½ cup fresh or frozen berries (blueberries strongly recommended, strawberries, raspberries, blackberries).",
  },
  {
    id: "poultry",
    name: "Poultry",
    frequency: "week",
    target: 2,
    unit: "servings",
    type: "positive",
    description:
      "Serving examples: 3-4 oz cooked chicken or turkey (prefer skinless, not fried).",
  },
  {
    id: "fish",
    name: "Fish",
    frequency: "week",
    target: 1,
    unit: "serving",
    type: "positive",
    description:
      "Serving examples: 3-4 oz cooked fish (prefer oily fish like salmon, mackerel, sardines; avoid fried fish).",
  },
  {
    id: "wine",
    name: "Wine",
    frequency: "day",
    target: 1,
    unit: "glass (max)",
    type: "limit",
    isOptional: true,
    description:
      "Optional: Limit to no more than one standard glass (approx. 5 oz) per day. Preferrably red wine.",
  },

  // Weekly Limit
  {
    id: "red_meat",
    name: "Red Meats",
    frequency: "week",
    target: 3,
    unit: "servings (max)",
    type: "limit",
    description:
      "Limit to less than 4 servings/week (target ≤3). Serving ~3-4 oz cooked. Includes beef, pork, lamb, and processed meats.",
  },
  {
    id: "butter_margarine",
    name: "Butter/Margarine",
    frequency: "day",
    target: 1,
    unit: "Tbsp (max)",
    type: "limit",
    description:
      "Limit butter to less than 1 Tbsp per day. Avoid stick margarine entirely.",
  },
  {
    id: "cheese",
    name: "Cheese",
    frequency: "week",
    target: 1,
    unit: "serving (max)",
    type: "limit",
    description:
      "Limit full-fat cheese to less than 1 serving/week (target ≤1). Serving ~1-1.5 oz.",
  },
  {
    id: "pastries_sweets",
    name: "Pastries & Sweets",
    frequency: "week",
    target: 4,
    unit: "servings (max)",
    type: "limit",
    description:
      "Limit pastries and sweets to less than 5 servings/week (target ≤4). Includes cakes, cookies, candies, ice cream, sugary drinks etc.",
  },
  {
    id: "fried_fast_food",
    name: "Fried/Fast Food",
    frequency: "week",
    target: 1,
    unit: "serving (max)",
    type: "limit",
    description:
      "Limit fried food (especially commercial) and fast food to less than 1 serving/week (target ≤1).",
  },
];

// State for Edit Totals Modal (in global scope since it needs to be accessed by multiple functions)
let editingWeekDataRef = null; // Reference to the data being edited
let editingSource = null; // 'current' or 'history'
let editedTotals = {}; // Temporary object holding edits within the modal
let cloudSync = null;
let syncEnabled = false;
let syncReady = false;
let sectionCollapseState = {}; // Track which sections are expanded/collapsed
let editingHistoryWeekDataRef = null; // -> The original history record from stateManager.state.history
let tempEditedDailyBreakdown = {}; // -> A deep copy of dailyBreakdown being modified in the modal
let selectedDayInHistoryModal = null; // -> YYYY-MM-DD string of the day currently active in the modal's day selector
let historyModalFoodGroups = []; // -> foodGroups array to use when rendering the modal list

function setSyncReady(ready) {
  syncReady = ready;
  updateSyncUIElements();
  logger.info("Sync readiness set to:", syncReady);
}

// Make function available globally
window.setSyncReady = function (ready) {
  setSyncReady(ready);
};

// DOM Elements - these would eventually be moved to a dedicated module
const domElements = {
  // Menu elements
  mainMenu: document.getElementById("main-menu"),
  aboutBtn: document.getElementById("about-btn"),
  settingsBtn: document.getElementById("settings-btn"),

  exportBtn: document.getElementById("export-btn"),
  importBtnTrigger: document.getElementById("import-btn-trigger"),
  importFileInput: document.getElementById("import-file-input"),

  // Edit totals modal elements
  editCurrentWeekBtn: document.getElementById("edit-current-week-btn"),
  editHistoryWeekBtn: document.getElementById("edit-history-week-btn"),
  editTotalsModal: document.getElementById("edit-totals-modal"),
  editTotalsTitle: document.getElementById("edit-totals-title"),
  editTotalsList: document.getElementById("edit-totals-list"),
  editTotalsItemTemplate: document.getElementById("edit-totals-item-template"),
  editTotalsCloseBtn: document.getElementById("edit-totals-close-btn"),
  editTotalsCancelBtn: document.getElementById("edit-totals-cancel-btn"),
  editTotalsSaveBtn: document.getElementById("edit-totals-save-btn"),

  // Footer elements
  appVersionElement: document.getElementById("app-version"),
};

/**
 * Update the sync UI elements based on current state
 */
function updateSyncUIElements() {
  // Check if online
  const isOnline = navigator.onLine;

  // Check if we have a cloud sync manager
  const hasSyncManager = !!cloudSync;

  // Check authentication status (provider-specific)
  let isAuthenticated = false;
  let providerName = "none";

  if (hasSyncManager && cloudSync.provider) {
    // Get provider name for more detailed logging
    providerName = cloudSync.provider.constructor.name;

    // Check if the current provider is authenticated
    if (providerName.includes("Dropbox")) {
      // For Dropbox, check if we have an access token
      isAuthenticated = !!cloudSync.provider.ACCESS_TOKEN;
    } else {
      // For Google Drive, use the internal flag
      isAuthenticated = cloudSync.isAuthenticated;
    }
  }

  // Get other sync state
  const isReady = syncReady;
  const syncInProgress = hasSyncManager && cloudSync.syncInProgress;

  // Condition for when sync should be enabled
  const syncButtonEnabled =
    isOnline &&
    hasSyncManager &&
    isAuthenticated &&
    isReady &&
    !syncInProgress &&
    syncEnabled;

  logger.info("Updating sync UI elements with state:", {
    online: isOnline,
    cloudSyncExists: hasSyncManager,
    providerName,
    isAuthenticated,
    syncReady: isReady,
    syncInProgress,
    syncEnabled,
    syncButtonEnabled,
  });

  // Update main menu sync button
  const menuSyncBtn = document.getElementById("sync-btn");
  if (menuSyncBtn) {
    menuSyncBtn.disabled = !syncButtonEnabled;

    if (syncInProgress) {
      menuSyncBtn.innerHTML = `<i class="mdi mdi-sync mdi-spin"></i> Syncing...`;
      menuSyncBtn.classList.add("syncing");
    } else {
      menuSyncBtn.innerHTML = `<i class="mdi mdi-cloud-sync-outline"></i> Sync Now`;
      menuSyncBtn.classList.remove("syncing");
    }
  }

  // Update settings dialog sync button
  const settingsSyncBtn = document.getElementById("sync-now-btn");
  if (settingsSyncBtn) {
    settingsSyncBtn.disabled = !syncButtonEnabled;

    // Optionally update button text here too
    if (syncInProgress) {
      settingsSyncBtn.textContent = "Syncing...";
      settingsSyncBtn.classList.add("syncing");
    } else {
      settingsSyncBtn.textContent = "Sync Now";
      settingsSyncBtn.classList.remove("syncing");
    }
  }

  // Update sync status indicator in settings if it exists
  const syncStatusEl = document.getElementById("sync-status");
  if (syncStatusEl) {
    let statusText = "Not connected";

    if (!isOnline) {
      statusText = "Offline";
    } else if (!hasSyncManager) {
      statusText = "Not initialized";
    } else if (syncInProgress) {
      statusText = "Syncing...";
    } else if (isAuthenticated) {
      statusText = "Connected";
    } else {
      statusText = "Authentication required";
    }

    syncStatusEl.textContent = statusText;
    syncStatusEl.className =
      "status-value " + (isAuthenticated ? "connected" : "disconnected");
  }
}

// In app.js - Improve network status monitoring
function setupNetworkListeners() {
  // Track current online status
  let isOnline = navigator.onLine;
  logger.info("Initial network status:", isOnline ? "Online" : "Offline");

  // Listen for online event
  window.addEventListener("online", () => {
    logger.info("Device came online");
    isOnline = true;

    // Update UI elements
    updateSyncUIElements();

    // Optionally notify the user
    uiRenderer.showToast("Network connection restored", "info");

    // Try to sync when device comes online
    if (syncEnabled && cloudSync && syncReady) {
      syncData();
    }
  });

  // Listen for offline event
  window.addEventListener("offline", () => {
    logger.info("Device went offline");
    isOnline = false;

    // Update UI elements
    updateSyncUIElements();

    // Optionally notify the user
    uiRenderer.showToast("Network connection lost", "warning");
  });

  // For mobile devices, check connection type changes if available
  if ("connection" in navigator && navigator.connection) {
    navigator.connection.addEventListener("change", () => {
      const connectionType = navigator.connection.type;
      logger.info("Connection type changed:", connectionType);

      // Update UI if we have a wifi-only constraint
      const syncWifiOnly = cloudSync?.syncWifiOnly || false;
      if (syncWifiOnly) {
        updateSyncUIElements();
      }

      // Log connection details for debugging
      const connectionDetails = {
        type: navigator.connection.type,
        effectiveType: navigator.connection.effectiveType,
        downlinkMax: navigator.connection.downlinkMax,
        downlink: navigator.connection.downlink,
        rtt: navigator.connection.rtt,
        saveData: navigator.connection.saveData,
      };
      logger.debug("Connection details:", connectionDetails);
    });
  }
}

async function finalizeLoggerConfig() {
  try {
    const configModule = await import("./config.js");
    const isDevMode = configModule.CONFIG?.DEV_MODE || false;

    const storedLogLevel = localStorage.getItem("appLogLevel");
    const effectiveLevel = storedLogLevel
      ? LOG_LEVELS[storedLogLevel]
      : isDevMode
      ? LOG_LEVELS.DEBUG
      : LOG_LEVELS.INFO;

    // Apply logger configuration
    configure({ defaultLevel: effectiveLevel });

    // If no level was stored, persist the one we just applied
    if (!storedLogLevel) {
      const effectiveLevelName =
        Object.entries(LOG_LEVELS).find(
          ([, val]) => val === effectiveLevel
        )?.[0] || "INFO";

      localStorage.setItem("appLogLevel", effectiveLevelName);
      logger.debug(
        `Persisted log level '${effectiveLevelName}' to localStorage`
      );
    }

    logger.debug(
      `Logger finalized with level: ${
        storedLogLevel || (isDevMode ? "DEBUG" : "INFO")
      }`
    );
  } catch (err) {
    logger.warn("Could not finalize logger config with config.js:", err);
  }
}

/**
 * Initialize the application
 */
async function initializeApp() {
  logger.info("Initializing app...");

  await finalizeLoggerConfig(); // Ensures DEV_MODE-aware logging early

  try {
    // Initialize data service first
    await dataService.initialize();

    // Initialize state manager with food groups configuration
    await stateManager.initialize(foodGroups);

    // Initialize UI renderer
    uiRenderer.initialize();

    // Render all UI components after initialization
    uiRenderer.renderEverything();

    // Set initial active view
    uiRenderer.setActiveView("tracker");

    // Register service worker
    appUtils.registerServiceWorker();

    // Display app version in footer
    await appUtils.loadAppVersion(domElements.appVersionElement);

    // Setup event listeners
    setupEventListeners();

    // Check if test mode is active and add banner if needed
    if (dataService.isTestModeEnabled()) {
      const testDate = dataService.getCurrentDate();
      appUtils.addTestModeBanner(
        `TEST MODE: Using date ${testDate.toLocaleDateString()}`
      );
    }

    // 5. Setup network listeners
    setupNetworkListeners();

    // 6. Initialize cloud sync capabilities
    const syncInitialized = await initializeCloudSync();

    // 7. Perform initial sync if enabled and initialized
    if (syncEnabled && syncReady) {
      logger.info("Performing initial sync");
      await syncData();
    }

    logger.info("App initialization complete");
  } catch (error) {
    logger.error("Error during app initialization:", error);
    uiRenderer.showToast(`Initialization Error: ${error.message}`, "error", {
      duration: 5000,
    });
  }
}

/**
 * Initialize cloud sync based on user preferences and stored auth state
 * @returns {Promise<boolean>} Whether sync was successfully initialized
 */
async function initializeCloudSync() {
  // First, check if sync is enabled - exit early if not
  syncEnabled = await dataService.getPreference("cloudSyncEnabled", false);
  logger.debug("Initial syncEnabled value:", syncEnabled);

  if (!syncEnabled) {
    logger.info("Cloud sync is disabled in preferences");
    return false;
  }

  // Set sync readiness to false initially
  setSyncReady(false);

  try {
    // Load all sync preferences at once
    const [syncProvider, autoSyncInterval, syncWifiOnly] = await Promise.all([
      dataService.getPreference("cloudSyncProvider", "gdrive"),
      dataService.getPreference("autoSyncInterval", 15),
      dataService.getPreference("syncWifiOnly", false),
    ]);

    // Determine effective provider based on configuration and auth state
    let effectiveProvider = syncProvider;
    let hasDropboxAuthRedirect = false;

    // Only process Dropbox-specific elements if Dropbox is the configured provider
    // or we explicitly detect a Dropbox redirect in URL
    const hasDropboxTokenInUrl = window.location.hash.includes("access_token=");

    if (syncProvider === "dropbox" || hasDropboxTokenInUrl) {
      // Check for stored auth state
      const storedAuthState = localStorage.getItem("dropbox_auth_state");
      if (storedAuthState) {
        try {
          const authState = JSON.parse(storedAuthState);

          // Clear stored state immediately
          localStorage.removeItem("dropbox_auth_state");

          // Check if state is recent (within 10 minutes)
          const stateAge = Date.now() - authState.timestamp;
          if (stateAge <= 10 * 60 * 1000) {
            logger.info("Found recent Dropbox auth state");
            effectiveProvider = "dropbox";
            hasDropboxAuthRedirect = true;
          } else {
            logger.info("Stored auth state expired, ignoring");
          }
        } catch (e) {
          logger.error("Error processing stored auth state:", e);
        }
      }

      // Force provider to dropbox if token is in URL
      if (hasDropboxTokenInUrl) {
        logger.info("Detected Dropbox token in URL hash");
        effectiveProvider = "dropbox";
      }
    }

    logger.info(`Initializing cloud sync with provider: ${effectiveProvider}`);

    // Create and initialize cloud sync manager
    cloudSync = new CloudSyncManager(
      dataService,
      stateManager,
      handleSyncComplete,
      handleSyncError
    );

    // Set network constraints
    cloudSync.syncWifiOnly = syncWifiOnly;

    // Initialize provider
    const initResult = await cloudSync.initialize(effectiveProvider);

    // Check if initialization failed due to missing config
    if (!initResult) {
      logger.warn(
        "Cloud sync initialization failed: Config missing or invalid"
      );

      // Show a user-friendly toast
      uiRenderer.showToast(
        "Cloud sync is disabled: API keys not configured",
        "warning",
        { duration: 5000 }
      );

      // Update preferences to disable sync
      await dataService.savePreference("cloudSyncEnabled", false);
      syncEnabled = false;

      // Update UI to reflect sync is disabled
      updateSyncUIElements();
      return false;
    }

    logger.info("Cloud sync initialized successfully");

    // Configure auto-sync
    if (autoSyncInterval > 0) {
      cloudSync.startAutoSync(autoSyncInterval);
      logger.info(`Auto-sync configured for every ${autoSyncInterval} minutes`);
    }

    // Handle Dropbox auth redirect case - only relevant for Dropbox
    if (effectiveProvider === "dropbox" && hasDropboxAuthRedirect) {
      // Update preferences since we now have a token
      await dataService.savePreference("cloudSyncEnabled", true);
      await dataService.savePreference("cloudSyncProvider", "dropbox");

      // Show settings dialog after a short delay to provide feedback
      setTimeout(() => {
        showSettings();
        // Show success toast
        uiRenderer.showToast("Dropbox connected successfully", "success");

        // Set sync ready AFTER the settings dialog is shown
        // This delay ensures the auto-sync doesn't happen immediately
        setTimeout(() => {
          setSyncReady(true);
        }, 1000);
      }, 500);

      // Return early WITHOUT setting syncReady=true
      return true;
    }

    // Mark sync as ready
    setSyncReady(true);

    // Update UI elements
    updateSyncUIElements();

    return true;
  } catch (error) {
    logger.error("Failed to initialize cloud sync:", error);
    // Keep sync disabled but don't interrupt app initialization
    setSyncReady(false);
    updateSyncUIElements();

    // Show error to user
    uiRenderer.showToast(
      `Cloud sync initialization failed: ${error.message}`,
      "error",
      { duration: 5000 }
    );

    return false;
  }
}

function setupSyncButton() {
  // Create the sync button if it doesn't exist
  let syncBtn = document.getElementById("sync-btn");

  if (!syncBtn) {
    syncBtn = document.createElement("button");
    syncBtn.id = "sync-btn";
    syncBtn.innerHTML = `<i class="mdi mdi-cloud-sync-outline"></i> Sync Now`;

    syncBtn.addEventListener("click", () => {
      logger.info("Sync button clicked");
      closeMenu();
      syncData();
    });

    // Add li element to menu
    const syncLi = document.createElement("li");
    syncLi.appendChild(syncBtn);

    // Find the Settings button's parent li element
    const importLi = document
      .getElementById("import-btn-trigger")
      .closest("li");

    // Insert sync button after the Settings button
    if (importLi && importLi.nextSibling) {
      importLi.parentNode.insertBefore(syncLi, importLi.nextSibling);
    } else {
      // Fallback: just append to the list
      const menuList = document.querySelector("#main-menu ul");
      if (menuList) {
        menuList.appendChild(syncLi);
      }
    }
  }

  // Initial button state
  updateSyncUIElements();
}

/**
 * Callback for when a day is selected in the Daily Tracker's day navigation bar.
 * @param {string} newSelectedDateStr - The YYYY-MM-DD string of the newly selected date.
 */
function handleTrackerDaySelect(newSelectedDateStr) {
  logger.debug(`Tracker day selected: ${newSelectedDateStr}`);
  const currentState = stateManager.getState();

  // Basic validation: ensure the newSelectedDateStr is within the current week
  const weekStartDateObj = new Date(
    currentState.currentWeekStartDate + "T00:00:00"
  );
  const weekEndDateObj = new Date(weekStartDateObj);
  weekEndDateObj.setDate(weekStartDateObj.getDate() + 6);
  const newSelectedDateObj = new Date(newSelectedDateStr + "T00:00:00");

  if (
    newSelectedDateObj >= weekStartDateObj &&
    newSelectedDateObj <= weekEndDateObj
  ) {
    stateManager.dispatch({
      type: stateManager.ACTION_TYPES.SET_SELECTED_TRACKER_DATE,
      payload: { date: newSelectedDateStr },
    });
  } else {
    logger.warn(
      `Attempted to select date ${newSelectedDateStr} outside of current week ${currentState.currentWeekStartDate}. Ignoring.`
    );
    // Optionally, provide feedback to the user or revert the visual selection in UI
    // For now, uiRenderer will re-render based on state, so if state doesn't change, UI won't either.
    // However, the button clicked might stay 'active' visually until next state-driven render.
    // To fix this, uiRenderer.renderDaySelectorBar might need to be called again with current state.selectedTrackerDate
    // if the selection is invalid. Or, the click handler in renderDaySelectorBar could be smarter.
    // For Phase 1, this level of edge case handling might be deferred.
  }
}

// Expose it for uiRenderer (TEMPORARY - better to pass via initialize or a proper interface)
// If uiRenderer.initialize can take callbacks:
// uiRenderer.initialize({ onTrackerDaySelect: handleTrackerDaySelect });
// For now, using a temporary window object:
if (!window.app) window.app = {};
window.app.handleTrackerDaySelect = handleTrackerDaySelect;

/**
 * Setup all event listeners for the application
 */
function setupEventListeners() {
  // Navigation buttons (using event delegation)
  document
    .querySelector(".tab-bar")
    .addEventListener("click", handleNavigation);

  // Menu toggle functionality
  const tabMenuBtn = document.getElementById("tab-menu-btn");
  if (tabMenuBtn) {
    tabMenuBtn.addEventListener("click", (event) => {
      event.preventDefault();
      toggleMenu();
    });
  }

  // Menu related
  document.addEventListener("click", handleOutsideMenuClick);

  // Menu items
  domElements.settingsBtn.addEventListener("click", handleSettings);
  domElements.userGuideBtn = document.getElementById("user-guide-btn");
  domElements.aboutBtn.addEventListener("click", handleAboutClick);

  // New single-container approach
  const foodTrackerContainer = document.getElementById("food-tracker");
  if (foodTrackerContainer) {
    foodTrackerContainer.addEventListener("click", handleCounterClick);
    foodTrackerContainer.addEventListener("change", handleCounterInputChange);
    foodTrackerContainer.addEventListener("input", handleCounterInputChange);
    foodTrackerContainer.addEventListener("click", handleInfoClick);
  }

  // History navigation
  const prevWeekBtn = document.getElementById("prev-week-btn");
  const nextWeekBtn = document.getElementById("next-week-btn");
  const historyDatePicker = document.getElementById("history-date-picker");

  prevWeekBtn.addEventListener("click", handlePrevWeek);
  nextWeekBtn.addEventListener("click", handleNextWeek);
  historyDatePicker.addEventListener("change", handleHistoryDatePick);

  // Modal listeners
  document
    .getElementById("modal-close-btn")
    .addEventListener("click", () => uiRenderer.closeModal());
  document
    .getElementById("generic-modal")
    .addEventListener("click", (event) => {
      if (event.target === document.getElementById("generic-modal"))
        uiRenderer.closeModal();
    });

  // Edit totals modal
  if (domElements.editHistoryWeekBtn) {
    domElements.editHistoryWeekBtn.addEventListener(
      "click",
      openEditHistoryDailyDetailsModal
    );
  }

  // Listeners for the "Edit History Daily Details" Modal (repurposed #edit-totals-modal)
  const modalFoodList = uiRenderer.domElements.modalElements.editTotalsList;
  if (modalFoodList) {
    modalFoodList.addEventListener("click", handleModalDailyDetailChange);
    // If you add direct input fields to this list later, add 'input' or 'change' listeners too
  }

  const modalSaveBtn = uiRenderer.domElements.modalElements.editTotalsSaveBtn;
  if (modalSaveBtn) {
    modalSaveBtn.addEventListener("click", saveEditedHistoryDailyDetails);
  }

  const modalCancelBtn =
    uiRenderer.domElements.modalElements.editTotalsCancelBtn;
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener("click", closeEditHistoryDailyDetailsModal);
  }

  const modalCloseIconBtn =
    uiRenderer.domElements.modalElements.editTotalsCloseBtn;
  if (modalCloseIconBtn) {
    modalCloseIconBtn.addEventListener(
      "click",
      closeEditHistoryDailyDetailsModal
    );
  }

  // Listener for clicking outside the modal content to close (if desired for this specific modal)
  const editModalContainer =
    uiRenderer.domElements.modalElements.editTotalsModal;
  if (editModalContainer) {
    editModalContainer.addEventListener("click", (event) => {
      if (event.target === editModalContainer) {
        // Clicked on the overlay itself
        closeEditHistoryDailyDetailsModal();
      }
    });
  }

  // User Guide button
  if (domElements.userGuideBtn) {
    domElements.userGuideBtn.addEventListener("click", handleUserGuideClick);
  }

  // Add sync event listeners
  window.addEventListener("online", () => {
    // Try to sync when device comes online
    if (syncEnabled && cloudSync) {
      syncData();
    }
  });

  // Attempt to sync before unload
  window.addEventListener("beforeunload", () => {
    if (syncEnabled && cloudSync && navigator.onLine) {
      // Use a synchronous approach for beforeunload
      try {
        // Create a sync record but don't wait for response
        const currentState = dataService.loadState();
        if (cloudSync.provider && cloudSync.isAuthenticated) {
          const fileInfo = cloudSync.provider.findOrCreateFile(
            "mind-diet-current-week.json"
          );
          if (fileInfo && fileInfo.id) {
            cloudSync.provider.uploadFile(fileInfo.id, currentState);
          }
        }
      } catch (e) {
        logger.warn("Could not sync on page unload:", e);
      }
    }
  });

  // Setup sync button
  setupSyncButton();

  // Add a sync settings option to the Settings menu
  const oldSettingsBtn = document.getElementById("settings-btn");
  if (oldSettingsBtn) {
    oldSettingsBtn.addEventListener("click", async () => {
      await showSettings();
    });
  }

  domElements.exportBtn.addEventListener("click", handleExport);
  domElements.importBtnTrigger.addEventListener("click", triggerImport);
  domElements.importFileInput.addEventListener(
    "change",
    handleImportFileSelect
  );
}

/**
 * Handle navigation button clicks
 * @param {Event} event - The click event
 */
function handleNavigation(event) {
  const button = event.target.closest("button[data-view]");
  if (!button) return;

  const viewId = button.dataset.view;
  uiRenderer.setActiveView(viewId);
}

/**
 * Toggle the main menu
 */
function toggleMenu() {
  const menuBtn = document.getElementById("tab-menu-btn");
  logger.debug(
    "Toggling menu, current state:",
    domElements.mainMenu.classList.contains("menu-open")
  );

  // Only position if the menu isn't already open (to prevent repositioning when closing)
  if (!domElements.mainMenu.classList.contains("menu-open")) {
    if (menuBtn) {
      const menuBtnRect = menuBtn.getBoundingClientRect();

      domElements.mainMenu.style.top = menuBtnRect.bottom + 5 + "px";
      domElements.mainMenu.style.right =
        window.innerWidth - menuBtnRect.right + "px";
      domElements.mainMenu.style.left = "auto";
    }
  }

  domElements.mainMenu.classList.toggle("menu-open");
  logger.debug(
    "Menu toggled, new state:",
    domElements.mainMenu.classList.contains("menu-open")
  );
}

/**
 * Handle clicks outside the menu to close it
 * @param {Event} event - The click event
 */
function handleOutsideMenuClick(event) {
  const tabMenuBtn = document.getElementById("tab-menu-btn");

  if (
    !domElements.mainMenu.contains(event.target) &&
    !(tabMenuBtn && tabMenuBtn.contains(event.target)) &&
    domElements.mainMenu.classList.contains("menu-open")
  ) {
    closeMenu();
  }
}

/**
 * Close the main menu
 */
function closeMenu() {
  domElements.mainMenu.classList.remove("menu-open");
}

/**
 * Handle counter button clicks in the tracker view
 * @param {Event} event - The click event
 */
function handleCounterClick(event) {
  const button = event.target.closest(".increment-btn, .decrement-btn");
  if (!button) return;

  const item = button.closest(".food-group-item");
  if (!item) return;

  const groupId = item.dataset.id;
  const input = item.querySelector(".count-input");
  // const frequency = input.dataset.frequency; // No longer needed from input dataset for this logic

  // Get the currently selected date from the state manager
  const currentState = stateManager.getState();
  const selectedDate = currentState.selectedTrackerDate;

  if (!selectedDate) {
    logger.error(
      "handleCounterClick: selectedTrackerDate is not available in state. Cannot update count."
    );
    uiRenderer.showToast("Error: No date selected to update.", "error");
    return;
  }

  let currentValue = parseInt(input.value, 10) || 0;
  let valueChanged = false;

  if (button.classList.contains("increment-btn")) {
    currentValue++;
    valueChanged = true;
  } else if (button.classList.contains("decrement-btn")) {
    const oldValue = currentValue;
    currentValue = Math.max(0, currentValue - 1);
    valueChanged = currentValue < oldValue; // Only true if value actually decreased
  }

  if (valueChanged) {
    logger.debug(
      `handleCounterClick: Updating count for date: ${selectedDate}, group: ${groupId}, new value: ${currentValue}`
    );
    appUtils.triggerHapticFeedback(30);

    // Call stateManager.updateDailyCount with the selectedDate
    stateManager.updateDailyCount(selectedDate, groupId, currentValue);
    // The stateManager.updateDailyCount action creator will handle dispatch and metadata updates.
    // UI will re-render via subscription.
  }
}

/**
 * Handle counter input changes in the tracker view
 * @param {Event} event - The input change event
 */
function handleCounterInputChange(event) {
  const input = event.target;
  if (!input || !input.classList.contains("count-input")) return;

  const item = input.closest(".food-group-item");
  if (!item) return;

  const groupId = item.dataset.id;
  let newValue = parseInt(input.value, 10);

  // Get the currently selected date from the state manager
  const currentState = stateManager.getState();
  const selectedDate = currentState.selectedTrackerDate;

  if (!selectedDate) {
    logger.error(
      "handleCounterInputChange: selectedTrackerDate is not available in state. Cannot update count."
    );
    // Potentially revert input or show error, but stateManager call will be skipped
    return;
  }

  // Validate input
  if (isNaN(newValue) || newValue < 0) {
    newValue = 0;
    // No, do not set input.value = newValue here. Let the UI re-render from state.
    // If the state doesn't change because the parsed value is the same as current,
    // the input might flicker if we set it here. The source of truth is the state.
  }

  logger.debug(
    `handleCounterInputChange: Updating count for date: ${selectedDate}, group: ${groupId}, new value: ${newValue}`
  );
  // Call stateManager.updateDailyCount with the selectedDate
  stateManager.updateDailyCount(selectedDate, groupId, newValue);
  // UI will re-render via subscription.
}

/**
 * Handle info button clicks
 * @param {Event} event - The click event
 */
function handleInfoClick(event) {
  const infoButton = event.target.closest(".info-btn");
  if (!infoButton) return;

  const groupId = infoButton.dataset.groupId;
  if (!groupId) return;

  const group = stateManager.getFoodGroup(groupId);
  if (!group || !group.description) {
    uiRenderer.showToast("Details not available.", "error");
    return;
  }

  // Prepare content with line breaks
  const descriptionHtml = group.description.replace(/\n/g, "<br>");
  uiRenderer.openModal(group.name, descriptionHtml);
}

/**
 * Handle previous week button in history view
 */
function handlePrevWeek() {
  const state = stateManager.getState();
  if (state.currentHistoryIndex < state.history.length - 1) {
    const newIndex = state.currentHistoryIndex + 1;
    stateManager.dispatch({
      type: stateManager.ACTION_TYPES.SET_HISTORY_INDEX,
      payload: { index: newIndex },
    });
  }
}

/**
 * Handle next week button in history view
 */
function handleNextWeek() {
  const state = stateManager.getState();
  if (state.currentHistoryIndex > 0) {
    const newIndex = state.currentHistoryIndex - 1;
    stateManager.dispatch({
      type: stateManager.ACTION_TYPES.SET_HISTORY_INDEX,
      payload: { index: newIndex },
    });
  }
}

/**
 * Handle history date picker change
 */
function handleHistoryDatePick() {
  const historyDatePicker = document.getElementById("history-date-picker");
  const selectedDateStr = historyDatePicker.value;
  if (!selectedDateStr) return;

  const selectedDate = new Date(selectedDateStr + "T00:00:00");
  const targetWeekStart = dataService.getWeekStartDate(selectedDate);

  const state = stateManager.getState();
  const foundIndex = state.history.findIndex(
    (week) => week.weekStartDate === targetWeekStart
  );

  if (foundIndex !== -1) {
    stateManager.dispatch({
      type: stateManager.ACTION_TYPES.SET_HISTORY_INDEX,
      payload: { index: foundIndex },
    });
  } else {
    uiRenderer.showToast(
      `No history found for the week starting ${targetWeekStart}`,
      "info"
    );
    // Future enhancement: Could offer to create data for this missing week
  }
}

/**
 * Handle User Guide button click
 */
function handleUserGuideClick() {
  closeMenu();
  // Open the GitHub wiki in a new tab
  const wikiUrl = "https://github.com/NateEaton/mind-pwa/wiki/User-Guide";
  window.open(wikiUrl, "_blank", "noopener,noreferrer");
}

/**
 * Handle About button click
 */
async function handleAboutClick() {
  closeMenu();

  // Import config to check DEV_MODE
  let isDevMode = false;
  try {
    const config = await import("./config.js");
    isDevMode = config.CONFIG.DEV_MODE || false;
  } catch (error) {
    logger.warn(
      "Could not load config.js, defaulting to production mode:",
      error
    );
  }

  const aboutTitle = "About MIND Diet Tracker";

  let aboutContent = `
    <p>This app helps you track your adherence to the MIND Diet principles.</p>
    <p>Track daily and weekly servings, view summaries, and check your history.</p>
    <p>Data is stored locally in your browser.</p>
    <p>More info and the source code on <a href="https://github.com/NateEaton/mind-pwa" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
    <p>Version: <span id="modal-app-version">(unknown)</span></p>
  `;

  // Only add dev controls if in dev mode
  if (isDevMode) {
    // Get current cloud provider
    let currentProvider = "None";
    if (cloudSync && cloudSync.provider) {
      currentProvider = cloudSync.provider.constructor.name.includes("Dropbox")
        ? "Dropbox"
        : "Google Drive";
    }

    aboutContent += `
    <!-- Developer Testing Controls -->
    <div id="dev-controls" style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #ccc;">
      <h4 style="margin: 5px 0;">Developer Controls</h4>
      
      <!-- Log Level Controls -->
      <div style="display: flex; align-items: center; margin-bottom: 10px;">
        <label for="log-level-select" style="margin-right: 10px;">Log Level:</label>
        <select id="log-level-select" style="margin-right: 5px;">
          <option value="ERROR">ERROR</option>
          <option value="WARN">WARN</option>
          <option value="INFO" selected>INFO</option>
          <option value="DEBUG">DEBUG</option>
          <option value="TRACE">TRACE</option>
        </select>
        <button id="apply-log-level" style="margin-left: 5px;">Apply</button>
      </div>
      <div id="log-level-status" style="font-size: 12px; color: #888;">
        Current application log level: INFO
      </div>      

      <!-- Existing test date controls -->
      <div style="display: flex; align-items: center; margin-bottom: 10px;">
        <label for="test-date" style="margin-right: 10px;">Test Date:</label>
        <input type="date" id="test-date" ${
          dataService.isTestModeEnabled()
            ? `value="${
                dataService.getCurrentDate().toISOString().split("T")[0]
              }"`
            : ""
        }>
        <button id="apply-test-date" style="margin-left: 5px;">Apply</button>
        <button id="reset-test-date" style="margin-left: 5px;" ${
          !dataService.isTestModeEnabled() ? "disabled" : ""
        }>Reset</button>
      </div>

      <div id="test-date-status" style="font-size: 12px; color: ${
        dataService.isTestModeEnabled() ? "#ff0000" : "#888"
      };">
        ${
          dataService.isTestModeEnabled()
            ? `TEST MODE ACTIVE: Using date ${dataService
                .getCurrentDate()
                .toLocaleDateString()}`
            : "Test mode inactive (using real system date)"
        }
      </div>

      <!-- Cloud data reset controls -->
      <div style="display: flex; align-items: center; margin-bottom: 10px;">
        <label style="margin-right: 10px;">Cloud Data:</label>
        <span style="font-weight: bold; margin-right: 10px;">${currentProvider}</span>
        <button id="view-cloud-files-btn" style="margin-left: 5px;" ${
          !syncEnabled || currentProvider === "None" ? "disabled" : ""
        }>View Files</button>
      </div>
      
      <div id="cloud-clear-status" style="font-size: 12px; color: #888;">
        ${
          syncEnabled && currentProvider !== "None"
            ? `Connected to ${currentProvider}`
            : "Cloud sync is not enabled"
        }
      </div>
    </div>
    
    <!-- Development information section -->
    <div id="dev-info" style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #ccc; font-family: monospace; font-size: 12px;">
      <h4 style="margin: 5px 0;">Development Information</h4>
      <div id="dev-info-content">Loading device info...</div>
    </div>
    `;
  }

  // Use the new modal format with footer
  uiRenderer.openModal(aboutTitle, aboutContent, {
    showFooter: true,
    buttons: [
      {
        label: "Close",
        id: "about-close-btn",
        class: "primary-btn",
        onClick: () => uiRenderer.closeModal(),
      },
    ],
  });

  // Update version in the modal
  const modalVersionEl = document.getElementById("modal-app-version");
  if (modalVersionEl) {
    const footerVersionEl = document.getElementById("app-version");
    modalVersionEl.textContent = footerVersionEl
      ? footerVersionEl.textContent
      : "(unknown)";
  }

  // Only set up dev controls if in dev mode
  if (isDevMode) {
    // Update device info
    const devInfo = appUtils.getDeviceInfo();
    const devInfoContent = document.getElementById("dev-info-content");
    if (devInfoContent) {
      let infoHtml = "";
      for (const [key, value] of Object.entries(devInfo)) {
        infoHtml += `<div>${key}: <span>${value}</span></div>`;
      }
      devInfoContent.innerHTML = infoHtml;
    }

    // Set up event listeners for dev controls
    setupDevControlEventListeners();
  }
}

// Separate function for dev control event listeners
function setupDevControlEventListeners() {
  // Add event listeners for test date controls
  const testDateInput = document.getElementById("test-date");
  const applyTestDateBtn = document.getElementById("apply-test-date");
  const resetTestDateBtn = document.getElementById("reset-test-date");
  const testDateStatus = document.getElementById("test-date-status");

  // Add event listener for log level selector
  const logLevelSelect = document.getElementById("log-level-select");
  const applyLogLevelBtn = document.getElementById("apply-log-level");
  const logLevelStatus = document.getElementById("log-level-status");

  // Set initial selection from localStorage if available
  if (logLevelSelect) {
    const storedLevel = localStorage.getItem("appLogLevel") || "INFO";
    logLevelSelect.value = storedLevel;
    logLevelStatus.textContent = `Current application log level: ${storedLevel}`;
  }

  if (applyLogLevelBtn) {
    applyLogLevelBtn.addEventListener("click", () => {
      const selectedLevel = logLevelSelect.value;

      // Update logger configuration
      import("./logger.js").then(({ configure, LOG_LEVELS }) => {
        configure({
          defaultLevel: LOG_LEVELS[selectedLevel],
        });

        // Store selection in localStorage for persistence
        localStorage.setItem("appLogLevel", selectedLevel);

        // Update status text
        if (logLevelStatus) {
          logLevelStatus.textContent = `Current application log level: ${selectedLevel}`;
        }

        // Show toast notification
        uiRenderer.showToast(`Log level set to ${selectedLevel}`, "success");
      });
    });
  }

  if (applyTestDateBtn) {
    applyTestDateBtn.addEventListener("click", async () => {
      const dateValue = testDateInput.value;
      if (dateValue) {
        dataService.enableTestMode(dateValue);
        testDateStatus.textContent = `TEST MODE ACTIVE: Using date ${dataService
          .getCurrentDate()
          .toLocaleDateString()}`;
        testDateStatus.style.color = "#ff0000";
        resetTestDateBtn.disabled = false;

        // Check for date changes with new test date
        await stateManager.checkDateAndReset();
        uiRenderer.renderEverything();

        // Show banner and toast
        appUtils.addTestModeBanner(
          `TEST MODE: Using date ${dataService
            .getCurrentDate()
            .toLocaleDateString()}`
        );
        uiRenderer.showToast(
          "Test date applied: " +
            dataService.getCurrentDate().toLocaleDateString(),
          "success"
        );
      }
    });
  }

  if (resetTestDateBtn) {
    resetTestDateBtn.addEventListener("click", async () => {
      dataService.disableTestMode();
      testDateStatus.textContent =
        "Test mode inactive (using real system date)";
      testDateStatus.style.color = "#888";
      resetTestDateBtn.disabled = true;

      // Check for date changes with real date
      await stateManager.checkDateAndReset();
      uiRenderer.renderEverything();

      // Remove banner and show toast
      appUtils.removeTestModeBanner();
      uiRenderer.showToast(
        "Test mode disabled. Using real system date.",
        "success"
      );
    });
  }

  const viewFilesBtn = document.getElementById("view-cloud-files-btn");
  if (viewFilesBtn) {
    viewFilesBtn.addEventListener("click", async () => {
      await showViewFilesDialog();
    });
  }
}

async function showViewFilesDialog() {
  if (!syncEnabled || !cloudSync || !cloudSync.provider) {
    uiRenderer.showToast("Cloud sync must be connected", "error");
    return;
  }

  const providerName = cloudSync.provider.constructor.name.includes("Dropbox")
    ? "Dropbox"
    : "Google Drive";

  try {
    // Show loading toast
    // uiRenderer.showToast(`Loading ${providerName} files...`, "info", {
    //  isPersistent: true,
    //  showSpinner: true,
    //});

    // Get file list
    let files = [];
    const provider = cloudSync.provider;

    if (providerName === "Google Drive") {
      const listResponse = await provider.gapi.client.drive.files.list({
        spaces: "appDataFolder",
        fields: "files(id, name, mimeType, modifiedTime, size)",
        pageSize: 100,
      });
      files = listResponse.result.files || [];
    } else if (providerName === "Dropbox") {
      const listResponse = await provider.dbx.filesListFolder({
        path: "",
      });
      files = listResponse.result.entries || [];
    }

    // Generate file list with checkboxes
    let fileListHtml = "";
    const fileCheckboxes = new Map(); // Store file data for download/delete

    if (files.length === 0) {
      fileListHtml = "<p>No files found.</p>";
    } else {
      fileListHtml = `
        <div style="margin-bottom: 10px;">
          <label>
            <input type="checkbox" id="select-all-files"> Select All
          </label>
        </div>
        <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px;">
          <div id="file-list">
      `;

      files.sort((a, b) => {
        const nameA = a.name || a.path_display || "";
        const nameB = b.name || b.path_display || "";
        return nameA.localeCompare(nameB);
      });

      files.forEach((file, index) => {
        const fileName = file.name || file.path_display || "Unknown file";
        const fileId = file.id || file.path_lower || `file-${index}`;
        const modifiedDate = file.modifiedTime || file.server_modified || "";
        const modifiedStr = modifiedDate
          ? ` (${new Date(modifiedDate).toLocaleString()})`
          : "";

        fileCheckboxes.set(fileId, file);

        fileListHtml += `
          <div style="margin-bottom: 8px;">
            <label style="display: flex; align-items: center;">
              <input type="checkbox" class="file-checkbox" data-file-id="${fileId}">
              <span style="margin-left: 8px; font-family: monospace; font-size: 12px;">
                ${fileName}${modifiedStr}
              </span>
            </label>
          </div>
        `;
      });

      fileListHtml += `
          </div>
        </div>
      `;
    }

    // Create dialog content
    const dialogContent = `
      <div style="margin-bottom: 15px;">
        <button id="download-selected-btn" class="action-btn" style="margin-right: 8px;">
          <i class="mdi mdi-cloud-download-outline"></i> Download
        </button>
        <button id="delete-selected-btn" class="action-btn danger-btn">
          <i class="mdi mdi-trash-can-outline"></i> Delete
        </button>
      </div>
      ${fileListHtml}
    `;

    // Show the dialog
    uiRenderer.openModal(`${providerName} Files`, dialogContent, {
      showFooter: true,
      buttons: [
        {
          label: "Close",
          id: "close-files-btn",
          class: "primary-btn",
          onClick: () => uiRenderer.closeModal(),
        },
      ],
    });

    // Disable buttons if no files
    const downloadBtn = document.getElementById("download-selected-btn");
    const deleteBtn = document.getElementById("delete-selected-btn");

    if (files.length === 0) {
      if (downloadBtn) downloadBtn.disabled = true;
      if (deleteBtn) deleteBtn.disabled = true;
    }

    // Set up event listeners
    const selectAllCheckbox = document.getElementById("select-all-files");
    const fileCheckboxElements = document.querySelectorAll(".file-checkbox");

    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener("change", (e) => {
        fileCheckboxElements.forEach((cb) => {
          cb.checked = e.target.checked;
        });
      });
    }

    // Download selected button
    //const downloadBtn = document.getElementById("download-selected-btn");
    if (downloadBtn) {
      downloadBtn.addEventListener("click", async () => {
        const selectedFiles = Array.from(fileCheckboxElements)
          .filter((cb) => cb.checked)
          .map((cb) => {
            const fileId = cb.dataset.fileId;
            return fileCheckboxes.get(fileId);
          });

        if (selectedFiles.length === 0) {
          uiRenderer.showToast("No files selected", "warning");
          return;
        }

        // Handle downloads
        if (selectedFiles.length === 1) {
          await downloadCloudFile(selectedFiles[0], providerName);
        } else {
          // For multiple files, prompt user for approach
          const approach = await uiRenderer.showConfirmDialog({
            title: "Download Multiple Files",
            message: "How would you like to download the selected files?",
            confirmText: "One at a time",
            cancelText: "Cancel",
            details: `<p>Selected ${selectedFiles.length} files for download.</p>
                     <p>Note: Some browsers may block multiple automatic downloads.</p>`,
          });

          if (approach) {
            // Download one at a time with small delay
            for (const file of selectedFiles) {
              await downloadCloudFile(file, providerName);
              await new Promise((resolve) => setTimeout(resolve, 500)); // Small delay
            }
          }
        }
      });
    }

    // Delete selected button
    //const deleteBtn = document.getElementById("delete-selected-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        const selectedFiles = Array.from(fileCheckboxElements)
          .filter((cb) => cb.checked)
          .map((cb) => {
            const fileId = cb.dataset.fileId;
            return fileCheckboxes.get(fileId);
          });

        if (selectedFiles.length === 0) {
          uiRenderer.showToast("No files selected", "warning");
          return;
        }

        const confirmed = await uiRenderer.showConfirmDialog({
          title: "Confirm Delete",
          message: `Are you sure you want to delete ${selectedFiles.length} file(s)?`,
          confirmText: "Delete",
          cancelText: "Cancel",
          details: `<p>This action cannot be undone.</p>`,
        });

        if (confirmed) {
          await deleteCloudFiles(selectedFiles, providerName);
          // Refresh the dialog
          // await showViewFilesDialog();
        }
      });
    }
  } catch (error) {
    logger.error("Error loading cloud files:", error);
    uiRenderer.showToast(`Error: ${error.message}`, "error");
  }
}

// Helper function to download a cloud file
async function downloadCloudFile(file, providerName) {
  try {
    const fileName = file.name || file.path_display || "unknown-file";
    const fileId = file.id || file.path_lower;

    uiRenderer.showToast(`Downloading ${fileName}...`, "info", {
      isPersistent: true,
      showSpinner: true,
    });

    // Download the file content
    const content = await cloudSync.provider.downloadFile(fileId);

    // Convert to JSON string
    const jsonString = JSON.stringify(content, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    // Create download link
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    uiRenderer.showToast(`Downloaded ${fileName}`, "success");
  } catch (error) {
    logger.error(`Error downloading file:`, error);
    uiRenderer.showToast(`Download failed: ${error.message}`, "error");
  }
}

// Helper function to delete cloud files
async function deleteCloudFiles(files, providerName) {
  let deletedCount = 0;

  try {
    for (const file of files) {
      const fileName = file.name || file.path_display || "unknown-file";
      const fileId = file.id || file.path_lower;

      if (providerName === "Google Drive") {
        await cloudSync.provider.gapi.client.drive.files.delete({ fileId });
      } else if (providerName === "Dropbox") {
        await cloudSync.provider.dbx.filesDelete({ path: fileId });
      }

      deletedCount++;
      logger.info(`Deleted file: ${fileName}`);
    }

    uiRenderer.showToast(`Deleted ${deletedCount} file(s)`, "success");
  } catch (error) {
    logger.error("Error deleting files:", error);
    uiRenderer.showToast(`Delete failed: ${error.message}`, "error");
  }
}

/**
 * Handle export data operation
 */
async function handleExport() {
  closeMenu();

  try {
    logger.info("Exporting data...");
    const dataToExport = await dataService.exportData();

    if (
      Object.keys(dataToExport.currentState).length === 0 &&
      dataToExport.history.length === 0
    ) {
      uiRenderer.showToast("No data available to export.", "error");
      return;
    }

    // Create JSON file and trigger download
    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const timestamp = dataService.getTodayDateString();
    link.download = `mind-diet-tracker-data-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    logger.info("Data exported successfully.");
    uiRenderer.showToast("Data exported successfully!", "success");
    uiRenderer.setActiveView("tracker");
  } catch (error) {
    logger.error("Error exporting data:", error);
    uiRenderer.showToast(`Export failed: ${error.message}`, "error");
  }
}

/**
 * Trigger the import file selection dialog
 */
function triggerImport() {
  closeMenu();
  domElements.importFileInput.click();
}

/**
 * Handle import file selection
 * @param {Event} event - The file input change event
 */
async function handleImportFileSelect(event) {
  const file = event.target.files[0];
  if (!file) {
    logger.info("No file selected for import.");
    return;
  }

  // Validate file type
  if (!file.type || file.type !== "application/json") {
    uiRenderer.showToast(
      "Invalid file type. Please select a '.json' file.",
      "error"
    );
    domElements.importFileInput.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const fileContent = e.target.result;
      const importedData = JSON.parse(fileContent);

      // Basic validation of the imported structure
      if (
        typeof importedData !== "object" ||
        importedData === null ||
        !importedData.currentState ||
        !Array.isArray(importedData.history)
      ) {
        throw new Error("Invalid file structure.");
      }

      // Format export date for display
      const exportDate =
        importedData.appInfo && importedData.appInfo.exportDate
          ? new Date(importedData.appInfo.exportDate).toLocaleString()
          : "unknown date";

      // Determine relationship between import date and current date
      const importedDate = importedData.currentState.currentDayDate;
      const todayStr = dataService.getTodayDateString();

      // Get date relationship (SAME_DAY, SAME_WEEK, PAST_WEEK, FUTURE_WEEK)
      const dateRelationship = getDateRelationship(importedDate, todayStr);

      // Prepare confirmation message
      let actionDescription;
      switch (dateRelationship) {
        case "SAME_DAY":
          actionDescription = "REPLACE ALL tracking data";
          break;
        case "SAME_WEEK":
          actionDescription = "UPDATE current week totals and REPLACE history";
          break;
        case "PAST_WEEK":
          actionDescription =
            "ADD the imported data as history while PRESERVING current tracking";
          break;
        case "FUTURE_WEEK":
          actionDescription =
            "Warning: Import data appears to be from a FUTURE date";
          break;
        default:
          actionDescription = "REPLACE ALL tracking data";
      }

      // File details for the dialog
      const fileDetails = `
        <p><strong>File:</strong> ${file.name}</p>
        <p><strong>Exported:</strong> ${exportDate}</p>
        <p><strong>Import type:</strong> ${dateRelationship
          .replace("_", " ")
          .toLowerCase()}</p>
      `;

      // Show confirmation dialog using uiRenderer instead of appUtils
      const confirmed = await uiRenderer.showConfirmDialog({
        title: "Import Confirmation",
        details: fileDetails,
        actionDesc: actionDescription,
        message:
          "This action cannot be undone. Do you want to proceed with the import?",
        confirmText: "Import",
        cancelText: "Cancel",
      });

      if (!confirmed) {
        logger.info("Import cancelled by user.");
        domElements.importFileInput.value = "";
        return;
      }

      // Perform the import based on the data relationship
      const importResult = await processImport(importedData, dateRelationship);

      // Reload UI with new data
      uiRenderer.renderEverything();
      uiRenderer.setActiveView("tracker");

      // Create success message
      let successMessage;
      switch (dateRelationship) {
        case "SAME_DAY":
          successMessage = `Import complete. All data replaced.`;
          break;
        case "SAME_WEEK":
          successMessage = `Import complete. Week totals updated for current week.`;
          break;
        case "PAST_WEEK":
          // Use the count directly from the import result
          const importedCount =
            importResult?.importedCount ||
            importedData.appInfo?.historyCount ||
            importedData.history.length;
          successMessage = `Import complete. ${importedCount} weeks added to history.`;
          break;
        case "FUTURE_WEEK":
          successMessage = `Import complete. Future-dated data imported.`;
          break;
        default:
          successMessage = `Import successful!`;
      }

      uiRenderer.showToast(successMessage, "success", { duration: 4000 });
    } catch (error) {
      logger.error("Error importing data:", error);
      uiRenderer.showToast(`Import failed: ${error.message}`, "error", {
        duration: 5000,
      });
    } finally {
      domElements.importFileInput.value = "";
    }
  };

  reader.onerror = (e) => {
    logger.error("Error reading file:", e);
    uiRenderer.showToast("Error reading the selected file.", "error");
    domElements.importFileInput.value = "";
  };

  reader.readAsText(file);
}

/**
 * Process the import operation based on date relationship.
 * @param {Object} importedData - The parsed data from the imported JSON file.
 * @param {string} dateRelationship - Relationship of imported currentState to local current date.
 * @returns {Promise<Object>} An object indicating success and any relevant import counts.
 */
async function processImport(importedData, dateRelationship) {
  try {
    let importResult = { success: false };

    if (dateRelationship === "PAST_WEEK") {
      const currentState = stateManager.getState();
      const currentDailyCounts = { ...currentState.dailyCounts };
      const currentWeeklyCounts = { ...currentState.weeklyCounts };
      const currentDayDate = currentState.currentDayDate;
      const currentWeekStartDate = currentState.currentWeekStartDate;

      const foodGroups =
        currentState.foodGroups || stateManager.getFoodGroups();

      const importedCurrentWeek = dataService.createHistoryFromCurrentState(
        importedData.currentState,
        importedData.appInfo,
        foodGroups
      );

      const combinedHistory = [importedCurrentWeek, ...importedData.history];
      const importedHistoryCount = combinedHistory.length;

      const historyOnly = {
        appInfo: {
          ...importedData.appInfo,
          historyCount: importedHistoryCount,
        },
        currentState: {
          currentDayDate,
          currentWeekStartDate,
          dailyCounts: currentDailyCounts,
          weeklyCounts: currentWeeklyCounts,
          lastModified: Date.now(),
          metadata: {
            schemaVersion: 3,
            partialImport: true,
            historyDirty: true,
          },
        },
        history: combinedHistory,
        preferences: importedData.preferences || {},
      };

      await dataService.importData(historyOnly);
      importResult = { success: true, importedCount: importedHistoryCount };
    } else if (dateRelationship === "SAME_WEEK") {
      const currentState = stateManager.getState();
      const currentDailyCounts = { ...currentState.dailyCounts };
      const currentWeeklyCounts = { ...currentState.weeklyCounts };
      const importedDailyCounts = { ...importedData.currentState.dailyCounts };
      const importedWeeklyCounts = {
        ...importedData.currentState.weeklyCounts,
      };

      // Merge daily counts
      const mergedDailyCounts = { ...currentDailyCounts };
      Object.keys(importedDailyCounts).forEach((date) => {
        mergedDailyCounts[date] = mergedDailyCounts[date] || {};
        Object.keys(importedDailyCounts[date]).forEach((groupId) => {
          const currentCount = mergedDailyCounts[date][groupId] || 0;
          const importedCount = importedDailyCounts[date][groupId] || 0;
          mergedDailyCounts[date][groupId] = Math.max(
            currentCount,
            importedCount
          );
        });
      });

      // Merge weekly counts
      const mergedWeeklyCounts = {};
      const allGroupIds = [
        ...new Set([
          ...Object.keys(currentWeeklyCounts),
          ...Object.keys(importedWeeklyCounts),
        ]),
      ];

      allGroupIds.forEach((groupId) => {
        const currentCount = currentWeeklyCounts[groupId] || 0;
        const importedCount = importedWeeklyCounts[groupId] || 0;
        mergedWeeklyCounts[groupId] = Math.max(currentCount, importedCount);
      });

      const now = Date.now();
      const mergedImport = {
        appInfo: importedData.appInfo,
        currentState: {
          currentDayDate: currentState.currentDayDate,
          currentWeekStartDate: currentState.currentWeekStartDate,
          dailyCounts: mergedDailyCounts,
          weeklyCounts: mergedWeeklyCounts,
          lastModified: now,
          metadata: {
            schemaVersion: 3,
            partialImport: true,
            currentWeekDirty: true,
            historyDirty: true,
            dailyTotalsDirty: true,
            dailyTotalsUpdatedAt: now,
            weeklyTotalsDirty: true,
            weeklyTotalsUpdatedAt: now,
          },
        },
        history: importedData.history,
        preferences: importedData.preferences || {},
      };

      await dataService.importData(mergedImport);

      // TODO: add call to have stateManager recalculate weekly totals from daily counts read in from import file
      importResult = { success: true };
    } else {
      // SAME_DAY or FUTURE_WEEK – full import
      importedData.currentState.metadata = {
        ...(importedData.currentState.metadata || {}),
        currentWeekDirty: true,
      };

      if (importedData.history && importedData.history.length > 0) {
        importedData.currentState.metadata.historyDirty = true;
      }

      await dataService.importData(importedData);
      importResult = { success: true };
    }

    const foodGroups =
      stateManager.getState().foodGroups || stateManager.getFoodGroups();
    await stateManager.initialize(foodGroups);

    return importResult;
  } catch (error) {
    logger.error("Error during import processing:", error);
    throw error;
  }
}

/**
 * Determine the relationship between two dates
 * @param {string} importDate - The import date string (YYYY-MM-DD)
 * @param {string} todayDate - The current date string (YYYY-MM-DD)
 * @returns {string} Relationship type (SAME_DAY, SAME_WEEK, PAST_WEEK, FUTURE_WEEK)
 */
function getDateRelationship(importDate, todayDate) {
  // Convert string dates to Date objects
  const importDateObj = new Date(`${importDate}T00:00:00`);
  const todayDateObj = new Date(`${todayDate}T00:00:00`);

  // Get week start dates to compare weeks
  const importWeekStart = dataService.getWeekStartDate(importDateObj);
  const todayWeekStart = dataService.getWeekStartDate(todayDateObj);

  if (importDate === todayDate) {
    return "SAME_DAY";
  } else if (importWeekStart === todayWeekStart) {
    return "SAME_WEEK";
  } else {
    return importDateObj < todayDateObj ? "PAST_WEEK" : "FUTURE_WEEK";
  }
}

function handleSyncComplete(result) {
  logger.info("Sync completed:", result);

  // Only show success toast if there's a valid result
  if (result) {
    // If history was synced, re-render history view
    if (result.historySynced) {
      uiRenderer.renderHistory();
    }
  } else {
    logger.warn("Sync completed with no result object");
  }
}

function handleSyncError(error) {
  logger.error("Sync error:", error);

  const errorMessage = error.message || "Unknown error";

  // Show toast notification
  uiRenderer.showToast(`Sync failed: ${errorMessage}`, "error", {
    duration: 5000,
  });

  // If authentication error, prompt user to re-authenticate
  if (
    errorMessage.includes("authentication") ||
    errorMessage.includes("auth")
  ) {
    cloudSync
      .authenticate()
      .catch((e) => logger.error("Authentication failed:", e));
  }
}

async function syncData() {
  logger.debug("syncData called", {
    cloudSync,
    syncEnabled,
    syncReady,
    online: navigator.onLine,
  });

  if (!cloudSync || !syncEnabled || !syncReady) {
    logger.debug("Sync skipped: not ready", {
      cloudSync,
      syncEnabled,
      syncReady,
    });
    return;
  }

  // Check authentication status
  if (!cloudSync.isAuthenticated) {
    logger.info("Authentication needed before sync");
    uiRenderer.showToast("Authenticating with cloud service...", "info", {
      isPersistent: true,
      showSpinner: true,
    });
    try {
      const authResult = await cloudSync.authenticate();
      if (!authResult) {
        logger.info("Authentication failed or was canceled");
        uiRenderer.showToast("Authentication required for sync", "warning", {
          duration: 5000,
        });
        return;
      }
      // Authentication succeeded
      logger.info("Authentication successful, proceeding with sync");
    } catch (error) {
      logger.error("Authentication error:", error);
      uiRenderer.showToast(`Authentication error: ${error.message}`, "error", {
        duration: 5000,
      });
      return;
    }
  }

  // Add debugging of metadata to help trace the issue
  try {
    const state = dataService.loadState();
    logger.debug("Current state metadata before sync:", state.metadata);
  } catch (e) {
    logger.error("Error logging state metadata:", e);
  }

  const providerName = cloudSync.provider.constructor.name.includes("Dropbox")
    ? "Dropbox"
    : "Google Drive";
  uiRenderer.showToast(`Syncing data with ${providerName}...`, "info", {
    isPersistent: true,
    showSpinner: true,
  });

  try {
    logger.info("Starting sync operation");
    // Update UI to show sync in progress
    updateSyncUIElements();

    const result = await cloudSync.sync();
    logger.info("Sync completed:", result);

    // Force a complete reload of state from dataService
    logger.info("Reloading state after sync");
    if (typeof stateManager.reload === "function") {
      logger.info("stateManager.reload is typeof function, calling reload");
      await stateManager.reload();
    } else {
      logger.warn("stateManager.reload not found, manually reloading state");
      // Fallback if reload method doesn't exist
      const freshData = dataService.loadState();
      stateManager.dispatch({
        type: stateManager.ACTION_TYPES.SET_STATE,
        payload: freshData,
      });

      const historyData = await dataService.getAllWeekHistory();
      stateManager.dispatch({
        type: stateManager.ACTION_TYPES.SET_HISTORY,
        payload: { history: historyData },
      });
    }

    // NEW ADDITION: Check if we need to perform a date reset after sync
    const currentState = stateManager.getState();
    const needsPostSyncReset = currentState.metadata?.pendingDateReset === true;

    if (needsPostSyncReset) {
      logger.info("Performing post-sync date reset");

      // Clear the pending flag first
      delete currentState.metadata.pendingDateReset;
      delete currentState.metadata.remoteDateWas;

      // Save the cleared flag
      dataService.saveState(currentState);

      // Perform the date check and reset
      const dateChanged = await stateManager.checkDateAndReset();

      if (dateChanged) {
        logger.info("Post-sync date reset completed successfully");
      } else {
        logger.warn("Post-sync date reset was flagged but no changes made");
      }
    }

    // Now refresh the UI
    logger.info("Refreshing UI after state reload");
    uiRenderer.renderEverything();

    uiRenderer.showToast(`Data synchronized successfully!`, "success", {
      duration: 2000,
    });
  } catch (error) {
    logger.error("Sync error:", error);
    handleSyncError(error);
  } finally {
    // Make sure syncInProgress is set to false if the cloudSync object exists
    if (cloudSync) {
      cloudSync.syncInProgress = false;
    }

    // Update the UI elements to reflect current state
    updateSyncUIElements();
  }
}

/**
 * Handle settings button click
 */
async function handleSettings() {
  closeMenu();

  // Get current sync settings
  const syncEnabled = dataService.getPreference("cloudSyncEnabled", false);
  const syncProvider = dataService.getPreference("cloudSyncProvider", "gdrive");
  const autoSyncInterval = dataService.getPreference("autoSyncInterval", 15);
  const syncWifiOnly = dataService.getPreference("syncWifiOnly", false);

  // Show the settings dialog with sync options
  await showSettings();
}

async function showSettings() {
  closeMenu();

  // Force a fresh read of preferences synchronously before building the UI
  try {
    // Get actual current sync enabled state
    const freshSyncEnabled = await dataService.getPreference(
      "cloudSyncEnabled",
      false
    );
    logger.info(
      "Settings dialog opening with cloud sync enabled:",
      freshSyncEnabled
    );

    // Update the global variable to match what's in storage
    window.syncEnabled = freshSyncEnabled;
    syncEnabled = freshSyncEnabled;

    // Get current sync provider
    let currentSyncProvider;
    if (cloudSync && cloudSync.provider) {
      // If we have an active cloud sync, check what type it is
      currentSyncProvider = cloudSync.provider.constructor.name.includes(
        "Dropbox"
      )
        ? "dropbox"
        : "gdrive";
      logger.debug("Active provider detected:", currentSyncProvider);
    } else {
      // Fall back to saved preference
      currentSyncProvider = await dataService.getPreference(
        "cloudSyncProvider",
        "gdrive"
      );
      logger.debug("Using saved provider preference:", currentSyncProvider);
    }

    // Get Wi-Fi only preference
    const syncWifiOnly = await dataService.getPreference("syncWifiOnly", false);

    const settingsTitle = "Settings";

    let settingsContent = `
      <div class="settings-container">

        <!-- Cloud Synchronization Section -->
        <div class="settings-section">
          <div class="section-header collapsible">
            <h4>Cloud Synchronization</h4>
            <span class="section-toggle">▼</span>
          </div>
          <div class="section-content">
            <div class="settings-row">
              <label for="sync-enabled">Enable cloud sync:</label>
              <input type="checkbox" id="sync-enabled" ${
                freshSyncEnabled ? "checked" : ""
              }>
            </div>
            
            <div class="sync-settings ${
              !freshSyncEnabled ? "disabled-section" : ""
            }">
              <div class="settings-row provider-row">
                <label for="sync-provider">Provider:</label>
                <select id="sync-provider" ${
                  !freshSyncEnabled ? "disabled" : ""
                }>
                  <option value="gdrive" ${
                    currentSyncProvider === "gdrive" ? "selected" : ""
                  }>Google Drive</option>
                  <option value="dropbox" ${
                    currentSyncProvider === "dropbox" ? "selected" : ""
                  }>Dropbox</option>
                </select>
                
                <div class="connection-status">
                  <span class="status-label">Status:</span>
                  <span id="sync-status" class="status-value ${
                    cloudSync?.isAuthenticated ? "connected" : "disconnected"
                  }">${
      cloudSync?.isAuthenticated ? "Connected" : "Not connected"
    }</span>
                </div>
                
                <button id="sync-reauth-btn" class="small-btn" ${
                  !freshSyncEnabled ? "disabled" : ""
                }>Connect</button>
                <button id="sync-now-btn" class="small-btn" ${
                  !freshSyncEnabled || !cloudSync?.isAuthenticated
                    ? "disabled"
                    : ""
                }>Sync Now</button>
              </div>
              
              <div class="settings-row sync-options-row">
                <label for="sync-wifi-only">Sync only on Wi-Fi:</label>
                <input type="checkbox" id="sync-wifi-only" ${
                  syncWifiOnly ? "checked" : ""
                } ${!freshSyncEnabled ? "disabled" : ""}>
                <span class="setting-note">(Mobile devices only)</span>
              </div>
              
              <div class="settings-row sync-last-row">
                <label>Last sync:</label>
                <span id="sync-last-time">${
                  cloudSync && cloudSync.lastSyncTimestamp
                    ? new Date(cloudSync.lastSyncTimestamp).toLocaleString()
                    : "Never"
                }</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Use the modal component
    uiRenderer.openModal(settingsTitle, settingsContent, {
      showFooter: true,
      buttons: [
        {
          label: "Apply",
          id: "settings-apply-btn",
          class: "secondary-btn",
          onClick: () => applySettingsWithoutClosing(),
        },
        {
          label: "Save",
          id: "settings-save-btn",
          class: "primary-btn",
          onClick: () => saveSettingsAndCloseModal(),
        },
        {
          label: "Cancel",
          id: "settings-cancel-btn",
          class: "secondary-btn",
          onClick: () => uiRenderer.closeModal(),
        },
      ],
    });

    // Add event listeners for collapsible sections
    document
      .querySelectorAll(".section-header.collapsible")
      .forEach((header) => {
        const sectionName = header.dataset.section;

        // Apply saved state or default to collapsed
        const isExpanded = sectionCollapseState[sectionName] === true;
        const content = header.nextElementSibling;
        const toggle = header.querySelector(".section-toggle");

        if (isExpanded) {
          content.style.display = "block";
          toggle.textContent = "▼";
        }

        header.addEventListener("click", () => {
          const isCurrentlyExpanded = content.style.display !== "none";
          content.style.display = isCurrentlyExpanded ? "none" : "block";
          toggle.textContent = isCurrentlyExpanded ? "▶" : "▼";

          // Save the state
          sectionCollapseState[sectionName] = !isCurrentlyExpanded;
        });
      });

    // Add event listener for Enable sync checkbox to update UI in real-time
    document
      .getElementById("sync-enabled")
      .addEventListener("change", async (e) => {
        const enabled = e.target.checked;
        const syncSettings = document.querySelector(".sync-settings");

        if (enabled) {
          // Show warning for demo host when enabling
          if (isDemoHost) {
            uiRenderer.showToast(
              "Cloud sync may not work unless your account has been registered for testing with Dropbox or Google Drive.",
              "warning",
              { duration: 5000 }
            );
          }

          syncSettings.classList.remove("disabled-section");
          document.getElementById("sync-provider").disabled = false;
          document.getElementById("sync-wifi-only").disabled = false;
          document.getElementById("sync-reauth-btn").disabled = false;

          // Initialize sync object immediately if needed
          const provider = document.getElementById("sync-provider").value;
          if (!cloudSync) {
            try {
              // Show loading indicator
              const statusElement = document.getElementById("sync-status");
              statusElement.textContent = "Initializing...";
              statusElement.className = "status-value initializing";

              // Initialize the cloud sync
              cloudSync = new CloudSyncManager(
                dataService,
                stateManager,
                handleSyncComplete,
                handleSyncError
              );
              await cloudSync.initialize(provider);

              // Update status
              setSyncReady(true);
              statusElement.textContent = cloudSync.isAuthenticated
                ? "Connected"
                : "Not connected";
              statusElement.className =
                "status-value " +
                (cloudSync.isAuthenticated ? "connected" : "disconnected");
              document.getElementById("sync-now-btn").disabled =
                !cloudSync.isAuthenticated;
            } catch (error) {
              logger.error("Failed to initialize cloud sync:", error);
              uiRenderer.showToast(
                "Failed to initialize sync: " + error.message,
                "error"
              );
            }
          }
        } else {
          syncSettings.classList.add("disabled-section");
          document.getElementById("sync-provider").disabled = true;
          document.getElementById("sync-wifi-only").disabled = true;
          document.getElementById("sync-reauth-btn").disabled = true;
          document.getElementById("sync-now-btn").disabled = true;
        }
      });

    // Add event listener for provider changes
    const syncProviderSelect = document.getElementById("sync-provider");
    if (syncProviderSelect) {
      syncProviderSelect.addEventListener("change", (e) => {
        const newProvider = e.target.value;
        const currentProvider = cloudSync
          ? cloudSync.provider.constructor.name.includes("Dropbox")
            ? "dropbox"
            : "gdrive"
          : "none";

        logger.info(
          `Provider changing from ${currentProvider} to ${newProvider}`
        );

        // If provider changes, reset the connection status
        if (newProvider !== currentProvider) {
          // Update status to show not connected
          const statusElement = document.getElementById("sync-status");
          if (statusElement) {
            statusElement.textContent = "Not connected";
            statusElement.className = "status-value disconnected";
          }

          // Disable sync button until authenticated with new provider
          const syncNowBtn = document.getElementById("sync-now-btn");
          if (syncNowBtn) {
            syncNowBtn.disabled = true;
          }
        }
      });
    }

    // Event listeners for action buttons
    document.getElementById("sync-now-btn").addEventListener("click", () => {
      syncData();
    });

    document
      .getElementById("sync-reauth-btn")
      .addEventListener("click", async () => {
        const provider = document.getElementById("sync-provider").value;

        if (
          !cloudSync ||
          cloudSync.provider?.constructor.name !==
            getProviderClassName(provider)
        ) {
          // Initialize with new provider
          cloudSync = new CloudSyncManager(
            dataService,
            stateManager,
            handleSyncComplete,
            handleSyncError
          );
          await cloudSync.initialize(provider);
        }

        try {
          await cloudSync.authenticate();
          // Update status after auth
          const statusElement = document.getElementById("sync-status");
          statusElement.textContent = cloudSync.isAuthenticated
            ? "Connected"
            : "Not connected";
          statusElement.className =
            "status-value " +
            (cloudSync.isAuthenticated ? "connected" : "disconnected");

          document.getElementById("sync-now-btn").disabled =
            !cloudSync.isAuthenticated;
        } catch (error) {
          uiRenderer.showToast(
            `Authentication failed: ${error.message}`,
            "error"
          );
        }
      });
  } catch (err) {
    logger.error("Error loading settings:", err);
    uiRenderer.showToast("Failed to load settings", "error");
  }
}

function getProviderClassName(provider) {
  return provider === "gdrive" ? "GoogleDriveProvider" : "DropboxProvider";
}

function applySettingsWithoutClosing() {
  // Get current settings from form elements
  const newSyncEnabled = document.getElementById("sync-enabled").checked;
  const syncProvider = document.getElementById("sync-provider").value;
  const syncWifiOnly = document.getElementById("sync-wifi-only").checked;

  // Save all preferences to storage
  dataService.savePreference("cloudSyncEnabled", newSyncEnabled);
  dataService.savePreference("cloudSyncProvider", syncProvider);
  dataService.savePreference("syncWifiOnly", syncWifiOnly);

  // Update global variables
  window.syncEnabled = newSyncEnabled;
  syncEnabled = newSyncEnabled;

  logger.info("Applied sync settings, syncEnabled =", syncEnabled);

  // Add warning for demo host when enabling cloud sync
  if (isDemoHost && newSyncEnabled) {
    uiRenderer.showToast(
      "Cloud sync may not work unless your account has been registered for testing with Dropbox or Google Drive.",
      "warning",
      { duration: 5000 }
    );
  }

  // Handle cloud sync changes based on new settings
  if (syncEnabled) {
    // Reset sync readiness until initialization completes
    setSyncReady(false);

    // Check if we need to initialize with a new provider
    if (
      !cloudSync ||
      (cloudSync.provider?.constructor.name.includes("GoogleDrive") &&
        syncProvider === "dropbox") ||
      (cloudSync.provider?.constructor.name.includes("Dropbox") &&
        syncProvider === "gdrive")
    ) {
      logger.info("Initializing new cloud sync provider:", syncProvider);

      cloudSync = new CloudSyncManager(
        dataService,
        stateManager,
        handleSyncComplete,
        handleSyncError
      );

      cloudSync
        .initialize(syncProvider)
        .then(() => {
          // Configure network constraints
          cloudSync.syncWifiOnly = syncWifiOnly;

          // Mark sync as ready
          setSyncReady(true);

          // Update status indicator
          const statusElement = document.getElementById("sync-status");
          if (statusElement) {
            if (cloudSync.isAuthenticated) {
              statusElement.textContent = "Connected";
              statusElement.className = "status-value connected";

              // Try to sync after initialization if authenticated
              if (cloudSync.isAuthenticated) {
                syncData();
              }
            } else {
              statusElement.textContent = "Not connected";
              statusElement.className = "status-value disconnected";
            }
          }
        })
        .catch((error) => {
          logger.error("Failed to initialize cloud sync:", error);
          setSyncReady(false);
        });
    } else {
      // Provider didn't change, but we might need to update network constraints
      cloudSync.syncWifiOnly = syncWifiOnly;

      // Mark sync as ready since we're using existing provider
      setSyncReady(true);
    }
  } else if (!syncEnabled && cloudSync) {
    // Disable sync
    cloudSync = null;
    setSyncReady(false);
    logger.info("Cloud sync disabled completely");
  }

  // Update the main menu Sync Now button
  updateSyncUIElements();

  // Show confirmation
  uiRenderer.showToast("Settings applied", "success");
}

function saveSettingsAndCloseModal() {
  // Apply the settings
  applySettingsWithoutClosing();

  // Close the modal
  uiRenderer.closeModal();
}

/**
 * Open the edit totals modal
 * @param {string} source - Source of data ('current' or 'history')
 */
function openEditTotalsModal(source) {
  const state = stateManager.getState();
  let title = "Edit Weekly Totals";
  let dataToEdit = null;

  if (source === "current") {
    editingWeekDataRef = state;
    dataToEdit = state.weeklyCounts;
    const weekStartDate = new Date(`${state.currentWeekStartDate}T00:00:00`);
    title = `Edit Totals: Week of ${weekStartDate.toLocaleDateString(
      undefined,
      { month: "short", day: "numeric", year: "numeric" }
    )}`;
    editingSource = "current";
  } else if (source === "history") {
    if (
      state.currentHistoryIndex === -1 ||
      !state.history[state.currentHistoryIndex]
    ) {
      uiRenderer.showToast("No history week selected to edit.", "error");
      return;
    }

    editingWeekDataRef = state.history[state.currentHistoryIndex];
    dataToEdit = editingWeekDataRef.totals;
    const historyWeekDate = new Date(
      `${editingWeekDataRef.weekStartDate}T00:00:00`
    );
    title = `Edit Totals: Week of ${historyWeekDate.toLocaleDateString(
      undefined,
      { month: "short", day: "numeric", year: "numeric" }
    )}`;
    editingSource = "history";
  } else {
    logger.error("Invalid source for edit modal:", source);
    return;
  }

  // Deep copy the totals to the temporary editing object
  editedTotals = JSON.parse(JSON.stringify(dataToEdit || {}));

  // Ensure all food groups have an entry in editedTotals
  state.foodGroups.forEach((group) => {
    if (!(group.id in editedTotals)) {
      editedTotals[group.id] = 0;
    }
  });

  // Update the modal title
  if (domElements.editTotalsTitle) {
    domElements.editTotalsTitle.textContent = title;
  }

  // Render the edit totals list
  renderEditTotalsList();

  // Show the modal
  if (domElements.editTotalsModal) {
    domElements.editTotalsModal.classList.add("modal-open");
  }
}

/**
 * Render the edit totals list in the modal
 */
function renderEditTotalsList() {
  if (!domElements.editTotalsList || !domElements.editTotalsItemTemplate)
    return;

  // Clear previous items
  domElements.editTotalsList.innerHTML = "";

  // Get food groups from state
  const state = stateManager.getState();

  // Create an item for each food group
  state.foodGroups.forEach((group) => {
    const item = domElements.editTotalsItemTemplate.content
      .cloneNode(true)
      .querySelector(".edit-totals-item");

    item.dataset.id = group.id;

    const nameSpan = item.querySelector(".edit-item-name");
    const totalSpan = item.querySelector(".edit-current-total");

    // Add data to buttons for easier access in handler
    const decBtn = item.querySelector(".edit-decrement-btn");
    const incBtn = item.querySelector(".edit-increment-btn");

    if (decBtn) decBtn.dataset.groupId = group.id;
    if (incBtn) incBtn.dataset.groupId = group.id;

    // Set content
    if (nameSpan) nameSpan.textContent = group.name;
    if (totalSpan) totalSpan.textContent = editedTotals[group.id] || 0;

    // Add to list
    domElements.editTotalsList.appendChild(item);
  });
}

/**
 * Handle clicks in the edit totals modal
 * @param {Event} event - The click event
 */
function handleEditTotalsItemClick(event) {
  const button = event.target.closest(
    ".edit-decrement-btn, .edit-increment-btn"
  );
  if (!button) return;

  const groupId = button.dataset.groupId;
  if (!groupId) {
    logger.error("Edit button clicked, but no groupId found in dataset.");
    return;
  }

  // Get current value
  let currentValue = editedTotals[groupId] || 0;

  // Update value based on button type
  if (button.classList.contains("edit-increment-btn")) {
    currentValue++;
  } else if (button.classList.contains("edit-decrement-btn")) {
    currentValue = Math.max(0, currentValue - 1);
  }

  // Update temporary state
  editedTotals[groupId] = currentValue;

  // Update display
  const itemElement = button.closest(".edit-totals-item");
  if (itemElement) {
    const totalSpan = itemElement.querySelector(".edit-current-total");
    if (totalSpan) {
      totalSpan.textContent = currentValue;
    }
  }
}

/**
 * Save changes from edit totals modal
 */
async function saveEditedTotals() {
  if (!editingSource || !editingWeekDataRef) {
    logger.error("Cannot save, editing context is missing.");
    uiRenderer.showToast("Error saving changes.", "error");
    closeEditTotalsModal();
    return;
  }

  try {
    // Get a deep copy of edited totals
    const finalTotals = JSON.parse(JSON.stringify(editedTotals));

    if (editingSource === "current") {
      // Update state weekly counts
      for (const [groupId, count] of Object.entries(finalTotals)) {
        stateManager.updateWeeklyCount(groupId, count);
      }

      // Force dirty flag explicitly after batch edit
      // This is for safety in case updateWeeklyCount doesn't set it correctly during batch operations
      const currentState = stateManager.getState();
      if (currentState.metadata) {
        // Use stateManager's updateMetadata function to ensure proper state updates
        stateManager.dispatch({
          type: stateManager.ACTION_TYPES.UPDATE_METADATA,
          payload: {
            metadata: {
              currentWeekDirty: true,
              lastModified: Date.now(),
            },
          },
        });
        logger.info(
          "Explicitly set currentWeekDirty flag after edit totals save"
        );
      }

      uiRenderer.showToast("Current week totals updated.", "success");
    } else if (editingSource === "history") {
      // Update the totals in the history object
      editingWeekDataRef.totals = finalTotals;

      // Ensure we have proper metadata with current timestamp
      if (!editingWeekDataRef.metadata) {
        editingWeekDataRef.metadata = {};
      }
      editingWeekDataRef.metadata.updatedAt = Date.now();

      // Save to database
      await dataService.saveWeekHistory(editingWeekDataRef);

      // Also update current state metadata to flag history as dirty for sync
      const currentState = stateManager.getState();
      if (currentState.metadata) {
        stateManager.dispatch({
          type: stateManager.ACTION_TYPES.UPDATE_METADATA,
          payload: {
            metadata: {
              historyDirty: true,
              lastModified: Date.now(),
            },
          },
        });
      }

      // Refresh history data in state
      const historyData = await dataService.getAllWeekHistory();
      stateManager.dispatch({
        type: stateManager.ACTION_TYPES.SET_HISTORY,
        payload: { history: historyData },
      });

      // Trigger sync for just this week if sync is enabled
      if (syncEnabled && cloudSync && syncReady) {
        try {
          // Only attempt sync if we have the week-level sync method
          if (typeof cloudSync.syncWeek === "function") {
            cloudSync
              .syncWeek(editingWeekDataRef.weekStartDate, "upload")
              .catch((err) => logger.warn("Error syncing edited week:", err));
          }
        } catch (error) {
          logger.warn("Could not trigger week sync after edit:", error);
        }
      }

      uiRenderer.showToast(
        `Totals updated for week ${editingWeekDataRef.weekStartDate}.`,
        "success"
      );
    }

    closeEditTotalsModal();
  } catch (error) {
    logger.error(`Error saving edited totals for ${editingSource}:`, error);
    uiRenderer.showToast(`Failed to save changes: ${error.message}`, "error");
  }
}

/**
 * Close the edit totals modal
 */
function closeEditTotalsModal() {
  if (domElements.editTotalsModal) {
    domElements.editTotalsModal.classList.remove("modal-open");
  }

  // Reset temporary editing state
  editingWeekDataRef = null;
  editingSource = null;
  editedTotals = {};

  if (domElements.editTotalsList) {
    domElements.editTotalsList.innerHTML = "";
  }
}

/**
 * Opens and initializes the modal for viewing/editing daily details of a historical week.
 */
function openEditHistoryDailyDetailsModal() {
  const state = stateManager.getState();
  if (
    state.currentHistoryIndex === -1 ||
    !state.history ||
    !state.history[state.currentHistoryIndex]
  ) {
    uiRenderer.showToast("No history week selected to edit.", "error");
    return;
  }

  editingHistoryWeekDataRef = state.history[state.currentHistoryIndex];
  historyModalFoodGroups = state.foodGroups; // Store foodGroups for use in modal rendering

  // Deep copy the dailyBreakdown for temporary editing.
  // Ensure that if dailyBreakdown is null or undefined on the history record, we start with an empty object.
  tempEditedDailyBreakdown = JSON.parse(
    JSON.stringify(editingHistoryWeekDataRef.dailyBreakdown || {})
  );

  const weekStartDateObj = new Date(
    editingHistoryWeekDataRef.weekStartDate + "T00:00:00"
  );
  const daysOfThisHistoricalWeek = [];

  // Ensure tempEditedDailyBreakdown has entries for all 7 days of the week
  for (let i = 0; i < 7; i++) {
    const dayObj = new Date(weekStartDateObj);
    dayObj.setDate(weekStartDateObj.getDate() + i);
    const dayStr = appUtils.formatDateToYYYYMMDD(dayObj);
    daysOfThisHistoricalWeek.push(dayStr);
    if (!tempEditedDailyBreakdown[dayStr]) {
      tempEditedDailyBreakdown[dayStr] = {}; // Initialize if day is missing
    }
  }

  // Calculate initial weekly totals from dailyBreakdown
  const initialWeeklyTotals = {};
  Object.values(tempEditedDailyBreakdown).forEach((dayData) => {
    Object.entries(dayData).forEach(([groupId, count]) => {
      initialWeeklyTotals[groupId] =
        (initialWeeklyTotals[groupId] || 0) + count;
    });
  });

  // Update the history record's totals
  editingHistoryWeekDataRef.totals = initialWeeklyTotals;

  selectedDayInHistoryModal = daysOfThisHistoricalWeek[0]; // Default to first day

  const mainModalTitle = `Week of ${weekStartDateObj.toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", year: "numeric" }
  )}`;

  // 1. Show the modal shell using uiRenderer
  uiRenderer.showEditHistoryModalShell(mainModalTitle, "Save Changes to Week");

  // 2. Get references to the modal's internal placeholders (cached in uiRenderer.domElements)
  //    We assume uiRenderer.domElements.modalElements.modalDaySelectorBar and .editTotalsList are correct.
  const modalDaySelectorBarEl =
    uiRenderer.domElements.modalElements.modalDaySelectorBar;
  // const modalDayDisplayEl = uiRenderer.domElements.modalElements.modalSelectedDayDisplay; // updated by updateModalSelectedDayDisplay
  // const modalFoodListEl = uiRenderer.domElements.modalElements.editTotalsList; // updated by renderModalDayDetailsList

  // 3. Populate the dynamic content using other uiRenderer functions
  uiRenderer.updateModalSelectedDayDisplay(selectedDayInHistoryModal);

  if (modalDaySelectorBarEl) {
    uiRenderer.renderDaySelectorBar(
      modalDaySelectorBarEl,
      editingHistoryWeekDataRef.weekStartDate,
      selectedDayInHistoryModal,
      handleModalDayNavigation, // Callback in app.js
      editingHistoryWeekDataRef.metadata?.weekStartDay ||
        state.metadata.weekStartDay ||
        "Sunday", // Use record's, then state's, then default
      true // isModal = true
    );
  } else {
    logger.error(
      "Modal day selector bar element not found for history edit modal."
    );
  }

  uiRenderer.renderModalDayDetailsList(
    historyModalFoodGroups,
    tempEditedDailyBreakdown[selectedDayInHistoryModal] || {},
    tempEditedDailyBreakdown
  );
}

/**
 * Handles navigation between days within the "Edit History Daily Details" modal.
 * @param {string} newSelectedDayStr - The YYYY-MM-DD of the day selected in the modal's day bar.
 */
function handleModalDayNavigation(newSelectedDayStr) {
  if (!editingHistoryWeekDataRef || !tempEditedDailyBreakdown) {
    logger.warn(
      "handleModalDayNavigation called without active editing context."
    );
    return;
  }

  selectedDayInHistoryModal = newSelectedDayStr;
  logger.debug(
    `History Modal: Day navigation changed to ${selectedDayInHistoryModal}`
  );

  // Update the "Mon, 3/8" display in the modal header
  uiRenderer.updateModalSelectedDayDisplay(selectedDayInHistoryModal);

  // Ensure weekly totals are up to date before re-rendering
  const weeklyTotals = {};
  Object.values(tempEditedDailyBreakdown).forEach((dayData) => {
    Object.entries(dayData).forEach(([groupId, count]) => {
      weeklyTotals[groupId] = (weeklyTotals[groupId] || 0) + count;
    });
  });
  editingHistoryWeekDataRef.totals = weeklyTotals;

  // Re-render the food item list for the newly selected day
  uiRenderer.renderModalDayDetailsList(
    historyModalFoodGroups,
    tempEditedDailyBreakdown[selectedDayInHistoryModal] || {},
    tempEditedDailyBreakdown
  );

  // The uiRenderer.renderDaySelectorBar already visually updates the active button
  // on click, but if we need to ensure it's correct after any programmatic change:
  const modalDaySelectorBarEl =
    uiRenderer.domElements.modalElements.modalDaySelectorBar;
  if (modalDaySelectorBarEl) {
    uiRenderer.updateDaySelectorActiveState(
      modalDaySelectorBarEl,
      selectedDayInHistoryModal
    );
  }
}

/**
 * Handles +/- clicks or input changes for food items within the "Edit History Daily Details" modal.
 * Updates the temporary 'tempEditedDailyBreakdown'.
 * @param {Event} event - The click event from +/- buttons or change event from input.
 */
function handleModalDailyDetailChange(event) {
  const button = event.target.closest(
    ".edit-decrement-btn, .edit-increment-btn"
  );
  // TODO: Later, also handle direct input change if you add number inputs to the modal list

  if (
    !button ||
    !selectedDayInHistoryModal ||
    !tempEditedDailyBreakdown ||
    !editingHistoryWeekDataRef
  ) {
    return;
  }

  const itemElement = button.closest(".edit-totals-item");
  const groupId = itemElement?.dataset.id;

  if (!groupId) {
    logger.warn("handleModalDailyDetailChange: groupId not found on item.");
    return;
  }

  // Ensure the day's entry and food group entry exist in our temporary breakdown
  if (!tempEditedDailyBreakdown[selectedDayInHistoryModal]) {
    tempEditedDailyBreakdown[selectedDayInHistoryModal] = {};
  }

  let currentValue =
    parseInt(
      tempEditedDailyBreakdown[selectedDayInHistoryModal][groupId],
      10
    ) || 0;

  if (button.classList.contains("edit-increment-btn")) {
    currentValue++;
  } else if (button.classList.contains("edit-decrement-btn")) {
    currentValue = Math.max(0, currentValue - 1);
  }

  tempEditedDailyBreakdown[selectedDayInHistoryModal][groupId] = currentValue;
  appUtils.triggerHapticFeedback(20);

  // Re-render the entire list to update all weekly badges
  uiRenderer.renderModalDayDetailsList(
    historyModalFoodGroups,
    tempEditedDailyBreakdown[selectedDayInHistoryModal] || {},
    tempEditedDailyBreakdown
  );
}

/**
 * Saves the changes made in the "Edit History Daily Details" modal
 * to the stateManager and IndexedDB.
 */
async function saveEditedHistoryDailyDetails() {
  if (!editingHistoryWeekDataRef || !tempEditedDailyBreakdown) {
    logger.error(
      "saveEditedHistoryDailyDetails: Cannot save, editing context is missing."
    );
    uiRenderer.showToast("Error saving changes. No editing context.", "error");
    closeEditHistoryDailyDetailsModal(); // Use the specific close function
    return;
  }

  try {
    logger.info(
      `Saving daily details for history week: ${editingHistoryWeekDataRef.weekStartDate}`
    );
    logger.debug(
      "Temporary daily breakdown being saved:",
      JSON.parse(JSON.stringify(tempEditedDailyBreakdown))
    );

    // 1. Update the original history record's dailyBreakdown with our temporary copy
    //    Make sure to create a new object to avoid reference issues if tempEditedDailyBreakdown is reused.
    editingHistoryWeekDataRef.dailyBreakdown = JSON.parse(
      JSON.stringify(tempEditedDailyBreakdown)
    );

    // 2. Recalculate totals for this history record based on the new dailyBreakdown
    const newTotalsForHistoryRecord = {};
    const weekStartDateForTotals = editingHistoryWeekDataRef.weekStartDate;
    const startDateObj = new Date(weekStartDateForTotals + "T00:00:00");

    for (let i = 0; i < 7; i++) {
      const dayToProcess = new Date(startDateObj);
      dayToProcess.setDate(startDateObj.getDate() + i);
      const dateStr = appUtils.formatDateToYYYYMMDD(dayToProcess);

      if (editingHistoryWeekDataRef.dailyBreakdown[dateStr]) {
        for (const foodId in editingHistoryWeekDataRef.dailyBreakdown[
          dateStr
        ]) {
          if (
            editingHistoryWeekDataRef.dailyBreakdown[dateStr].hasOwnProperty(
              foodId
            )
          ) {
            newTotalsForHistoryRecord[foodId] =
              (newTotalsForHistoryRecord[foodId] || 0) +
              (editingHistoryWeekDataRef.dailyBreakdown[dateStr][foodId] || 0);
          }
        }
      }
    }
    editingHistoryWeekDataRef.totals = newTotalsForHistoryRecord;
    logger.debug(
      "Recalculated totals for history record:",
      JSON.parse(JSON.stringify(newTotalsForHistoryRecord))
    );

    // 3. Update metadata for the history record
    if (!editingHistoryWeekDataRef.metadata)
      editingHistoryWeekDataRef.metadata = {};
    editingHistoryWeekDataRef.metadata.updatedAt =
      dataService.getCurrentTimestamp();
    // Ensure weekStartDay from original record is preserved. It was set on archival.
    // It should not change during an edit of daily details.
    editingHistoryWeekDataRef.metadata.weekStartDay =
      editingHistoryWeekDataRef.metadata.weekStartDay ||
      stateManager.getState().metadata.weekStartDay || // Fallback to current app pref
      "Sunday"; // Ultimate fallback

    // 4. Save the modified history record to dataService
    // We need to pass foodGroups in case normalizeWeekData needs to rebuild targets
    // if they were missing from an old history record.
    await dataService.saveWeekHistory(editingHistoryWeekDataRef, {
      foodGroups: stateManager.getState().foodGroups,
      weekStartDay: editingHistoryWeekDataRef.metadata.weekStartDay, // Pass the record's specific weekStartDay
    });

    // 5. Refresh history data in stateManager (this will trigger UI update for history view)
    const updatedHistoryData = await dataService.getAllWeekHistory();
    stateManager.dispatch({
      type: stateManager.ACTION_TYPES.SET_HISTORY,
      payload: { history: updatedHistoryData || [] },
    });
    // The currentHistoryIndex should still point to the edited week,
    // so uiRenderer.renderHistory() (called via subscription) will show updated data.

    // 6. Update app-level metadata
    stateManager.updateMetadata({
      historyDirty: true, // Mark history as dirty for potential sync
      lastModified: dataService.getCurrentTimestamp(), // General app data modification
    });

    uiRenderer.showToast(
      `Daily details updated for week of ${new Date(
        editingHistoryWeekDataRef.weekStartDate + "T00:00:00"
      ).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`,
      "success"
    );
    closeEditHistoryDailyDetailsModal();
  } catch (error) {
    logger.error(
      `Error saving edited history daily details for week ${editingHistoryWeekDataRef.weekStartDate}:`,
      error
    );
    uiRenderer.showToast(`Failed to save changes: ${error.message}`, "error");
    // Optionally, don't close the modal on error so user can retry or see data.
  }
}

/**
 * Closes the "Edit History Daily Details" modal and resets its temporary state.
 */
function closeEditHistoryDailyDetailsModal() {
  uiRenderer.closeEditTotalsModal(); // Call the uiRenderer function to hide the modal

  // Reset temporary editing state variables in app.js
  editingHistoryWeekDataRef = null;
  tempEditedDailyBreakdown = {};
  selectedDayInHistoryModal = null;
  historyModalFoodGroups = [];

  logger.debug("Closed Edit History Daily Details modal and reset temp state.");

  // Optional: Reset the modal's internal DOM structure if uiRenderer.closeEditTotalsModal doesn't
  // For example, clear the list element:
  // const listEl = uiRenderer.domElements.modalElements.editTotalsList;
  // if (listEl) listEl.innerHTML = "";
  // However, showEditHistoryModalShell already clears these areas upon opening.
}

// Initialize the application when the DOM is loaded
document.addEventListener("DOMContentLoaded", initializeApp);
