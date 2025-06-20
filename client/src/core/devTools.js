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

import { createLogger } from "./logger.js";
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

    // Bind methods to maintain context
    this.showViewFilesDialog = this.showViewFilesDialog.bind(this);
    this.downloadCloudFile = this.downloadCloudFile.bind(this);
    this.deleteCloudFiles = this.deleteCloudFiles.bind(this);
    this.setupDevControlEventListeners =
      this.setupDevControlEventListeners.bind(this);
  }

  /**
   * Show cloud files management dialog
   */
  async showViewFilesDialog() {
    if (
      !this.appManager.getSyncEnabled() ||
      !this.appManager.getCloudSync() ||
      !this.appManager.getCloudSync().provider
    ) {
      this.uiRenderer.showToast("Cloud sync must be connected", "error");
      return;
    }

    const providerName = this.appManager
      .getCloudSync()
      .provider.constructor.name.includes("Dropbox")
      ? "Dropbox"
      : "Google Drive";

    try {
      // Get file list
      let files = [];
      const provider = this.appManager.getCloudSync().provider;

      if (providerName === "Google Drive") {
        const listResponse = await provider.gapi.client.drive.files.list({
          spaces: "appDataFolder",
          fields: "files(id, name, mimeType, modifiedTime, size)",
          pageSize: 100,
        });
        files = listResponse.result.files || [];
      } else if (providerName === "Dropbox") {
        const listResponse = await provider.dbx.filesListFolder({
          path: "",
        });
        files = listResponse.result.entries || [];
      }

      // Generate file list with checkboxes
      let fileListHtml = "";
      const fileCheckboxes = new Map(); // Store file data for download/delete

      if (files.length === 0) {
        fileListHtml = "<p>No files found.</p>";
      } else {
        fileListHtml = `
          <div style="margin-bottom: 10px;">
            <label>
              <input type="checkbox" id="select-all-files"> Select All
            </label>
          </div>
          <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 10px;">
            <div id="file-list">
        `;

        files.sort((a, b) => {
          const nameA = a.name || a.path_display || "";
          const nameB = b.name || b.path_display || "";
          return nameA.localeCompare(nameB);
        });

        files.forEach((file, index) => {
          const fileName = file.name || file.path_display || "Unknown file";
          const fileId = file.id || file.path_lower || `file-${index}`;
          const modifiedDate = file.modifiedTime || file.server_modified || "";
          const modifiedStr = modifiedDate
            ? ` (${new Date(modifiedDate).toLocaleString()})`
            : "";

          fileCheckboxes.set(fileId, file);

          fileListHtml += `
            <div style="margin-bottom: 8px;">
              <label style="display: flex; align-items: center;">
                <input type="checkbox" class="file-checkbox" data-file-id="${fileId}">
                <span style="margin-left: 8px; font-family: monospace; font-size: 12px;">
                  ${fileName}${modifiedStr}
                </span>
              </label>
            </div>
          `;
        });

        fileListHtml += `
            </div>
          </div>
        `;
      }

      // Create dialog content
      const dialogContent = `
        <div style="margin-bottom: 15px;">
          <button id="download-selected-btn" class="action-btn" style="margin-right: 8px;">
            <i class="mdi mdi-cloud-download-outline"></i> Download
          </button>
          <button id="delete-selected-btn" class="action-btn danger-btn">
            <i class="mdi mdi-trash-can-outline"></i> Delete
          </button>
        </div>
        ${fileListHtml}
      `;

      // Show the dialog
      this.uiRenderer.openModal(`${providerName} Files`, dialogContent, {
        showFooter: true,
        buttons: [
          {
            label: "Close",
            id: "close-files-btn",
            class: "primary-btn",
            onClick: () => this.uiRenderer.closeModal(),
          },
        ],
      });

      // Disable buttons if no files
      const downloadBtn = document.getElementById("download-selected-btn");
      const deleteBtn = document.getElementById("delete-selected-btn");

      if (files.length === 0) {
        if (downloadBtn) downloadBtn.disabled = true;
        if (deleteBtn) deleteBtn.disabled = true;
      }

      // Set up event listeners
      const selectAllCheckbox = document.getElementById("select-all-files");
      const fileCheckboxElements = document.querySelectorAll(".file-checkbox");

      if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener("change", (e) => {
          fileCheckboxElements.forEach((cb) => {
            cb.checked = e.target.checked;
          });
        });
      }

      // Download selected button
      if (downloadBtn) {
        downloadBtn.addEventListener("click", async () => {
          const selectedFiles = Array.from(fileCheckboxElements)
            .filter((cb) => cb.checked)
            .map((cb) => {
              const fileId = cb.dataset.fileId;
              return fileCheckboxes.get(fileId);
            });

          if (selectedFiles.length === 0) {
            this.uiRenderer.showToast("No files selected", "warning");
            return;
          }

          // Handle downloads
          if (selectedFiles.length === 1) {
            await this.downloadCloudFile(selectedFiles[0], providerName);
          } else {
            // For multiple files, prompt user for approach
            const approach = await this.uiRenderer.showConfirmDialog({
              title: "Download Multiple Files",
              message: "How would you like to download the selected files?",
              confirmText: "One at a time",
              cancelText: "Cancel",
              details: `<p>Selected ${selectedFiles.length} files for download.</p>
                       <p>Note: Some browsers may block multiple automatic downloads.</p>`,
            });

            if (approach) {
              // Download one at a time with small delay
              for (const file of selectedFiles) {
                await this.downloadCloudFile(file, providerName);
                await new Promise((resolve) => setTimeout(resolve, 500)); // Small delay
              }
            }
          }
        });
      }

      // Delete selected button
      if (deleteBtn) {
        deleteBtn.addEventListener("click", async () => {
          const selectedFiles = Array.from(fileCheckboxElements)
            .filter((cb) => cb.checked)
            .map((cb) => {
              const fileId = cb.dataset.fileId;
              return fileCheckboxes.get(fileId);
            });

          if (selectedFiles.length === 0) {
            this.uiRenderer.showToast("No files selected", "warning");
            return;
          }

          const confirmed = await this.uiRenderer.showConfirmDialog({
            title: "Confirm Delete",
            message: `Are you sure you want to delete ${selectedFiles.length} file(s)?`,
            confirmText: "Delete",
            cancelText: "Cancel",
            details: `<p>This action cannot be undone.</p>`,
          });

          if (confirmed) {
            await this.deleteCloudFiles(selectedFiles, providerName);
            // Refresh the dialog
            // await this.showViewFilesDialog();
          }
        });
      }
    } catch (error) {
      logger.error("Error loading cloud files:", error);
      this.uiRenderer.showToast(`Error: ${error.message}`, "error");
    }
  }

  /**
   * Download a cloud file
   * @param {Object} file - File object from cloud provider
   * @param {string} providerName - Name of the cloud provider
   */
  async downloadCloudFile(file, providerName) {
    try {
      const fileName = file.name || file.path_display || "unknown-file";
      const fileId = file.id || file.path_lower;

      this.uiRenderer.showToast(`Downloading ${fileName}...`, "info", {
        isPersistent: true,
        showSpinner: true,
      });

      // Download the file content
      const content = await this.appManager
        .getCloudSync()
        .provider.downloadFile(fileId);

      // Convert to JSON string
      const jsonString = JSON.stringify(content, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // Create download link
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      this.uiRenderer.showToast(`Downloaded ${fileName}`, "success");
    } catch (error) {
      logger.error(`Error downloading file:`, error);
      this.uiRenderer.showToast(`Download failed: ${error.message}`, "error");
    }
  }

  /**
   * Delete multiple cloud files
   * @param {Array} files - Array of file objects to delete
   * @param {string} providerName - Name of the cloud provider
   */
  async deleteCloudFiles(files, providerName) {
    let deletedCount = 0;

    try {
      for (const file of files) {
        const fileName = file.name || file.path_display || "unknown-file";
        const fileId = file.id || file.path_lower;

        if (providerName === "Google Drive") {
          await this.appManager
            .getCloudSync()
            .provider.gapi.client.drive.files.delete({ fileId });
        } else if (providerName === "Dropbox") {
          await this.appManager
            .getCloudSync()
            .provider.dbx.filesDelete({ path: fileId });
        }

        deletedCount++;
        logger.info(`Deleted file: ${fileName}`);
      }

      this.uiRenderer.showToast(`Deleted ${deletedCount} file(s)`, "success");
    } catch (error) {
      logger.error("Error deleting files:", error);
      this.uiRenderer.showToast(`Delete failed: ${error.message}`, "error");
    }
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

        // Update logger configuration
        import("./logger.js").then(({ configure, LOG_LEVELS }) => {
          configure({
            defaultLevel: LOG_LEVELS[selectedLevel],
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
