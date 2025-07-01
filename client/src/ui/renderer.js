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

import dataService from "../core/dataService.js";
import stateManager from "../core/stateManager.js";
import logger from "../core/logger.js";
import {
  renderFoodGroupItem,
  renderDaySelectorButton,
  renderCurrentWeekCard,
  renderHistoryCard,
  renderEditTotalsItem,
  renderSummaryCardsContainer,
  updateBadgeColor,
  formatDate,
  getBadgeClass,
  getCurrentWeekStatusClass,
  getHistoryStatusClass,
} from "./components.js";

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
    currentWeekStartDateEl: document.getElementById("current-week-start-date"),
    currentWeekSummaryContent: document.getElementById(
      "current-week-summary-content"
    ),
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
    modalSelectedDayDisplay: null,
    modalDaySelectorBar: null,
    editTotalsList: null,
    editTotalsItemTemplate: null,
    editTotalsCloseBtn: null,
    editTotalsCancelBtn: null,
    editTotalsSaveBtn: null,
  },
  toastElements: {
    toastContainer: null,
    toastMessage: null,
    toastSpinner: null,
    toastText: null,
  },
};

let toastTimeout = null; // For managing toast hide timer

// Reference to app manager for callbacks
let appManagerRef = null;

/**
 * Initialize the UI renderer by caching DOM elements
 * @param {Object} appManager - Reference to the app manager for callbacks
 */
function initialize(appManager = null) {
  appManagerRef = appManager;
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
    editTotalsTitle: document.getElementById("edit-totals-title"), // For "Week of..."
    modalSelectedDayDisplay: document.getElementById(
      "modal-selected-day-display"
    ), // For "Mon, 3/8"
    modalDaySelectorBar: document.getElementById("modal-day-selector-bar"), // Container for SMTWTFS buttons
    editTotalsList: document.getElementById("edit-totals-list"), // Where food group items go
    editTotalsItemTemplate: document.getElementById(
      "edit-totals-item-template"
    ),
    editTotalsCloseBtn: document.getElementById("edit-totals-close-btn"),
    editTotalsCancelBtn: document.getElementById("edit-totals-cancel-btn"),
    editTotalsSaveBtn: document.getElementById("edit-totals-save-btn"),
  };

  // Cache toast elements
  const toastMessageDiv = document.getElementById("toast-message");
  domElements.toastElements = {
    toastContainer: document.getElementById("toast-container"),
    toastMessage: document.getElementById("toast-message"),
    toastSpinner: toastMessageDiv
      ? toastMessageDiv.querySelector(".toast-spinner")
      : null,
    toastText: toastMessageDiv
      ? toastMessageDiv.querySelector(".toast-text")
      : null,
  };

  // Log initialization status
  if (allRequiredElementsCached()) {
    logger.info("UI Renderer initialized successfully");
  } else {
    logger.warn("UI Renderer initialized with missing elements");
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
    logger.warn("Missing main view elements");
    return false;
  }

  // Check tracker elements
  if (
    !domElements.trackerElements.foodItemsList ||
    !domElements.trackerElements.foodGroupTemplate
  ) {
    logger.warn("Missing tracker elements");
    return false;
  }

  // Check current week elements
  if (!domElements.currentWeekElements.currentWeekSummaryContent) {
    logger.warn("Missing current week elements");
    return false;
  }

  // Check history elements
  if (!domElements.historyElements.historyContent) {
    logger.warn("Missing history elements");
    return false;
  }

  return true;
}

/**
 * Renders a day selector bar (S, M, T, W, T, F, S).
 * @param {HTMLElement} parentElement - The DOM element to append the bar to.
 * @param {string} activeWeekStartDateStr - The YYYY-MM-DD of the start of the week.
 * @param {string} selectedDateStr - The YYYY-MM-DD of the currently selected day.
 * @param {Function} onDaySelectCallback - Function to call when a day button is clicked, passes new selected YYYY-MM-DD.
 * @param {string} weekStartDayPref - "Sunday" or "Monday", to determine day letters and order.
 * @param {boolean} [isModal=false] - True if rendering inside a modal for different styling.
 */
