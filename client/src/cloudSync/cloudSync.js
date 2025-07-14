/**
 * MIND Diet Tracker PWA
 * Copyright (c) 2024
 *
 * Cloud Sync Manager
 * Handles synchronization between local data and PocketBase
 */

import logger from "../core/logger.js";
import PocketbaseProvider from "../cloudProviders/pocketbaseProvider.js";
import { AutoSyncEngine } from "./autoSyncEngine.js";

/**
 * Manages cloud synchronization for the application
 */
export class CloudSyncManager {
  constructor(
    dataService,
    stateManager,
    uiRenderer,
    onSyncComplete,
    onSyncError
  ) {
    this.dataService = dataService;
    this.stateManager = stateManager;
    this.uiRenderer = uiRenderer;
    this.onSyncComplete = onSyncComplete || (() => {});
    this.onSyncError = onSyncError || logger.error;
    this.provider = new PocketbaseProvider();
    this.isAuthenticated = false;
    this.autoSyncEngine = null;
  }

  /**
   * Initialize cloud sync
   * @returns {Promise<boolean>}
   */
  async initialize() {
    // Initialize the provider and check if it was successful
    const initResult = await this.provider.initialize();
    if (!initResult) {
      logger.warn(
        "PocketBase initialization failed, likely due to missing config"
      );
      return false;
    }

    // Check authentication status
    this.isAuthenticated = await this.provider.checkAuth();

    if (this.isAuthenticated) {
      logger.info("PocketBase authentication valid from stored session");
      this.setupAutoSyncEngine();
    } else {
      logger.info("PocketBase authentication required");
    }

    return true;
  }

  /**
   * Enable auto-sync - Handled by AutoSyncEngine for PocketBase
   * @param {number} intervalMinutes - Ignored for PocketBase
   */
  enableAutoSync(intervalMinutes = 15) {
    logger.info(
      "Real-time sync active via AutoSyncEngine (no periodic sync needed)"
    );
    // AutoSyncEngine handles all sync operations
  }
  /**
   * Disable auto-sync
   */
  disableAutoSync() {
    logger.info("Real-time sync cannot be disabled for PocketBase");
    // AutoSyncEngine handles all sync operations
  }

  /**
   * Check if auto-sync is enabled
   * @returns {boolean}
   */
  isAutoSyncEnabled() {
    return this.autoSyncEngine !== null;
  }

  /**
   * Get last sync time
   * @returns {Date|null}
   */
  getLastSyncTime() {
    // AutoSyncEngine handles sync timing
    return null;
  }

  /**
   * Forwards a sync request to the auto-sync engine.
   * This is the new primary way to explicitly trigger a sync.
   * @param {string} trigger - A descriptive name for what initiated the sync.
   */
  async requestSync(trigger) {
    if (this.autoSyncEngine) {
      logger.info(
        `CloudSyncManager forwarding sync request triggered by: ${trigger}`
      );
      await this.autoSyncEngine.performSync(trigger);
      return true;
    }
    logger.warn(
      `Sync request for trigger '${trigger}' ignored: no auto-sync engine available.`
    );
    return false;
  }

  /**
   * Check if sync is needed - AutoSyncEngine handles this
   * @returns {Promise<boolean>}
   */
  async checkIfSyncNeeded() {
    // AutoSyncEngine handles sync need detection
    return false;
  }

  /**
   * Get sync status
   * @returns {Object} Sync status information
   */
  getSyncStatus() {
    return {
      lastSyncTime: null, // AutoSyncEngine handles timing
      autoSyncEnabled: this.autoSyncEngine !== null,
      syncInProgress: false, // AutoSyncEngine handles progress
    };
  }

  /**
   * Authenticate with PocketBase
   */
  async authenticatePocketbase(email, password) {
    try {
      const success = await this.provider.authenticate(email, password);
      if (success) {
        this.isAuthenticated = true;
        this.setupAutoSyncEngine();
        return true;
      }
      return false;
    } catch (error) {
      // Re-throw the error to be caught by the UI layer (the modal)
      throw error;
    }
  }

