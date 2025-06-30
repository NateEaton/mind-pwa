/*
 * MIND Diet Tracker PWA - Event Handlers
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

import { createLogger, configure, LOG_LEVELS } from "./logger.js";
import appUtils from "../utils/appUtils.js";
import DevTools from "./devTools.js";
import { CONFIG } from "../config.js";

const logger = createLogger("eventHandlers");

/**
 * Event Handlers Module
 * Manages all event handling logic for the MIND Diet Tracker application
 */
class EventHandlers {
  constructor(dependencies) {
    // Inject dependencies
    this.appManager = dependencies.appManager;
    this.stateManager = dependencies.stateManager;
    this.uiRenderer = dependencies.uiRenderer;
    this.dataService = dependencies.dataService;
    this.settingsManager = dependencies.settingsManager;
    this.historyModalManager = dependencies.historyModalManager;
    this.importExportManager = dependencies.importExportManager;
    this.syncData = dependencies.syncData;
    this.closeMenu = dependencies.closeMenu;

    // Initialize DevTools module
    this.devTools = new DevTools({
      appManager: this.appManager,
      uiRenderer: this.uiRenderer,
      dataService: this.dataService,
      stateManager: this.stateManager,
      appUtils: appUtils,
      configureLogger: configure,
      logLevels: LOG_LEVELS,
    });

    // Bind methods to preserve 'this' context
    this.handleNavigation = this.handleNavigation.bind(this);
    this.handleCounterClick = this.handleCounterClick.bind(this);
    this.handleCounterInputChange = this.handleCounterInputChange.bind(this);
    this.handleInfoClick = this.handleInfoClick.bind(this);
    this.handlePrevWeek = this.handlePrevWeek.bind(this);
    this.handleNextWeek = this.handleNextWeek.bind(this);
    this.handleHistoryDatePick = this.handleHistoryDatePick.bind(this);
    this.handleUserGuideClick = this.handleUserGuideClick.bind(this);
    this.handleAboutClick = this.handleAboutClick.bind(this);
    this.toggleMenu = this.toggleMenu.bind(this);
    this.handleOutsideMenuClick = this.handleOutsideMenuClick.bind(this);
  }

  /**
   * Setup all event listeners for the application
   */
  setupEventListeners() {
    // Navigation buttons (using event delegation)
    document
      .querySelector(".tab-bar")
      .addEventListener("click", this.handleNavigation);

    // Menu toggle functionality
    const tabMenuBtn = document.getElementById("tab-menu-btn");
    if (tabMenuBtn) {
      tabMenuBtn.addEventListener("click", (event) => {
        event.preventDefault();
        this.toggleMenu();
      });
    }

    // Menu related
    document.addEventListener("click", this.handleOutsideMenuClick);

    // Menu items
    this.appManager
      .getDomElements()
      .settingsBtn.addEventListener(
        "click",
        this.settingsManager.handleSettings
      );
    this.appManager.getDomElements().userGuideBtn =
      document.getElementById("user-guide-btn");
    this.appManager
      .getDomElements()
      .aboutBtn.addEventListener("click", this.handleAboutClick);

    // New single-container approach
    const foodTrackerContainer = document.getElementById("food-tracker");
    if (foodTrackerContainer) {
      foodTrackerContainer.addEventListener("click", this.handleCounterClick);
      foodTrackerContainer.addEventListener(
        "change",
        this.handleCounterInputChange
      );
      foodTrackerContainer.addEventListener(
        "input",
        this.handleCounterInputChange
      );
      foodTrackerContainer.addEventListener("click", this.handleInfoClick);
    }

    // History navigation
    const prevWeekBtn = document.getElementById("prev-week-btn");
    const nextWeekBtn = document.getElementById("next-week-btn");
    const historyDatePicker = document.getElementById("history-date-picker");

    prevWeekBtn.addEventListener("click", this.handlePrevWeek);
    nextWeekBtn.addEventListener("click", this.handleNextWeek);
    historyDatePicker.addEventListener("change", this.handleHistoryDatePick);

    // History edit modal button
    if (this.appManager.getDomElements().editHistoryWeekBtn) {
      this.appManager
        .getDomElements()
        .editHistoryWeekBtn.addEventListener("click", () =>
          this.historyModalManager.openEditHistoryDailyDetailsModal()
        );
    }

    // User Guide button
    if (this.appManager.getDomElements().userGuideBtn) {
      this.appManager
        .getDomElements()
        .userGuideBtn.addEventListener("click", this.handleUserGuideClick);
    }

    // Import/Export handlers
    this.appManager
      .getDomElements()
      .exportBtn.addEventListener("click", () =>
        this.importExportManager.handleExport(this.closeMenu)
      );
    this.appManager
      .getDomElements()
      .importBtnTrigger.addEventListener("click", () =>
        this.importExportManager.triggerImport(this.closeMenu)
      );

    // Add sync event listeners
    window.addEventListener("online", () => {
      // Try to sync when device comes online
      if (this.appManager.getSyncEnabled() && this.appManager.getCloudSync()) {
        this.syncData();
      }
    });

    // Sync on visibility change (tab focus/blur)
    document.addEventListener("visibilitychange", () => {
      this.handleVisibilityChange();
    });

    logger.info("Event listeners setup complete");
  }

