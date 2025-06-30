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
  constructor(dependencies = {}) {
    // Store dependencies
    this.stateManager = dependencies.stateManager;

    this.cloudSync = null;
    this.syncEnabled = false;
    this.syncReady = false;
    this.lastSyncTime = 0;
    this.lastFocusChangeTime = 0;
    this.visibilityChangeTimeout = null;
    this.initialSyncInProgress = false;
    this.MIN_SYNC_INTERVAL = 1 * 60 * 1000; // 1 minute between auto-syncs

    // Centralized sync coordination
    this.syncState = {
      lastSyncTime: 0,
      lastSyncCompletionTime: 0,
      syncInProgress: false,
      pendingSyncRequests: [],
      syncCooldownUntil: 0,
      syncDebounceTimeout: null,
      syncThrottleTimeout: null,
    };

    // Sync timing constants
    this.SYNC_COOLDOWN_PERIOD = 30000; // 30 seconds after sync completion
    this.SYNC_DEBOUNCE_WINDOW = 5000; // 5 seconds for rapid requests
    this.SYNC_THROTTLE_PERIOD = 60000; // 1 minute minimum between auto-syncs

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

    if (this.stateManager) {
      this.stateManager.dispatch({
        type: this.stateManager.ACTION_TYPES.SET_SELECTED_TRACKER_DATE,
        payload: { date: newSelectedDateStr },
      });
    } else {
      logger.error("StateManager not available for day selection");
    }
  }

  /**
   * Centralized sync coordination - prevents overlapping syncs from different triggers
   * @param {string} trigger - The trigger source ('initial', 'timer', 'visibility', 'manual', 'reload')
   * @param {Object} options - Sync options
   * @returns {Promise<boolean>} Whether sync was executed
   */
  async requestSync(trigger, options = {}) {
    const now = Date.now();
    const {
      skipCooldown = false,
      skipDebounce = false,
      skipThrottle = false,
      priority = "normal",
    } = options;

    logger.debug(`Sync request from ${trigger}`, {
      skipCooldown,
      skipDebounce,
      skipThrottle,
      priority,
      currentTime: now,
      cooldownUntil: this.syncState.syncCooldownUntil,
      lastSyncTime: this.syncState.lastSyncTime,
      syncInProgress: this.syncState.syncInProgress,
    });

    // Check if sync is enabled and ready
    if (
      !this.getSyncEnabled() ||
      !this.getCloudSync() ||
      !this.getSyncReady()
    ) {
      logger.debug(`Sync request blocked: not ready`, {
        syncEnabled: this.getSyncEnabled(),
        hasCloudSync: !!this.getCloudSync(),
        syncReady: this.getSyncReady(),
      });
      return false;
    }

    // Check cooldown period (unless skipped for high priority operations)
    if (!skipCooldown && now < this.syncState.syncCooldownUntil) {
      logger.debug(
        `Sync request blocked by cooldown until ${new Date(
          this.syncState.syncCooldownUntil
        )}`
      );
      return false;
    }

    // Check if already in progress
    if (this.syncState.syncInProgress) {
      logger.debug("Sync already in progress, queuing request");
      this.syncState.pendingSyncRequests.push({
        trigger,
        priority,
        timestamp: now,
        options,
      });
      return false;
    }

    // Apply debouncing for rapid successive requests (unless skipped)
    if (!skipDebounce && this.syncState.syncDebounceTimeout) {
      logger.debug("Sync request debounced");
      clearTimeout(this.syncState.syncDebounceTimeout);
      this.syncState.syncDebounceTimeout = setTimeout(() => {
        this.executeSync(trigger, options);
      }, this.SYNC_DEBOUNCE_WINDOW);
      return false;
    }

    // Apply throttling for auto-sync operations (unless skipped)
    if (!skipThrottle && trigger !== "manual" && trigger !== "initial") {
      const timeSinceLastSync = now - this.syncState.lastSyncTime;
      if (timeSinceLastSync < this.SYNC_THROTTLE_PERIOD) {
        logger.debug(
          `Sync request throttled: ${timeSinceLastSync}ms since last sync`
        );
        return false;
      }
    }

    // Execute the sync
    return this.executeSync(trigger, options);
  }

  /**
   * Execute sync with trigger-specific logic
   * @param {string} trigger - The trigger source
   * @param {Object} options - Sync options
   * @returns {Promise<boolean>} Whether sync was successful
   */
  async executeSync(trigger, options = {}) {
    const now = Date.now();

    // Mark sync as in progress
    this.syncState.syncInProgress = true;
    this.syncState.lastSyncTime = now;

    logger.info(`Executing sync triggered by ${trigger}`, options);

    try {
      // Trigger-specific sync logic
      let syncResult;

      switch (trigger) {
        case "initial":
          // Initial sync: Full sync with no cooldown
          syncResult = await this.performInitialSync();
          break;

        case "timer":
          // Timer sync: Check for changes first, then sync if needed
          syncResult = await this.performTimerSync();
          break;

        case "visibility":
          // Visibility sync: Quick check for remote changes
          syncResult = await this.performVisibilitySync();
          break;

        case "manual":
          // Manual sync: Full sync with user feedback
          syncResult = await this.performManualSync();
          break;

        case "reload":
          // Reload sync: Check for cross-device changes
          syncResult = await this.performReloadSync();
          break;

        default:
          // Default: Standard sync
          syncResult = await this.performStandardSync();
      }

      // Mark sync as completed
      this.syncState.lastSyncCompletionTime = now;
      this.syncState.syncCooldownUntil = now + this.SYNC_COOLDOWN_PERIOD;

      logger.info(
        `Sync completed successfully for trigger ${trigger}`,
        syncResult
      );

      // Process any pending requests
      this.processPendingSyncRequests();

      return true;
    } catch (error) {
      logger.error(`Sync failed for trigger ${trigger}:`, error);

      // Mark sync as completed (even on error) to allow retries
      this.syncState.lastSyncCompletionTime = now;
      this.syncState.syncCooldownUntil = now + this.SYNC_COOLDOWN_PERIOD;

      // Process any pending requests
      this.processPendingSyncRequests();

      return false;
    } finally {
      this.syncState.syncInProgress = false;
    }
  }

  /**
   * Process any pending sync requests after current sync completes
   */
  processPendingSyncRequests() {
    if (this.syncState.pendingSyncRequests.length === 0) {
      return;
    }

    // Sort by priority and timestamp
    this.syncState.pendingSyncRequests.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      const aPriority = priorityOrder[a.priority] || 2;
      const bPriority = priorityOrder[b.priority] || 2;

      if (aPriority !== bPriority) {
        return bPriority - aPriority; // Higher priority first
      }

      return a.timestamp - b.timestamp; // Earlier timestamp first
    });

    // Take the highest priority request
    const nextRequest = this.syncState.pendingSyncRequests.shift();
    logger.debug(`Processing pending sync request: ${nextRequest.trigger}`);

    // Clear the queue (we only process one at a time)
    this.syncState.pendingSyncRequests = [];

    // Execute the request after a short delay
    setTimeout(() => {
      this.requestSync(nextRequest.trigger, nextRequest.options);
    }, 1000);
  }

  /**
   * Trigger-specific sync implementations
   */
  async performInitialSync() {
    logger.info("Performing initial sync");
    // Initial sync should be full sync with no restrictions
    return this.cloudSync.sync(true); // silent = true
  }

  async performTimerSync() {
    logger.info("Performing timer-based sync");
    // Timer sync should check if sync is needed first
    const needsSync = await this.cloudSync.checkIfSyncNeeded();
    if (needsSync) {
      return this.cloudSync.sync(true); // silent = true
    }
    logger.debug("Timer sync: no changes detected, skipping");
    return false;
  }

  async performVisibilitySync() {
    logger.info("Performing visibility-based sync");
    // Visibility sync should be a quick check for remote changes
    return this.cloudSync.sync(true); // silent = true
  }

  async performManualSync() {
    logger.info("Performing manual sync");
    // Manual sync should be full sync with user feedback
    return this.cloudSync.sync(false); // silent = false
  }

  async performReloadSync() {
    logger.info("Performing reload sync");
    // Reload sync should check for cross-device changes
    return this.cloudSync.sync(true); // silent = true
  }

  async performStandardSync() {
    logger.info("Performing standard sync");
    // Default sync behavior
    return this.cloudSync.sync(true); // silent = true
  }

  /**
   * Clear any pending sync operations (useful for cleanup)
   */
  clearPendingSyncs() {
    if (this.syncState.syncDebounceTimeout) {
      clearTimeout(this.syncState.syncDebounceTimeout);
      this.syncState.syncDebounceTimeout = null;
    }
    if (this.syncState.syncThrottleTimeout) {
      clearTimeout(this.syncState.syncThrottleTimeout);
      this.syncState.syncThrottleTimeout = null;
    }
    this.syncState.pendingSyncRequests = [];
  }
}
