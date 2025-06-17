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
import uiRenderer from "../uiRenderer.js";
import dateUtils from "../utils/dateUtils.js";
import dataService from "./dataService.js";
import logger from "./logger.js";

// Modal state management
let modalState = {
  // History Daily Details Modal state
  editingHistoryWeekDataRef: null,
  tempEditedDailyBreakdown: {},
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

  // Deep copy the dailyBreakdown for temporary editing
  modalState.tempEditedDailyBreakdown = JSON.parse(
    JSON.stringify(modalState.editingHistoryWeekDataRef.dailyBreakdown || {})
  );

  const weekStartDateObj = new Date(
    modalState.editingHistoryWeekDataRef.weekStartDate + "T00:00:00"
  );
  const daysOfThisHistoricalWeek = [];

  // Ensure tempEditedDailyBreakdown has entries for all 7 days of the week
  for (let i = 0; i < 7; i++) {
    const dayObj = new Date(weekStartDateObj);
    dayObj.setDate(weekStartDateObj.getDate() + i);
    const dayStr = dateUtils.formatDateToYYYYMMDD(dayObj);
    daysOfThisHistoricalWeek.push(dayStr);
    if (!modalState.tempEditedDailyBreakdown[dayStr]) {
      modalState.tempEditedDailyBreakdown[dayStr] = {};
    }
  }

  // Calculate initial weekly totals from dailyBreakdown
  const initialWeeklyTotals = {};
  Object.values(modalState.tempEditedDailyBreakdown).forEach((dayData) => {
    Object.entries(dayData).forEach(([groupId, count]) => {
      initialWeeklyTotals[groupId] =
        (initialWeeklyTotals[groupId] || 0) + count;
    });
  });

  // Update the history record's totals
  modalState.editingHistoryWeekDataRef.totals = initialWeeklyTotals;

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
    modalState.tempEditedDailyBreakdown[modalState.selectedDayInHistoryModal] ||
      {},
    modalState.tempEditedDailyBreakdown
  );
}

/**
 * Handles navigation between days within the "Edit History Daily Details" modal
 * @param {string} newSelectedDayStr - The YYYY-MM-DD of the day selected in the modal's day bar
 */
function handleModalDayNavigation(newSelectedDayStr) {
  if (
    !modalState.editingHistoryWeekDataRef ||
    !modalState.tempEditedDailyBreakdown
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
  Object.values(modalState.tempEditedDailyBreakdown).forEach((dayData) => {
    Object.entries(dayData).forEach(([groupId, count]) => {
      weeklyTotals[groupId] = (weeklyTotals[groupId] || 0) + count;
    });
  });
  modalState.editingHistoryWeekDataRef.totals = weeklyTotals;

  // Re-render the food item list for the newly selected day
  uiRenderer.renderModalDayDetailsList(
    modalState.historyModalFoodGroups,
    modalState.tempEditedDailyBreakdown[modalState.selectedDayInHistoryModal] ||
      {},
    modalState.tempEditedDailyBreakdown
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
    !modalState.tempEditedDailyBreakdown ||
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
  if (
    !modalState.tempEditedDailyBreakdown[modalState.selectedDayInHistoryModal]
  ) {
    modalState.tempEditedDailyBreakdown[modalState.selectedDayInHistoryModal] =
      {};
  }

  let currentValue =
    parseInt(
      modalState.tempEditedDailyBreakdown[modalState.selectedDayInHistoryModal][
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
  modalState.tempEditedDailyBreakdown[modalState.selectedDayInHistoryModal][
    groupId
  ] = currentValue;

  // Update display
  const totalSpan = itemElement.querySelector(".edit-current-total");
  if (totalSpan) {
    totalSpan.textContent = currentValue;
  }

  // Recalculate and update weekly totals
  const weeklyTotals = {};
  Object.values(modalState.tempEditedDailyBreakdown).forEach((dayData) => {
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

  modalState.editingHistoryWeekDataRef.totals = weeklyTotals;
}

/**
 * Save changes from history daily details modal
 */
async function saveEditedHistoryDailyDetails() {
  if (
    !modalState.editingHistoryWeekDataRef ||
    !modalState.tempEditedDailyBreakdown
  ) {
    logger.error(
      "Cannot save history daily details, editing context is missing."
    );
    uiRenderer.showToast("Error saving changes.", "error");
    closeEditHistoryDailyDetailsModal();
    return;
  }

  try {
    // Apply the temporary changes to the actual history object
    modalState.editingHistoryWeekDataRef.dailyBreakdown = JSON.parse(
      JSON.stringify(modalState.tempEditedDailyBreakdown)
    );

    // Recalculate weekly totals
    const weeklyTotals = {};
    Object.values(modalState.editingHistoryWeekDataRef.dailyBreakdown).forEach(
      (dayData) => {
        Object.entries(dayData).forEach(([groupId, count]) => {
          weeklyTotals[groupId] = (weeklyTotals[groupId] || 0) + count;
        });
      }
    );
    modalState.editingHistoryWeekDataRef.totals = weeklyTotals;

    // Update metadata
    if (!modalState.editingHistoryWeekDataRef.metadata) {
      modalState.editingHistoryWeekDataRef.metadata = {};
    }
    modalState.editingHistoryWeekDataRef.metadata.updatedAt = Date.now();

    // Save to database
    await dataService.saveWeekHistory(modalState.editingHistoryWeekDataRef, {
      foodGroups: stateManager.getState().foodGroups,
      updatedAt: modalState.editingHistoryWeekDataRef.metadata.updatedAt,
    });

    // Mark history as dirty for sync
    stateManager.dispatch({
      type: stateManager.ACTION_TYPES.UPDATE_METADATA,
      payload: {
        metadata: {
          historyDirty: true,
          lastModified: Date.now(),
        },
      },
    });

    uiRenderer.showToast("History week details updated.", "success");
    closeEditHistoryDailyDetailsModal();

    // Reload history data from database and update state to reflect changes
    try {
      const updatedHistoryData = await dataService.getAllWeekHistory();
      stateManager.dispatch({
        type: stateManager.ACTION_TYPES.SET_HISTORY,
        payload: { history: updatedHistoryData },
      });
      // UI will automatically re-render via state subscription
    } catch (error) {
      logger.error("Error reloading history after save:", error);
      // Fallback to manual refresh if history reload fails
      uiRenderer.renderHistory();
    }
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
  modalState.tempEditedDailyBreakdown = {};
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
