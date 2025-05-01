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

import dataService from "./dataService.js";
import stateManager from "./stateManager.js";

/**
 * UIRenderer - Responsible for rendering UI components based on application state
 */

// DOM Elements cache - populated during initialization
const domElements = {
  views: {},
  navButtons: null,
  trackerElements: {
    dailyGoalsList: null,
    weeklyGoalsList: null,
    dailyGoalsDateEl: null,
    weeklyGoalsDateEl: null,
    foodGroupTemplate: null,
  },
  currentWeekElements: {
    currentWeekStartDateEl: null,
    currentWeekSummaryContent: null,
    editCurrentWeekBtn: null,
  },
  historyElements: {
    historyContent: null,
    historyWeekLabel: null,
    prevWeekBtn: null,
    nextWeekBtn: null,
    historyDatePicker: null,
    editHistoryWeekBtn: null,
  },
  modalElements: {
    genericModal: null,
    modalTitle: null,
    modalBody: null,
    modalCloseBtn: null,
    editTotalsModal: null,
    editTotalsTitle: null,
    editTotalsList: null,
    editTotalsItemTemplate: null,
  },
  toastElements: {
    toastContainer: null,
    toastMessage: null,
  },
};

let toastTimeout = null; // For managing toast hide timer

/**
 * Initialize the UI renderer by caching DOM elements
 */
function initialize() {
  // Cache main view elements
  domElements.views = {
    tracker: document.getElementById("tracker-view"),
    "current-week": document.getElementById("current-week-view"),
    history: document.getElementById("history-view"),
  };

  // Cache tab bar elements
  domElements.tabBar = {
    container: document.querySelector(".tab-bar-container"),
    navButtons: document.querySelectorAll(".tab-bar .tab-item[data-view]"),
    menuBtn: document.getElementById("tab-menu-btn"),
  };

  // Cache tracker view elements
  domElements.trackerElements = {
    foodItemsList: document.getElementById("food-items-list"),
    trackerDateEl: document.getElementById("tracker-date"),
    foodGroupTemplate: document.getElementById("food-group-item-template"),
  };

  // Cache current week view elements
  domElements.currentWeekElements = {
    currentWeekStartDateEl: document.getElementById("current-week-start-date"),
    currentWeekSummaryContent: document.getElementById(
      "current-week-summary-content"
    ),
    editCurrentWeekBtn: document.getElementById("edit-current-week-btn"),
  };

  // Cache history view elements
  domElements.historyElements = {
    historyContent: document.getElementById("history-content"),
    historyWeekLabel: document.getElementById("history-week-label"),
    prevWeekBtn: document.getElementById("prev-week-btn"),
    nextWeekBtn: document.getElementById("next-week-btn"),
    historyDatePicker: document.getElementById("history-date-picker"),
    editHistoryWeekBtn: document.getElementById("edit-history-week-btn"),
  };

  // Cache modal elements
  domElements.modalElements = {
    genericModal: document.getElementById("generic-modal"),
    modalTitle: document.getElementById("modal-title"),
    modalBody: document.getElementById("modal-body"),
    modalCloseBtn: document.getElementById("modal-close-btn"),
    editTotalsModal: document.getElementById("edit-totals-modal"),
    editTotalsTitle: document.getElementById("edit-totals-title"),
    editTotalsList: document.getElementById("edit-totals-list"),
    editTotalsItemTemplate: document.getElementById(
      "edit-totals-item-template"
    ),
  };

  // Cache toast elements
  domElements.toastElements = {
    toastContainer: document.getElementById("toast-container"),
    toastMessage: document.getElementById("toast-message"),
  };

  // Log initialization status
  if (allRequiredElementsCached()) {
    console.log("UI Renderer initialized successfully");
  } else {
    console.warn("UI Renderer initialized with missing elements");
  }

  // Subscribe to state changes
  stateManager.subscribe(handleStateChange);
}

