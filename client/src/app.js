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

// Check if server features are enabled (build-time constant)
const SERVER_FEATURES_ENABLED = __SERVER_FEATURES_ENABLED__;

// Detect and handle OAuth redirects from our server before any other initialization
(function detectOAuthRedirect() {
  // A redirect from our server will contain 'provider' and 'access_token' in the query parameters
  if (
    window.location.search.includes("access_token=") &&
    window.location.search.includes("provider=")
  ) {
    try {
      // Use URLSearchParams for robust parsing of the query string
      const params = new URLSearchParams(window.location.search.substring(1)); // remove the leading '?'

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token"); // This is the new, crucial token
      const provider = params.get("provider");

      let state = null;
      if (params.has("state")) {
        try {
          state = JSON.parse(atob(decodeURIComponent(params.get("state"))));
        } catch (e) {
          console.error("Error parsing OAuth state parameter:", e);
        }
      }

      if (!accessToken || !provider) {
        throw new Error("Incomplete token information in redirect URL.");
      }

      // Store tokens based on the provider sent back from our server
      if (provider === "gdrive") {
        localStorage.setItem("gdrive_access_token", accessToken);
        // Only store the refresh token if the server provided one.
        // Google often only sends it on the very first consent.
        if (refreshToken) {
          localStorage.setItem("gdrive_refresh_token", refreshToken);
        }
      } else if (provider === "dropbox") {
        localStorage.setItem("dropbox_access_token", accessToken);
        if (refreshToken) {
          localStorage.setItem("dropbox_refresh_token", refreshToken);
        }
      }

      // Check if this was a wizard OAuth flow to signal continuation
      if (state?.wizardContext === "cloudProviderConnect") {
        localStorage.setItem("pendingWizardContinuation", "true");
        console.log("OAuth redirect detected for wizard flow");
      } else if (state?.wizardContext === "settingsAuth") {
        // This was a settings dialog OAuth flow
        localStorage.setItem("pendingSettingsAuth", "true");
        console.log("OAuth redirect detected for settings flow");
      } else {
        // Legacy or unknown context - store state for backward compatibility
        if (state) {
          localStorage.setItem(
            `${provider}_auth_state`,
            JSON.stringify({
              ...state,
              timestamp: Date.now(),
            })
          );
        }
        console.log("OAuth redirect detected for unknown context");
      }

      // Clear the query parameters from the URL so it doesn't get processed again on reload
      window.history.replaceState(null, "", window.location.pathname);
      console.log(`Successfully processed OAuth redirect for ${provider}.`);
    } catch (error) {
      console.error("OAuth redirect handling error:", error);
      // It's often better to clear the query even on error to prevent loops.
      window.history.replaceState(null, "", window.location.pathname);
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

// Create event handlers instance (will be initialized later with dependencies)
let eventHandlers = null;
let appManager = null; // Will be initialized after stateManager

// Expose only necessary functions to window (for cloud providers)
window.setSyncReady = function (ready) {
  if (appManager) {
    appManager.setSyncReady(ready);
  }
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

    // Try to sync when device comes online using centralized coordination
    if (
      appManager.getSyncEnabled() &&
      appManager.getCloudSync() &&
      appManager.getSyncReady()
    ) {
      appManager.requestSync("reload", {
        priority: "high",
        skipCooldown: true, // Force sync when coming back online
      });
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
import themeManager from "./core/themeManager.js";

// ... existing code ...

/**
 * Initialize the application
 */
async function initializeApp() {
  logger.info("Initializing app...");

  await finalizeLoggerConfig(); // Ensures DEV_MODE-aware logging early

  try {
    // Check for OAuth redirect first - this takes priority over setup completion check
    const pendingWizardContinuation = localStorage.getItem(
      "pendingWizardContinuation"
    );

    if (pendingWizardContinuation) {
      logger.info("Detected pending wizard continuation from OAuth redirect");

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

      // Launch the setup wizard (it will detect the pendingWizardContinuation flag)
      await setupWizard.start();
      return; // Exit early, wait for setup completion
    }

    // Check if initial setup is needed (only if no pending OAuth continuation)
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

    // Initialize theme manager
    await themeManager.initialize();

    // Initialize state manager with food groups configuration
    await stateManager.initialize(foodGroups);

    // Initialize app manager with stateManager dependency
    appManager = new AppManager({ stateManager });

    // Initialize UI renderer
    uiRenderer.initialize(appManager);

    // Initialize modal manager
    historyModalManager.initialize();

    // Initialize DOM elements cache
    appManager.initializeDOMElements();

    // Initialize import/export manager
    importExportManager.initialize(appManager.getDomElements().importFileInput);

    // Initialize settings manager with conditional cloud sync features
    if (SERVER_FEATURES_ENABLED) {
      logger.info(
        "Server features are enabled. Initializing cloud sync components."
      );
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
    } else {
      logger.info("Server features are disabled. Running in local-only mode.");
      settingsManager.initialize({
        CloudSyncManager: null,
        closeMenu: closeMenu,
        updateSyncUIElements: () => appManager.updateSyncUIElements(),
        setSyncReady: (ready) => appManager.setSyncReady(ready),
        syncData: () => logger.warn("Sync called in local-only mode."),
        handleSyncComplete: () =>
          logger.warn("Sync complete called in local-only mode."),
        handleSyncError: () =>
          logger.warn("Sync error called in local-only mode."),
        stateManager: stateManager,
        getCloudSyncState: () => null,
        setCloudSyncState: () =>
          logger.warn("Set cloud sync state called in local-only mode."),
        getSyncEnabled: () => false,
        setSyncEnabled: () =>
          logger.warn("Set sync enabled called in local-only mode."),
        getSyncReady: () => false,
        getIsDemoHost: () => isDemoHost,
      });
    }

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

    // Setup sync button in menu (only if server features are enabled)
    if (SERVER_FEATURES_ENABLED) {
      setupSyncButton();
    }

    // Check if test mode is active and add banner if needed
    if (dataService.isTestModeEnabled()) {
      const testDate = dataService.getCurrentDate();
      appUtils.addTestModeBanner(
        `TEST MODE: Using date ${testDate.toLocaleDateString()}`
      );
    }

    // 5. Setup network listeners
    setupNetworkListeners();

    // 6. Initialize cloud sync capabilities (only if server features are enabled)
    let syncInitialized = false;

    if (SERVER_FEATURES_ENABLED) {
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
    } else {
      logger.info(
        "Cloud sync initialization skipped - server features disabled"
      );
    }

    // Check for settings OAuth return when app is already initialized (only if server features enabled)
    if (SERVER_FEATURES_ENABLED) {
      const pendingSettingsAuth = localStorage.getItem("pendingSettingsAuth");
      if (pendingSettingsAuth && !fromWizard) {
        logger.info("Detected settings OAuth return, showing settings dialog");
        localStorage.removeItem("pendingSettingsAuth");

        // Show settings dialog after a short delay to ensure app is fully initialized
        setTimeout(() => {
          settingsManager.showSettings();
          uiRenderer.showToast("Authentication successful", "success");

          // Set pending initial sync flag so sync will be triggered when dialog closes
          if (settingsManager.setPendingInitialSync) {
            settingsManager.setPendingInitialSync(true);
          }
        }, 1000);
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

    // Use the configured provider
    const effectiveProvider = syncProvider;

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

    // Handle OAuth redirect cases for both providers
    const hasOAuthRedirect = window.location.search.includes("access_token=");
    const pendingWizardContinuation = localStorage.getItem(
      "pendingWizardContinuation"
    );
    const pendingSettingsAuth = localStorage.getItem("pendingSettingsAuth");

    if (hasOAuthRedirect || pendingWizardContinuation || pendingSettingsAuth) {
      // Update preferences since we now have a token
      await dataService.savePreference("cloudSyncEnabled", true);
      await dataService.savePreference("cloudSyncProvider", effectiveProvider);

      // Clear the flags
      localStorage.removeItem("pendingWizardContinuation");
      localStorage.removeItem("pendingSettingsAuth");

      if (pendingWizardContinuation) {
        // This was a wizard OAuth flow - set sync ready and let the wizard handle continuation
        appManager.setSyncReady(true);
        return true;
      } else if (pendingSettingsAuth) {
        // This was a settings dialog OAuth flow
        setTimeout(() => {
          settingsManager.showSettings();
          // Show success toast
          uiRenderer.showToast(
            `${
              effectiveProvider === "gdrive" ? "Google Drive" : "Dropbox"
            } connected successfully`,
            "success"
          );

          // Set pending initial sync flag so sync will be triggered when dialog closes
          if (settingsManager.setPendingInitialSync) {
            settingsManager.setPendingInitialSync(true);
          }

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

  // Use centralized sync coordination instead of direct sync
  const trigger = isInitialSync
    ? "initial"
    : isManualSync
    ? "manual"
    : "reload";
  const options = {
    skipCooldown: isInitialSync || isManualSync, // Skip cooldown for high priority operations
    skipDebounce: isManualSync, // Skip debounce for manual syncs
    skipThrottle: isInitialSync || isManualSync, // Skip throttle for high priority operations
    priority: isManualSync ? "high" : "normal",
  };

  try {
    logger.info("Starting sync operation");
    // Update UI to show sync in progress
    appManager.updateSyncUIElements();

    // Use centralized sync coordination
    const syncExecuted = await appManager.requestSync(trigger, options);

    if (!syncExecuted) {
      logger.debug("Sync request was blocked by coordination system");
      return;
    }

    logger.info("Sync completed successfully");

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

    // Now refresh the UI with explicit validation
    logger.info("Refreshing UI after state reload");

    // Ensure we have the latest state before rendering
    const currentState = stateManager.getState();
    logger.debug("Current state after reload:", {
      dayDate: currentState.currentDayDate,
      weekStartDate: currentState.currentWeekStartDate,
      dailyCountsKeys: Object.keys(currentState.dailyCounts || {}),
      weeklyCountsKeys: Object.keys(currentState.weeklyCounts || {}),
    });

    // Force a complete UI refresh
    uiRenderer.renderEverything();

    // Additional validation: ensure daily counts are properly displayed
    const selectedDate = currentState.selectedTrackerDate;
    if (selectedDate && currentState.dailyCounts[selectedDate]) {
      logger.debug(
        `Daily counts for ${selectedDate}:`,
        currentState.dailyCounts[selectedDate]
      );
    }
  } catch (error) {
    logger.error("Sync error:", error);
    handleSyncError(error);
  } finally {
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
