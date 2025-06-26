/*
 * MIND Diet Tracker PWA - AppManager
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

import logger from "./logger.js";

/**
 * AppManager - Central application state and coordination
 *
 * This class manages the application's global state and coordinates
 * between different modules (UI, data, sync, etc.).
 */
export default class AppManager {
  constructor() {
    this.cloudSync = null;
    this.syncEnabled = false;
    this.syncReady = false;
    this.lastSyncTime = 0;
    this.lastFocusChangeTime = 0;
    this.visibilityChangeTimeout = null;
    this.initialSyncInProgress = false;
    this.MIN_SYNC_INTERVAL = 1 * 60 * 1000; // 1 minute between auto-syncs

    // DOM Elements cache
    this.domElements = {
      // Menu elements
      mainMenu: null,
      aboutBtn: null,
      settingsBtn: null,
      exportBtn: null,
      importBtnTrigger: null,
      importFileInput: null,

      // Edit totals modal elements
      editCurrentWeekBtn: null,
      editHistoryWeekBtn: null,
      editTotalsModal: null,
      editTotalsTitle: null,
      editTotalsList: null,
      editTotalsItemTemplate: null,
      editTotalsCloseBtn: null,
      editTotalsCancelBtn: null,
      editTotalsSaveBtn: null,

      // Footer elements
      appVersionElement: null,
    };

    // Initialization state
    this.initialized = false;
  }

  // Initialize DOM element references
  initializeDOMElements() {
    this.domElements.mainMenu = document.getElementById("main-menu");
    this.domElements.aboutBtn = document.getElementById("about-btn");
    this.domElements.settingsBtn = document.getElementById("settings-btn");
    this.domElements.exportBtn = document.getElementById("export-btn");
    this.domElements.importBtnTrigger =
      document.getElementById("import-btn-trigger");
    this.domElements.importFileInput =
      document.getElementById("import-file-input");
    this.domElements.editCurrentWeekBtn = document.getElementById(
      "edit-current-week-btn"
    );
    this.domElements.editHistoryWeekBtn = document.getElementById(
      "edit-history-week-btn"
    );
    this.domElements.editTotalsModal =
      document.getElementById("edit-totals-modal");
    this.domElements.editTotalsTitle =
      document.getElementById("edit-totals-title");
    this.domElements.editTotalsList =
      document.getElementById("edit-totals-list");
    this.domElements.editTotalsItemTemplate = document.getElementById(
      "edit-totals-item-template"
    );
    this.domElements.editTotalsCloseBtn = document.getElementById(
      "edit-totals-close-btn"
    );
    this.domElements.editTotalsCancelBtn = document.getElementById(
      "edit-totals-cancel-btn"
    );
    this.domElements.editTotalsSaveBtn = document.getElementById(
      "edit-totals-save-btn"
    );
    this.domElements.appVersionElement = document.getElementById("app-version");
  }

  // Getters for controlled access
  getCloudSync() {
    return this.cloudSync;
  }
  getSyncEnabled() {
    return this.syncEnabled;
  }
  getSyncReady() {
    return this.syncReady;
  }
  getDomElements() {
    return this.domElements;
  }

  // Setters with validation
  setCloudSync(cloudSync) {
    this.cloudSync = cloudSync;
    this.updateSyncUIElements();
  }

  setSyncEnabled(enabled) {
    this.syncEnabled = enabled;
    this.updateSyncUIElements();
  }

  setSyncReady(ready) {
    this.syncReady = ready;
    this.updateSyncUIElements();
    logger.info("Sync readiness set to:", this.syncReady);
  }

  /**
   * Update the sync UI elements based on current state
   */
  updateSyncUIElements() {
    // Check if online
    const isOnline = navigator.onLine;

    // Check if we have a cloud sync manager
    const hasSyncManager = !!this.cloudSync;

    // Check authentication status (provider-specific)
    let isAuthenticated = false;
    let providerName = "none";

    if (hasSyncManager && this.cloudSync.provider) {
      // Get provider name for more detailed logging
      providerName = this.cloudSync.provider.providerName;

      // Check if the current provider is authenticated
      if (providerName === "DropboxProvider") {
        // For Dropbox, check if we have an access token
        isAuthenticated = !!this.cloudSync.provider.ACCESS_TOKEN;
      } else {
        // For Google Drive, use the internal flag
        isAuthenticated = this.cloudSync.isAuthenticated;
      }
    }

    // Get other sync state
    const isReady = this.syncReady;
    const syncInProgress = hasSyncManager && this.cloudSync.syncInProgress;

    // Condition for when sync should be enabled
    const syncButtonEnabled =
      isOnline &&
      hasSyncManager &&
      isAuthenticated &&
      !syncInProgress &&
      this.syncEnabled;

    logger.info("Updating sync UI elements with state:", {
      online: isOnline,
      cloudSyncExists: hasSyncManager,
      providerName,
      isAuthenticated,
      syncReady: isReady,
      syncInProgress,
      syncEnabled: this.syncEnabled,
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
        statusText = "Not authenticated";
      }

      syncStatusEl.textContent = statusText;
      syncStatusEl.className = `status-value ${
        isAuthenticated ? "connected" : "disconnected"
      }`;
    }
  }

  /**
   * Handle day selection in the tracker view
   * @param {string} newSelectedDateStr - The new selected date (YYYY-MM-DD)
   */
  handleTrackerDaySelect(newSelectedDateStr) {
    // This method will be called by the UI renderer when a day is selected
    // It should update the state manager with the new selected date
    logger.debug("AppManager: Day selection requested:", newSelectedDateStr);

    // Import stateManager here to avoid circular dependencies
    import("./stateManager.js")
      .then(({ default: stateManager }) => {
        stateManager.dispatch({
          type: stateManager.ACTION_TYPES.SET_SELECTED_TRACKER_DATE,
          payload: { date: newSelectedDateStr },
        });
      })
      .catch((error) => {
        logger.error("Error importing stateManager for day selection:", error);
      });
  }
}