/**
 * Check if all required DOM elements are cached
 * @returns {boolean} True if all required elements are cached
 */
function allRequiredElementsCached() {
  // Check main views
  if (
    !domElements.views.tracker ||
    !domElements.views["current-week"] ||
    !domElements.views.history
  ) {
    console.warn("Missing main view elements");
    return false;
  }

  // Check tracker elements
  if (
    !domElements.trackerElements.foodItemsList ||
    !domElements.trackerElements.foodGroupTemplate
  ) {
    console.warn("Missing tracker elements");
    return false;
  }

  // Check current week elements
  if (!domElements.currentWeekElements.currentWeekSummaryContent) {
    console.warn("Missing current week elements");
    return false;
  }

  // Check history elements
  if (!domElements.historyElements.historyContent) {
    console.warn("Missing history elements");
    return false;
  }

  return true;
}

/**
 * Handle state changes by updating the UI
 * @param {Object} state - The current state
 * @param {Object} action - The action that caused the state change
 */
function handleStateChange(state, action) {
  console.log(`State changed due to action: ${action.type}`);

  // Determine what to render based on the action type
  switch (action.type) {
    case stateManager.ACTION_TYPES.INITIALIZE_STATE:
      renderEverything();
      break;

    case stateManager.ACTION_TYPES.UPDATE_DAILY_COUNT:
    case stateManager.ACTION_TYPES.UPDATE_WEEKLY_COUNT:
      renderTrackerItems();
      renderCurrentWeekSummary();
      break;

    case stateManager.ACTION_TYPES.RESET_DAILY_COUNTS:
      renderTrackerItems();
      break;

    case stateManager.ACTION_TYPES.RESET_WEEKLY_COUNTS:
      renderTrackerItems();
      renderCurrentWeekSummary();
      break;

    case stateManager.ACTION_TYPES.SET_CURRENT_DAY:
    case stateManager.ACTION_TYPES.SET_CURRENT_WEEK:
      renderDateElements();
      break;

    case stateManager.ACTION_TYPES.SET_HISTORY:
      renderHistory();
      break;

    case stateManager.ACTION_TYPES.SET_HISTORY_INDEX:
      renderHistory();
      break;

    case stateManager.ACTION_TYPES.IMPORT_STATE:
      renderEverything();
      break;

    default:
      // For unknown actions, re-render everything to be safe
      renderEverything();
      break;
  }
}

/**
 * Render all UI components
 */
function renderEverything() {
  renderDateElements();
  renderTrackerItems();
  renderCurrentWeekSummary();
  renderHistory();
}

/**
 * Render date elements across the UI
 */
function renderDateElements() {
  try {
    const state = stateManager.getState();

    // Format the current day date
    const displayDate = new Date(`${state.currentDayDate}T00:00:00`);

    // Update daily goals date element
    if (domElements.trackerElements.trackerDateEl) {
      domElements.trackerElements.trackerDateEl.textContent =
        `${displayDate.toLocaleDateString(undefined, { weekday: "short" })}, ` +
        `${displayDate.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}`;
    }

    // Format the week start date
    const weekStartDateDisplay = new Date(
      `${state.currentWeekStartDate}T00:00:00`
    );

    // Update current week start date element
    if (domElements.currentWeekElements.currentWeekStartDateEl) {
      domElements.currentWeekElements.currentWeekStartDateEl.textContent =
        `Starts ${weekStartDateDisplay.toLocaleDateString(undefined, {
          weekday: "short",
        })}, ` +
        `${weekStartDateDisplay.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}`;
    }
  } catch (error) {
    console.error("Error rendering date elements:", error);

    // Handle error display
    if (domElements.trackerElements.trackerDateEl) {
      domElements.trackerElements.trackerDateEl.textContent = "(Error)";
    }
  }
}

/**
 * Render the tracker items in the unified food tracker view
 */
