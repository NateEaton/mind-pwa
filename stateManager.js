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

/**
 * StateManager - Centralized state management with publisher/subscriber pattern
 *
 * This module manages the application state using a publisher/subscriber pattern,
 * allowing components to subscribe to state changes and receive updates.
 */

// Action types (similar to Redux)
export const ACTION_TYPES = {
  // State initialization
  INITIALIZE_STATE: "INITIALIZE_STATE",
  SET_STATE: "SET_STATE",

  // Food counts
  UPDATE_DAILY_COUNT: "UPDATE_DAILY_COUNT",
  UPDATE_WEEKLY_COUNT: "UPDATE_WEEKLY_COUNT",

  // Date changes
  SET_CURRENT_DAY: "SET_CURRENT_DAY",
  SET_CURRENT_WEEK: "SET_CURRENT_WEEK",

  // Bulk operations
  RESET_DAILY_COUNTS: "RESET_DAILY_COUNTS",
  RESET_WEEKLY_COUNTS: "RESET_WEEKLY_COUNTS",

  // History operations
  SET_HISTORY: "SET_HISTORY",
  SET_HISTORY_INDEX: "SET_HISTORY_INDEX",

  // Import/Export
  IMPORT_STATE: "IMPORT_STATE",

  UPDATE_METADATA: "UPDATE_METADATA",
};

// Default initial state
const defaultState = {
  currentDayDate: null, // YYYY-MM-DD
  currentWeekStartDate: null, // YYYY-MM-DD (Sunday)
  dailyCounts: {}, // { food_id: count }
  weeklyCounts: {}, // { food_id: count }
  history: [], // Array of past week objects { weekStartDate, totals: {...} }
  currentHistoryIndex: -1, // Index for viewed history week (-1 = none selected)
  foodGroups: [], // Reference to food groups configuration
  metadata: {
    currentWeekDirty: false,
    historyDirty: false,
    lastModified: null,
  },
};

// Private state container
let _state = { ...defaultState };

// Array of subscriber functions
const _subscribers = [];

/**
 * Subscribe to state changes
 * @param {Function} callback - Function to call when state changes
 * @returns {Function} Unsubscribe function
 */
function subscribe(callback) {
  if (typeof callback !== "function") {
    throw new Error("Subscriber callback must be a function");
  }

  _subscribers.push(callback);

  // Return unsubscribe function
  return () => {
    const index = _subscribers.indexOf(callback);
    if (index !== -1) {
      _subscribers.splice(index, 1);
    }
  };
}

/**
 * Notify all subscribers of state change
 * @param {Object} state - The current state
 * @param {Object} action - The action that caused the change
 */
function notifySubscribers(state, action) {
  _subscribers.forEach((callback) => {
    try {
      callback(state, action);
    } catch (error) {
      console.error("Error in subscriber callback:", error);
    }
  });
}

/**
 * Dispatch an action to update the state
 * @param {Object} action - The action to dispatch
 * @param {string} action.type - The action type
 * @param {Object} action.payload - The action payload
 * @returns {Object} The updated state
 */
function dispatch(action) {
  if (!action || !action.type) {
    console.error("Invalid action:", action);
    return _state;
  }

  const prevState = { ..._state };
  const nextState = reducer(prevState, action);

  // Only update and notify if state actually changed
  if (JSON.stringify(prevState) !== JSON.stringify(nextState)) {
    _state = nextState;

    // Persist state changes to storage if needed
    if (
      action.type !== ACTION_TYPES.INITIALIZE_STATE &&
      action.type !== ACTION_TYPES.SET_HISTORY &&
      action.type !== ACTION_TYPES.SET_HISTORY_INDEX
    ) {
      saveStateToStorage();
    }

    // Notify subscribers
    notifySubscribers(_state, action);
  }

  return _state;
}

/**
 * Reducer function to handle state updates based on actions
 * @param {Object} state - The current state
 * @param {Object} action - The action to process
 * @returns {Object} The new state
 */