  /**
   * Handle navigation button clicks
   * @param {Event} event - The click event
   */
  handleNavigation(event) {
    const button = event.target.closest("button[data-view]");
    if (!button) return;

    const viewId = button.dataset.view;
    this.uiRenderer.setActiveView(viewId);
  }

  /**
   * Toggle the main menu
   */
  toggleMenu() {
    const menuBtn = document.getElementById("tab-menu-btn");
    logger.debug(
      "Toggling menu, current state:",
      this.appManager.getDomElements().mainMenu.classList.contains("menu-open")
    );

    // Only position if the menu isn't already open (to prevent repositioning when closing)
    if (
      !this.appManager.getDomElements().mainMenu.classList.contains("menu-open")
    ) {
      if (menuBtn) {
        const menuBtnRect = menuBtn.getBoundingClientRect();

        this.appManager.getDomElements().mainMenu.style.top =
          menuBtnRect.bottom + 5 + "px";
        this.appManager.getDomElements().mainMenu.style.right =
          window.innerWidth - menuBtnRect.right + "px";
        this.appManager.getDomElements().mainMenu.style.left = "auto";
      }
    }

    this.appManager.getDomElements().mainMenu.classList.toggle("menu-open");
    logger.debug(
      "Menu toggled, new state:",
      this.appManager.getDomElements().mainMenu.classList.contains("menu-open")
    );
  }

  /**
   * Handle clicks outside the menu to close it
   * @param {Event} event - The click event
   */
  handleOutsideMenuClick(event) {
    const tabMenuBtn = document.getElementById("tab-menu-btn");

    if (
      !this.appManager.getDomElements().mainMenu.contains(event.target) &&
      !(tabMenuBtn && tabMenuBtn.contains(event.target)) &&
      this.appManager.getDomElements().mainMenu.classList.contains("menu-open")
    ) {
      this.closeMenu();
    }
  }

  /**
   * Handle counter button clicks in the tracker view
   * @param {Event} event - The click event
   */
  handleCounterClick(event) {
    const button = event.target.closest(".increment-btn, .decrement-btn");
    if (!button) return;

    const item = button.closest(".food-group-item");
    if (!item) return;

    const groupId = item.dataset.id;
    const input = item.querySelector(".count-input");

    // Get the currently selected date from the state manager
    const currentState = this.stateManager.getState();
    const selectedDate = currentState.selectedTrackerDate;

    if (!selectedDate) {
      logger.error(
        "handleCounterClick: selectedTrackerDate is not available in state. Cannot update count."
      );
      this.uiRenderer.showToast("Error: No date selected to update.", "error");
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
      valueChanged = currentValue < oldValue;
    }

    if (valueChanged) {
      logger.debug(
        `handleCounterClick: Updating count for date: ${selectedDate}, group: ${groupId}, new value: ${currentValue}`
      );
      appUtils.triggerHapticFeedback(30);

      this.stateManager.updateDailyCount(selectedDate, groupId, currentValue);
    }
  }

  /**
   * Handle counter input changes in the tracker view
   * @param {Event} event - The input change event
   */
  handleCounterInputChange(event) {
    const input = event.target;
    if (!input || !input.classList.contains("count-input")) return;

    const item = input.closest(".food-group-item");
    if (!item) return;

    const groupId = item.dataset.id;
    let newValue = parseInt(input.value, 10);

    // Get the currently selected date from the state manager
    const currentState = this.stateManager.getState();
    const selectedDate = currentState.selectedTrackerDate;

    if (!selectedDate) {
      logger.error(
        "handleCounterInputChange: selectedTrackerDate is not available in state. Cannot update count."
      );
      return;
    }

    // Validate input
    if (isNaN(newValue) || newValue < 0) {
      newValue = 0;
    }

    logger.debug(
      `handleCounterInputChange: Updating count for date: ${selectedDate}, group: ${groupId}, new value: ${newValue}`
    );
    this.stateManager.updateDailyCount(selectedDate, groupId, newValue);
  }