function renderTrackerItems() {
  const state = stateManager.getState();
  const foodItemsList = document.getElementById("food-items-list");
  const foodGroupTemplate = document.getElementById("food-group-item-template");
  const dateElement = document.getElementById("tracker-date");

  // Ensure we have the required elements
  if (!foodItemsList || !foodGroupTemplate) {
    console.error("Missing required elements for renderTrackerItems");
    return;
  }

  // Update date display
  if (dateElement) {
    const displayDate = new Date(`${state.currentDayDate}T00:00:00`);
    dateElement.textContent =
      `${displayDate.toLocaleDateString(undefined, { weekday: "short" })}, ` +
      `${displayDate.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })}`;
  }

  // Clear the list
  foodItemsList.innerHTML = "";

  // Render each food group
  state.foodGroups.forEach((group) => {
    // Clone the template
    const item = foodGroupTemplate.content
      .cloneNode(true)
      .querySelector(".food-group-item");

    // Set basic properties
    item.dataset.id = group.id;

    // Get elements
    const nameElement = item.querySelector(".name");
    const weeklyBadge = item.querySelector(".weekly-badge");
    const weeklyBadgeValue = item.querySelector(".weekly-badge .wk-val");

    // Set name
    nameElement.textContent = group.name;

    // Set info button data
    const infoBtn = item.querySelector(".info-btn");
    if (infoBtn) {
      infoBtn.dataset.groupId = group.id;
    }

    // Format target description
    let targetDesc = "";
    const targetVal = group.target;
    const freqText = group.frequency === "day" ? "day" : "week";
    const unitText = group.unit || "servings";

    if (group.type === "positive") {
      targetDesc = `Target: ≥ ${targetVal} ${unitText}/${freqText}`;
    } else {
      targetDesc = `Limit: ≤ ${targetVal} ${unitText}/${freqText}`;
      if (group.isOptional) targetDesc += " (optional)";
    }

    item.querySelector(".target").textContent = targetDesc;

    // Set up count input
    const countInput = item.querySelector(".count-input");
    const frequency = group.frequency; // 'day' or 'week'

    // Always show today's count (daily) in the input
    countInput.value = state.dailyCounts[group.id] || 0;
    countInput.dataset.frequency = frequency;
    countInput.dataset.groupid = group.id;

    // Always show weekly badge for all items
    if (weeklyBadge) {
      const weeklyCount = state.weeklyCounts[group.id] || 0;
      weeklyBadgeValue.textContent = weeklyCount;
      weeklyBadge.style.display = "inline-flex";

      // Apply color coding to the badge based on progress
      updateBadgeColor(weeklyBadge, group, weeklyCount);
    }

    // Add the item to the list
    foodItemsList.appendChild(item);
  });
}

/**
 * Update the badge color based on the progress
 * @param {HTMLElement} badge - The badge element
 * @param {Object} group - The food group data
 * @param {number} count - The current count
 */
function updateBadgeColor(badge, group, count) {
  // Remove existing color classes
  badge.classList.remove(
    "badge-primary",
    "badge-secondary",
    "badge-warning",
    "badge-danger"
  );

  // Get current day of the week (0-6, where 0 is Sunday)
  const state = stateManager.getState();
  const currentDate = new Date(`${state.currentDayDate}T00:00:00`);
  const weekStartDate = new Date(`${state.currentWeekStartDate}T00:00:00`);
  const daysSinceWeekStart = Math.floor(
    (currentDate - weekStartDate) / (24 * 60 * 60 * 1000)
  );
  const daysIntoWeek = Math.max(0, daysSinceWeekStart) + 1; // Add 1 to include current day

  // Determine which color to use based on progress
  if (group.type === "positive") {
    // Target-based item
    if (
      count >=
      group.target * (group.frequency === "day" ? daysIntoWeek : 1)
    ) {
      // Target met or exceeded for current point in week
      badge.classList.add("badge-primary");
    } else {
      // Target in progress
      badge.classList.add("badge-secondary");
    }
  } else {
    // Limit-based item

    // Special case: if count is 0, always use secondary color (not warning)
    if (count === 0) {
      badge.classList.add("badge-secondary");
      return;
    }

    // Calculate the prorated max for daily items
    const maxAllowed =
      group.frequency === "day"
        ? group.target * daysIntoWeek // Daily limit × days into week
        : group.target; // Weekly limit as is

    if (count > maxAllowed) {
      // Limit exceeded for current point in week
      badge.classList.add("badge-danger");
    } else if (count >= maxAllowed - 1) {
      // Within 1 of limit
      badge.classList.add("badge-warning");
    } else {
      // Well below limit
      badge.classList.add("badge-secondary");
    }
  }
}