function reducer(state, action) {
  switch (action.type) {
    case ACTION_TYPES.SET_STATE:
      return {
        ...state,
        ...action.payload,
      };

    case ACTION_TYPES.INITIALIZE_STATE:
      return {
        ...state,
        ...action.payload,
      };

    case ACTION_TYPES.UPDATE_DAILY_COUNT:
      const { groupId, count } = action.payload;
      const oldDailyCount = state.dailyCounts[groupId] || 0;
      const diff = count - oldDailyCount;

      // Update both daily count and weekly total by the difference
      return {
        ...state,
        dailyCounts: {
          ...state.dailyCounts,
          [groupId]: count,
        },
        weeklyCounts: {
          ...state.weeklyCounts,
          [groupId]: (state.weeklyCounts[groupId] || 0) + diff,
        },
      };

    case ACTION_TYPES.UPDATE_WEEKLY_COUNT:
      return {
        ...state,
        weeklyCounts: {
          ...state.weeklyCounts,
          [action.payload.groupId]: action.payload.count,
        },
      };

    case ACTION_TYPES.SET_CURRENT_DAY:
      return {
        ...state,
        currentDayDate: action.payload.date,
      };

    case ACTION_TYPES.SET_CURRENT_WEEK:
      return {
        ...state,
        currentWeekStartDate: action.payload.date,
      };

    case ACTION_TYPES.RESET_DAILY_COUNTS:
      // Reset all daily counts to 0
      const resetDailyCounts = {};
      const dailyResetTimestamp = action.payload?.resetTimestamp || Date.now();

      return {
        ...state,
        dailyCounts: resetDailyCounts,
        lastModified: dailyResetTimestamp,
      };

    case ACTION_TYPES.RESET_WEEKLY_COUNTS:
      // Reset all weekly counts to 0
      const resetWeeklyCounts = {};
      const weeklyResetTimestamp = action.payload?.resetTimestamp || Date.now();

      return {
        ...state,
        weeklyCounts: resetWeeklyCounts,
        lastModified: weeklyResetTimestamp,
      };

    case ACTION_TYPES.SET_HISTORY:
      return {
        ...state,
        history: action.payload.history,
      };

    case ACTION_TYPES.SET_HISTORY_INDEX:
      return {
        ...state,
        currentHistoryIndex: action.payload.index,
      };

    case ACTION_TYPES.IMPORT_STATE:
      // Complete replacement of state with imported data
      return {
        ...action.payload,
      };

    case ACTION_TYPES.UPDATE_METADATA:
      return {
        ...state,
        metadata: {
          ...(state.metadata || {}),
          ...action.payload.metadata,
        },
      };

    default:
      console.warn(`Unknown action type: ${action.type}`);
      return state;
  }
}

/**
 * Save current state to persistent storage
 */
function saveStateToStorage() {
  // Include metadata in the state object being saved
  const stateToSave = {
    currentDayDate: _state.currentDayDate,
    currentWeekStartDate: _state.currentWeekStartDate,
    dailyCounts: _state.dailyCounts,
    weeklyCounts: _state.weeklyCounts,
    metadata: _state.metadata, // <--- ADD THIS LINE
  };

  // Optionally add lastModified here if you want stateManager to control it consistently
  // stateToSave.lastModified = _state.lastModified; // Ensure lastModified is saved

  console.log("StateManager saving state to storage:", stateToSave); // Add logging to verify
  dataService.saveState(stateToSave);
}

/**
 * Load state from persistent storage
 * @returns {Object} The loaded state
 */
function loadStateFromStorage() {
  return dataService.loadState();
}

/**
 * Initialize the state manager
 * @param {Object} foodGroups - The food groups configuration
 * @returns {Promise<Object>} The initialized state
 */
async function initialize(foodGroups) {
  // Load state from storage
  const savedState = loadStateFromStorage();

  // Set initial state
  const initialState = {
    ...savedState,
    foodGroups,
    history: [],
  };

  // Dispatch initialization action
  dispatch({
    type: ACTION_TYPES.INITIALIZE_STATE,
    payload: initialState,
  });

  // Load history data
  try {
    const historyData = await dataService.getAllWeekHistory();

    dispatch({
      type: ACTION_TYPES.SET_HISTORY,
      payload: { history: historyData },
    });

    // Set default history index if history exists
    if (historyData.length > 0) {
      dispatch({
        type: ACTION_TYPES.SET_HISTORY_INDEX,
        payload: { index: 0 },
      });
    }
  } catch (error) {
    console.error("Failed to load history data:", error);
  }

  return getState();
}

/**
 * Get the current state
 * @returns {Object} The current state
 */
function getState() {
  // Return a deep copy to prevent direct mutation
  return JSON.parse(JSON.stringify(_state));
}