  async determineWhatToSync() {
    // AutoSyncEngine handles sync determination
    logger.info("Sync determination delegated to AutoSyncEngine");
    return { syncCurrent: false, syncHistory: false };
  }

  /**
   * Clear a specific dirty flag - No longer needed with real-time sync
   * @param {string} flagName - Name of the flag to clear
   */
  async clearDirtyFlag(flagName) {
    // Real-time sync eliminates need for dirty flags
    logger.debug(
      `Dirty flag clearing not needed with PocketBase real-time sync: ${flagName}`
    );
  }

  /**
   * Clear date reset flags - Simplified for real-time sync
   */
  async clearDateResetFlags() {
    // Real-time sync handles this automatically
    logger.debug("Date reset flag clearing handled by AutoSyncEngine");
  }

  /**
   * Schedule an archive merge - Not needed with real-time sync
   * @param {string} weekStartDate - The start date of the week to merge with
   * @param {Object} remoteWeeklyCounts - The remote weekly counts to merge
   */
  scheduleArchiveMerge(weekStartDate, remoteWeeklyCounts) {
    // Real-time sync eliminates need for manual archive merging
    logger.debug("Archive merge not needed with PocketBase real-time sync");
  }

  /**
   * Execute a pending archive merge operation - Not needed with real-time sync
   * @returns {Promise<boolean>} Success status
   */
  async executePendingArchiveMerge() {
    // Real-time sync eliminates need for manual archive merging
    logger.debug(
      "Archive merge execution not needed with PocketBase real-time sync"
    );
    return true;
  }

  /**
   * Get most recent date - Simplified for PocketBase
   */
  getMostRecentDate(date1, date2) {
    try {
      const d1 = new Date(date1);
      const d2 = new Date(date2);
      return d1 > d2 ? date1 : date2;
    } catch (e) {
      return date1;
    }
  }

  /**
   * Validate data - Simplified for PocketBase
   */
  validateData(data, type = "current") {
    if (!data || typeof data !== "object") {
      logger.error(`Invalid ${type} data:`, data);
      return false;
    }
    // PocketBase schema validation handles the rest
    return true;
  }

  /**
   * Store sync state - Not needed with real-time sync
   */
  storeLastSyncedState() {
    // AutoSyncEngine handles state persistence
    logger.debug("Sync state storage handled by AutoSyncEngine");
  }

  /**
   * Load sync state - Not needed with real-time sync
   */
  loadSyncState() {
    // AutoSyncEngine handles state loading
    logger.debug("Sync state loading handled by AutoSyncEngine");
  }

  /**
   * Debug sync state - Simplified for PocketBase
   */
  async debugSyncState() {
    try {
      const currentState = this.dataService.loadState();
      logger.info("=== PocketBase Sync Debug Info ===");
      logger.info("Current State:", {
        currentDayDate: currentState.currentDayDate,
        currentWeekStartDate: currentState.currentWeekStartDate,
        dailyCountsSize: Object.keys(currentState.dailyCounts || {}).length,
        weeklyTotalsSize: Object.keys(currentState.weeklyTotals || {}).length,
        autoSyncEngineActive: !!this.autoSyncEngine,
      });

      return {
        hasData: Object.keys(currentState.weeklyTotals || {}).length > 0,
        hasMetadata: !!currentState.metadata,
        autoSyncActive: !!this.autoSyncEngine,
      };
    } catch (error) {
      logger.error("Error in sync debug:", error);
      return { error: error.message };
    }
  }

  /**
   * Setup AutoSyncEngine for PocketBase
   */
  setupAutoSyncEngine() {
    this.autoSyncEngine = new AutoSyncEngine(
      this.stateManager,
      this.dataService,
      this.provider,
      this.uiRenderer
    );

    logger.info("AutoSyncEngine initialized for PocketBase");
  }

  /**
   * Register new PocketBase user
   */
  async registerPocketbase(username, email, password) {
    try {
      const success = await this.provider.register(username, email, password);
      if (success) {
        this.isAuthenticated = true;
        this.setupAutoSyncEngine();
        return true;
      }
      return false;
    } catch (error) {
      throw error;
    }
  }
}

export default CloudSyncManager;
