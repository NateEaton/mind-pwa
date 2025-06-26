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

// Detect and handle OAuth redirects before any other initialization
(function detectOAuthRedirect() {
  if (window.location.hash.includes("access_token=")) {
    try {
      const accessToken = window.location.hash.match(/access_token=([^&]*)/)[1];
      let state = null;

      // Try to parse state parameter
      const stateMatch = window.location.hash.match(/state=([^&]*)/);
      if (stateMatch) {
        try {
          state = JSON.parse(atob(decodeURIComponent(stateMatch[1])));
        } catch (e) {
          console.error("Error parsing OAuth state parameter:", e);
        }
      }

      // Store the token
      localStorage.setItem("dropbox_access_token", accessToken);

      // Check if this was a wizard OAuth flow
      if (state?.wizardContext === "cloudProviderConnect") {
        localStorage.setItem("pendingWizardContinuation", "true");
      } else {
        if (state) {
          localStorage.setItem("dropbox_auth_state", JSON.stringify(state));
        }
      }

      // Clear the hash
      window.history.replaceState(null, "", window.location.pathname);
    } catch (error) {
      console.error("OAuth redirect handling error:", error);
    }
  }
})();

import dataService from "./core/dataService.js";
import stateManager from "./core/stateManager.js";
import uiRenderer from "./ui/renderer.js";
import appUtils from "./utils/appUtils.js";
import dateUtils from "./utils/dateUtils.js";
import historyModalManager from "./core/historyModalManager.js";
import importExportManager from "./core/importExportManager.js";
import settingsManager from "./core/settingsManager.js";
import CloudSyncManager from "./cloudSync/cloudSync.js";
import EventHandlers from "./core/eventHandlers.js";
import AppManager from "./core/appManager.js";
import { createLogger, configure, LOG_LEVELS } from "./core/logger.js";
import { CONFIG } from "./config.js";

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

// Create single app manager instance
const appManager = new AppManager();

// Create event handlers instance (will be initialized later with dependencies)
let eventHandlers = null;