/**
 * Action creator for updating daily count
 * @param {string} groupId - The food group ID
 * @param {number} count - The new count value
 * @returns {Object} The action object
 */
function updateDailyCount(groupId, count) {
  const result = dispatch({
    type: ACTION_TYPES.UPDATE_DAILY_COUNT,
    payload: { groupId, count },
  });

  // Update timestamps and set dirty flags for daily totals
  const updateTime = Date.now();
  updateMetadata({
    // Daily totals metadata
    dailyTotalsUpdatedAt: updateTime,
    dailyTotalsDirty: true,

    // Weekly totals metadata (since daily changes affect weekly too)
    weeklyTotalsUpdatedAt: updateTime,
    weeklyTotalsDirty: true,

    // Legacy flag for backward compatibility
    currentWeekDirty: true,
    lastModified: updateTime,
  });

  return result;
}

/**
 * Action creator for updating weekly count
 * @param {string} groupId - The food group ID
 * @param {number} count - The new count value
 * @returns {Object} The action object
 */
function updateWeeklyCount(groupId, count) {
  const result = dispatch({
    type: ACTION_TYPES.UPDATE_WEEKLY_COUNT,
    payload: { groupId, count },
  });

  // Update only weekly totals metadata
  const updateTime = Date.now();
  updateMetadata({
    weeklyTotalsUpdatedAt: updateTime,
    weeklyTotalsDirty: true,

    // Legacy flag for backward compatibility
    currentWeekDirty: true,
    lastModified: updateTime,
  });

  return result;
}

/**
 * Action creator for resetting daily counts
 * @param {number} [resetTimestamp] - Optional timestamp for the reset
 * @returns {Object} The action object
 */
function resetDailyCounts(resetTimestamp = null) {
  console.log(`==== resetDailyCounts called ====`);
  const state = getState();
  console.log(
    `Daily counts before reset: ${JSON.stringify(state.dailyCounts)}`
  );

  // Ensure we have a valid timestamp
  const timestamp =
    resetTimestamp || getMidnightTimestamp(dataService.getCurrentDate());

  // Original dispatch call
  const result = dispatch({
    type: ACTION_TYPES.RESET_DAILY_COUNTS,
    payload: { resetTimestamp: timestamp },
  });

  // Update metadata with reset timestamp - important: don't update the dailyTotalsUpdatedAt
  // because we want to preserve when totals were last changed by user
  updateMetadata({
    dailyResetTimestamp: timestamp,
    dailyTotalsDirty: true,

    // Legacy flag for backward compatibility
    currentWeekDirty: true,
    lastModified: timestamp,
  });

  // Verify the reset worked
  const afterState = getState();
  console.log(
    `Daily counts after reset: ${JSON.stringify(afterState.dailyCounts)}`
  );
  console.log(`==== resetDailyCounts completed ====`);

  return result;
}

/**
 * Action creator for resetting weekly counts
 * @param {number} [resetTimestamp] - Optional timestamp for the reset
 * @returns {Object} The action object
 */
function resetWeeklyCounts(resetTimestamp = null) {
  console.log(`==== resetWeeklyCounts called ====`);
  const state = getState();
  console.log(
    `Weekly counts before reset: ${JSON.stringify(state.weeklyCounts)}`
  );

  // Ensure we have a valid timestamp
  const timestamp =
    resetTimestamp || getMidnightTimestamp(dataService.getCurrentDate());

  const result = dispatch({
    type: ACTION_TYPES.RESET_WEEKLY_COUNTS,
    payload: { resetTimestamp: timestamp },
  });

  // Update metadata with reset timestamp - important: don't update the weeklyTotalsUpdatedAt
  // because we want to preserve when totals were last changed by user
  updateMetadata({
    weeklyResetTimestamp: timestamp,
    weeklyTotalsDirty: true,

    // Legacy flag for backward compatibility
    currentWeekDirty: true,
    lastModified: timestamp,
  });

  // Verify the reset worked
  const afterState = getState();
  console.log(
    `Weekly counts after reset: ${JSON.stringify(afterState.weeklyCounts)}`
  );
  console.log(`==== resetWeeklyCounts completed ====`);

  return result;
}

/**
 * Action creator for setting current day date
 * @param {string} date - The current day date (YYYY-MM-DD)
 * @returns {Object} The action object
 */
function setCurrentDay(date) {
  return dispatch({
    type: ACTION_TYPES.SET_CURRENT_DAY,
    payload: { date },
  });
}