function renderDaySelectorBar(
  parentElement,
  activeWeekStartDateStr,
  selectedDateStr,
  onDaySelectCallback,
  weekStartDayPref = "Sunday",
  isModal = false
) {
  if (
    !parentElement ||
    !activeWeekStartDateStr ||
    !selectedDateStr ||
    typeof onDaySelectCallback !== "function"
  ) {
    logger.error("renderDaySelectorBar: Missing required parameters.", {
      parentElement,
      activeWeekStartDateStr,
      selectedDateStr,
      onDaySelectCallback,
    });
    return;
  }

  parentElement.innerHTML = ""; // Clear previous bar

  const dayLetters =
    weekStartDayPref === "Monday"
      ? ["M", "T", "W", "T", "F", "S", "S"]
      : ["S", "M", "T", "W", "T", "F", "S"];

  const dayAriaLabels =
    weekStartDayPref === "Monday"
      ? [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ]
      : [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];

  const weekStartDateObj = new Date(activeWeekStartDateStr + "T00:00:00");

  for (let i = 0; i < 7; i++) {
    const dayInWeekObj = new Date(weekStartDateObj);
    dayInWeekObj.setDate(weekStartDateObj.getDate() + i);

    const year = dayInWeekObj.getFullYear();
    const month = String(dayInWeekObj.getMonth() + 1).padStart(2, "0");
    const day = String(dayInWeekObj.getDate()).padStart(2, "0");
    const dayDateStr = `${year}-${month}-${day}`;

    const buttonHtml = renderDaySelectorButton(
      dayLetters[i],
      dayDateStr,
      dayDateStr === selectedDateStr,
      dayAriaLabels[i]
    );

    const button = document.createElement("div");
    button.innerHTML = buttonHtml;
    const buttonElement = button.firstElementChild;

    if (isModal) {
      buttonElement.classList.add("modal-day-selector-btn");
    }

    buttonElement.addEventListener("click", () => {
      // Visually update active button immediately for responsiveness before state change propagates
      parentElement
        .querySelectorAll(".day-selector-btn")
        .forEach((btn) => btn.classList.remove("active"));
      buttonElement.classList.add("active");
      onDaySelectCallback(dayDateStr);
    });

    parentElement.appendChild(buttonElement);
  }
}

/**
 * Handle state changes by updating the UI
 * @param {Object} state - The current state
 * @param {Object} action - The action that caused the state change
 */
function handleStateChange(state, action) {
  logger.debug(`State changed due to action: ${action.type}`);

  // Determine what to render based on the action type
  switch (action.type) {
    case stateManager.ACTION_TYPES.INITIALIZE_STATE:
      renderEverything();
      break;

    case stateManager.ACTION_TYPES.SET_STATE:
      logger.trace("SET_STATE action detected - re-rendering everything");
      renderEverything();
      break;

    case stateManager.ACTION_TYPES.UPDATE_DAILY_COUNT:
      // case stateManager.ACTION_TYPES.UPDATE_WEEKLY_COUNT:
      renderTrackerItems();
      renderCurrentWeekSummary();
      break;

    case stateManager.ACTION_TYPES.RESET_DAILY_COUNTS:
      renderTrackerItems();
      renderCurrentWeekSummary();
      break;

    case stateManager.ACTION_TYPES.RESET_WEEKLY_COUNTS:
    case stateManager.ACTION_TYPES.RECALCULATE_WEEKLY_TOTALS:
      renderDateElements(); // Date might have changed as part of weekly reset
      renderTrackerItems();
      renderCurrentWeekSummary();
      break;

    case stateManager.ACTION_TYPES.SET_CURRENT_DAY:
    case stateManager.ACTION_TYPES.SET_CURRENT_WEEK:
    case stateManager.ACTION_TYPES.SET_SELECTED_TRACKER_DATE: // New case
      renderDateElements(); // Update main date display
      renderTrackerItems(); // Re-render list for new selected date
      // Current week summary doesn't change on selectedTrackerDate change alone
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

    case "BATCH_COMPLETE":
      // Handle batched updates by re-rendering everything
      renderEverything();
      break;

    default:
      // For unknown actions, re-render everything to be safe
      logger.debug(
        `Unknown action type: ${action.type} - re-rendering everything`
      );
      renderEverything();
      break;
  }
}

