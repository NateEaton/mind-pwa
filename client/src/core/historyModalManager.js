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
 * History Modal Manager - Manages the History Daily Details modal for editing historical week data
 */

import stateManager from "./stateManager.js";
import uiRenderer from "../ui/renderer.js";
import dateUtils from "../utils/dateUtils.js";
import dataService from "./dataService.js";
import logger from "./logger.js";

// Modal state management
let modalState = {
  // History Daily Details Modal state
  editingHistoryWeekDataRef: null,
  tempEditedDailyCounts: {},
  selectedDayInHistoryModal: null,
  historyModalFoodGroups: [],
};

/**
 * Initialize modal manager and set up event listeners
 */
function initialize() {
  setupModalEventListeners();
  logger.debug("History Modal Manager initialized");
}

/**
 * Set up event listeners for modal interactions
 */
function setupModalEventListeners() {
  // Generic modal listeners
  const modalCloseBtn = document.getElementById("modal-close-btn");
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", () => uiRenderer.closeModal());
  }

  const genericModal = document.getElementById("generic-modal");
  if (genericModal) {
    genericModal.addEventListener("click", (event) => {
      if (event.target === genericModal) {
        uiRenderer.closeModal();
      }
    });
  }

  // Edit totals modal listeners - the modal serves dual purpose
  const modalFoodList = uiRenderer.domElements.modalElements.editTotalsList;
  if (modalFoodList) {
    modalFoodList.addEventListener("click", handleModalClick);
  }

  const modalSaveBtn = uiRenderer.domElements.modalElements.editTotalsSaveBtn;
  if (modalSaveBtn) {
    modalSaveBtn.addEventListener("click", handleModalSave);
    logger.debug("Modal save button event listener added");
  } else {
    logger.error("Modal save button not found during initialization");
  }

  const modalCancelBtn =
    uiRenderer.domElements.modalElements.editTotalsCancelBtn;
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener("click", handleModalCancel);
  }

  const modalCloseIconBtn =
    uiRenderer.domElements.modalElements.editTotalsCloseBtn;
  if (modalCloseIconBtn) {
    modalCloseIconBtn.addEventListener("click", handleModalCancel);
  }

  // Click outside modal to close
  const editModalContainer =
    uiRenderer.domElements.modalElements.editTotalsModal;
  if (editModalContainer) {
    editModalContainer.addEventListener("click", (event) => {
      if (event.target === editModalContainer) {
        handleModalCancel();
      }
    });
  }
}

/**
 * Handle modal click events for history daily details
 * @param {Event} event - The click event
 */
function handleModalClick(event) {
  handleModalDailyDetailChange(event);
}

/**
 * Handle modal save events for history daily details
 */
async function handleModalSave() {
  logger.debug("handleModalSave called", {
    editingHistoryWeekDataRef: !!modalState.editingHistoryWeekDataRef,
  });

  if (modalState.editingHistoryWeekDataRef) {
    logger.debug("Calling saveEditedHistoryDailyDetails");
    await saveEditedHistoryDailyDetails();
  } else {
    logger.warn("Save called but no editing context available");
  }
}

/**
 * Handle modal cancel events for history daily details
 */
function handleModalCancel() {
  closeEditHistoryDailyDetailsModal();
}

// =============================================================================
// HISTORY DAILY DETAILS MODAL
// =============================================================================

/**
 * Opens and initializes the modal for viewing/editing daily details of a historical week
 */