/**
 * Action creator for setting current week start date
 * @param {string} date - The current week start date (YYYY-MM-DD)
 * @returns {Object} The action object
 */
function setCurrentWeek(date) {
  return dispatch({
    type: ACTION_TYPES.SET_CURRENT_WEEK,
    payload: { date },
  });
}

/**
 * Enhanced checkDateAndReset with detailed debugging
 */
async function checkDateAndReset() {
  const state = getState();
  const today = dataService.getCurrentDate();
  const todayStr = dataService.getTodayDateString();
  const currentWeekStartStr = dataService.getWeekStartDate(today);

  let stateChanged = false;
  let weekResetOccurred = false;
  let dateResetType = null;

  // Get the last modified timestamp for the week
  const lastUpdateTimestamp = state.lastModified || Date.now();

  // Calculate how many weeks have passed since the current week start date
  const currentWeekStart = new Date(state.currentWeekStartDate + "T00:00:00");
  const newWeekStart = new Date(currentWeekStartStr + "T00:00:00");
  const daysDiff = Math.round(
    (newWeekStart - currentWeekStart) / (24 * 60 * 60 * 1000)
  );
  const weeksDiff = Math.floor(daysDiff / 7);

  console.log(`====== checkDateAndReset: DETAILED DIAGNOSTICS ======`);
  console.log(`Current state date: ${state.currentDayDate}`);
  console.log(`System date (today): ${todayStr}`);
  console.log(`Current week start in state: ${state.currentWeekStartDate}`);
  console.log(`Calculated week start for today: ${currentWeekStartStr}`);
  console.log(`Day difference: ${daysDiff}`);
  console.log(`Week difference: ${weeksDiff}`);

  // Check for week change
  if (state.currentWeekStartDate !== currentWeekStartStr) {
    console.log(`Entering WEEK RESET logic`);

    // Save the previous week start date for use in sync
    const previousWeekStartDate = state.currentWeekStartDate;

    // Handle multi-week gap case
    if (weeksDiff > 1) {
      console.log(`Multi-week gap detected: ${weeksDiff} weeks`);

      // FIX: Check if we have valid foodGroups before archiving
      if (
        state.foodGroups &&
        Array.isArray(state.foodGroups) &&
        state.foodGroups.length > 0
      ) {
        // Archive the completed week before resetting - with timestamp of following Sunday midnight
        const nextWeekStartDate = getNextWeekStartDate(
          state.currentWeekStartDate
        );
        console.log(
          `Archiving week starting ${state.currentWeekStartDate} before reset`
        );
        await archiveCurrentWeek(getMidnightTimestamp(nextWeekStartDate));
      } else {
        console.log(
          "Food groups not available during multi-week gap handling, skipping archive"
        );
      }

      // Set new week start date - with timestamp of current week start
      console.log(`Setting new week start date to ${currentWeekStartStr}`);
      setCurrentWeek(currentWeekStartStr);

      // Reset weekly counts with timestamp of current week start midnight
      const resetTimestamp = getMidnightTimestamp(currentWeekStartStr);
      console.log("Resetting weekly counts");
      resetWeeklyCounts(resetTimestamp);

      // Reset daily counts
      console.log("Resetting daily counts");
      resetDailyCounts(resetTimestamp);

      // Set new day
      console.log(`Setting current day to ${todayStr}`);
      setCurrentDay(todayStr);
    } else {
      // Normal single week change
      console.log("Normal week transition");

      // FIX: Check if we have valid foodGroups before archiving
      if (
        state.foodGroups &&
        Array.isArray(state.foodGroups) &&
        state.foodGroups.length > 0
      ) {
        // Archive the completed week before resetting
        console.log(
          `Archiving week starting ${state.currentWeekStartDate} before reset`
        );
        await archiveCurrentWeek();
      } else {
        console.log(
          "Food groups not available during week reset, skipping archive"
        );
      }

      // Set new week start date
      console.log(`Setting new week start date to ${currentWeekStartStr}`);
      setCurrentWeek(currentWeekStartStr);

      // Reset weekly counts with timestamp of midnight on the day after last update
      const resetTimestamp = getMidnightAfterDate(state.currentWeekStartDate);
      console.log("Resetting weekly counts");
      resetWeeklyCounts(resetTimestamp);

      // Reset daily counts and set new day (handled by week change)
      console.log("Resetting daily counts");
      resetDailyCounts(resetTimestamp);

      console.log(`Setting current day to ${todayStr}`);
      setCurrentDay(todayStr);
    }

    stateChanged = true;
    weekResetOccurred = true;
    dateResetType = "WEEKLY";

    // Update metadata with previous week start date for use in sync
    updateMetadata({
      dateResetPerformed: true,
      dateResetType: dateResetType,
      dateResetTimestamp: Date.now(),
      previousWeekStartDate: previousWeekStartDate,
    });
  }

  // Check for day change (if week didn't already reset)
  if (!weekResetOccurred && state.currentDayDate !== todayStr) {
    console.log(`Entering DAY RESET logic`);
    console.log(
      `Current daily counts before reset: ${JSON.stringify(state.dailyCounts)}`
    );
    console.log(
      `Current weekly counts before rollup: ${JSON.stringify(
        state.weeklyCounts
      )}`
    );

    // Reset daily counts
    console.log(`Calling resetDailyCounts with timestamp`);
    const resetTimestamp = getMidnightAfterDate(state.currentDayDate);
    resetDailyCounts(resetTimestamp);

    // Set new day
    console.log(`Updating currentDayDate to ${todayStr}`);
    setCurrentDay(todayStr);

    stateChanged = true;
    dateResetType = "DAILY";

    // Update metadata
    updateMetadata({
      dateResetPerformed: true,
      dateResetType: dateResetType,
      dateResetTimestamp: Date.now(),
    });

    // Verify the reset was successful
    const afterState = getState();
    console.log(
      `Daily counts after reset: ${JSON.stringify(afterState.dailyCounts)}`
    );
  }

  // If neither condition triggered
  if (!stateChanged) {
    console.log(
      `======= NO DATE RESET REQUIRED: Condition checks failed =======`
    );
  }

  // Add a final verification
  if (stateChanged) {
    const afterState = getState();
    console.log("VERIFICATION - After reset:");
    console.log(`- Current day: ${afterState.currentDayDate}`);
    console.log(`- Current week start: ${afterState.currentWeekStartDate}`);
    console.log(`- Daily counts: ${JSON.stringify(afterState.dailyCounts)}`);
    console.log(`- Weekly counts: ${JSON.stringify(afterState.weeklyCounts)}`);
  }

  console.log(
    `====== checkDateAndReset: FINISHED (stateChanged=${stateChanged}) ======`
  );

  return stateChanged;
}

