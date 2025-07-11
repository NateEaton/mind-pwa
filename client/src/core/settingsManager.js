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
 * Settings Manager - Handles application settings dialog and cloud sync configuration
 */

import dataService from "./dataService.js";
import uiRenderer from "../ui/renderer.js";
import logger from "./logger.js";
import themeManager from "./themeManager.js";

// Module state
let sectionCollapseState = {}; // Track which sections are expanded/collapsed
let pendingInitialSync = false;

// Dependencies injected during initialization
let CloudSyncManager = null;
let closeMenuCallback = null;
let updateSyncUIElementsCallback = null;
let setSyncReadyCallback = null;
let syncDataCallback = null;
let handleSyncCompleteCallback = null;
let handleSyncErrorCallback = null;
let stateManager = null;

// Dynamic cloud sync state accessors (functions to get current state)
let getCloudSyncState = null;
let setCloudSyncState = null;
let getSyncEnabled = null;
let setSyncEnabled = null;
let getSyncReady = null;
let getIsDemoHost = null;

// Check if PocketBase is enabled at build time
const POCKETBASE_ENABLED = typeof __POCKETBASE_ENABLED__ !== 'undefined' ? __POCKETBASE_ENABLED__ : false;

/**
 * Initialize the settings manager
 * @param {Object} dependencies - Required dependencies
 */
function initialize(dependencies) {
  CloudSyncManager = dependencies.CloudSyncManager;
  closeMenuCallback = dependencies.closeMenu;
  updateSyncUIElementsCallback = dependencies.updateSyncUIElements;
  setSyncReadyCallback = dependencies.setSyncReady;
  syncDataCallback = dependencies.syncData;
  handleSyncCompleteCallback = dependencies.handleSyncComplete;
  handleSyncErrorCallback = dependencies.handleSyncError;
  stateManager = dependencies.stateManager;

  // State accessors
  getCloudSyncState = dependencies.getCloudSyncState;
  setCloudSyncState = dependencies.setCloudSyncState;
  getSyncEnabled = dependencies.getSyncEnabled;
  setSyncEnabled = dependencies.setSyncEnabled;
  getSyncReady = dependencies.getSyncReady;
  getIsDemoHost = dependencies.getIsDemoHost;

  logger.debug("Settings Manager initialized");
}

/**
 * Handle settings button click
 */
async function handleSettings() {
  if (closeMenuCallback) closeMenuCallback();
  await showSettings();
}

/**
 * Show the settings dialog
 */
