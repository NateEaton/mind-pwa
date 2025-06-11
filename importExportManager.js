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
 * Import/Export Manager - Handles data import and export operations
 */

import stateManager from "./stateManager.js";
import uiRenderer from "./uiRenderer.js";
import dataService from "./dataService.js";
import logger from "./logger.js";

// DOM element reference for file input
let importFileInputElement = null;

/**
 * Initialize the import/export manager
 * @param {HTMLElement} importFileInput - The file input element for imports
 */
function initialize(importFileInput) {
  importFileInputElement = importFileInput;
  setupEventListeners();
  logger.debug("Import/Export Manager initialized");
}

/**
 * Set up event listeners for import functionality
 */
function setupEventListeners() {
  if (importFileInputElement) {
    importFileInputElement.addEventListener("change", handleImportFileSelect);
  } else {
    logger.error(
      "Import file input element not provided during initialization"
    );
  }
}

/**
 * Handle data export - creates and downloads a JSON file with current data
 * @param {Function} closeMenuCallback - Function to close the menu after export starts
 */
async function handleExport(closeMenuCallback) {
  if (closeMenuCallback) closeMenuCallback();

  try {
    logger.info("Exporting data...");
    const dataToExport = await dataService.exportData();

    if (
      Object.keys(dataToExport.currentState).length === 0 &&
      dataToExport.history.length === 0
    ) {
      uiRenderer.showToast("No data available to export.", "error");
      return;
    }

    // Create JSON file and trigger download
    const jsonString = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const timestamp = dataService.getTodayDateString();
    link.download = `mind-diet-tracker-data-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    logger.info("Data exported successfully.");
    uiRenderer.showToast("Data exported successfully!", "success");
    uiRenderer.setActiveView("tracker");
  } catch (error) {
    logger.error("Error exporting data:", error);
    uiRenderer.showToast(`Export failed: ${error.message}`, "error");
  }
}

/**
 * Trigger the import file selection dialog
 * @param {Function} closeMenuCallback - Function to close the menu
 */
function triggerImport(closeMenuCallback) {
  if (closeMenuCallback) closeMenuCallback();
  if (importFileInputElement) {
    importFileInputElement.click();
  } else {
    logger.error("Import file input element not available");
    uiRenderer.showToast("Import functionality not available.", "error");
  }
}

/**
 * Handle import file selection
 * @param {Event} event - The file input change event
 */
async function handleImportFileSelect(event) {
  const file = event.target.files[0];
  if (!file) {
    logger.info("No file selected for import.");
    return;
  }

  // Validate file type
  if (!file.type || file.type !== "application/json") {
    uiRenderer.showToast(
      "Invalid file type. Please select a '.json' file.",
      "error"
    );
    clearFileInput();
    return;
  }

  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const fileContent = e.target.result;
      const importedData = JSON.parse(fileContent);

      // Basic validation of the imported structure
      if (
        typeof importedData !== "object" ||
        importedData === null ||
        !importedData.currentState ||
        !Array.isArray(importedData.history)
      ) {
        throw new Error("Invalid file structure.");
      }

      // Format export date for display
      const exportDate =
        importedData.appInfo && importedData.appInfo.exportDate
          ? new Date(importedData.appInfo.exportDate).toLocaleString()
          : "unknown date";

      // Determine relationship between import date and current date
      const importedDate = importedData.currentState.currentDayDate;
      const todayStr = dataService.getTodayDateString();

      // Get date relationship (SAME_DAY, SAME_WEEK, PAST_WEEK, FUTURE_WEEK)
      const dateRelationship = getDateRelationship(importedDate, todayStr);

      // Prepare confirmation message
      let actionDescription;
      switch (dateRelationship) {
        case "SAME_DAY":
          actionDescription = "REPLACE ALL tracking data";
          break;
        case "SAME_WEEK":
          actionDescription = "UPDATE current week totals and REPLACE history";
          break;
        case "PAST_WEEK":
          actionDescription =
            "ADD the imported data as history while PRESERVING current tracking";
          break;
        case "FUTURE_WEEK":
          actionDescription =
            "Warning: Import data appears to be from a FUTURE date";
          break;
        default:
          actionDescription = "REPLACE ALL tracking data";
      }

      // File details for the dialog
      const fileDetails = `
        <p><strong>File:</strong> ${file.name}</p>
        <p><strong>Exported:</strong> ${exportDate}</p>
        <p><strong>Import type:</strong> ${dateRelationship
          .replace("_", " ")
          .toLowerCase()}</p>
      `;

      // Show confirmation dialog using uiRenderer
      const confirmed = await uiRenderer.showConfirmDialog({
        title: "Import Confirmation",
        details: fileDetails,
        actionDesc: actionDescription,
        message:
          "This action cannot be undone. Do you want to proceed with the import?",
        confirmText: "Import",
        cancelText: "Cancel",
      });

      if (!confirmed) {
        logger.info("Import cancelled by user.");
        clearFileInput();
        return;
      }

      // Perform the import based on the data relationship
      const importResult = await processImport(importedData, dateRelationship);

      // Reload UI with new data
      uiRenderer.renderEverything();
      uiRenderer.setActiveView("tracker");

      // Create success message
      let successMessage;
      switch (dateRelationship) {
        case "SAME_DAY":
          successMessage = `Import complete. All data replaced.`;
          break;
        case "SAME_WEEK":
          successMessage = `Import complete. Week totals updated for current week.`;
          break;
        case "PAST_WEEK":
          // Use the count directly from the import result
          const importedCount =
            importResult?.importedCount ||
            importedData.appInfo?.historyCount ||
            importedData.history.length;
          successMessage = `Import complete. ${importedCount} weeks added to history.`;
          break;
        case "FUTURE_WEEK":
          successMessage = `Import complete. Future-dated data imported.`;
          break;
        default:
          successMessage = `Import successful!`;
      }

      uiRenderer.showToast(successMessage, "success", { duration: 4000 });
    } catch (error) {
      logger.error("Error importing data:", error);
      uiRenderer.showToast(`Import failed: ${error.message}`, "error", {
        duration: 5000,
      });
    } finally {
      clearFileInput();
    }
  };

  reader.onerror = (e) => {
    logger.error("Error reading file:", e);
    uiRenderer.showToast("Error reading the selected file.", "error");
    clearFileInput();
  };

  reader.readAsText(file);
}

/**
 * Process the import operation based on date relationship
 * @param {Object} importedData - The parsed data from the imported JSON file
 * @param {string} dateRelationship - Relationship of imported currentState to local current date
 * @returns {Promise<Object>} An object indicating success and any relevant import counts
 */
async function processImport(importedData, dateRelationship) {
  try {
    let importResult = { success: false };

    if (dateRelationship === "PAST_WEEK") {
      const currentState = stateManager.getState();
      const currentDailyCounts = { ...currentState.dailyCounts };
      const currentWeeklyCounts = { ...currentState.weeklyCounts };
      const currentDayDate = currentState.currentDayDate;
      const currentWeekStartDate = currentState.currentWeekStartDate;

      const foodGroups =
        currentState.foodGroups || stateManager.getFoodGroups();

      const importedCurrentWeek = dataService.createHistoryFromCurrentState(
        importedData.currentState,
        importedData.appInfo,
        foodGroups
      );

      const combinedHistory = [importedCurrentWeek, ...importedData.history];
      const importedHistoryCount = combinedHistory.length;

      const historyOnly = {
        appInfo: {
          ...importedData.appInfo,
          historyCount: importedHistoryCount,
        },
        currentState: {
          currentDayDate,
          currentWeekStartDate,
          dailyCounts: currentDailyCounts,
          weeklyCounts: currentWeeklyCounts,
          lastModified: Date.now(),
          metadata: {
            schemaVersion: dataService.SCHEMA?.VERSION || 3,
            partialImport: true,
            historyDirty: true,
          },
        },
        history: combinedHistory,
        preferences: importedData.preferences || {},
      };

      await dataService.importData(historyOnly);
      importResult = { success: true, importedCount: importedHistoryCount };
    } else if (dateRelationship === "SAME_WEEK") {
      const currentState = stateManager.getState();
      const currentDailyCounts = { ...currentState.dailyCounts };
      const currentWeeklyCounts = { ...currentState.weeklyCounts };
      const importedDailyCounts = { ...importedData.currentState.dailyCounts };
      const importedWeeklyCounts = {
        ...importedData.currentState.weeklyCounts,
      };

      // Merge daily counts
      const mergedDailyCounts = { ...currentDailyCounts };
      Object.keys(importedDailyCounts).forEach((date) => {
        mergedDailyCounts[date] = mergedDailyCounts[date] || {};
        Object.keys(importedDailyCounts[date]).forEach((groupId) => {
          const currentCount = mergedDailyCounts[date][groupId] || 0;
          const importedCount = importedDailyCounts[date][groupId] || 0;
          mergedDailyCounts[date][groupId] = Math.max(
            currentCount,
            importedCount
          );
        });
      });

      // Merge weekly counts
      const mergedWeeklyCounts = {};
      const allGroupIds = [
        ...new Set([
          ...Object.keys(currentWeeklyCounts),
          ...Object.keys(importedWeeklyCounts),
        ]),
      ];

      allGroupIds.forEach((groupId) => {
        const currentCount = currentWeeklyCounts[groupId] || 0;
        const importedCount = importedWeeklyCounts[groupId] || 0;
        mergedWeeklyCounts[groupId] = Math.max(currentCount, importedCount);
      });

      const now = Date.now();
      const mergedImport = {
        appInfo: importedData.appInfo,
        currentState: {
          currentDayDate: currentState.currentDayDate,
          currentWeekStartDate: currentState.currentWeekStartDate,
          dailyCounts: mergedDailyCounts,
          weeklyCounts: mergedWeeklyCounts,
          lastModified: now,
          metadata: {
            schemaVersion: dataService.SCHEMA?.VERSION || 3,
            partialImport: true,
            currentWeekDirty: true,
            historyDirty: true,
            dailyTotalsDirty: true,
            dailyTotalsUpdatedAt: now,
            weeklyTotalsDirty: true,
            weeklyTotalsUpdatedAt: now,
          },
        },
        history: importedData.history,
        preferences: importedData.preferences || {},
      };

      await dataService.importData(mergedImport);

      // Recalculate weekly totals from merged daily counts to ensure consistency
      stateManager.recalculateWeeklyTotals();
      logger.info("Recalculated weekly totals after SAME_WEEK import merge");

      importResult = { success: true };
    } else {
      // SAME_DAY or FUTURE_WEEK – full import
      importedData.currentState.metadata = {
        ...(importedData.currentState.metadata || {}),
        currentWeekDirty: true,
      };

      if (importedData.history && importedData.history.length > 0) {
        importedData.currentState.metadata.historyDirty = true;
      }

      await dataService.importData(importedData);
      importResult = { success: true };
    }

    const foodGroups =
      stateManager.getState().foodGroups || stateManager.getFoodGroups();
    await stateManager.initialize(foodGroups);

    // Ensure weekly totals are consistent with daily counts after any import
    stateManager.recalculateWeeklyTotals();
    logger.debug("Post-import weekly totals recalculation complete");

    return importResult;
  } catch (error) {
    logger.error("Error during import processing:", error);
    throw error;
  }
}

/**
 * Determine the relationship between two dates
 * @param {string} importDate - The import date string (YYYY-MM-DD)
 * @param {string} todayDate - The current date string (YYYY-MM-DD)
 * @returns {string} Relationship type (SAME_DAY, SAME_WEEK, PAST_WEEK, FUTURE_WEEK)
 */
function getDateRelationship(importDate, todayDate) {
  // Convert string dates to Date objects
  const importDateObj = new Date(`${importDate}T00:00:00`);
  const todayDateObj = new Date(`${todayDate}T00:00:00`);

  // Get week start dates to compare weeks
  const importWeekStart = dataService.getWeekStartDate(importDateObj);
  const todayWeekStart = dataService.getWeekStartDate(todayDateObj);

  if (importDate === todayDate) {
    return "SAME_DAY";
  } else if (importWeekStart === todayWeekStart) {
    return "SAME_WEEK";
  } else {
    return importDateObj < todayDateObj ? "PAST_WEEK" : "FUTURE_WEEK";
  }
}

/**
 * Clear the file input value
 */
function clearFileInput() {
  if (importFileInputElement) {
    importFileInputElement.value = "";
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

export default {
  initialize,
  handleExport,
  triggerImport,
  handleImportFileSelect,
  processImport,
  getDateRelationship,
};

// Named exports for convenience
export {
  initialize,
  handleExport,
  triggerImport,
  handleImportFileSelect,
  processImport,
  getDateRelationship,
};
