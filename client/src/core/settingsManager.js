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
    if (setSyncEnabled) setSyncEnabled(freshSyncEnabled);

    // Get current sync provider
    let currentSyncProvider;
    const cloudSync = getCloudSyncState ? getCloudSyncState() : null;
    if (cloudSync && cloudSync.provider) {
      // If we have an active cloud sync, check what type it is
      currentSyncProvider =
        cloudSync.provider.providerName === "DropboxProvider"
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

    // Get user info if connected
    let userInfo = null;
    if (cloudSync?.isAuthenticated && cloudSync.provider?.getUserInfo) {
      try {
        userInfo = await cloudSync.provider.getUserInfo();
      } catch (error) {
        logger.debug("Failed to get user info:", error);
      }
    }

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
                <div class="provider-select-row">
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
                </div>
                
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
                    : ""
                }
              </div>
              
              <div class="settings-row sync-actions-row">
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

  // Add event listener for Enable sync checkbox
  setupSyncEnabledListener();

  // Add event listener for provider changes
  setupProviderChangeListener();

  // Add event listener for WiFi-only setting
  setupWifiOnlyListener();

  // Event listeners for action buttons
  setupActionButtonListeners();
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
        document.getElementById("sync-provider").disabled = false;
        document.getElementById("sync-wifi-only").disabled = false;
        document.getElementById("sync-reauth-btn").disabled = false;

        // Initialize sync object immediately if needed
        const provider = document.getElementById("sync-provider").value;
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

/**
 * Setup provider change listener
 */
function setupProviderChangeListener() {
  const syncProviderSelect = document.getElementById("sync-provider");
  if (syncProviderSelect) {
    syncProviderSelect.addEventListener("change", async (e) => {
      const newProvider = e.target.value;
      let cloudSync = getCloudSyncState ? getCloudSyncState() : null;
      const currentProvider = cloudSync
        ? cloudSync.provider.providerName === "DropboxProvider"
          ? "dropbox"
          : "gdrive"
        : "none";

      logger.info(
        `Provider changing from ${currentProvider} to ${newProvider}`
      );

      // Save preference immediately
      await dataService.savePreference("cloudSyncProvider", newProvider);

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

        // If we're enabled, initialize the new provider
        const syncEnabled = getSyncEnabled ? getSyncEnabled() : false;
        if (syncEnabled) {
          try {
            if (setSyncReadyCallback) setSyncReadyCallback(false);
            cloudSync = new CloudSyncManager(
              dataService,
              stateManager,
              uiRenderer,
              handleSyncCompleteCallback,
              handleSyncErrorCallback
            );
            await cloudSync.initialize(newProvider);
            if (setCloudSyncState) setCloudSyncState(cloudSync);
            if (setSyncReadyCallback) setSyncReadyCallback(true);
          } catch (error) {
            logger.error("Failed to initialize new provider:", error);
            uiRenderer.showToast(
              "Failed to initialize new provider: " + error.message,
              "error"
            );
          }
        }
      }
    });
  }
}

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
  // Sync Now button
  document
    .getElementById("sync-now-btn")
    .addEventListener("click", async () => {
      if (syncDataCallback) {
        try {
          // Show syncing status
          const syncNowBtn = document.getElementById("sync-now-btn");
          const originalText = syncNowBtn.textContent;
          syncNowBtn.textContent = "Syncing...";
          syncNowBtn.disabled = true;

          // Use centralized sync coordination for manual sync
          await syncDataCallback(false, true); // Not initial sync, but is manual sync

          // Update the last sync time display
          const cloudSync = getCloudSyncState ? getCloudSyncState() : null;
          if (cloudSync && cloudSync.lastSyncTimestamp) {
            const lastSyncElement = document.getElementById("sync-last-time");
            if (lastSyncElement) {
              lastSyncElement.textContent = new Date(
                cloudSync.lastSyncTimestamp
              ).toLocaleString();
            }
          }

          // Reset button
          syncNowBtn.textContent = originalText;
          syncNowBtn.disabled = false;
        } catch (error) {
          logger.error("Sync failed:", error);
          // Reset button on error
          const syncNowBtn = document.getElementById("sync-now-btn");
          syncNowBtn.textContent = "Sync Now";
          syncNowBtn.disabled = false;
        }
      }
    });

  // Connect/Re-authenticate button
  document
    .getElementById("sync-reauth-btn")
    .addEventListener("click", async () => {
      const provider = document.getElementById("sync-provider").value;
      let cloudSync = getCloudSyncState ? getCloudSyncState() : null;

      if (
        !cloudSync ||
        cloudSync.provider?.providerName !==
          (provider === "gdrive" ? "GoogleDriveProvider" : "DropboxProvider")
      ) {
        // Initialize with new provider
        cloudSync = new CloudSyncManager(
          dataService,
          stateManager,
          uiRenderer,
          handleSyncCompleteCallback,
          handleSyncErrorCallback
        );
        await cloudSync.initialize(provider);
        if (setCloudSyncState) setCloudSyncState(cloudSync);
      }

      try {
        // Create state parameter for settings OAuth flow
        const state = {
          wizardContext: "settingsAuth",
          source: "settingsDialog",
        };
        const stateParam = btoa(JSON.stringify(state));

        // Redirect to server OAuth with state parameter
        if (provider === "dropbox") {
          window.location.href = `/api/dropbox/auth?state=${encodeURIComponent(
            stateParam
          )}`;
        } else if (provider === "gdrive") {
          window.location.href = `/api/gdrive/auth?state=${encodeURIComponent(
            stateParam
          )}`;
        }

        // The page will reload after OAuth, so we don't need to handle the return here
      } catch (error) {
        uiRenderer.showToast(
          `Authentication failed: ${error.message}`,
          "error"
        );
      }
    });
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