/**
 * Render the current week summary using slim cards
 */
function renderCurrentWeekSummary() {
  const state = stateManager.getState();
  const { currentWeekSummaryContent, editCurrentWeekBtn } =
    domElements.currentWeekElements;

  // Ensure we have the required element
  if (!currentWeekSummaryContent) {
    console.error("Missing required element for renderCurrentWeekSummary");
    return;
  }

  // Clear previous content
  currentWeekSummaryContent.innerHTML = "";

  // Create cards container
  const cardsContainer = document.createElement("div");
  cardsContainer.className = "summary-cards";

  // Helper function to get effective weekly target
  const getWeeklyTarget = (group) => {
    if (group.frequency === "week") return group.target;
    if (group.frequency === "day") return group.target * 7; // 7 days per week
    return group.target; // Fallback for special cases
  };

  // Render each food group
  state.foodGroups.forEach((group) => {
    const card = document.createElement("div");
    card.className = "food-card";

    const currentTotal = state.weeklyCounts[group.id] || 0;
    const weeklyTarget = getWeeklyTarget(group);

    // For current week, only apply status classes for completed conditions
    let statusClass = "";

    if (group.type === "positive") {
      // Only apply goal-met to positive targets that have been achieved
      if (currentTotal >= weeklyTarget) statusClass = "goal-met";
      // Do not apply goal-missed since the week is still in progress
    } else {
      // For limits, only show warning/error states
      if (currentTotal > weeklyTarget) {
        statusClass = "limit-exceeded";
      } else if (
        currentTotal > weeklyTarget * 0.75 &&
        currentTotal <= weeklyTarget
      ) {
        statusClass = "limit-near";
      }
    }

    // Apply status class if assigned
    if (statusClass) card.classList.add(statusClass);

    // Create the card content
    card.innerHTML = `
      <div class="status-indicator"></div>
      <div class="card-content">
        <div class="card-food-name">${group.name}</div>
        <div class="metric-container">
          <div class="metric-label">SERVINGS</div>
          <div class="metric-value">${currentTotal}</div>
        </div>
        <div class="metric-container">
          <div class="metric-label">TARGET</div>
          <div class="metric-value">${
            group.type === "limit" ? "≤" : "≥"
          } ${weeklyTarget}</div>
        </div>
      </div>
    `;

    // Add the card to the container
    cardsContainer.appendChild(card);
  });

  // Add the cards container to the view
  currentWeekSummaryContent.appendChild(cardsContainer);

  // Enable the edit button if it exists
  if (editCurrentWeekBtn) {
    editCurrentWeekBtn.disabled = false;
  }
}

/**
 * Render the history view using slim cards
 * @param {number} weekIndex - Optional index to display (defaults to current state index)
 */