function openEditHistoryDailyDetailsModal() {
  const state = stateManager.getState();
  if (
    state.currentHistoryIndex === -1 ||
    !state.history ||
    !state.history[state.currentHistoryIndex]
  ) {
    uiRenderer.showToast("No history week selected to edit.", "error");
    return;
  }

  modalState.editingHistoryWeekDataRef =
    state.history[state.currentHistoryIndex];
  modalState.historyModalFoodGroups = state.foodGroups;

  // Deep copy the dailyCounts for temporary editing
  modalState.tempEditedDailyCounts = JSON.parse(
    JSON.stringify(modalState.editingHistoryWeekDataRef.dailyCounts || {})
  );

  const weekStartDateObj = new Date(
    modalState.editingHistoryWeekDataRef.weekStartDate + "T00:00:00"
  );
  const daysOfThisHistoricalWeek = [];

  // Ensure tempEditedDailyCounts has entries for all 7 days of the week
  for (let i = 0; i < 7; i++) {
    const dayObj = new Date(weekStartDateObj);
    dayObj.setDate(weekStartDateObj.getDate() + i);
    const dayStr = dateUtils.formatDateToYYYYMMDD(dayObj);
    daysOfThisHistoricalWeek.push(dayStr);
    if (!modalState.tempEditedDailyCounts[dayStr]) {
      modalState.tempEditedDailyCounts[dayStr] = {};
    }
  }

  // Calculate initial weekly totals from dailyCounts
  const initialWeeklyTotals = {};
  Object.values(modalState.tempEditedDailyCounts).forEach((dayData) => {
    Object.entries(dayData).forEach(([groupId, count]) => {
      initialWeeklyTotals[groupId] =
        (initialWeeklyTotals[groupId] || 0) + count;
    });
  });

  // Update the history record's weeklyTotals
  modalState.editingHistoryWeekDataRef.weeklyTotals = initialWeeklyTotals;

  modalState.selectedDayInHistoryModal = daysOfThisHistoricalWeek[0]; // Default to first day

  const mainModalTitle = `Week of ${weekStartDateObj.toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", year: "numeric" }
  )}`;

  // Show the modal shell using uiRenderer
  uiRenderer.showEditHistoryModalShell(mainModalTitle, "Save Changes to Week");

  // Get references to the modal's internal placeholders
  const modalDaySelectorBarEl =
    uiRenderer.domElements.modalElements.modalDaySelectorBar;

  // Populate the dynamic content using other uiRenderer functions
  uiRenderer.updateModalSelectedDayDisplay(
    modalState.selectedDayInHistoryModal
  );

  if (modalDaySelectorBarEl) {
    uiRenderer.renderDaySelectorBar(
      modalDaySelectorBarEl,
      modalState.editingHistoryWeekDataRef.weekStartDate,
      modalState.selectedDayInHistoryModal,
      (newDay) => handleModalDayNavigation(newDay),
      modalState.editingHistoryWeekDataRef.metadata?.weekStartDay ||
      state.metadata.weekStartDay ||
      "Sunday",
      true // isModal = true
    );
  } else {
    logger.error(
      "Modal day selector bar element not found for history edit modal."
    );
  }

  uiRenderer.renderModalDayDetailsList(
    modalState.historyModalFoodGroups,
    modalState.tempEditedDailyCounts[modalState.selectedDayInHistoryModal] ||
    {},
    modalState.tempEditedDailyCounts
  );
}

/**
 * Handles navigation between days within the "Edit History Daily Details" modal
 * @param {string} newSelectedDayStr - The YYYY-MM-DD of the day selected in the modal's day bar
 */
function handleModalDayNavigation(newSelectedDayStr) {
  if (
    !modalState.editingHistoryWeekDataRef ||
    !modalState.tempEditedDailyCounts
  ) {
    logger.warn(
      "handleModalDayNavigation called without active editing context."
    );
    return;
  }

  modalState.selectedDayInHistoryModal = newSelectedDayStr;
  logger.debug(
    `History Modal: Day navigation changed to ${modalState.selectedDayInHistoryModal}`
  );

  // Update the "Mon, 3/8" display in the modal header
  uiRenderer.updateModalSelectedDayDisplay(
    modalState.selectedDayInHistoryModal
  );

  // Ensure weekly totals are up to date before re-rendering
  const weeklyTotals = {};
  Object.values(modalState.tempEditedDailyCounts).forEach((dayData) => {
    Object.entries(dayData).forEach(([groupId, count]) => {
      weeklyTotals[groupId] = (weeklyTotals[groupId] || 0) + count;
    });
  });
  modalState.editingHistoryWeekDataRef.weeklyTotals = weeklyTotals;

  // Re-render the food item list for the newly selected day
  uiRenderer.renderModalDayDetailsList(
    modalState.historyModalFoodGroups,
    modalState.tempEditedDailyCounts[modalState.selectedDayInHistoryModal] ||
    {},
    modalState.tempEditedDailyCounts
  );

  // Update the day selector active state
  const modalDaySelectorBarEl =
    uiRenderer.domElements.modalElements.modalDaySelectorBar;
  if (modalDaySelectorBarEl) {
    uiRenderer.updateDaySelectorActiveState(
      modalDaySelectorBarEl,
      modalState.selectedDayInHistoryModal
    );
  }
}

