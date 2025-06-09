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
 * ModalManager - Centralized modal management for the application
 */

import stateManager from "./stateManager.js";
import uiRenderer from "./uiRenderer.js";
import dateUtils from "./dateUtils.js";
import dataService from "./dataService.js";
import logger from "./logger.js";

// Modal state management
let modalState = {
  // Edit Totals Modal state
  editingSource: null, // 'current' or 'history'
  editingWeekDataRef: null,
  editedTotals: {},

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
  logger.debug("ModalManager initialized");
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
 * Handle modal click events - routes to appropriate handler based on modal type
 * @param {Event} event - The click event
 */
function handleModalClick(event) {
  if (modalState.editingHistoryWeekDataRef) {
    // We're in history daily details mode
    handleModalDailyDetailChange(event);
  } else {
    // We're in edit totals mode
    handleEditTotalsItemClick(event);
  }
}

/**
 * Handle modal save events - routes to appropriate handler based on modal type
 */
async function handleModalSave() {
  logger.debug("handleModalSave called", {
    editingHistoryWeekDataRef: !!modalState.editingHistoryWeekDataRef,
    editingWeekDataRef: !!modalState.editingWeekDataRef,
    editingSource: modalState.editingSource,
  });

  if (modalState.editingHistoryWeekDataRef) {
    // We're in history daily details mode
    logger.debug("Calling saveEditedHistoryDailyDetails");
    await saveEditedHistoryDailyDetails();
  } else {
    // We're in edit totals mode
    logger.debug("Calling saveEditedTotals");
    await saveEditedTotals();
  }
}

/**
 * Handle modal cancel events - routes to appropriate handler based on modal type
 */
function handleModalCancel() {
  if (modalState.editingHistoryWeekDataRef) {
    // We're in history daily details mode
    closeEditHistoryDailyDetailsModal();
  } else {
    // We're in edit totals mode
    closeEditTotalsModal();
  }
}

// =============================================================================
// EDIT TOTALS MODAL
// =============================================================================

/**
 * Open the edit totals modal
 * @param {string} source - Source of data ('current' or 'history')
 */
function openEditTotalsModal(source) {
  const state = stateManager.getState();
  let title = "Edit Weekly Totals";
  let dataToEdit = null;

  if (source === "current") {
    modalState.editingWeekDataRef = state;
    dataToEdit = state.weeklyCounts;
    const weekStartDate = new Date(`${state.currentWeekStartDate}T00:00:00`);
    title = `Edit Totals: Week of ${weekStartDate.toLocaleDateString(
      undefined,
      { month: "short", day: "numeric", year: "numeric" }
    )}`;
    modalState.editingSource = "current";
  } else if (source === "history") {
    if (
      state.currentHistoryIndex === -1 ||
      !state.history[state.currentHistoryIndex]
    ) {
      uiRenderer.showToast("No history week selected to edit.", "error");
      return;
    }

    modalState.editingWeekDataRef = state.history[state.currentHistoryIndex];
    dataToEdit = modalState.editingWeekDataRef.totals;
    const historyWeekDate = new Date(
      `${modalState.editingWeekDataRef.weekStartDate}T00:00:00`
    );
    title = `Edit Totals: Week of ${historyWeekDate.toLocaleDateString(
      undefined,
      { month: "short", day: "numeric", year: "numeric" }
    )}`;
    modalState.editingSource = "history";
  } else {
    logger.error("Invalid source for edit modal:", source);
    return;
  }

  // Deep copy the totals to the temporary editing object
  modalState.editedTotals = JSON.parse(JSON.stringify(dataToEdit || {}));

  // Ensure all food groups have an entry in editedTotals
  state.foodGroups.forEach((group) => {
    if (!(group.id in modalState.editedTotals)) {
      modalState.editedTotals[group.id] = 0;
    }
  });

  // Update the modal title
  const domElements = uiRenderer.domElements;
  if (domElements.modalElements.editTotalsTitle) {
    domElements.modalElements.editTotalsTitle.textContent = title;
  }

  // Render the edit totals list
  renderEditTotalsList();

  // Show the modal
  if (domElements.modalElements.editTotalsModal) {
    domElements.modalElements.editTotalsModal.classList.add("modal-open");
  }
}

/**
 * Render the edit totals list in the modal
 */
function renderEditTotalsList() {
  const domElements = uiRenderer.domElements;
  if (
    !domElements.modalElements.editTotalsList ||
    !domElements.modalElements.editTotalsItemTemplate
  ) {
    return;
  }

  // Clear previous items
  domElements.modalElements.editTotalsList.innerHTML = "";

  // Get food groups from state
  const state = stateManager.getState();

  // Create an item for each food group
  state.foodGroups.forEach((group) => {
    const item = domElements.modalElements.editTotalsItemTemplate.content
      .cloneNode(true)
      .querySelector(".edit-totals-item");

    item.dataset.id = group.id;

    const nameSpan = item.querySelector(".edit-item-name");
    const totalSpan = item.querySelector(".edit-current-total");

    // Add data to buttons for easier access in handler
    const decBtn = item.querySelector(".edit-decrement-btn");
    const incBtn = item.querySelector(".edit-increment-btn");

    if (decBtn) decBtn.dataset.groupId = group.id;
    if (incBtn) incBtn.dataset.groupId = group.id;

    // Set content
    if (nameSpan) nameSpan.textContent = group.name;
    if (totalSpan)
      totalSpan.textContent = modalState.editedTotals[group.id] || 0;

    // Add to list
    domElements.modalElements.editTotalsList.appendChild(item);
  });
}

/**
 * Handle clicks in the edit totals modal
 * @param {Event} event - The click event
 */
function handleEditTotalsItemClick(event) {
  const button = event.target.closest(
    ".edit-decrement-btn, .edit-increment-btn"
  );
  if (!button) return;

  const groupId = button.dataset.groupId;
  if (!groupId) {
    logger.error("Edit button clicked, but no groupId found in dataset.");
    return;
  }

  // Get current value
  let currentValue = modalState.editedTotals[groupId] || 0;

  // Update value based on button type
  if (button.classList.contains("edit-increment-btn")) {
    currentValue++;
  } else if (button.classList.contains("edit-decrement-btn")) {
    currentValue = Math.max(0, currentValue - 1);
  }

  // Update temporary state
  modalState.editedTotals[groupId] = currentValue;

  // Update display
  const itemElement = button.closest(".edit-totals-item");
  if (itemElement) {
    const totalSpan = itemElement.querySelector(".edit-current-total");
    if (totalSpan) {
      totalSpan.textContent = currentValue;
    }
  }
}

/**
 * Save changes from edit totals modal
 */
async function saveEditedTotals() {
  if (!modalState.editingSource || !modalState.editingWeekDataRef) {
    logger.error("Cannot save, editing context is missing.");
    uiRenderer.showToast("Error saving changes.", "error");
    closeEditTotalsModal();
    return;
  }

  try {
    // Get a deep copy of edited totals
    const finalTotals = JSON.parse(JSON.stringify(modalState.editedTotals));

    if (modalState.editingSource === "current") {
      // Update state weekly counts
      for (const [groupId, count] of Object.entries(finalTotals)) {
        stateManager.updateWeeklyCount(groupId, count);
      }

      // Force dirty flag explicitly after batch edit
      const currentState = stateManager.getState();
      if (currentState.metadata) {
        stateManager.dispatch({
          type: stateManager.ACTION_TYPES.UPDATE_METADATA,
          payload: {
            metadata: {
              currentWeekDirty: true,
              lastModified: Date.now(),
            },
          },
        });
        logger.info(
          "Explicitly set currentWeekDirty flag after edit totals save"
        );
      }

      uiRenderer.showToast("Current week totals updated.", "success");
    } else if (modalState.editingSource === "history") {
      // Update the totals in the history object
      modalState.editingWeekDataRef.totals = finalTotals;

      // Ensure we have proper metadata with current timestamp
      if (!modalState.editingWeekDataRef.metadata) {
        modalState.editingWeekDataRef.metadata = {};
      }
      modalState.editingWeekDataRef.metadata.updatedAt = Date.now();

      // Save to database
      await dataService.saveWeekHistory(modalState.editingWeekDataRef, {
        foodGroups: stateManager.getState().foodGroups,
        updatedAt: modalState.editingWeekDataRef.metadata.updatedAt,
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

      uiRenderer.showToast("History week totals updated.", "success");
    }

    closeEditTotalsModal();
  } catch (error) {
    logger.error("Error saving edited totals:", error);
    uiRenderer.showToast("Error saving changes. Please try again.", "error");
  }
}

/**
 * Close the edit totals modal
 */
function closeEditTotalsModal() {
  const domElements = uiRenderer.domElements;
  if (domElements.modalElements.editTotalsModal) {
    domElements.modalElements.editTotalsModal.classList.remove("modal-open");
  }

  // Reset temporary editing state
  modalState.editingWeekDataRef = null;
  modalState.editingSource = null;
  modalState.editedTotals = {};

  if (domElements.modalElements.editTotalsList) {
    domElements.modalElements.editTotalsList.innerHTML = "";
  }
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
  openEditTotalsModal,
  closeEditTotalsModal,
  openEditHistoryDailyDetailsModal,
  closeEditHistoryDailyDetailsModal,
  handleModalDayNavigation,
  handleModalDailyDetailChange,
  saveEditedTotals,
  saveEditedHistoryDailyDetails,
  handleEditTotalsItemClick,
};

// Named exports for convenience
export {
  initialize,
  openEditTotalsModal,
  closeEditTotalsModal,
  openEditHistoryDailyDetailsModal,
  closeEditHistoryDailyDetailsModal,
  handleModalDayNavigation,
  handleModalDailyDetailChange,
  saveEditedTotals,
  saveEditedHistoryDailyDetails,
  handleEditTotalsItemClick,
};