function renderHistory(weekIndex) {
  const state = stateManager.getState();
  const {
    historyContent,
    historyWeekLabel,
    prevWeekBtn,
    nextWeekBtn,
    historyDatePicker,
    editHistoryWeekBtn,
  } = domElements.historyElements;

  // Ensure we have the required element
  if (!historyContent) {
    console.error("Missing required element for renderHistory");
    return;
  }

  // Clear previous content
  historyContent.innerHTML = "";

  // Default to disabled edit button
  if (editHistoryWeekBtn) {
    editHistoryWeekBtn.disabled = true;
  }

  // Reset history UI elements
  if (historyWeekLabel) historyWeekLabel.textContent = "Select a week";
  if (prevWeekBtn) prevWeekBtn.disabled = true;
  if (nextWeekBtn) nextWeekBtn.disabled = true;
  if (historyDatePicker) historyDatePicker.value = "";

  // Check if we have any history data
  if (!state.history || state.history.length === 0) {
    historyContent.innerHTML = "<p>No history data available yet.</p>";
    if (historyWeekLabel) historyWeekLabel.textContent = "No History";
    return;
  }

  // Determine which index to display
  let displayIndex =
    weekIndex !== undefined ? weekIndex : state.currentHistoryIndex;

  // If index is invalid, default to most recent (index 0)
  if (displayIndex === -1 || displayIndex >= state.history.length) {
    displayIndex = 0;

    // Update the state with the corrected index
    stateManager.dispatch({
      type: stateManager.ACTION_TYPES.SET_HISTORY_INDEX,
      payload: { index: displayIndex },
    });
  }

  // Get the week data to display
  const weekData = state.history[displayIndex];
  if (!weekData) {
    historyContent.innerHTML =
      "<p>Error: Could not load selected week data.</p>";
    if (historyWeekLabel) historyWeekLabel.textContent = "Error";
    return;
  }

  // Enable the edit button now that we have valid data
  if (editHistoryWeekBtn) {
    editHistoryWeekBtn.disabled = false;
  }

  // Update navigation UI
  const weekStartDate = new Date(`${weekData.weekStartDate}T00:00:00`);

  if (historyWeekLabel) {
    historyWeekLabel.textContent = `Week of ${weekStartDate.toLocaleDateString(
      undefined,
      {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }
    )}`;
  }

  if (prevWeekBtn) {
    prevWeekBtn.disabled = displayIndex >= state.history.length - 1;
  }

  if (nextWeekBtn) {
    nextWeekBtn.disabled = displayIndex <= 0;
  }

  if (historyDatePicker) {
    historyDatePicker.value = weekData.weekStartDate;
  }

  // Create cards container
  const cardsContainer = document.createElement("div");
  cardsContainer.className = "summary-cards";

  // Use stored targets if available, otherwise use current config
  const targets =
    weekData.targets ||
    state.foodGroups.reduce((acc, group) => {
      acc[group.id] = {
        target: group.target,
        frequency: group.frequency,
        type: group.type,
        unit: group.unit,
        name: group.name,
      };
      return acc;
    }, {});

  // Get the list of food groups to display
  const foodGroupsToDisplay = state.foodGroups.filter(
    (group) =>
      targets[group.id] ||
      (weekData.totals && typeof weekData.totals[group.id] !== "undefined")
  );

  // Render each food group in the history view
  foodGroupsToDisplay.forEach((group) => {
    const groupId = group.id;
    const total = weekData.totals[groupId] || 0;
    const targetInfo = targets[groupId];

    if (!targetInfo) return; // Skip if no target info found

    // Calculate effective weekly target
    let effectiveWeeklyTarget;
    if (targetInfo.frequency === "week") {
      effectiveWeeklyTarget = targetInfo.target;
    } else if (targetInfo.frequency === "day") {
      effectiveWeeklyTarget = targetInfo.target * 7;
    } else {
      effectiveWeeklyTarget = targetInfo.target;
    }

    // Create card
    const card = document.createElement("div");
    card.className = "food-card";

    // In history view, always apply status classes since the weeks are complete
    let statusClass = "";
    if (targetInfo.type === "positive") {
      statusClass = total >= effectiveWeeklyTarget ? "goal-met" : "goal-missed";
    } else {
      // limit
      if (total <= effectiveWeeklyTarget) {
        statusClass = "limit-ok";
        if (effectiveWeeklyTarget > 0 && total > effectiveWeeklyTarget * 0.75) {
          statusClass = "limit-near";
        }
      } else {
        statusClass = "limit-exceeded";
      }
    }

    // Apply status class
    if (statusClass) card.classList.add(statusClass);

    // Create the card content
    card.innerHTML = `
      <div class="status-indicator"></div>
      <div class="card-content">
        <div class="card-food-name">${targetInfo.name || group.name}</div>
        <div class="metric-container">
          <div class="metric-label">SERVINGS</div>
          <div class="metric-value">${total}</div>
        </div>
        <div class="metric-container">
          <div class="metric-label">TARGET</div>
          <div class="metric-value">${
            targetInfo.type === "limit" ? "≤" : "≥"
          } ${effectiveWeeklyTarget}</div>
        </div>
      </div>
    `;

    // Add card to the container
    cardsContainer.appendChild(card);
  });

  // Add the cards container to the view
  historyContent.appendChild(cardsContainer);
}