  /**
   * Handle info button clicks
   * @param {Event} event - The click event
   */
  handleInfoClick(event) {
    const infoButton = event.target.closest(".info-btn");
    if (!infoButton) return;

    const groupId = infoButton.dataset.groupId;
    if (!groupId) return;

    const group = this.stateManager.getFoodGroup(groupId);
    if (!group || !group.description) {
      this.uiRenderer.showToast("Details not available.", "error");
      return;
    }

    // Prepare content with line breaks
    const descriptionHtml = group.description.replace(/\n/g, "<br>");
    this.uiRenderer.openModal(group.name, descriptionHtml);
  }

  /**
   * Handle previous week button in history view
   */
  handlePrevWeek() {
    const state = this.stateManager.getState();
    if (state.currentHistoryIndex < state.history.length - 1) {
      const newIndex = state.currentHistoryIndex + 1;
      this.stateManager.dispatch({
        type: this.stateManager.ACTION_TYPES.SET_HISTORY_INDEX,
        payload: { index: newIndex },
      });
    }
  }

  /**
   * Handle next week button in history view
   */
  handleNextWeek() {
    const state = this.stateManager.getState();
    if (state.currentHistoryIndex > 0) {
      const newIndex = state.currentHistoryIndex - 1;
      this.stateManager.dispatch({
        type: this.stateManager.ACTION_TYPES.SET_HISTORY_INDEX,
        payload: { index: newIndex },
      });
    }
  }

  /**
   * Handle history date picker change
   */
  handleHistoryDatePick() {
    const historyDatePicker = document.getElementById("history-date-picker");
    const selectedDateStr = historyDatePicker.value;
    if (!selectedDateStr) return;

    const selectedDate = new Date(selectedDateStr + "T00:00:00");
    const targetWeekStart = this.dataService.getWeekStartDate(selectedDate);

    const state = this.stateManager.getState();
    const foundIndex = state.history.findIndex(
      (week) => week.weekStartDate === targetWeekStart
    );

    if (foundIndex !== -1) {
      this.stateManager.dispatch({
        type: this.stateManager.ACTION_TYPES.SET_HISTORY_INDEX,
        payload: { index: foundIndex },
      });
    } else {
      this.uiRenderer.showToast(
        `No history found for the week starting ${targetWeekStart}`,
        "info"
      );
    }
  }

  /**
   * Handle User Guide button click
   */
  handleUserGuideClick() {
    this.closeMenu();
    // Open the GitHub wiki in a new tab
    const wikiUrl = "https://github.com/NateEaton/mind-pwa/wiki/User-Guide";
    window.open(wikiUrl, "_blank", "noopener,noreferrer");
  }

  /**
   * Handle About button click
   */
  async handleAboutClick() {
    this.closeMenu();

    const isDevMode = CONFIG?.DEV_MODE || false;

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
      if (
        this.appManager.getCloudSync() &&
        this.appManager.getCloudSync().provider
      ) {
        currentProvider =
          this.appManager.getCloudSync().provider.providerName ===
          "DropboxProvider"
            ? "Dropbox"
            : "Google Drive";
      }

      aboutContent += this.getDevControlsHtml();
    }

    this.uiRenderer.openModal(aboutTitle, aboutContent, {
      showFooter: true,
      buttons: [
        {
          label: "Close",
          id: "about-close-btn",
          class: "primary-btn",
          onClick: () => this.uiRenderer.closeModal(),
        },
      ],
    });

    // Update version in the modal
    const modalVersionEl = document.getElementById("modal-app-version");
    if (modalVersionEl) {
      try {
        const versionData = await appUtils.loadAppVersion();
        modalVersionEl.textContent = versionData
          ? `v${versionData.commitHash}`
          : "(unknown)";
      } catch (error) {
        logger.warn("Failed to load version for About dialog:", error);
        modalVersionEl.textContent = "(unknown)";
      }
    }

