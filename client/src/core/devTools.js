/*
 * MIND Diet Tracker PWA - Development Tools Module
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
const logger = createLogger("devTools");

/**
 * Development Tools Class
 * Handles all development-related functionality including cloud file management,
 * test mode controls, logging configuration, and device information display.
 */
class DevTools {
  constructor(dependencies) {
    // Store dependencies
    this.appManager = dependencies.appManager;
    this.uiRenderer = dependencies.uiRenderer;
    this.dataService = dependencies.dataService;
    this.stateManager = dependencies.stateManager;
    this.appUtils = dependencies.appUtils;

    // Add logger configuration functions with fallbacks
    this.configureLogger = dependencies.configureLogger || configure;
    this.logLevels = dependencies.logLevels || LOG_LEVELS;

    // Bind methods to maintain context
    this.setupDevControlEventListeners =
      this.setupDevControlEventListeners.bind(this);
  }

  /**
   * Show cloud files management dialog
   */
  async showViewFilesDialog() {
    // Developer cloud files feature removed
    logger.info("Cloud files feature disabled");
  }

  /**
   * Download a cloud file
   * @param {Object} file - File object from cloud provider
   * @param {string} providerName - Name of the cloud provider
   */
  async downloadCloudFile(file, providerName) {
    // Developer cloud files feature removed
    logger.info("Cloud file download feature disabled");
  }

  /**
   * Delete multiple cloud files
   * @param {Array} files - Array of file objects to delete
   * @param {string} providerName - Name of the cloud provider
   */
  async deleteCloudFiles(files, providerName) {
    // Developer cloud files feature removed
    logger.info("Cloud file deletion feature disabled");
  }

  /**
   * Set up event listeners for developer controls in the About dialog
   */
  setupDevControlEventListeners() {
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

        // Use injected functions instead of dynamic import
        this.configureLogger({
          defaultLevel: this.logLevels[selectedLevel],
        });

        // Store selection in localStorage for persistence
        localStorage.setItem("appLogLevel", selectedLevel);

        // Update status text
        if (logLevelStatus) {
          logLevelStatus.textContent = `Current application log level: ${selectedLevel}`;
        }

        // Show toast notification
        this.uiRenderer.showToast(
          `Log level set to ${selectedLevel}`,
          "success"
        );
      });
    }

    if (applyTestDateBtn) {
      applyTestDateBtn.addEventListener("click", async () => {
        const dateValue = testDateInput.value;
        if (dateValue) {
          this.dataService.enableTestMode(dateValue);
          testDateStatus.textContent = `TEST MODE ACTIVE: Using date ${this.dataService
            .getCurrentDate()
            .toLocaleDateString()}`;
          testDateStatus.style.color = "#ff0000";
          resetTestDateBtn.disabled = false;

          // Check for date changes with new test date
          await this.stateManager.checkDateAndReset();
          this.uiRenderer.renderEverything();

          // Show banner and toast
          this.appUtils.addTestModeBanner(
            `TEST MODE: Using date ${this.dataService
              .getCurrentDate()
              .toLocaleDateString()}`
          );
          this.uiRenderer.showToast(
            "Test date applied: " +
              this.dataService.getCurrentDate().toLocaleDateString(),
            "success"
          );
        }
      });
    }

    if (resetTestDateBtn) {
      resetTestDateBtn.addEventListener("click", async () => {
        this.dataService.disableTestMode();
        testDateStatus.textContent =
          "Test mode inactive (using real system date)";
        testDateStatus.style.color = "#888";
        resetTestDateBtn.disabled = true;

        // Check for date changes with real date
        await this.stateManager.checkDateAndReset();
        this.uiRenderer.renderEverything();

        this.appUtils.removeTestModeBanner();
        this.uiRenderer.showToast(
          "Test mode disabled. Using real system date.",
          "success"
        );
      });
    }

    const viewFilesBtn = document.getElementById("view-cloud-files-btn");
    if (viewFilesBtn) {
      viewFilesBtn.addEventListener("click", async () => {
        await this.showViewFilesDialog();
      });
    }
  }
}

export default DevTools;