/**
 * Set the active view
 * @param {string} viewId - The ID of the view to activate
 */
function setActiveView(viewId) {
  // Hide all views
  Object.values(domElements.views).forEach((view) => {
    if (view) view.classList.remove("active-view");
  });

  // Deactivate all tab buttons
  const tabButtons = document.querySelectorAll(".tab-bar .tab-item");
  tabButtons.forEach((button) => button.classList.remove("active"));

  // Show the selected view
  const activeView = domElements.views[viewId];
  if (activeView) {
    activeView.classList.add("active-view");
  } else {
    console.error(`Could not find view element for key: ${viewId}`);
  }

  // Activate the corresponding tab button
  const activeButton = document.querySelector(
    `.tab-bar button[data-view="${viewId}"]`
  );
  if (activeButton) {
    activeButton.classList.add("active");
  }

  // Handle view-specific actions
  if (viewId === "history") {
    renderHistory();
  } else if (viewId === "current-week") {
    renderCurrentWeekSummary();
  } else if (viewId === "tracker") {
    // Reset history edit button if on tracker view
    if (domElements.historyElements.editHistoryWeekBtn) {
      domElements.historyElements.editHistoryWeekBtn.disabled = true;
    }
  }

  // Close any open modals or menus
  closeModal();
  closeEditTotalsModal();
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The toast type ('success' or 'error')
 * @param {number} duration - The display duration in milliseconds
 */
function showToast(message, type = "success", duration = 3000) {
  const { toastMessage } = domElements.toastElements;

  if (!toastMessage) return;

  // Clear any existing timeout
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  // Reset classes
  toastMessage.className = "toast";

  // Set content and style
  toastMessage.textContent = message;
  toastMessage.classList.add(`toast-${type}`);
  toastMessage.classList.add("toast-show");

  // Set timeout to hide
  toastTimeout = setTimeout(() => {
    toastMessage.classList.remove("toast-show");
    toastTimeout = null;
  }, duration);
}

/**
 * Open the generic modal with the new header-style design
 * @param {string} title - The modal title
 * @param {string} htmlContent - The modal body content as HTML
 * @param {Object} options - Additional options for the modal
 * @param {boolean} options.showFooter - Whether to show a footer with buttons
 * @param {Array} options.buttons - Array of button configs [{label, id, class, onClick}]
 */
function openModal(title, htmlContent, options = {}) {
  const { genericModal, modalTitle, modalBody, modalCloseBtn } =
    domElements.modalElements;

  if (!genericModal || !modalBody) {
    console.error("Modal elements not found", { genericModal, modalBody });
    return;
  }

  // Set modal title - ensure it's visible and has content
  if (modalTitle) {
    modalTitle.textContent = title || "Dialog";
    modalTitle.style.display = "block"; // Make sure it's visible
  }

  // Clear and then set the modal body content
  if (modalBody) {
    // Ensure the body is properly reset and visible
    modalBody.style.display = "block";
    modalBody.innerHTML = ""; // Clear first

    // Add the content - handle both string and HTML content
    if (typeof htmlContent === "string") {
      modalBody.innerHTML = htmlContent;
    } else if (htmlContent instanceof Element) {
      modalBody.appendChild(htmlContent);
    } else {
      console.warn(
        "Invalid content type provided to modal:",
        typeof htmlContent
      );
      modalBody.textContent = "Content could not be displayed";
    }
  }

  // Handle optional footer with buttons
  const existingFooter = genericModal.querySelector(".modal-actions");
  if (existingFooter) {
    existingFooter.remove(); // Remove any existing footer
  }

  // Add footer if requested
  if (options.showFooter && options.buttons && options.buttons.length > 0) {
    const footer = document.createElement("div");
    footer.className = "modal-actions";

    // Add buttons to footer
    options.buttons.forEach((button) => {
      const btn = document.createElement("button");
      btn.textContent = button.label;
      btn.id = button.id || "";
      btn.className = button.class || "secondary-btn"; // Default to secondary

      if (button.onClick) {
        btn.addEventListener("click", button.onClick);
      }

      footer.appendChild(btn);
    });

    genericModal.querySelector(".modal-content").appendChild(footer);
  }

  // Show the modal
  genericModal.classList.add("modal-open");

  // Focus close button for accessibility
  if (modalCloseBtn) {
    modalCloseBtn.focus();
  }

  // Debug output
  console.log("Modal opened with title:", title);
  console.log("Modal content length:", htmlContent ? htmlContent.length : 0);
}

/**
 * Show a confirmation dialog
 * @param {Object} options - Dialog options
 * @param {string} options.title - Dialog title
 * @param {string} options.message - Main dialog message
 * @param {string} [options.confirmText='OK'] - Text for confirm button
 * @param {string} [options.cancelText='Cancel'] - Text for cancel button
 * @param {string} [options.details=null] - Optional details HTML
 * @param {string} [options.actionDesc=null] - Optional action description HTML
 * @returns {Promise<boolean>} Promise resolving to true if confirmed, false if canceled
 */
function showConfirmDialog(options) {
  return new Promise((resolve) => {
    const {
      title,
      message,
      confirmText = "OK",
      cancelText = "Cancel",
      details = null,
      actionDesc = null,
    } = options;

    // Prepare the dialog content
    let dialogContent = "";

    if (details) {
      dialogContent += `
        <div class="dialog-import-details">
          ${details}
        </div>
      `;
    }

    if (actionDesc) {
      dialogContent += `
        <div class="dialog-action-description">
          ${actionDesc}
        </div>
      `;
    }

    dialogContent += `<p>${message}</p>`;

    // Use openModal with the new options for footer buttons
    openModal(title, dialogContent, {
      showFooter: true,
      buttons: [
        {
          label: cancelText,
          id: "confirm-cancel-btn",
          class: "secondary-btn",
          onClick: () => {
            closeModal();
            resolve(false);
          },
        },
        {
          label: confirmText,
          id: "confirm-ok-btn",
          class: "primary-btn",
          onClick: () => {
            closeModal();
            resolve(true);
          },
        },
      ],
    });
  });
}

/**
 * Close the generic modal
 */
function closeModal() {
  const { genericModal } = domElements.modalElements;

  if (genericModal) {
    genericModal.classList.remove("modal-open");
  }
}

/**
 * Close the edit totals modal
 */
function closeEditTotalsModal() {
  const { editTotalsModal } = domElements.modalElements;

  if (editTotalsModal) {
    editTotalsModal.classList.remove("modal-open");
  }
}

// Export public API
export default {
  initialize,
  renderEverything,
  renderTrackerItems,
  renderCurrentWeekSummary,
  renderHistory,
  renderDateElements,
  setActiveView,
  showToast,
  openModal,
  showConfirmDialog,
  closeModal,
  closeEditTotalsModal,
};