async function showSettings() {
  if (closeMenuCallback) closeMenuCallback();

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
    if (setSyncEnabled) {
      setSyncEnabled(freshSyncEnabled);
    }

    // Get current sync provider
    let currentSyncProvider;
    const cloudSync = getCloudSyncState ? getCloudSyncState() : null;
    if (cloudSync && cloudSync.provider) {
      // If we have an active cloud sync, check what type it is
      if (cloudSync.provider.providerName === "DropboxProvider") {
        currentSyncProvider = "dropbox";
      } else if (cloudSync.provider.providerName === "PocketbaseProvider") {
        currentSyncProvider = "pocketbase";
      } else {
        currentSyncProvider = "gdrive";
      }
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

    // Get user info if connected
    let userInfo = null;
    if (cloudSync?.isAuthenticated && cloudSync.provider?.getUserInfo) {
      try {
        userInfo = await cloudSync.provider.getUserInfo();
      } catch (error) {
        logger.debug("Failed to get user info:", error);
      }
    }

    // Get current theme
    const currentTheme = themeManager.getCurrentTheme();

    const settingsTitle = "Settings";

    let settingsContent = `
      <div class="settings-container">

        ${
          POCKETBASE_ENABLED
            ? `
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
              <!-- Authentication Section -->
              <div class="settings-row auth-row">
                <div class="auth-form-section">
                  <div class="connection-status">
                    <span class="status-label">Status:</span>
                    <span id="sync-status" class="status-value ${
                      cloudSync?.isAuthenticated ? "connected" : "disconnected"
                    }">${
                  cloudSync?.isAuthenticated ? "Connected" : "Not connected"
                }</span>
                  </div>
                  
                  ${
                    userInfo
                      ? `
                  <div class="connection-status account-info">
                    <span class="status-label">Account:</span>
                    <span class="status-value connected">${userInfo.email}</span>
                  </div>
                  `
                      : `
                  <!-- Sign In Form -->
                  <div class="auth-form" id="settings-auth-form">
                    <div class="form-group">
                      <label for="settings-email">Email</label>
                      <input type="email" id="settings-email" name="email" required 
                             autocomplete="username" ${!freshSyncEnabled ? "disabled" : ""}>
                    </div>
                    <div class="form-group">
                      <label for="settings-password">Password</label>
                      <input type="password" id="settings-password" name="password" required 
                             autocomplete="current-password" ${!freshSyncEnabled ? "disabled" : ""}>
                    </div>
                    <div class="auth-actions">
                      <button type="button" id="settings-signin-btn" class="small-btn" 
                              ${!freshSyncEnabled ? "disabled" : ""}>Sign In</button>
                      <button type="button" id="settings-register-btn" class="small-btn secondary" 
                              ${!freshSyncEnabled ? "disabled" : ""}>Create Account</button>
                    </div>
                    <div class="auth-status hidden" id="settings-auth-status">
                      <span class="status-message"></span>
                    </div>
                  </div>
                  `
                  }
                </div>
              </div>
              
              <div class="settings-row sync-options-row">
                <label for="sync-wifi-only">Sync only on Wi-Fi:</label>
                <input type="checkbox" id="sync-wifi-only" ${
                  syncWifiOnly ? "checked" : ""
                } ${!freshSyncEnabled ? "disabled" : ""}>
                <span class="setting-note">(Mobile devices only)</span>
              </div>
              
              ${
                cloudSync?.isAuthenticated
                  ? `
              <div class="settings-row sync-disconnect-row">
                <button id="sync-disconnect-btn" class="small-btn secondary" 
                        ${!freshSyncEnabled ? "disabled" : ""}>Disconnect</button>
              </div>
              `
                  : ""
              }
            </div>
          </div>
        </div>
        `
            : `
        <!-- Local-Only Mode Notice -->
        <div class="settings-section">
          <div class="section-header">
            <h4>Data Storage</h4>
          </div>
          <div class="section-content">
            <div class="settings-row">
              <p style="margin: 0; color: var(--text-muted);">
                Your data is stored locally in your browser. 
                Use Export/Import from the menu to backup or transfer your data.
              </p>
            </div>
          </div>
        </div>
        `
        }

        <!-- Appearance Section -->
        <div class="settings-section">
          <div class="section-header collapsible">
            <h4>Appearance</h4>
            <span class="section-toggle">▼</span>
          </div>
          <div class="section-content">
            <div class="settings-row">
              <label for="theme-select">Theme:</label>
              <select id="theme-select">
                <option value="light" ${
                  currentTheme === "light" ? "selected" : ""
                }>Light</option>
                <option value="dark" ${
                  currentTheme === "dark" ? "selected" : ""
                }>Dark</option>
                <option value="auto" ${
                  currentTheme === "auto" ? "selected" : ""
                }>Auto (System)</option>
              </select>
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
          label: "Cancel",
          id: "settings-cancel-btn",
          class: "secondary-btn",
          onClick: () => uiRenderer.closeModal(),
        },
        {
          label: "Save",
          id: "settings-save-btn",
          class: "primary-btn",
          onClick: () => closeSettingsModal(),
        },
      ],
    });

    setupSettingsEventListeners(freshSyncEnabled);
  } catch (err) {
    logger.error("Error loading settings:", err);
    uiRenderer.showToast("Failed to load settings", "error");
  }
}

/**
 * Setup event listeners for the settings dialog
 * @param {boolean} syncEnabled - Current sync enabled state
 */
function setupSettingsEventListeners(syncEnabled) {
  // Add event listeners for collapsible sections
  document.querySelectorAll(".section-header.collapsible").forEach((header) => {
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

  // Add event listeners for appearance settings
  setupAppearanceListeners();

  // Add cloud sync event listeners only if PocketBase is enabled
  if (POCKETBASE_ENABLED) {
    // Add event listener for Enable sync checkbox
    setupSyncEnabledListener();

    // Provider selection removed - only PocketBase is supported

    // Add event listener for WiFi-only setting
    setupWifiOnlyListener();

    // Event listeners for action buttons
    setupActionButtonListeners();
  }
}

/**
 * Setup appearance settings listeners
 */
function setupAppearanceListeners() {
  // Theme selector
  const themeSelect = document.getElementById("theme-select");
  if (themeSelect) {
    themeSelect.addEventListener("change", async (e) => {
      const newTheme = e.target.value;
      await themeManager.applyTheme(newTheme);
      uiRenderer.showToast(`Theme changed to ${newTheme}`, "success");
    });
  }
}

/**
 * Setup sync enabled checkbox listener
 */
function setupSyncEnabledListener() {
  document
    .getElementById("sync-enabled")
    .addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      const syncSettings = document.querySelector(".sync-settings");

      // Save preference immediately
      await dataService.savePreference("cloudSyncEnabled", enabled);

      // Update global state
      if (setSyncEnabled) setSyncEnabled(enabled);

      if (enabled) {
        // Show warning for demo host when enabling
        const isDemoHost = getIsDemoHost ? getIsDemoHost() : false;
        if (isDemoHost) {
          uiRenderer.showToast(
            "Cloud sync may not work unless your account has been registered for testing with Dropbox or Google Drive.",
            "warning",
            { duration: 5000 }
          );
        }

        syncSettings.classList.remove("disabled-section");
        const syncWifiOnly = document.getElementById("sync-wifi-only");
        const settingsEmailInput = document.getElementById("settings-email");
        const settingsPasswordInput = document.getElementById("settings-password");
        const signinBtn = document.getElementById("settings-signin-btn");
        const registerBtn = document.getElementById("settings-register-btn");
        
        if (syncWifiOnly) syncWifiOnly.disabled = false;
        if (settingsEmailInput) settingsEmailInput.disabled = false;
        if (settingsPasswordInput) settingsPasswordInput.disabled = false;
        if (signinBtn) signinBtn.disabled = false;
        if (registerBtn) registerBtn.disabled = false;

        // Initialize sync object immediately if needed
        const provider = "pocketbase";
        let cloudSync = getCloudSyncState ? getCloudSyncState() : null;

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
              uiRenderer,
              handleSyncCompleteCallback,
              handleSyncErrorCallback
            );
            await cloudSync.initialize(provider);

            // Update global state
            if (setCloudSyncState) setCloudSyncState(cloudSync);

            // Update status
            if (setSyncReadyCallback) setSyncReadyCallback(true);
            statusElement.textContent = cloudSync.isAuthenticated
              ? "Connected"
              : "Not connected";
            statusElement.className =
              "status-value " +
              (cloudSync.isAuthenticated ? "connected" : "disconnected");
            // Cloud sync is now initialized, authentication status is shown in the UI
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
        const syncWifiOnly = document.getElementById("sync-wifi-only");
        const settingsEmailInput = document.getElementById("settings-email");
        const settingsPasswordInput = document.getElementById("settings-password");
        const signinBtn = document.getElementById("settings-signin-btn");
        const registerBtn = document.getElementById("settings-register-btn");
        const disconnectBtn = document.getElementById("sync-disconnect-btn");
        
        if (syncWifiOnly) syncWifiOnly.disabled = true;
        if (settingsEmailInput) settingsEmailInput.disabled = true;
        if (settingsPasswordInput) settingsPasswordInput.disabled = true;
        if (signinBtn) signinBtn.disabled = true;
        if (registerBtn) registerBtn.disabled = true;
        if (disconnectBtn) disconnectBtn.disabled = true;

        // Disable sync if it was enabled
        let cloudSync = getCloudSyncState ? getCloudSyncState() : null;
        if (cloudSync) {
          if (setCloudSyncState) setCloudSyncState(null);
          if (setSyncReadyCallback) setSyncReadyCallback(false);
          logger.info("Cloud sync disabled completely");
        }
      }

      // Update UI elements
      if (updateSyncUIElementsCallback) updateSyncUIElementsCallback();
    });
}

// Provider selection removed - setupProviderChangeListener no longer needed

/**
 * Setup WiFi-only checkbox listener
 */
function setupWifiOnlyListener() {
  const syncWifiOnlyCheckbox = document.getElementById("sync-wifi-only");
  if (syncWifiOnlyCheckbox) {
    syncWifiOnlyCheckbox.addEventListener("change", async (e) => {
      const wifiOnly = e.target.checked;
      // Save preference immediately
      await dataService.savePreference("syncWifiOnly", wifiOnly);
      // Update cloud sync if active
      const cloudSync = getCloudSyncState ? getCloudSyncState() : null;
      if (cloudSync) {
        cloudSync.syncWifiOnly = wifiOnly;
      }
    });
  }
}

/**
 * Setup action button listeners
 */
function setupActionButtonListeners() {
  // Sign In button
  const signinBtn = document.getElementById("settings-signin-btn");
  if (signinBtn) {
    signinBtn.addEventListener("click", async () => {
      await handleSettingsAuth("signin");
    });
  }

  // Register button
  const registerBtn = document.getElementById("settings-register-btn");
  if (registerBtn) {
    registerBtn.addEventListener("click", async () => {
      await handleSettingsAuth("register");
    });
  }

  // Disconnect button
  const disconnectBtn = document.getElementById("sync-disconnect-btn");
  if (disconnectBtn) {
    disconnectBtn.addEventListener("click", async () => {
      await handleDisconnect();
    });
  }
}

/**
 * Close settings modal with pending sync handling
 */
function closeSettingsModal() {
  // Check if we have a pending initial sync
  const syncEnabled = getSyncEnabled ? getSyncEnabled() : false;
  const cloudSync = getCloudSyncState ? getCloudSyncState() : null;
  const syncReady = getSyncReady ? getSyncReady() : false;

  if (pendingInitialSync && syncEnabled && cloudSync) {
    logger.info("Executing pending initial sync after settings dialog close");
    pendingInitialSync = false;

    // For Google Drive, ensure sync ready is set since auth flow delays it
    if (
      cloudSync.provider?.providerName === "GoogleDriveProvider" &&
      setSyncReadyCallback
    ) {
      setSyncReadyCallback(true);
    }

    setTimeout(() => {
      if (syncDataCallback) {
        // Use centralized sync coordination for pending initial sync
        syncDataCallback(true, false); // isInitialSync=true, isManualSync=false
      }
    }, 1000); // Small delay after dialog closes
  }

  // Close the modal
  uiRenderer.closeModal();
}

/**
 * Set the pending initial sync flag
 * @param {boolean} value - Whether to set pending initial sync
 */
function setPendingInitialSync(value) {
  pendingInitialSync = value;
  logger.debug(`Set pendingInitialSync to: ${value}`);
}

/**
 * Handle PocketBase authentication in settings
 */
async function handleSettingsAuth(action) {
  const email = document.getElementById("settings-email")?.value?.trim();
  const password = document.getElementById("settings-password")?.value;
  
  if (!email || !password) {
    showSettingsAuthError("Please fill in all fields");
    return;
  }
  
  setSettingsAuthLoading(true);
  clearSettingsAuthError();
  
  try {
    // Get or initialize cloud sync
    let cloudSync = getCloudSyncState ? getCloudSyncState() : null;
    
    if (!cloudSync) {
      cloudSync = new CloudSyncManager(
        dataService,
        stateManager,
        uiRenderer,
        handleSyncCompleteCallback,
        handleSyncErrorCallback
      );
      await cloudSync.initialize("pocketbase");
      if (setCloudSyncState) setCloudSyncState(cloudSync);
    }
    
    let success = false;
    if (action === "signin") {
      success = await cloudSync.authenticatePocketbase(email, password);
    } else if (action === "register") {
      // For register, we need a username - use email prefix
      const username = email.split('@')[0];
      success = await cloudSync.registerPocketbase(username, email, password);
    }
    
    if (success) {
      // Update UI state
      if (setSyncReadyCallback) setSyncReadyCallback(true);
      
      // Refresh the settings dialog to show connected state
      showSettingsAuthSuccess(`Successfully ${action === 'signin' ? 'signed in' : 'registered'}!`);
      setTimeout(() => {
        showSettings(); // Refresh the entire dialog
      }, 1500);
    }
  } catch (error) {
    logger.error(`PocketBase ${action} error:`, error);
    let errorMessage = error.message || `${action} failed. Please try again.`;
    
    // Handle specific error types
    if (error?.data?.data) {
      const fieldErrors = Object.entries(error.data.data);
      if (fieldErrors.length > 0) {
        const [field, details] = fieldErrors[0];
        errorMessage = `${field.charAt(0).toUpperCase() + field.slice(1)}: ${details.message}`;
      }
    }
    
    showSettingsAuthError(errorMessage);
  } finally {
    setSettingsAuthLoading(false);
  }
}

/**
 * Handle disconnect from PocketBase
 */
async function handleDisconnect() {
  try {
    const cloudSync = getCloudSyncState ? getCloudSyncState() : null;
    
    if (cloudSync && cloudSync.provider && cloudSync.provider.logout) {
      await cloudSync.provider.logout();
    }
    
    // Clear cloud sync state
    if (setCloudSyncState) setCloudSyncState(null);
    if (setSyncReadyCallback) setSyncReadyCallback(false);
    
    // Show success message and refresh dialog
    uiRenderer.showToast("Successfully disconnected", "success");
    setTimeout(() => {
      showSettings(); // Refresh the entire dialog
    }, 1000);
  } catch (error) {
    logger.error("Disconnect error:", error);
    uiRenderer.showToast("Failed to disconnect: " + error.message, "error");
  }
}

/**
 * Show authentication error in settings
 */
function showSettingsAuthError(message) {
  const statusElement = document.getElementById("settings-auth-status");
  const messageElement = statusElement?.querySelector(".status-message");
  
  if (statusElement && messageElement) {
    messageElement.textContent = message;
    statusElement.className = "auth-status error";
    statusElement.classList.remove("hidden");
  }
}

/**
 * Show authentication success in settings
 */
function showSettingsAuthSuccess(message) {
  const statusElement = document.getElementById("settings-auth-status");
  const messageElement = statusElement?.querySelector(".status-message");
  
  if (statusElement && messageElement) {
    messageElement.textContent = message;
    statusElement.className = "auth-status success";
    statusElement.classList.remove("hidden");
  }
}

/**
 * Clear authentication error in settings
 */
function clearSettingsAuthError() {
  const statusElement = document.getElementById("settings-auth-status");
  if (statusElement) {
    statusElement.classList.add("hidden");
  }
}

/**
 * Set loading state for authentication buttons in settings
 */
function setSettingsAuthLoading(loading) {
  const signinBtn = document.getElementById("settings-signin-btn");
  const registerBtn = document.getElementById("settings-register-btn");
  
  [signinBtn, registerBtn].forEach(btn => {
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? "..." : (btn.id.includes("signin") ? "Sign In" : "Create Account");
    }
  });
}

// =============================================================================
// PUBLIC API
// =============================================================================

export default {
  initialize,
  handleSettings,
  showSettings,
  closeSettingsModal,
  setPendingInitialSync,
};