    // Only set up dev controls if in dev mode
    if (isDevMode) {
      // Update device info and module information
      this.updateDevInfoContent();

      // Set up event listeners for dev controls
      this.devTools.setupDevControlEventListeners();
    }
  }

  /**
   * Update the development information content including device info
   */
  async updateDevInfoContent() {
    const devInfoContent = document.getElementById("dev-info-content");
    if (!devInfoContent) return;

    // Show loading message
    devInfoContent.innerHTML = "Loading development information...";

    try {
      // Get device info
      const devInfo = appUtils.getDeviceInfo();
      let infoHtml = "<h5 style='margin: 5px 0;'>Device Information</h5>";
      for (const [key, value] of Object.entries(devInfo)) {
        infoHtml += `<div>${key}: <span>${value}</span></div>`;
      }

      // Update content with device info
      devInfoContent.innerHTML = infoHtml;
    } catch (error) {
      logger.error("Error updating dev info content:", error);
      devInfoContent.innerHTML = "Error loading development information.";
    }
  }

  getDevControlsHtml() {
    // Get current cloud provider
    let currentProvider = "None";
    if (
      this.appManager.getCloudSync() &&
      this.appManager.getCloudSync().provider
    ) {
      currentProvider =
        this.appManager.getCloudSync().provider.providerName ===
        "DropboxProvider"
          ? "Dropbox"
          : "Google Drive";
    }

    return `
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

      <!-- Test date controls -->
      <div style="display: flex; align-items: center; margin-bottom: 10px;">
        <label for="test-date" style="margin-right: 10px;">Test Date:</label>
        <input type="date" id="test-date" ${
          this.dataService.isTestModeEnabled()
            ? `value="${
                this.dataService.getCurrentDate().toISOString().split("T")[0]
              }"`
            : ""
        }>
        <button id="apply-test-date" style="margin-left: 5px;">Apply</button>
        <button id="reset-test-date" style="margin-left: 5px;" ${
          !this.dataService.isTestModeEnabled() ? "disabled" : ""
        }>Reset</button>
      </div>

      <div id="test-date-status" style="font-size: 12px; color: ${
        this.dataService.isTestModeEnabled() ? "#ff0000" : "#888"
      };">
        ${
          this.dataService.isTestModeEnabled()
            ? `TEST MODE ACTIVE: Using date ${this.dataService
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
          !this.appManager.getSyncEnabled() || currentProvider === "None"
            ? "disabled"
            : ""
        }>View Files</button>
      </div>
      
      <div id="cloud-clear-status" style="font-size: 12px; color: #888;">
        ${
          this.appManager.getSyncEnabled() && currentProvider !== "None"
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

  /**
   * Handle visibility change events (tab focus/blur)
   */
  handleVisibilityChange() {
    // Clear any pending timeout
    if (this.appManager.visibilityChangeTimeout) {
      clearTimeout(this.appManager.visibilityChangeTimeout);
      this.appManager.visibilityChangeTimeout = null;
    }

    const now = Date.now();
    const timeSinceLastSync = now - this.appManager.lastSyncTime;
    const timeSinceLastFocusChange = now - this.appManager.lastFocusChangeTime;
    this.appManager.lastFocusChangeTime = now;

    // Skip visibility change handling during initial sync
    if (this.appManager.initialSyncInProgress) {
      logger.debug("Skipping visibility change sync during initial sync");
      return;
    }

    if (document.hidden) {
      // App is being hidden/minimized - check for changes
      if (this.appManager.getSyncEnabled() && this.appManager.getCloudSync()) {
        // Check if we're in an OAuth flow
        const isInOAuthFlow =
          document.querySelector("#generic-modal.modal-open") ||
          document.querySelector(".modal.modal-open");

        if (isInOAuthFlow) {
          logger.info(
            "App being hidden during OAuth flow, skipping sync to prevent conflicts"
          );
          return;
        }

        const state = this.stateManager.getState();
        const hasDirtyFlags =
          state.metadata?.currentWeekDirty ||
          state.metadata?.historyDirty ||
          state.metadata?.dailyTotalsDirty ||
          state.metadata?.weeklyTotalsDirty;

        if (hasDirtyFlags) {
          logger.info(
            "App being hidden with unsaved changes, syncing immediately"
          );
          // Use centralized sync coordination with high priority for dirty flags
          this.appManager.requestSync("visibility", {
            priority: "high",
            skipCooldown: true, // Force sync even during cooldown for dirty flags
          });
        } else if (timeSinceLastSync >= this.appManager.MIN_SYNC_INTERVAL) {
          logger.info("App being hidden, periodic sync triggered");
          // Use centralized sync coordination for periodic sync
          this.appManager.requestSync("visibility", {
            priority: "normal",
          });
        } else {
          logger.debug("No changes and too soon since last sync, skipping");
        }
      }
    } else {
      // App is becoming visible
      if (this.appManager.getSyncEnabled() && this.appManager.getCloudSync()) {
        const isInOAuthFlow =
          document.querySelector("#generic-modal.modal-open") ||
          document.querySelector(".modal.modal-open");

        if (isInOAuthFlow) {
          logger.info(
            "App becoming visible during OAuth flow, skipping sync to prevent conflicts"
          );
          return;
        }

        if (
          timeSinceLastSync >= this.appManager.MIN_SYNC_INTERVAL &&
          timeSinceLastFocusChange >= 5000
        ) {
          logger.info(
            "App visible after significant time, checking for remote changes"
          );
          this.appManager.visibilityChangeTimeout = setTimeout(() => {
            // Use centralized sync coordination for visibility sync
            this.appManager.requestSync("visibility", {
              priority: "normal",
            });
          }, 2000);
        } else {
          logger.debug(
            "Visibility change sync: Skipped - too soon since last sync or focus change"
          );
        }
      }
    }
  }
}

export default EventHandlers;