/**
 * Render all UI components
 */
function renderEverything() {
  try {
    const state = stateManager.getState();
    logger.debug("renderEverything called with state:", {
      dayDate: state.currentDayDate,
      weekStartDate: state.currentWeekStartDate,
      selectedTrackerDate: state.selectedTrackerDate,
      dailyCountsKeys: Object.keys(state.dailyCounts || {}),
      weeklyCountsKeys: Object.keys(state.weeklyCounts || {}),
    });

    renderDateElements();
    renderTrackerItems();
    renderCurrentWeekSummary();
    renderHistory();

    logger.debug("renderEverything completed successfully");
  } catch (error) {
    logger.error("Error in renderEverything:", error);
    // Fallback: try to render individual components
    try {
      renderDateElements();
    } catch (e) {
      logger.error("Error rendering date elements:", e);
    }
    try {
      renderTrackerItems();
    } catch (e) {
      logger.error("Error rendering tracker items:", e);
    }
    try {
      renderCurrentWeekSummary();
    } catch (e) {
      logger.error("Error rendering current week summary:", e);
    }
    try {
      renderHistory();
    } catch (e) {
      logger.error("Error rendering history:", e);
    }
  }
}

/**
 * Render date elements across the UI
 */
function renderDateElements() {
  try {
    const state = stateManager.getState();

    if (
      domElements.trackerElements.trackerDateEl &&
      state.selectedTrackerDate
    ) {
      domElements.trackerElements.trackerDateEl.textContent = formatDate(
        state.selectedTrackerDate,
        "short"
      );
    } else if (domElements.trackerElements.trackerDateEl) {
      domElements.trackerElements.trackerDateEl.textContent = "Date not set";
    }

    // Current Week Summary date display remains based on currentWeekStartDate
    if (
      domElements.currentWeekElements.currentWeekStartDateEl &&
      state.currentWeekStartDate
    ) {
      domElements.currentWeekElements.currentWeekStartDateEl.textContent =
        formatDate(state.currentWeekStartDate, "short");
    } else if (domElements.currentWeekElements.currentWeekStartDateEl) {
      domElements.currentWeekElements.currentWeekStartDateEl.textContent =
        "Week not set";
    }
  } catch (error) {
    logger.error("Error rendering date elements:", error);
    if (domElements.trackerElements.trackerDateEl) {
      domElements.trackerElements.trackerDateEl.textContent =
        "(Error displaying date)";
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
  const daySelectorBarElement = document.getElementById(
    "tracker-day-selector-bar"
  );

  if (!foodItemsList || !foodGroupTemplate || !daySelectorBarElement) {
    logger.error(
      "Missing required elements for renderTrackerItems (foodItemsList, template, or daySelectorBarElement)"
    );
    return;
  }
  if (!state.selectedTrackerDate || !state.currentWeekStartDate) {
    logger.warn(
      "renderTrackerItems: selectedTrackerDate or currentWeekStartDate is not set in state. Skipping render."
    );
    foodItemsList.innerHTML = "<p>Select a date to view items.</p>"; // Or some placeholder
    daySelectorBarElement.innerHTML = ""; // Clear day selector if dates are missing
    return;
  }

  // Debug logging for daily counts
  const dailyCountsForSelectedDate =
    state.dailyCounts[state.selectedTrackerDate] || {};
  logger.debug(`renderTrackerItems for ${state.selectedTrackerDate}:`, {
    dailyCounts: dailyCountsForSelectedDate,
    weeklyCounts: state.weeklyCounts,
    foodGroupsCount: state.foodGroups?.length || 0,
  });

  // Render the Day Selector Bar for the Daily Tracker
  renderDaySelectorBar(
    daySelectorBarElement,
    state.currentWeekStartDate,
    state.selectedTrackerDate,
    (newSelectedDateStr) => {
      // onDaySelectCallback
      // Call the app manager's day selection handler
      if (
        appManagerRef &&
        typeof appManagerRef.handleTrackerDaySelect === "function"
      ) {
        appManagerRef.handleTrackerDaySelect(newSelectedDateStr);
      } else {
        logger.warn(
          "appManager.handleTrackerDaySelect not found. Day selection might not work."
        );
      }
    },
    state.metadata?.weekStartDay || "Sunday" // Pass the week start day preference
  );

  // Clear the list
  foodItemsList.innerHTML = "";

  state.foodGroups.forEach((group) => {
    const dailyCount = dailyCountsForSelectedDate[group.id] || 0;
    const weeklyTotal = state.weeklyCounts[group.id] || 0;

    logger.trace(`Rendering food group ${group.id}:`, {
      dailyCount,
      weeklyTotal,
      groupName: group.name,
    });

    const html = renderFoodGroupItem(group, dailyCount, weeklyTotal, state);
    const item = document.createElement("div");
    item.innerHTML = html;
    const foodGroupItem = item.firstElementChild;

    const nameElement = foodGroupItem.querySelector(".name");
    const weeklyBadge = foodGroupItem.querySelector(".weekly-badge");
    const weeklyBadgeValue = weeklyBadge
      ? weeklyBadge.querySelector(".wk-val")
      : null;

    const infoBtn = foodGroupItem.querySelector(".info-btn");
    if (infoBtn) infoBtn.dataset.groupId = group.id;

    // Weekly badge ALWAYS shows the total for state.weeklyCounts for the current week
    if (weeklyBadge && weeklyBadgeValue) {
      weeklyBadge.style.display = "inline-flex"; // Ensure it's visible
      updateBadgeColor(weeklyBadge, group, weeklyTotal, state); // updateBadgeColor uses weekly total
    } else if (weeklyBadge) {
      weeklyBadge.style.display = "none"; // Hide if value span not found
    }

    foodItemsList.appendChild(foodGroupItem);
  });
}

/**
 * Render the current week summary using slim cards
 */
function renderCurrentWeekSummary() {
  const state = stateManager.getState();
  const { currentWeekSummaryContent } = domElements.currentWeekElements;

  // Ensure we have the required element
  if (!currentWeekSummaryContent) {
    logger.error("Missing required element for renderCurrentWeekSummary");
    return;
  }

  // Clear previous content
  currentWeekSummaryContent.innerHTML = "";

  // Helper function to get effective weekly target
  const getWeeklyTarget = (group) => {
    if (group.frequency === "week") return group.target;
    if (group.frequency === "day") return group.target * 7; // 7 days per week
    return group.target; // Fallback for special cases
  };

  // Render each food group
  const cards = state.foodGroups.map((group) => {
    const currentTotal = state.weeklyCounts[group.id] || 0;
    const weeklyTarget = getWeeklyTarget(group);

    return renderCurrentWeekCard(group, currentTotal, weeklyTarget);
  });

  // Add the cards container to the view
  const containerHtml = renderSummaryCardsContainer(cards);
  currentWeekSummaryContent.innerHTML = containerHtml;
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
  const mainHistoryTitleEl = document.getElementById("history-main-title"); // Get the h2 element

  // Ensure we have the required element
  if (!historyContent || !mainHistoryTitleEl) {
    // Added mainHistoryTitleEl check
    logger.error(
      "Missing required element for renderHistory (historyContent or history-main-title)"
    );
    return;
  }

  // Clear previous content
  historyContent.innerHTML = "";
  if (editHistoryWeekBtn) editHistoryWeekBtn.disabled = true;

  // Reset navigation UI elements
  if (prevWeekBtn) prevWeekBtn.disabled = true;
  if (nextWeekBtn) nextWeekBtn.disabled = true;
  if (historyDatePicker) historyDatePicker.value = "";

  // Check if we have any history data
  if (!state.history || state.history.length === 0) {
    historyContent.innerHTML = "<p>No history data available yet.</p>";
    mainHistoryTitleEl.textContent = "No History";
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
    mainHistoryTitleEl.textContent = "Error Loading History";
    return;
  }

  // Update the main history title with the week's date
  mainHistoryTitleEl.textContent = `Week of ${formatDate(
    weekData.weekStartDate,
    "title"
  )}`;

  // Enable the edit button now that we have valid data
  if (editHistoryWeekBtn) {
    editHistoryWeekBtn.disabled = false;
  }

  // Update navigation UI
  if (prevWeekBtn) {
    prevWeekBtn.disabled = displayIndex >= state.history.length - 1;
  }

  if (nextWeekBtn) {
    nextWeekBtn.disabled = displayIndex <= 0;
  }

  if (historyDatePicker) {
    historyDatePicker.value = weekData.weekStartDate;
  }

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
  const cards = foodGroupsToDisplay
    .map((group) => {
      const groupId = group.id;
      const total = weekData.totals[groupId] || 0;
      const targetInfo = targets[groupId];

      if (!targetInfo) return null; // Skip if no target info found

      // Calculate effective weekly target
      let effectiveWeeklyTarget;
      if (targetInfo.frequency === "week") {
        effectiveWeeklyTarget = targetInfo.target;
      } else if (targetInfo.frequency === "day") {
        effectiveWeeklyTarget = targetInfo.target * 7;
      } else {
        effectiveWeeklyTarget = targetInfo.target;
      }

      return renderHistoryCard(targetInfo, total, effectiveWeeklyTarget);
    })
    .filter((card) => card !== null); // Remove null cards

  // Add the cards container to the view
  const containerHtml = renderSummaryCardsContainer(cards);
  historyContent.innerHTML = containerHtml;
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
    logger.error(`Could not find view element for key: ${viewId}`);
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
 * @param {string} type - The toast type ('success', 'error', 'info', 'warning')
 * @param {Object} options - Options for the toast
 * @param {number} [options.duration=3000] - The display duration in ms (ignored if persistent)
 * @param {boolean} [options.isPersistent=false] - If true, toast stays until replaced
 * @param {boolean} [options.showSpinner=false] - If true, shows a spinner
 */
function showToast(message, type = "info", options = {}) {
  const { toastMessage, toastSpinner, toastText } = domElements.toastElements;
  const {
    duration = 1000,
    isPersistent = false,
    showSpinner = false,
  } = options;

  if (!toastMessage || !toastSpinner || !toastText) {
    logger.warn("Toast elements not fully cached. Cannot show toast.");
    return;
  }

  // Clear any existing timeout
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null; // Important to reset
  }

  // Reset classes on the main toast message div
  toastMessage.className = "toast"; // Resets to base class

  // Set content and style
  toastText.textContent = message; // Set text on the new span
  toastMessage.classList.add(`toast-${type}`); // Add type class for styling

  // Handle spinner
  if (showSpinner) {
    toastSpinner.classList.add("active");
  } else {
    toastSpinner.classList.remove("active");
  }

  // Show the toast
  toastMessage.classList.add("toast-show");

  // Set timeout to hide, unless it's persistent
  if (!isPersistent) {
    toastTimeout = setTimeout(() => {
      toastMessage.classList.remove("toast-show");
      toastSpinner.classList.remove("active"); // Ensure spinner is also hidden
      toastTimeout = null; // Reset after execution
    }, duration);
  }
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
    logger.error("Modal elements not found", { genericModal, modalBody });
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
      logger.warn(
        "Invalid content type provided to modal:",
        typeof htmlContent
      );
      modalBody.textContent = "Content could not be displayed";
    }
  }

  // Handle optional footer with buttons
  const existingFooter = genericModal.querySelector(".modal-actions");
  if (existingFooter) {
    existingFooter.remove();
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
  logger.debug("Modal opened with title:", title);
  logger.debug("Modal content length:", htmlContent ? htmlContent.length : 0);
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

/**
 * Opens and prepares the modal shell used for editing history daily details.
 * app.js will then call other uiRenderer functions to populate its dynamic content.
 * @param {string} mainTitle - The main title for the modal (e.g., "Week of March 10, 2025").
 * @param {string} saveButtonText - Text for the primary save action button.
 */
function showEditHistoryModalShell(mainTitle, saveButtonText = "Save Changes") {
  const modal = domElements.modalElements.editTotalsModal;
  const titleEl = domElements.modalElements.editTotalsTitle;
  const saveBtnEl = domElements.modalElements.editTotalsSaveBtn;
  const dayDisplayEl = domElements.modalElements.modalSelectedDayDisplay;
  const daySelectorEl = domElements.modalElements.modalDaySelectorBar;
  const listEl = domElements.modalElements.editTotalsList;

  if (
    !modal ||
    !titleEl ||
    !saveBtnEl ||
    !dayDisplayEl ||
    !daySelectorEl ||
    !listEl
  ) {
    logger.error(
      "uiRenderer.showEditHistoryModalShell: One or more required modal elements are missing from DOM cache."
    );
    // Optionally, show a generic error toast to the user
    showToast("Error: Cannot open details editor.", "error");
    return;
  }

  // Set main title (e.g., "Week of...")
  titleEl.textContent = mainTitle;

  // Set save button text (e.g., "Save Changes to Week")
  saveBtnEl.textContent = saveButtonText;

  // Clear dynamic content areas, preparing them for fresh population
  dayDisplayEl.textContent = ""; // Will be set by updateModalSelectedDayDisplay
  daySelectorEl.innerHTML = ""; // Will be populated by renderDaySelectorBar
  listEl.innerHTML = ""; // Will be populated by renderModalDayDetailsList

  // Ensure modal is visible
  modal.classList.add("modal-open");

  logger.info(`Edit History Modal Shell shown with title: ${mainTitle}`);
}

/**
 * Updates the subheader date display within the "Edit History Daily Details" modal.
 * @param {string} dateStr - The YYYY-MM-DD string of the selected day in the modal.
 */
function updateModalSelectedDayDisplay(dateStr) {
  const displayElement = domElements.modalElements.modalSelectedDayDisplay;
  if (!displayElement) {
    logger.warn(
      "uiRenderer.updateModalSelectedDayDisplay: modalSelectedDayDisplay element not found."
    );
    return;
  }

  if (dateStr) {
    displayElement.textContent = formatDate(dateStr, "modal");
  } else {
    displayElement.textContent = "Select a day";
  }
}

/**
 * Renders the list of food items with counts for a specific day within the
 * "Edit Daily Details for Historical Week" modal.
 * Assumes +/- button event listeners will be handled by app.js delegation on #edit-totals-list.
 * @param {Array} foodGroups - The global food groups array.
 * @param {Object} dailyCountsForSelectedDayInModal - Object like { foodGroupId: count } for the selected day.
 * @param {Object} tempEditedDailyBreakdown - The complete daily breakdown being edited
 */
function renderModalDayDetailsList(
  foodGroups,
  dailyCountsForSelectedDayInModal,
  tempEditedDailyBreakdown
) {
  const listElement = domElements.modalElements.editTotalsList;
  const itemTemplate = domElements.modalElements.editTotalsItemTemplate;

  if (!listElement) {
    logger.error(
      "uiRenderer.renderModalDayDetailsList: editTotalsList element not found."
    );
    return;
  }
  if (!itemTemplate) {
    logger.error(
      "uiRenderer.renderModalDayDetailsList: editTotalsItemTemplate element not found."
    );
    listElement.innerHTML = "<p>Error: Item template missing.</p>";
    return;
  }
  if (!foodGroups || !Array.isArray(foodGroups)) {
    logger.error(
      "uiRenderer.renderModalDayDetailsList: foodGroups array is missing or invalid."
    );
    listElement.innerHTML = "<p>Error: Food groups not available.</p>";
    return;
  }

  listElement.innerHTML = ""; // Clear previous items

  const counts = dailyCountsForSelectedDayInModal || {};

  // Calculate weekly totals from tempEditedDailyBreakdown
  const weeklyTotals = {};
  logger.trace(
    "Calculating weekly totals from tempEditedDailyBreakdown:",
    tempEditedDailyBreakdown
  );

  if (tempEditedDailyBreakdown) {
    Object.values(tempEditedDailyBreakdown).forEach((dayData) => {
      Object.entries(dayData).forEach(([groupId, count]) => {
        weeklyTotals[groupId] = (weeklyTotals[groupId] || 0) + count;
      });
    });
  }

  logger.trace("Calculated weekly totals:", weeklyTotals);

  foodGroups.forEach((group) => {
    const count = counts[group.id] || 0;
    const weeklyTotal = weeklyTotals[group.id] || 0;

    const html = renderEditTotalsItem(group, count, weeklyTotal);
    const item = document.createElement("div");
    item.innerHTML = html;
    const editTotalsItem = item.firstElementChild;

    listElement.appendChild(editTotalsItem);
  });
}

/**
 * Updates the active state of the day selector buttons within a given bar.
 * Removes 'active' class from all buttons, then adds it to the button matching selectedDateStr.
 * @param {HTMLElement} daySelectorBarElement - The container of the day selector buttons.
 * @param {string} selectedDateStr - The YYYY-MM-DD string of the date that should be active.
 */
function updateDaySelectorActiveState(daySelectorBarElement, selectedDateStr) {
  if (!daySelectorBarElement) {
    logger.warn(
      "uiRenderer.updateDaySelectorActiveState: daySelectorBarElement not provided."
    );
    return;
  }
  if (typeof selectedDateStr !== "string") {
    logger.warn(
      "uiRenderer.updateDaySelectorActiveState: selectedDateStr is not a string."
    );
    // Potentially clear all active states if selectedDateStr is invalid
    // daySelectorBarElement.querySelectorAll('.day-selector-btn').forEach(btn => btn.classList.remove('active'));
    return;
  }

  const buttons = daySelectorBarElement.querySelectorAll(".day-selector-btn");
  buttons.forEach((btn) => {
    if (btn.dataset.date === selectedDateStr) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

/**
 * Clears any currently displayed toast messages
 */
function clearToasts() {
  const { toastMessage, toastSpinner } = domElements.toastElements;

  if (!toastMessage || !toastSpinner) {
    logger.warn("Toast elements not fully cached. Cannot clear toasts.");
    return;
  }

  // Clear any existing timeout
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = null;
  }

  // Hide the toast and spinner
  toastMessage.classList.remove("toast-show");
  toastSpinner.classList.remove("active");
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

  // Functions for the "Edit Daily Details for Historical Week" Modal:
  showEditHistoryModalShell, // To show the modal shell
  closeEditTotalsModal, // To close this specific modal (renamed from generic closeModal if it was too confusing)
  renderDaySelectorBar, // For app.js to populate the modal's day selector
  updateModalSelectedDayDisplay, // For app.js to update the modal's selected day text
  renderModalDayDetailsList, // For app.js to populate the modal's food item list
  updateDaySelectorActiveState, // For app.js to manage active state in modal's day selector
  clearToasts,
  domElements,
};
