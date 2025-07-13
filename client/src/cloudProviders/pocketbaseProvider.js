/**
 * MIND Diet Tracker PWA
 * Copyright (c) 2024
 * PocketBase Provider - Integrates with existing cloud provider system
 */

import PocketBase from "pocketbase";
import logger from "../core/logger.js";
import dataService from "../core/dataService.js";
export default class PocketbaseProvider {
  constructor() {
    this.pb = null;
    this.isInitialized = false;
    this.isAuthenticated = false;
    this.providerName = "PocketbaseProvider";
    this.subscriptions = new Map();
    this.syncQueue = [];
    this.isOnline = navigator.onLine;
    this.deviceId = this.getOrCreateDeviceId();
    this.changeCallbacks = new Set();

    this.setupNetworkListeners();
    logger.info("PocketBase provider created");
  }

  /**
   * Helper method to convert local date string to PocketBase date format
   * PocketBase expects: Y-m-d H:i:s.uZ format (e.g., "2025-07-06 00:00:00.000Z")
   */
  convertLocalDateToPocketBase(dateStr) {
    if (!dateStr) return "";

    // If already in PocketBase format, return as-is
    if (dateStr.includes(" ") && dateStr.endsWith("Z")) {
      return dateStr;
    }

    // If in standard ISO format, convert to PocketBase format
    if (dateStr.includes("T")) {
      return dateStr.replace("T", " ");
    }

    // Convert YYYY-MM-DD to PocketBase format at UTC midnight
    const dateObj = new Date(
      Date.UTC(
        parseInt(dateStr.substring(0, 4)), // Year
        parseInt(dateStr.substring(5, 7)) - 1, // Month (0-based)
        parseInt(dateStr.substring(8, 10)) // Day
      )
    );

    // Format as PocketBase expects: Y-m-d H:i:s.uZ
    const year = dateObj.getUTCFullYear();
    const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getUTCDate()).padStart(2, "0");
    const hours = String(dateObj.getUTCHours()).padStart(2, "0");
    const minutes = String(dateObj.getUTCMinutes()).padStart(2, "0");
    const seconds = String(dateObj.getUTCSeconds()).padStart(2, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.000Z`;
  }

  /**
   * Helper method to convert PocketBase date format back to local YYYY-MM-DD format
   */
  convertPocketBaseDateToLocal(pocketbaseDate) {
    if (!pocketbaseDate) return "";

    // If already in YYYY-MM-DD format, return as-is
    if (!pocketbaseDate.includes(" ") && !pocketbaseDate.includes("T")) {
      return pocketbaseDate;
    }

    // Extract just the date part (YYYY-MM-DD) from PocketBase format
    return pocketbaseDate.split(" ")[0];
  }

  /**
   * [INTERNAL] Converts a local weekly data object to the PocketBase schema format.
   * This is the single source of truth for sending data TO the server.
   * @param {object} localWeeklyData - The local week object.
   * @returns {object} A data payload ready for the PocketBase API.
   */
  _toRemoteWeeklyData(localWeeklyData) {
    const userId = this.pb.authStore.model.id;
    const weekStartDate = localWeeklyData.weekStartDate;
    const weekEndDate = this.calculateWeekEndDate(weekStartDate);

    return {
      user: userId,
      week_start_date: this.convertLocalDateToPocketBase(weekStartDate),
      week_end_date: this.convertLocalDateToPocketBase(weekEndDate),
      daily_breakdown: localWeeklyData.dailyBreakdown || {},
      totals: localWeeklyData.totals || {},
      metadata: {
        ...(localWeeklyData.metadata || {}),
        lastSyncTimestamp: dataService.getCurrentTimestamp(),
        deviceId: this.deviceId,
      },
    };
  }

  /**
   * [INTERNAL] Converts a remote record from PocketBase to the local app format.
   * This is the single source of truth for processing data FROM the server.
   * @param {object} remoteRecord - The record object from PocketBase.
   * @returns {object} A week object in the local application's format.
   */
  _fromRemoteWeeklyData(remoteRecord) {
    // --- START FIX ---
    // The goal of this function is to create an object that looks EXACTLY
    // like the application's internal state for a given week.
    const localFormat = {
      weekStartDate: this.convertPocketBaseDateToLocal(
        remoteRecord.week_start_date
      ),
      weekEndDate: this.convertPocketBaseDateToLocal(
        remoteRecord.week_end_date
      ),

      // CRITICAL: Map the incoming 'daily_breakdown' to the app's 'dailyCounts' property.
      dailyCounts: remoteRecord.daily_breakdown || {},

      // CRITICAL: Map the incoming 'totals' to the app's 'weeklyCounts' property.
      weeklyCounts: remoteRecord.totals || {},

      metadata: remoteRecord.metadata || {},
    };
    // --- END FIX ---

    // Ensure updatedAt is a timestamp for conflict resolution
    if (remoteRecord.updated) {
      localFormat.metadata.updatedAt = new Date(remoteRecord.updated).getTime();
    }
    return localFormat;
  }

  /**
   * Initialize PocketBase connection - matches interface of other providers
   * @returns {boolean} Success status
   */
  async initialize() {
    try {
      const pocketbaseUrl = import.meta.env.VITE_POCKETBASE_URL;
      if (!pocketbaseUrl) {
        logger.warn("PocketBase URL not configured in environment");
        return false;
      }

      this.pb = new PocketBase(pocketbaseUrl);

      // Enable auto-cancellation for duplicate requests
      this.pb.autoCancellation(false);

      this.isInitialized = true;
      logger.info("PocketBase provider initialized:", pocketbaseUrl);

      // Check if we have existing authentication
      await this.checkAuth();

      return true;
    } catch (error) {
      logger.error("Failed to initialize PocketBase:", error);
      return false;
    }
  }

  /**
   * Check authentication status - matches interface of other providers
   * @returns {boolean} Authentication status
   */
  async checkAuth() {
    if (!this.isInitialized || !this.pb) return false;

    this.isAuthenticated = this.pb.authStore.isValid;

    if (this.isAuthenticated) {
      logger.info("PocketBase authentication valid");
      await this.setupRealtimeSubscriptions();
    } else {
      logger.info("PocketBase authentication invalid");
    }

    return this.isAuthenticated;
  }

  /**
   * Authenticate user with email/password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {boolean} Authentication success
   */
  async authenticate(email, password) {
    if (!this.isInitialized || !this.pb) {
      throw new Error("PocketBase not initialized");
    }

    try {
      const authData = await this.pb
        .collection("users")
        .authWithPassword(email, password);
      this.isAuthenticated = true;

      logger.info(
        "PocketBase authentication successful:",
        authData.record.email
      );

      // Setup real-time subscriptions after authentication
      await this.setupRealtimeSubscriptions();

      return true;
    } catch (error) {
      logger.error("PocketBase authentication failed:", error);
      this.isAuthenticated = false;
      // Re-throw the specific error from PocketBase.
      // This will contain useful information like "Failed to authenticate."
      throw error;
    }
  }

  /**
   * Register new user
   * @param {string} username - Username
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {boolean} Registration success
   */
  async register(username, email, password) {
    if (!this.isInitialized || !this.pb) {
      throw new Error("PocketBase not initialized");
    }

    try {
      const userData = {
        email,
        password,
        passwordConfirm: password,
        username,
        preferences: {
          weekStartDay: "sunday",
          initialSetupCompleted: false,
        },
      };

      const record = await this.pb.collection("users").create(userData);
      logger.info("PocketBase user registration successful:", record.email);
      return await this.authenticate(email, password);
    } catch (error) {
      logger.error("PocketBase registration failed:", error);
      // Re-throw the specific error.
      throw error;
    }
  }

  /**
   * Get user info - matches interface of other providers
   * @returns {Object} User information
   */
  getUserInfo() {
    if (!this.isAuthenticated || !this.pb.authStore.model) {
      return null;
    }

    const user = this.pb.authStore.model;
    return {
      id: user.id,
      name: user.username || user.email,
      email: user.email,
      provider: "PocketBase",
    };
  }

  /**
   * Sync weekly data - works for current week OR historical weeks
   * @param {Object} weekData Week data to sync
   * @returns {Object} Sync result
   */
  async syncWeeklyData(weekData) {
    if (!this.isAuthenticated) {
      // ... (error handling is fine)
    }

    try {
      // 1. Convert local data to the remote format using our new single source of truth.
      const syncData = this._toRemoteWeeklyData(weekData);

      console.log(
        "DEBUG: Final data packet being sent to PocketBase:",
        JSON.stringify(syncData, null, 2)
      );

      // 2. Check for existing record.
      const existingRecords = await this.pb
        .collection("weekly_data")
        .getList(1, 1, {
          filter: `user = "${syncData.user}" && week_start_date = '${syncData.week_start_date}'`,
        });

      // 3. Create or Update.
      if (existingRecords.items.length > 0) {
        await this.pb
          .collection("weekly_data")
          .update(existingRecords.items[0].id, syncData);
        logger.info(
          "Updated weekly data in PocketBase:",
          weekData.weekStartDate
        );
      } else {
        await this.pb.collection("weekly_data").create(syncData);
        logger.info(
          "Created new weekly data in PocketBase:",
          weekData.weekStartDate
        );
      }

      return { success: true };
    } catch (error) {
      logger.error("Failed to sync weekly data to PocketBase:", error);
      if (!this.isOnline) {
        this.addToSyncQueue("weekly_data", weekData);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Get remote current week data
   */
  async getRemoteCurrentWeek(userId, weekStartDate) {
    try {
      logger.debug(
        "getRemoteCurrentWeek: Input userId:",
        userId,
        "weekStartDate:",
        weekStartDate
      );

      // Use the same conversion method for consistency
      const weekStartDatePB = this.convertLocalDateToPocketBase(weekStartDate);

      // Use explicit user filter with properly quoted user ID
      const filter = `user = "${userId}" && week_start_date = '${weekStartDatePB}'`;

      logger.debug("PocketBase getRemoteCurrentWeek - Query filter:", filter);
      logger.debug(
        "PocketBase getRemoteCurrentWeek - userId type:",
        typeof userId,
        "value:",
        userId
      );
      logger.debug(
        "PocketBase getRemoteCurrentWeek - weekStartDatePB type:",
        typeof weekStartDatePB,
        "value:",
        weekStartDatePB
      );

      const queryOptions = {
        filter: filter,
      };
      logger.debug(
        "PocketBase getRemoteCurrentWeek - Query Options:",
        JSON.stringify(queryOptions)
      );

      const records = await this.pb
        .collection("weekly_data")
        .getList(1, 1, queryOptions);

      logger.debug(
        "PocketBase getRemoteCurrentWeek - Raw query result:",
        records
      );
      logger.debug(
        "PocketBase getRemoteCurrentWeek - Found records:",
        records.items.length
      );

      if (records.items.length > 0) {
        logger.debug(
          "PocketBase getRemoteCurrentWeek - First record:",
          records.items[0]
        );
      }

      return records.items.length > 0 ? records.items[0] : null;
    } catch (error) {
      logger.error("Failed to get remote current week:", error);
      logger.error("PocketBase query error details:", {
        message: error.message,
        status: error.status,
        data: error.data,
        filter: `week_start_date = '${weekStartDatePB}'`,
      });
      return null;
    }
  }

  /**
   * Get all weekly data for initial sync
   * @returns {Array} All weekly data records for current user
   */
  async getAllWeeklyData() {
    if (!this.isAuthenticated) {
      throw new Error("Not authenticated");
    }
    try {
      const userId = this.pb.authStore.model.id;
      const records = await this.pb.collection("weekly_data").getFullList({
        filter: `user = "${userId}"`,
        sort: "-week_start_date",
      });
      logger.info(
        `Retrieved ${records.length} weekly data records for bulk sync`
      );

      // Use the new, correct conversion method.
      return records.map((record) => this._fromRemoteWeeklyData(record));
    } catch (error) {
      logger.error("Failed to get all weekly data:", error);
      throw error;
    }
  }

  /**
   * Setup real-time subscriptions for automatic sync
   */
  async setupRealtimeSubscriptions() {
    if (!this.isAuthenticated || !this.pb) return;

    const userId = this.pb.authStore.model.id;

    try {
      // Single subscription for all weekly data changes
      await this.pb.collection("weekly_data").subscribe(
        "*",
        (e) => {
          // Only process changes from other devices
          if (e.record.metadata?.deviceId !== this.deviceId) {
            logger.info("Received weekly data change from another device");
            this.notifyChangeCallbacks("weekly_data", e);
          } else {
            logger.debug("Ignoring weekly data change from same device");
          }
        },
        {
          filter: `user = '${userId}'`,
        }
      );

      logger.info(
        "PocketBase real-time subscription established for weekly_data"
      );
    } catch (error) {
      logger.error("Failed to setup PocketBase subscription:", error);
    }
  }

  /**
   * Register callback for remote changes
   */
  onRemoteChange(callback) {
    this.changeCallbacks.add(callback);
  }

  /**
   * Subscribe to remote changes - interface expected by AutoSyncEngine
   * @param {Function} callback Callback function for changes
   */
  subscribeToChanges(callback) {
    this.onRemoteChange(callback);
  }

  /**
   * Notify change callbacks
   */
  notifyChangeCallbacks(dataType, changeEvent) {
    this.changeCallbacks.forEach((callback) => {
      try {
        callback(dataType, changeEvent);
      } catch (error) {
        logger.error("Error in change callback:", error);
      }
    });
  }

  /**
   * Handle offline sync queue
   */
  addToSyncQueue(type, data) {
    this.syncQueue.push({
      type,
      data,
      timestamp: dataService.getCurrentTimestamp(),
      retries: 0,
    });
    logger.info(`Added ${type} to sync queue`);
  }

  async processSyncQueue() {
    if (!this.isOnline || this.syncQueue.length === 0) return;

    logger.info(`Processing sync queue: ${this.syncQueue.length} items`);

    const queue = [...this.syncQueue];
    this.syncQueue = [];

    for (const item of queue) {
      try {
        let result;
        if (item.type === "current_week") {
          result = await this.syncCurrentWeek(item.data);
        } else if (item.type === "weekly_data") {
          result = await this.syncWeeklyHistory(item.data);
        }

        if (!result?.success && item.retries < 3) {
          item.retries++;
          this.syncQueue.push(item);
        }
      } catch (error) {
        logger.error("Sync queue processing error:", error);
        if (item.retries < 3) {
          item.retries++;
          this.syncQueue.push(item);
        }
      }
    }
  }

  setupNetworkListeners() {
    window.addEventListener("online", () => {
      this.isOnline = true;
      logger.info("Network connection restored");
      this.processSyncQueue();
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      logger.info("Network connection lost");
    });
  }

  getOrCreateDeviceId() {
    let deviceId = localStorage.getItem("pocketbase_device_id");
    if (!deviceId) {
      deviceId =
        "pb_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now();
      localStorage.setItem("pocketbase_device_id", deviceId);
    }
    return deviceId;
  }

  /**
   * Disconnect and cleanup - matches interface of other providers
   */
  async disconnect() {
    try {
      if (this.pb) {
        // Unsubscribe from all collections
        this.pb.collection("weekly_data").unsubscribe();

        // Clear auth store
        this.pb.authStore.clear();
      }

      this.isAuthenticated = false;
      this.changeCallbacks.clear();
      this.subscriptions.clear();

      logger.info("PocketBase provider disconnected");
    } catch (error) {
      logger.error("Error disconnecting PocketBase provider:", error);
    }
  }

  /**
   * Get provider info (for compatibility with existing system)
   */
  getProviderInfo() {
    return {
      name: "PocketBase",
      id: "pocketbase",
      authMethod: "email_password",
      realTime: true,
      offlineQueue: true,
    };
  }

  /**
   * Check if sync data has changed compared to existing record
   * @param {Object} existingRecord - The existing PocketBase record
   * @param {Object} syncData - The new data to sync
   * @returns {boolean} True if data has changed
   */
  hasDataChanged(existingRecord, syncData) {
    try {
      // Compare key fields that matter for sync detection
      const fieldsToCompare = [
        "current_day_date",
        "selected_tracker_date",
        "daily_counts",
        "targets",
      ];

      for (const field of fieldsToCompare) {
        const existingValue = existingRecord[field];
        const newValue = syncData[field];

        // Deep comparison for objects like daily_counts and targets
        if (typeof existingValue === "object" && typeof newValue === "object") {
          if (JSON.stringify(existingValue) !== JSON.stringify(newValue)) {
            logger.debug(`Data changed in field: ${field}`);
            return true;
          }
        } else {
          // For date fields, normalize to local format before comparison
          let normalizedExisting = existingValue;
          let normalizedNew = newValue;

          if (
            field === "current_day_date" ||
            field === "selected_tracker_date"
          ) {
            // Convert both to YYYY-MM-DD format for comparison
            normalizedExisting =
              this.convertPocketBaseDateToLocal(existingValue);
            normalizedNew = this.convertPocketBaseDateToLocal(newValue);
          }

          if (normalizedExisting !== normalizedNew) {
            logger.debug(
              `Data changed in field: ${field} (${normalizedExisting} -> ${normalizedNew})`
            );
            return true;
          }
        }
      }

      // No changes detected
      return false;
    } catch (error) {
      logger.error("Error comparing data changes:", error);
      // If comparison fails, err on the side of caution and sync
      return true;
    }
  }

  /**
   * Calculate weekly totals from daily counts
   * @param {Object} dailyCounts - Daily counts object with date keys
   * @param {string} weekStartDate - Week start date (YYYY-MM-DD)
   * @returns {Object} Weekly totals for each food group
   */
  calculateWeeklyTotals(dailyCounts = {}, weekStartDate) {
    const weeklyTotals = {};

    if (!weekStartDate || !dailyCounts) {
      return weeklyTotals;
    }

    try {
      // Get the 7 days of the week starting from weekStartDate
      const weekStart = new Date(weekStartDate);
      const weekDates = [];

      for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD format
        weekDates.push(dateStr);
      }

      logger.debug("Calculating weekly totals for dates:", weekDates);

      // Sum up counts for each food group across the week
      weekDates.forEach((dateStr) => {
        const dayCounts = dailyCounts[dateStr] || {};

        Object.entries(dayCounts).forEach(([foodGroup, count]) => {
          if (typeof count === "number" && count > 0) {
            weeklyTotals[foodGroup] = (weeklyTotals[foodGroup] || 0) + count;
          }
        });
      });

      logger.debug("Calculated weekly totals:", weeklyTotals);
    } catch (error) {
      logger.error("Error calculating weekly totals:", error);
    }

    return weeklyTotals;
  }

  /**
   * Calculate week end date from week start date
   * @param {string} weekStartDate - Week start date in YYYY-MM-DD format
   * @returns {string} Week end date in YYYY-MM-DD format
   */
  calculateWeekEndDate(weekStartDate) {
    if (!weekStartDate) return "";

    try {
      const startDate = new Date(weekStartDate);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6); // Add 6 days to get end of week

      return endDate.toISOString().split("T")[0]; // Return YYYY-MM-DD format
    } catch (error) {
      logger.error("Error calculating week end date:", error);
      return "";
    }
  }

  /**
   * Update user preferences in PocketBase
   * @param {Object} preferences User preferences object
   */
  async updateUserPreferences(preferences) {
    if (!this.isAuthenticated)
      return { success: false, error: "Not authenticated" };

    try {
      const userId = this.pb.authStore.model.id;
      await this.pb.collection("users").update(userId, {
        preferences: preferences,
      });

      logger.info("User preferences updated in PocketBase:", preferences);
      return { success: true };
    } catch (error) {
      logger.error("Failed to update user preferences:", error);
      return { success: false, error: error.message };
    }
  }
}