/**
 * Handles +/- clicks or input changes for food items within the "Edit History Daily Details" modal
 * @param {Event} event - The click event from +/- buttons or change event from input
 */
function handleModalDailyDetailChange(event) {
  const button = event.target.closest(
    ".edit-decrement-btn, .edit-increment-btn"
  );

  if (
    !button ||
    !modalState.selectedDayInHistoryModal ||
    !modalState.tempEditedDailyCounts ||
    !modalState.editingHistoryWeekDataRef
  ) {
    return;
  }

  const itemElement = button.closest(".edit-totals-item");
  const groupId = itemElement?.dataset.id;

  if (!groupId) {
    logger.warn("handleModalDailyDetailChange: groupId not found on item.");
    return;
  }

  // Ensure the day's entry and food group entry exist in our temporary breakdown
  if (!modalState.tempEditedDailyCounts[modalState.selectedDayInHistoryModal]) {
    modalState.tempEditedDailyCounts[modalState.selectedDayInHistoryModal] = {};
  }

  let currentValue =
    parseInt(
      modalState.tempEditedDailyCounts[modalState.selectedDayInHistoryModal][
      groupId
      ],
      10
    ) || 0;

  // Update value based on button type
  if (button.classList.contains("edit-increment-btn")) {
    currentValue++;
  } else if (button.classList.contains("edit-decrement-btn")) {
    currentValue = Math.max(0, currentValue - 1);
  }

  // Update temporary state
  modalState.tempEditedDailyCounts[modalState.selectedDayInHistoryModal][
    groupId
  ] = currentValue;

  // Update display
  const totalSpan = itemElement.querySelector(".edit-current-total");
  if (totalSpan) {
    totalSpan.textContent = currentValue;
  }

  // Recalculate and update weekly totals
  const weeklyTotals = {};
  Object.values(modalState.tempEditedDailyCounts).forEach((dayData) => {
    Object.entries(dayData).forEach(([groupId, count]) => {
      weeklyTotals[groupId] = (weeklyTotals[groupId] || 0) + count;
    });
  });

  // Update the weekly total display in the current item
  const weeklySpan = itemElement.querySelector(".edit-weekly-total");
  if (weeklySpan) {
    weeklySpan.textContent = weeklyTotals[groupId] || 0;
  }

  // Update the badge color and number for the current item
  const weeklyBadge = itemElement.querySelector(".weekly-badge");
  if (weeklyBadge) {
    // Update the badge number
    const badgeValueSpan = weeklyBadge.querySelector(".wk-val");
    if (badgeValueSpan) {
      badgeValueSpan.textContent = weeklyTotals[groupId] || 0;
    }

    // Find the food group info
    const group = modalState.historyModalFoodGroups.find(
      (g) => g.id === groupId
    );
    if (group) {
      // Remove existing badge color classes
      weeklyBadge.classList.remove(
        "badge-primary",
        "badge-secondary",
        "badge-warning",
        "badge-danger"
      );

      // Calculate effective weekly target
      let effectiveWeeklyTarget;
      if (group.frequency === "week") {
        effectiveWeeklyTarget = group.target;
      } else if (group.frequency === "day") {
        effectiveWeeklyTarget = group.target * 7;
      } else {
        effectiveWeeklyTarget = group.target;
      }

      // Update badge color based on progress
      const weeklyTotal = weeklyTotals[groupId] || 0;
      if (group.type === "positive") {
        if (weeklyTotal >= effectiveWeeklyTarget) {
          weeklyBadge.classList.add("badge-primary");
        } else {
          weeklyBadge.classList.add("badge-secondary");
        }
      } else {
        // For limits
        if (weeklyTotal === 0) {
          weeklyBadge.classList.add("badge-secondary");
        } else if (weeklyTotal > effectiveWeeklyTarget) {
          weeklyBadge.classList.add("badge-danger");
        } else if (weeklyTotal > effectiveWeeklyTarget * 0.75) {
          weeklyBadge.classList.add("badge-warning");
        } else {
          weeklyBadge.classList.add("badge-secondary");
        }
      }
    }
  }

  modalState.editingHistoryWeekDataRef.weeklyTotals = weeklyTotals;
}