/**
 * Get midnight timestamp for the day after the specified date
 * @param {string} dateStr - YYYY-MM-DD date string
 * @returns {number} Timestamp for midnight after the date
 */
function getMidnightAfterDate(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  const nextDay = new Date(date);
  nextDay.setDate(date.getDate() + 1);
  nextDay.setHours(0, 0, 0, 0);
  return nextDay.getTime();
}

/**
 * Get midnight timestamp for the specified date
 * @param {string} dateStr - YYYY-MM-DD date string
 * @returns {number} Timestamp for midnight of the date
 */
function getMidnightTimestamp(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Get the start date of the week after the specified week
 * @param {string} weekStartDateStr - YYYY-MM-DD of week start
 * @returns {string} YYYY-MM-DD of next week start
 */
function getNextWeekStartDate(weekStartDateStr) {
  const weekStartDate = new Date(`${weekStartDateStr}T00:00:00`);
  const nextWeekStart = new Date(weekStartDate);
  nextWeekStart.setDate(weekStartDate.getDate() + 7);

  const year = nextWeekStart.getFullYear();
  const month = String(nextWeekStart.getMonth() + 1).padStart(2, "0");
  const day = String(nextWeekStart.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/**
 * Archive the current week data to history
 * @param {number} [archiveTimestamp] - Optional timestamp for the archive
 * @returns {Promise<void>} Promise that resolves when archive is complete
 */
async function archiveCurrentWeek(archiveTimestamp = null) {
  const state = getState();
  const timestamp = archiveTimestamp || Date.now();

  // Create week data object for archiving
  const weekData = {
    weekStartDate: state.currentWeekStartDate,
    weekStartDaySetting: "Sunday", // Default day setting
    totals: { ...state.weeklyCounts },
    timestamp: timestamp, // Add timestamp for the archive operation
  };

  // FIX: Check if foodGroups is available before creating targets
  if (
    state.foodGroups &&
    Array.isArray(state.foodGroups) &&
    state.foodGroups.length > 0
  ) {
    // Store targets for future reference
    weekData.targets = state.foodGroups.reduce((acc, group) => {
      acc[group.id] = {
        target: group.target,
        frequency: group.frequency,
        type: group.type,
        unit: group.unit,
      };
      return acc;
    }, {});
  } else {
    console.log(
      "Food groups not available during archiving, creating empty targets object"
    );
    weekData.targets = {};
  }

  try {
    // Save week data to history store
    await dataService.saveWeekHistory(weekData);
    console.log(
      `Archived week ${state.currentWeekStartDate} with timestamp ${timestamp}`
    );

    // Refresh history data
    const historyData = await dataService.getAllWeekHistory();

    dispatch({
      type: ACTION_TYPES.SET_HISTORY,
      payload: { history: historyData },
    });

    // Set history dirty flag and mark weekly totals as archived (no longer dirty)
    updateMetadata({
      historyDirty: true,
      lastHistoryUpdate: timestamp,
      weeklyTotalsDirty: false, // Weekly data is now archived
      // Don't clear the weeklyResetTimestamp since it's still needed for sync
    });

    // Reset history index to show most recent
    if (historyData.length > 0) {
      dispatch({
        type: ACTION_TYPES.SET_HISTORY_INDEX,
        payload: { index: 0 },
      });
    }
  } catch (error) {
    console.error(
      `Failed to archive week ${state.currentWeekStartDate}:`,
      error
    );
    throw error;
  }
}

/**
 * Get the food group data by ID
 * @param {string} id - The food group ID
 * @returns {Object|null} The food group object or null if not found
 */
function getFoodGroup(id) {
  const state = getState();
  return state.foodGroups.find((group) => group.id === id) || null;
}

/**
 * Reload state from persistent storage
 * @returns {Promise<boolean>} Success indicator
 */
async function reload() {
  console.log("Reloading state from data service");

  // Load fresh data from data service
  const freshData = dataService.loadState();
  console.log("Fresh data loaded:", {
    dayDate: freshData.currentDayDate,
    weekStartDate: freshData.currentWeekStartDate,
    dailyCounts: Object.keys(freshData.dailyCounts || {}),
    weeklyCounts: Object.keys(freshData.weeklyCounts || {}),
  });

  // Update state with fresh data
  dispatch({
    type: ACTION_TYPES.SET_STATE,
    payload: freshData,
  });

  // Also reload history if needed
  const historyData = await dataService.getAllWeekHistory();
  console.log("History data loaded:", historyData.length, "weeks");

  dispatch({
    type: ACTION_TYPES.SET_HISTORY,
    payload: { history: historyData },
  });

  console.log("State reloaded successfully");
  return true;
}

/**
 * Update metadata in the state
 * @param {Object} metadataChanges - The metadata properties to update
 */
function updateMetadata(metadataChanges) {
  const state = getState();
  const currentMetadata = state.metadata || {};

  dispatch({
    type: ACTION_TYPES.UPDATE_METADATA,
    payload: {
      metadata: {
        ...currentMetadata,
        ...metadataChanges,
      },
    },
  });
}

/**
 * Also trace through ensureCurrentDate to see what's happening there
 */
function ensureCurrentDate() {
  const state = getState();
  const todayStr = dataService.getTodayDateString();

  console.log(`==== ensureCurrentDate ====`);
  console.log(`Current date in state: ${state.currentDayDate}`);
  console.log(`System date: ${todayStr}`);
  console.log(`Dates match? ${state.currentDayDate === todayStr}`);

  // If current date in state doesn't match today, update it
  if (state.currentDayDate !== todayStr) {
    console.log(
      `Correcting currentDayDate from ${state.currentDayDate} to ${todayStr}`
    );
    setCurrentDay(todayStr);
    return true;
  }

  console.log(`No date correction needed`);
  return false;
}

// Export public API
export default {
  // State management
  initialize,
  getState,
  subscribe,
  dispatch,

  // Action creators
  updateDailyCount,
  updateWeeklyCount,
  resetDailyCounts,
  resetWeeklyCounts,
  setCurrentDay,
  setCurrentWeek,

  // Date check & reset
  checkDateAndReset,
  archiveCurrentWeek,
  ensureCurrentDate,

  // Helper functions
  getFoodGroup,
  reload, // Add reload to the exported methods

  // Action types (for external use)
  ACTION_TYPES,
};