// Expose only necessary functions to window (for cloud providers)
window.setSyncReady = function (ready) {
  appManager.setSyncReady(ready);
};

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
    appManager.updateSyncUIElements();

    // Optionally notify the user
    uiRenderer.showToast("Network connection restored", "info");

    // Try to sync when device comes online
    if (
      appManager.getSyncEnabled() &&
      appManager.getCloudSync() &&
      appManager.getSyncReady()
    ) {
      syncData();
    }
  });

  // Listen for offline event
  window.addEventListener("offline", () => {
    logger.info("Device went offline");
    isOnline = false;

    // Update UI elements
    appManager.updateSyncUIElements();

    // Optionally notify the user
    uiRenderer.showToast("Network connection lost", "warning");
  });

  // For mobile devices, check connection type changes if available
  if ("connection" in navigator && navigator.connection) {
    navigator.connection.addEventListener("change", () => {
      const connectionType = navigator.connection.type;
      logger.info("Connection type changed:", connectionType);

      // Update UI if we have a wifi-only constraint
      const syncWifiOnly = appManager.getCloudSync()?.syncWifiOnly || false;
      if (syncWifiOnly) {
        appManager.updateSyncUIElements();
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
    const isDevMode = CONFIG?.DEV_MODE || false;

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

// ... existing imports ...
import setupWizard from "./core/setupWizard.js";

// ... existing code ...

/**
 * Initialize the application
 */
async function initializeApp() {
  logger.info("Initializing app...");

  await finalizeLoggerConfig(); // Ensures DEV_MODE-aware logging early

  try {
    // Check if initial setup is needed
    const setupCompleted = await dataService.getPreference(
      "initialSetupCompleted",
      false
    );

    if (!setupCompleted) {
      logger.info("Initial setup not completed, launching setup wizard");

      // Listen for setup completion
      window.addEventListener(
        "setupWizardComplete",
        async (event) => {
          logger.info(
            "Setup wizard completed with selections:",
            event.detail.selections
          );

          // Continue with app initialization
          await completeAppInitialization(true);
        },
        { once: true }
      );

      // Launch the setup wizard
      await setupWizard.start();
      return; // Exit early, wait for setup completion
    }

    // If setup is complete, continue with normal initialization
    await completeAppInitialization();
  } catch (error) {
    logger.error("Error during app initialization:", error);
    uiRenderer.showToast(`Initialization Error: ${error.message}`, "error", {
      duration: 5000,
    });
  }
}

/**
 * Complete the app initialization after setup wizard (if needed)
 * @param {boolean} fromWizard - Whether this is being called after wizard completion
 */
async function completeAppInitialization(fromWizard = false) {
  try {
    // Initialize data service first
    await dataService.initialize();

    // Initialize state manager with food groups configuration
    await stateManager.initialize(foodGroups);

    // Initialize UI renderer
    uiRenderer.initialize(appManager);

    // Initialize modal manager
    historyModalManager.initialize();

    // Initialize DOM elements cache
    appManager.initializeDOMElements();

    // Initialize import/export manager
    importExportManager.initialize(appManager.getDomElements().importFileInput);

    // Initialize settings manager
    settingsManager.initialize({
      CloudSyncManager: CloudSyncManager,
      closeMenu: closeMenu,
      updateSyncUIElements: () => appManager.updateSyncUIElements(),
      setSyncReady: (ready) => appManager.setSyncReady(ready),
      syncData: syncData,
      handleSyncComplete: handleSyncComplete,
      handleSyncError: handleSyncError,
      stateManager: stateManager,
      getCloudSyncState: () => appManager.getCloudSync(),
      setCloudSyncState: (newCloudSync) =>
        appManager.setCloudSync(newCloudSync),
      getSyncEnabled: () => appManager.getSyncEnabled(),
      setSyncEnabled: (enabled) => appManager.setSyncEnabled(enabled),
      getSyncReady: () => appManager.getSyncReady(),
      getIsDemoHost: () => isDemoHost,
    });

    // Render all UI components after initialization
    uiRenderer.renderEverything();

    // Set initial active view
    uiRenderer.setActiveView("tracker");

    // Register service worker
    appUtils.registerServiceWorker();

    // Display app version in footer
    await appUtils.loadAppVersion(
      appManager.getDomElements().appVersionElement
    );

    // Initialize event handlers with all dependencies
    eventHandlers = new EventHandlers({
      appManager,
      stateManager,
      uiRenderer,
      dataService,
      settingsManager,
      historyModalManager,
      importExportManager,
      syncData,
      closeMenu,
    });

    // Setup event listeners
    eventHandlers.setupEventListeners();

    // Setup sync button in menu
    setupSyncButton();

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
    let syncInitialized = false;

    if (fromWizard) {
      // If coming from wizard, cloud sync is already set up if the user enabled it
      appManager.setSyncEnabled(
        await dataService.getPreference("cloudSyncEnabled", false)
      );

      if (appManager.getSyncEnabled()) {
        logger.info(
          "Cloud sync was enabled during wizard setup, using existing configuration"
        );

        // Get the provider that was set up in the wizard
        const syncProvider = await dataService.getPreference(
          "cloudSyncProvider",
          "gdrive"
        );

        // Create and initialize cloud sync manager with existing auth
        appManager.setCloudSync(
          new CloudSyncManager(
            dataService,
            stateManager,
            uiRenderer,
            handleSyncComplete,
            handleSyncError
          )
        );

        const autoSyncInterval = await dataService.getPreference(
          "autoSyncInterval",
          15
        );
        const syncWifiOnly = await dataService.getPreference(
          "syncWifiOnly",
          false
        );
        appManager.getCloudSync().syncWifiOnly = syncWifiOnly;

        // Initialize provider (should find existing auth from wizard)
        const initResult = await appManager
          .getCloudSync()
          .initialize(syncProvider);

        if (initResult) {
          appManager.setSyncReady(true);

          // Configure auto-sync
          if (autoSyncInterval > 0) {
            appManager.getCloudSync().enableAutoSync(autoSyncInterval);
            logger.info(
              `Auto-sync configured for every ${autoSyncInterval} minutes`
            );
          }

          // Trigger immediate sync after setup
          logger.info("Triggering initial sync after setup completion");
          await syncData(true, false); // isInitialSync=true, isManualSync=false

          syncInitialized = true;
          logger.info(
            "Cloud sync initialized successfully using wizard configuration"
          );
        } else {
          logger.warn(
            "Failed to initialize cloud sync with wizard configuration"
          );
        }
      } else {
        logger.info("Cloud sync was disabled during wizard setup");
      }
    } else {
      // Normal app startup - use full initialization
      syncInitialized = await initializeCloudSync();
    }

    // 7. Perform initial sync if enabled and initialized
    // Only for normal startup, not after wizard completion
    if (
      !fromWizard &&
      appManager.getSyncEnabled() &&
      appManager.getSyncReady()
    ) {
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
  appManager.setSyncEnabled(
    await dataService.getPreference("cloudSyncEnabled", false)
  );
  logger.debug("Initial syncEnabled value:", appManager.getSyncEnabled());

  if (!appManager.getSyncEnabled()) {
    logger.info("Cloud sync is disabled in preferences");
    return false;
  }

  // Set sync readiness to false initially
  appManager.setSyncReady(false);

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
    appManager.setCloudSync(
      new CloudSyncManager(
        dataService,
        stateManager,
        uiRenderer,
        handleSyncComplete,
        handleSyncError
      )
    );

    // Set network constraints
    appManager.getCloudSync().syncWifiOnly = syncWifiOnly;

    // Initialize provider
    const initResult = await appManager
      .getCloudSync()
      .initialize(effectiveProvider);

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
      appManager.setSyncEnabled(false);

      // Update UI to reflect sync is disabled
      appManager.updateSyncUIElements();
      return false;
    }

    logger.info("Cloud sync initialized successfully");

    // Configure auto-sync
    if (autoSyncInterval > 0) {
      appManager.getCloudSync().enableAutoSync(autoSyncInterval);
      logger.info(`Auto-sync configured for every ${autoSyncInterval} minutes`);
    }

    // Handle Dropbox auth redirect case - only relevant for Dropbox
    if (effectiveProvider === "dropbox" && hasDropboxAuthRedirect) {
      // Update preferences since we now have a token
      await dataService.savePreference("cloudSyncEnabled", true);
      await dataService.savePreference("cloudSyncProvider", "dropbox");

      // Check if this redirect came from the wizard
      const pendingWizardContinuation = localStorage.getItem(
        "pendingWizardContinuation"
      );

      if (pendingWizardContinuation) {
        // This was a wizard OAuth flow - set sync ready and let the wizard handle continuation
        appManager.setSyncReady(true);
        return true;
      } else {
        // This was a settings dialog OAuth flow
        setTimeout(() => {
          settingsManager.showSettings();
          // Show success toast
          uiRenderer.showToast("Dropbox connected successfully", "success");

          // Set sync ready AFTER the settings dialog is shown

          setTimeout(() => {
            appManager.setSyncReady(true);
          }, 1000);
        }, 500);

        // Return early WITHOUT setting syncReady=true
        return true;
      }
    }

    // Mark sync as ready
    appManager.setSyncReady(true);

    // Update UI elements
    appManager.updateSyncUIElements();

    // Set flag to indicate we're doing initial sync
    appManager.initialSyncInProgress = true;

    // Perform initial sync if enabled and initialized
    if (appManager.getSyncEnabled() && appManager.getSyncReady()) {
      logger.info("Performing initial sync");
      await syncData(true); // Pass true to indicate this is initial sync
    }

    appManager.initialSyncInProgress = false;
    return true;
  } catch (error) {
    logger.error("Failed to initialize cloud sync:", error);
    // Keep sync disabled but don't interrupt app initialization
    appManager.setSyncReady(false);
    appManager.updateSyncUIElements();

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
      syncData(false, true); // Not initial sync, but is manual sync
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
  } else {
    // If button exists, update its click handler
    syncBtn.addEventListener("click", () => {
      logger.info("Sync button clicked");
      closeMenu();
      syncData(false, true); // Not initial sync, but is manual sync
    });
  }

  // Initial button state
  appManager.updateSyncUIElements();
}

/**
 * Close the main menu
 */
function closeMenu() {
  appManager.getDomElements().mainMenu.classList.remove("menu-open");
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
    appManager
      .getCloudSync()
      .authenticate()
      .catch((e) => logger.error("Authentication failed:", e));
  }
}

// Update syncData to track last sync time
async function syncData(isInitialSync = false, isManualSync = false) {
  logger.debug("syncData called", {
    cloudSync: appManager.getCloudSync(),
    syncEnabled: appManager.getSyncEnabled(),
    syncReady: appManager.getSyncReady(),
    online: navigator.onLine,
    isInitialSync,
    isManualSync,
  });

  if (
    !appManager.getCloudSync() ||
    !appManager.getSyncEnabled() ||
    !appManager.getSyncReady()
  ) {
    logger.debug("Sync skipped: not ready", {
      cloudSync: appManager.getCloudSync(),
      syncEnabled: appManager.getSyncEnabled(),
      syncReady: appManager.getSyncReady(),
    });
    return;
  }

  // If this is not an initial sync and one is in progress, skip
  if (!isInitialSync && appManager.initialSyncInProgress) {
    logger.info("Skipping sync while initial sync is in progress");
    return;
  }

  // If any sync is already in progress, skip
  if (appManager.getCloudSync().syncInProgress) {
    logger.info("Sync already in progress, skipping");
    return;
  }

  try {
    logger.info("Starting sync operation");
    // Update UI to show sync in progress
    appManager.updateSyncUIElements();

    // Start the sync process - cloudSyncManager handles all toast messages
    const result = await appManager.getCloudSync().sync(!isManualSync); // Pass silent=true for auto syncs, silent=false for manual syncs

    logger.info("Sync completed:", result);

    // Update last sync time
    appManager.lastSyncTime = Date.now();

    // Force a complete reload of state from dataService
    logger.info("Reloading state after sync");
    if (typeof stateManager.reload === "function") {
      logger.info("stateManager.reload is typeof function, calling reload");
      await stateManager.reload();
    } else {
      logger.warn("stateManager.reload not found, manually reloading state");
      // Fallback if reload method doesn't exist - use batching to prevent UI flicker
      stateManager.startBatching();
      try {
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
      } finally {
        stateManager.endBatching();
      }
    }

    // Now refresh the UI
    logger.info("Refreshing UI after state reload");
    uiRenderer.renderEverything();
  } catch (error) {
    logger.error("Sync error:", error);
    handleSyncError(error);
  } finally {
    if (appManager.getCloudSync()) {
      appManager.getCloudSync().syncInProgress = false;
    }
    appManager.updateSyncUIElements();
  }
}

/**
 * Handle dynamic viewport height for mobile browsers
 * This addresses issues with browsers like Edge mobile that include browser chrome in viewport calculations
 */
function setupDynamicViewportHeight() {
  function updateViewportHeight() {
    // Calculate the actual viewport height
    const vh = window.innerHeight * 0.01;
    // Set a CSS custom property for use in calculations
    document.documentElement.style.setProperty("--vh", `${vh}px`);

    // For browsers that don't support dvh, we can use this custom property
    if (!CSS.supports("height", "100dvh")) {
      document.documentElement.style.setProperty(
        "--dynamic-vh",
        `${window.innerHeight}px`
      );
    }
  }

  // Set initial values
  updateViewportHeight();

  // Update on resize and orientation change
  window.addEventListener("resize", updateViewportHeight);
  window.addEventListener("orientationchange", () => {
    // Delay update to allow browser UI to settle
    setTimeout(updateViewportHeight, 100);
  });

  // Update on visual viewport changes (for browsers that support it)
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateViewportHeight);
  }
}

// Initialize the application when the DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Setup dynamic viewport height first
    setupDynamicViewportHeight();

    // Initialize the main application
    await initializeApp();
  } catch (error) {
    logger.error("Error initializing app:", error);
    uiRenderer.showToast(`Initialization Error: ${error.message}`, "error", {
      duration: 5000,
    });
  }
});