/**
 * Save changes from history daily details modal
 */
async function saveEditedHistoryDailyDetails() {
  if (!modalState.editingHistoryWeekDataRef) {
    logger.error("Cannot save, editing context is missing.");
    return;
  }

  try {
    const editedWeekData = { ...modalState.editingHistoryWeekDataRef };

    editedWeekData.dailyCounts = JSON.parse(
      JSON.stringify(modalState.tempEditedDailyCounts)
    );

    const weeklyTotals = {};
    Object.values(editedWeekData.dailyCounts).forEach((dayData) => {
      Object.entries(dayData).forEach(([groupId, count]) => {
        weeklyTotals[groupId] = (weeklyTotals[groupId] || 0) + count;
      });
    });
    editedWeekData.weeklyTotals = weeklyTotals;

    if (!editedWeekData.metadata) editedWeekData.metadata = {};
    editedWeekData.metadata.updatedAt = Date.now();

    // ======================= START OF FIX =======================
    // **Explicitly mark this specific record as needing a sync.**
    // The `getDirtyWeekHistory` function looks for this status.
    editedWeekData.metadata.syncStatus = "dirty";
    // ======================== END OF FIX ========================

    // 1. Save the updated and now "dirty" record to the database
    await dataService.saveWeekHistory(editedWeekData, {
      foodGroups: stateManager.getState().foodGroups,
      updatedAt: editedWeekData.metadata.updatedAt,
    });

    // 2. Update the state directly to reflect the change immediately
    const currentState = stateManager.getState();
    const historyIndex = currentState.history.findIndex(
      (week) => week.weekStartDate === editedWeekData.weekStartDate
    );

    if (historyIndex !== -1) {
      const updatedHistory = [...currentState.history];
      updatedHistory[historyIndex] = editedWeekData;

      stateManager.dispatch({
        type: stateManager.ACTION_TYPES.SET_HISTORY,
        payload: { history: updatedHistory },
      });
    }

    // ======================= START OF FIX =======================
    // The payload for UPDATE_METADATA must be a nested object
    // to match what the reducer expects.
    stateManager.dispatch({
      type: stateManager.ACTION_TYPES.UPDATE_METADATA,
      payload: {
        metadata: {
          historyDirty: true,
          lastModified: Date.now()
        }
      },
    });
    // ======================== END OF FIX ========================

    uiRenderer.showToast("History week details updated.", "success");
    closeEditHistoryDailyDetailsModal();

  } catch (error) {
    logger.error("Error saving edited history daily details:", error);
    uiRenderer.showToast("Error saving changes. Please try again.", "error");
  }
}

/**
 * Close the history daily details modal
 */
function closeEditHistoryDailyDetailsModal() {
  uiRenderer.closeEditTotalsModal(); // Call the uiRenderer function to hide the modal

  // Reset temporary editing state
  modalState.editingHistoryWeekDataRef = null;
  modalState.tempEditedDailyCounts = {};
  modalState.selectedDayInHistoryModal = null;
  modalState.historyModalFoodGroups = [];
}

// =============================================================================
// PUBLIC API
// =============================================================================

export default {
  initialize,
  openEditHistoryDailyDetailsModal,
  closeEditHistoryDailyDetailsModal,
  handleModalDayNavigation,
  handleModalDailyDetailChange,
  saveEditedHistoryDailyDetails,
};

// Named exports for convenience
export {
  initialize,
  openEditHistoryDailyDetailsModal,
  closeEditHistoryDailyDetailsModal,
  handleModalDayNavigation,
  handleModalDailyDetailChange,
  saveEditedHistoryDailyDetails,
};
