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
import appUtils from "../utils/appUtils.js";
import dateUtils from "../utils/dateUtils.js";
import uiRenderer from "../ui/renderer.js";
import logger from "./logger.js";

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
  // UPDATE_WEEKLY_COUNT: "UPDATE_WEEKLY_COUNT",

  // Date changes
  SET_CURRENT_DAY: "SET_CURRENT_DAY",
  SET_CURRENT_WEEK: "SET_CURRENT_WEEK",
  SET_SELECTED_TRACKER_DATE: "SET_SELECTED_TRACKER_DATE", // New

  // Bulk operations
  RESET_DAILY_COUNTS: "RESET_DAILY_COUNTS",
  RESET_WEEKLY_COUNTS: "RESET_WEEKLY_COUNTS",
  RECALCULATE_WEEKLY_TOTALS: "RECALCULATE_WEEKLY_TOTALS", // New

  // History operations
  SET_HISTORY: "SET_HISTORY",
  SET_HISTORY_INDEX: "SET_HISTORY_INDEX",

  // Import/Export
  IMPORT_STATE: "IMPORT_STATE", // Will be handled in Phase 2

  UPDATE_METADATA: "UPDATE_METADATA",
};

// Default initial state
const defaultState = {
  currentDayDate: null,
  currentWeekStartDate: null,
  selectedTrackerDate: null, // New
  dailyCounts: {}, // New structure: { "YYYY-MM-DD": { foodId: count } }
  weeklyCounts: {},
  history: [],
  currentHistoryIndex: -1,
  foodGroups: [],
  metadata: {
    currentWeekDirty: false, // Legacy, might be replaced by daily/weekly specific
    historyDirty: false,
    lastModified: null,
    weekStartDay: "Sunday", // New, will be loaded from preferences
    // Granular dirty flags
    dailyTotalsDirty: false,
    weeklyTotalsDirty: false,
  },
};

// Private state container
let _state = { ...defaultState };

// Array of subscriber functions
const _subscribers = [];

// Batch update flag to prevent intermediate UI updates during complex operations
let _batchingUpdates = false;

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
      logger.error("Error in subscriber callback:", error);
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
    logger.error("Invalid action:", action);
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

    // Notify subscribers only if not batching updates
    if (!_batchingUpdates) {
      notifySubscribers(_state, action);
    }
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
    case ACTION_TYPES.SET_STATE: // For general state replacement, e.g., after import or full reload
      return {
        ...state, // Preserve any parts of state not in payload (like foodGroups if not included)
        ...action.payload,
      };

    case ACTION_TYPES.INITIALIZE_STATE:
      const initialPayload = action.payload || {};
      const initialSelectedDate =
        initialPayload.selectedTrackerDate ||
        initialPayload.currentDayDate ||
        dataService.getTodayDateString();

      const initialDailyCounts = { ...(initialPayload.dailyCounts || {}) };
      if (!initialDailyCounts[initialSelectedDate]) {
        initialDailyCounts[initialSelectedDate] = {};
      }

      const initialMetadata = {
        ...defaultState.metadata, // Start with base defaults from stateManager
        ...(initialPayload.metadata || {}), // Overlay with metadata from loaded state
        weekStartDay:
          initialPayload.metadata?.weekStartDay ||
          defaultState.metadata.weekStartDay, // Ensure weekStartDay is set
        schemaVersion:
          initialPayload.metadata?.schemaVersion ||
          defaultState.metadata.schemaVersion ||
          dataService.SCHEMA?.VERSION ||
          3, // Ensure schema version
      };

      return {
        ...defaultState, // Start with stateManager's default structure
        ...initialPayload, // Overlay with loaded/initial data
        selectedTrackerDate: initialSelectedDate,
        dailyCounts: initialDailyCounts,
        metadata: initialMetadata,
        foodGroups: initialPayload.foodGroups || state.foodGroups || [], // Preserve foodGroups if already set
      };

    case ACTION_TYPES.UPDATE_DAILY_COUNT:
      const { date, groupId, count } = action.payload;
      const newCount = Math.max(0, parseInt(count, 10) || 0);

      const currentDailyCountsForDate = state.dailyCounts[date] || {};
      const oldDailyValue = currentDailyCountsForDate[groupId] || 0;
      const delta = newCount - oldDailyValue;

      return {
        ...state,
        dailyCounts: {
          ...state.dailyCounts,
          [date]: {
            ...currentDailyCountsForDate,
            [groupId]: newCount,
          },
        },
        weeklyCounts: {
          ...state.weeklyCounts,
          [groupId]: (state.weeklyCounts[groupId] || 0) + delta,
        },
      };

    // UPDATE_WEEKLY_COUNT is deprecated - weekly counts are now derived from daily counts
    /*
    case ACTION_TYPES.UPDATE_WEEKLY_COUNT:
      return {
        ...state,
        weeklyCounts: {
          ...state.weeklyCounts,
          [action.payload.groupId]: action.payload.count,
        },
      };
    */

    case ACTION_TYPES.SET_CURRENT_DAY:
      const newCurrentDay = action.payload.date;
      const updatedDailyCountsForNewDaySet = { ...state.dailyCounts };
      if (!updatedDailyCountsForNewDaySet[newCurrentDay]) {
        updatedDailyCountsForNewDaySet[newCurrentDay] = {};
      }
      return {
        ...state,
        currentDayDate: newCurrentDay,
        selectedTrackerDate: newCurrentDay, // Update selectedTrackerDate as well
        dailyCounts: updatedDailyCountsForNewDaySet,
      };

    case ACTION_TYPES.SET_CURRENT_WEEK:
      // Usually part of a larger flow like weekly reset
      return {
        ...state,
        currentWeekStartDate: action.payload.date,
      };

    case ACTION_TYPES.SET_SELECTED_TRACKER_DATE:
      const newSelectedDate = action.payload.date;
      const updatedDailyCountsForSelect = { ...state.dailyCounts };
      if (!updatedDailyCountsForSelect[newSelectedDate]) {
        updatedDailyCountsForSelect[newSelectedDate] = {};
      }
      return {
        ...state,
        selectedTrackerDate: newSelectedDate,
        dailyCounts: updatedDailyCountsForSelect,
      };

    case ACTION_TYPES.RESET_DAILY_COUNTS:
      // Resets counts for a specific date and updates weekly totals accordingly.
      const { dateToReset } = action.payload;
      const dailyCountsToClear = state.dailyCounts[dateToReset] || {};
      let updatedWeeklyCountsAfterDailyReset = { ...state.weeklyCounts };

      for (const foodId in dailyCountsToClear) {
        if (dailyCountsToClear.hasOwnProperty(foodId)) {
          const countToSubtract = dailyCountsToClear[foodId] || 0;
          updatedWeeklyCountsAfterDailyReset[foodId] =
            (updatedWeeklyCountsAfterDailyReset[foodId] || 0) - countToSubtract;
          if (updatedWeeklyCountsAfterDailyReset[foodId] < 0) {
            updatedWeeklyCountsAfterDailyReset[foodId] = 0;
          }
        }
      }
      return {
        ...state,
        dailyCounts: {
          ...state.dailyCounts,
          [dateToReset]: {}, // Set to empty object for that date
        },
        weeklyCounts: updatedWeeklyCountsAfterDailyReset,
      };

    case ACTION_TYPES.RESET_WEEKLY_COUNTS:
      // Resets all daily counts for the current week and all weekly counts
      const currentDayForWeeklyReset =
        state.currentDayDate || dataService.getTodayDateString();
      return {
        ...state,
        dailyCounts: { [currentDayForWeeklyReset]: {} },
        weeklyCounts: {},
      };

    case ACTION_TYPES.RECALCULATE_WEEKLY_TOTALS:
      const weekStartForRecalc = state.currentWeekStartDate;
      const newCalculatedWeeklyTotals = {};

      if (!weekStartForRecalc) {
        logger.warn(
          "Cannot recalculate weekly totals: currentWeekStartDate is not set."
        );
        return state; // Return current state if week start is missing
      }

      const startDateForRecalc = new Date(weekStartForRecalc + "T00:00:00");

      for (let i = 0; i < 7; i++) {
        const dayToProcess = new Date(startDateForRecalc);
        dayToProcess.setDate(startDateForRecalc.getDate() + i);
        // Format date as YYYY-MM-DD
        const year = dayToProcess.getFullYear();
        const month = String(dayToProcess.getMonth() + 1).padStart(2, "0");
        const day = String(dayToProcess.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;

        if (state.dailyCounts[dateStr]) {
          for (const foodId in state.dailyCounts[dateStr]) {
            if (state.dailyCounts[dateStr].hasOwnProperty(foodId)) {
              newCalculatedWeeklyTotals[foodId] =
                (newCalculatedWeeklyTotals[foodId] || 0) +
                (state.dailyCounts[dateStr][foodId] || 0);
            }
          }
        }
      }
      return {
        ...state,
        weeklyCounts: newCalculatedWeeklyTotals,
      };

    case ACTION_TYPES.SET_HISTORY:
      return {
        ...state,
        history: action.payload.history || [],
      };

    case ACTION_TYPES.SET_HISTORY_INDEX:
      return {
        ...state,
        currentHistoryIndex: action.payload.index,
      };

    case ACTION_TYPES.IMPORT_STATE:
      logger.warn("IMPORT_STATE action called but is deferred to Phase 2.");
      return state;

    case ACTION_TYPES.UPDATE_METADATA:
      return {
        ...state,
        metadata: {
          ...(state.metadata || {}),
          ...action.payload.metadata,
        },
      };

    default:
      logger.warn(`Unknown action type in reducer: ${action.type}`);
      return state;
  }
}

/**
 * Save current state to persistent storage
 */
function saveStateToStorage() {
  const stateToSave = {
    currentDayDate: _state.currentDayDate,
    currentWeekStartDate: _state.currentWeekStartDate,
    dailyCounts: _state.dailyCounts,
    weeklyCounts: _state.weeklyCounts,
    metadata: _state.metadata,
  };

  logger.debug("StateManager saving state to storage:", stateToSave);
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
  // 1. Load essential preferences first
  const weekStartDayPref = await dataService.getPreference(
    "weekStartDay",
    "Sunday"
  );
  logger.info(
    `StateManager Initialize: Using weekStartDay preference: ${weekStartDayPref}`
  );

  // 2. Load raw state from storage
  const savedState = loadStateFromStorage(); // dataService.loadState()

  // 3. Construct the initial state for the store, ensuring preferences are applied
  const effectiveCurrentDayDate =
    savedState.currentDayDate || dataService.getTodayDateString();
  const authoritativeCurrentWeekStart = dataService.getWeekStartDate(
    effectiveCurrentDayDate,
    weekStartDayPref
  );

  const initialState = {
    ...defaultState, // Start with stateManager's default structure
    ...savedState, // Overlay with loaded data
    foodGroups: foodGroups || [],
    currentDayDate: effectiveCurrentDayDate,
    currentWeekStartDate: authoritativeCurrentWeekStart, // Authoritative based on pref & current day
    selectedTrackerDate:
      savedState.selectedTrackerDate || effectiveCurrentDayDate,
    history: [], // History loaded separately below
    metadata: {
      ...defaultState.metadata, // Start with defaults
      ...(savedState.metadata || {}), // Overlay with loaded metadata
      weekStartDay: weekStartDayPref, // Ensure preference is set in metadata
      schemaVersion: dataService.SCHEMA?.VERSION || 3, // Ensure current schema version
    },
  };

  // Ensure dailyCounts object exists and has an entry for the selectedTrackerDate
  if (!initialState.dailyCounts) {
    initialState.dailyCounts = {};
  }
  if (!initialState.dailyCounts[initialState.selectedTrackerDate]) {
    initialState.dailyCounts[initialState.selectedTrackerDate] = {};
  }
  // Also ensure for currentDayDate if different and not present
  if (
    initialState.currentDayDate !== initialState.selectedTrackerDate &&
    !initialState.dailyCounts[initialState.currentDayDate]
  ) {
    initialState.dailyCounts[initialState.currentDayDate] = {};
  }

  logger.debug(
    "StateManager Initialize: Initial state being dispatched:",
    JSON.parse(JSON.stringify(initialState))
  );
  dispatch({
    type: ACTION_TYPES.INITIALIZE_STATE,
    payload: initialState,
  });

  // 4. Load history data (can happen after initial state dispatch)
  try {
    const historyData = await dataService.getAllWeekHistory();
    dispatch({
      type: ACTION_TYPES.SET_HISTORY,
      payload: { history: historyData || [] },
    });
    if (historyData && historyData.length > 0) {
      dispatch({
        type: ACTION_TYPES.SET_HISTORY_INDEX,
        payload: { index: 0 },
      });
    }
  } catch (error) {
    logger.error(
      "StateManager Initialize: Failed to load history data:",
      error
    );
  }

  // 5. Perform date/week integrity check NOW that state is initialized with correct prefs
  logger.debug("StateManager Initialize: Calling checkDateAndReset()...");
  await checkDateAndReset();
  logger.debug("StateManager Initialize: checkDateAndReset() complete.");

  // 6. Recalculate weekly totals based on the (potentially) updated daily counts and week structure
  logger.debug("StateManager Initialize: Calling recalculateWeeklyTotals()...");
  recalculateWeeklyTotals();
  logger.debug("StateManager Initialize: recalculateWeeklyTotals() complete.");

  // 7. CRITICAL FINAL STEP FOR FRESH INSTALL:
  //    After all initialization, if it's still marked as a fresh install,
  //    override key timestamps to ensure cloud data wins on first sync.
  let currentStateAfterInit = getState(); // Get the state *after* all above operations
  if (currentStateAfterInit.metadata?.isFreshInstall) {
    logger.info(
      "StateManager Initialize: Fresh install detected at FINAL STAGE. Overriding timestamps to sentinel values."
    );
    const sentinelTimestamp = new Date("2025-01-01T00:00:00Z").getTime();

    // Dispatch an action to update metadata with these sentinel values.

    // and importantly, triggers saveStateToStorage().
    dispatch({
      type: ACTION_TYPES.UPDATE_METADATA,
      payload: {
        metadata: {
          dailyTotalsUpdatedAt: sentinelTimestamp,
          weeklyTotalsUpdatedAt: sentinelTimestamp,
          lastModified: sentinelTimestamp, // Override the overall state's lastModified too
          // isFreshInstall remains true. CloudSyncManager will set it to false
          // after the first successful sync that uses this information.
        },
      },
    });
    // The saveStateToStorage() will be called by the dispatch above.
  }

  logger.info("StateManager Initialize: Initialization complete.");
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
 * Action creator for updating daily count for a specific date (usually selectedTrackerDate)
 * @param {string} date - The date for which to update the count (YYYY-MM-DD)
 * @param {string} groupId - The food group ID
 * @param {number} count - The new count value
 * @returns {Object} The action object
 */
function updateDailyCount(date, groupId, count) {
  // Added 'date' parameter
  const result = dispatch({
    type: ACTION_TYPES.UPDATE_DAILY_COUNT,
    payload: { date, groupId, count },
  });

  const updateTime = Date.now();
  updateMetadata({
    dailyTotalsUpdatedAt: updateTime,
    dailyTotalsDirty: true, // A daily count changed
    weeklyTotalsUpdatedAt: updateTime, // Weekly sum also changed
    weeklyTotalsDirty: true,
    lastModified: updateTime, // Overall state modified
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
 * Action creator for resetting daily counts for a specific date.
 * @param {string} dateToReset - The date (YYYY-MM-DD) whose counts should be reset.
 * @param {number} [resetTimestamp] - Optional timestamp for the reset.
 * @returns {Object} The action object
 */
function resetDailyCounts(dateToReset, resetTimestamp = null) {
  logger.debug(`==== resetDailyCounts called for date: ${dateToReset} ====`);
  const timestamp = resetTimestamp || dataService.getCurrentTimestamp(); // Use dataService for test mode compatibility

  const result = dispatch({
    type: ACTION_TYPES.RESET_DAILY_COUNTS,
    payload: { dateToReset, resetTimestamp: timestamp },
  });

  updateMetadata({
    dailyResetTimestamp: timestamp, // Or a more specific one if needed
    dailyTotalsDirty: true,
    weeklyTotalsDirty: true, // Because weekly sum changed
    currentWeekDirty: true, // Legacy
    lastModified: timestamp,
  });
  return result;
}

/**
 * Action creator for resetting weekly counts
 * @param {number} [resetTimestamp] - Optional timestamp for the reset
 * @returns {Object} The action object
 */
function resetWeeklyCounts(resetTimestamp = null) {
  logger.debug(`==== resetWeeklyCounts called ====`);
  const state = getState();
  logger.debug(
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
  logger.debug(
    `Weekly counts after reset: ${JSON.stringify(afterState.weeklyCounts)}`
  );
  logger.info(`==== resetWeeklyCounts completed ====`);

  return result;
}

/**
 * Action creator for explicitly recalculating weekly totals from daily counts.
 * @returns {Object} The state after recalculation.
 */
function recalculateWeeklyTotals() {
  const result = dispatch({
    type: ACTION_TYPES.RECALCULATE_WEEKLY_TOTALS,
    payload: {}, // No payload needed, uses current state
  });

  updateMetadata({
    weeklyTotalsUpdatedAt: Date.now(),
    weeklyTotalsDirty: true, // Mark as dirty because it was just recalculated
    lastModified: Date.now(),
  });
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
 * Checks if the current date or week has changed compared to the stored state,
 * and performs necessary resets and archiving.
 * @returns {Promise<boolean>} True if state was changed (date/week reset occurred), false otherwise.
 */
async function checkDateAndReset() {
  const currentState = getState(); // Get a fresh copy of the current state
  const systemToday = dataService.getCurrentDate(); // Respects test mode
  const systemTodayStr = dataService.getTodayDateString(systemToday); // Format current system date
  const weekStartDayPref = currentState.metadata?.weekStartDay || "Sunday"; // Get preference from state

  const systemCurrentWeekStartStr = dataService.getWeekStartDate(
    systemToday,
    weekStartDayPref
  );

  let stateChanged = false;
  let resetType = null; // "DAILY" or "WEEKLY"

  logger.debug("checkDateAndReset: Initial state", {
    stateCurrentDay: currentState.currentDayDate,
    stateWeekStart: currentState.currentWeekStartDate,
    stateSelectedTracker: currentState.selectedTrackerDate,
    systemToday: systemTodayStr,
    systemWeekStart: systemCurrentWeekStartStr,
    weekStartPref: weekStartDayPref,
  });

  // Weekly rollover check
  if (currentState.currentWeekStartDate !== systemCurrentWeekStartStr) {
    logger.info(
      `Weekly rollover detected: from ${currentState.currentWeekStartDate} to ${systemCurrentWeekStartStr}`
    );

    // Capture the state of the week that is *ending* before any modifications
    const completedWeekState = JSON.parse(JSON.stringify(currentState)); // Deep copy

    try {
      // Before archiving, ensure its weeklyCounts are accurate based on its dailyCounts

      const accurateWeeklyTotalsForArchive = {};
      const startDateForArchive = new Date(
        completedWeekState.currentWeekStartDate + "T00:00:00"
      );
      for (let i = 0; i < 7; i++) {
        const dayToProcess = new Date(startDateForArchive);
        dayToProcess.setDate(startDateForArchive.getDate() + i);

        const dateStr = dateUtils.formatDateToYYYYMMDD(dayToProcess);

        if (completedWeekState.dailyCounts[dateStr]) {
          for (const foodId in completedWeekState.dailyCounts[dateStr]) {
            accurateWeeklyTotalsForArchive[foodId] =
              (accurateWeeklyTotalsForArchive[foodId] || 0) +
              (completedWeekState.dailyCounts[dateStr][foodId] || 0);
          }
        }
      }
      completedWeekState.weeklyCounts = accurateWeeklyTotalsForArchive; // Use the accurate sum for archival

      logger.debug(
        "State being passed to archiveCurrentWeek:",
        JSON.parse(JSON.stringify(completedWeekState))
      );
      await archiveCurrentWeek(completedWeekState); // Pass the captured state

      // Now, update state for the NEW week
      dispatch({
        type: ACTION_TYPES.SET_CURRENT_WEEK,
        payload: { date: systemCurrentWeekStartStr },
      });
      dispatch({
        type: ACTION_TYPES.SET_CURRENT_DAY,
        payload: { date: systemTodayStr },
      });
      dispatch({ type: ACTION_TYPES.RESET_WEEKLY_COUNTS }); // Resets dailyCounts to today and clears weeklyCounts

      stateChanged = true;
      resetType = "WEEKLY";
      updateMetadata({
        dateResetPerformed: true,
        dateResetType: resetType,
        dateResetTimestamp: dataService.getCurrentTimestamp(),
        previousWeekStartDate: completedWeekState.currentWeekStartDate, // Store the week that was just archived
        // Reset dirty flags for the new week
        dailyTotalsDirty: false,
        weeklyTotalsDirty: false,
        currentWeekDirty: false, // Legacy
      });

      logger.info(
        `Weekly reset complete. New week: ${systemCurrentWeekStartStr}, New day: ${systemTodayStr}`
      );
    } catch (archiveError) {
      logger.error(
        "Weekly rollover failed because archiving the previous week failed:",
        archiveError
      );
      // If archiving fails, we should NOT proceed with the weekly reset to avoid data loss.
      // The app will remain in the "old" week. It will try again on next load/check.
      // Consider showing a persistent error to the user.
      uiRenderer.showToast(
        "Error archiving previous week. Please try syncing or check storage.",
        "error",
        { isPersistent: true }
      );
      return false; // Indicate no state change for current week because of error
    }
  }
  // Daily rollover check (only if no weekly rollover occurred)
  else if (currentState.currentDayDate !== systemTodayStr) {
    logger.info(
      `Daily rollover detected: from ${currentState.currentDayDate} to ${systemTodayStr}`
    );
    dispatch({
      type: ACTION_TYPES.SET_CURRENT_DAY,
      payload: { date: systemTodayStr },
    });
    // No need to call RESET_DAILY_COUNTS for the new 'systemTodayStr' as it will start empty.
    // dailyCounts for previous days in the same week are preserved.

    // Perform a recalculation of weeklyTotals to ensure integrity after a day change,
    // especially if app was closed for multiple days within the same week.
    dispatch({ type: ACTION_TYPES.RECALCULATE_WEEKLY_TOTALS });

    stateChanged = true;
    resetType = "DAILY";
    updateMetadata({
      dateResetPerformed: true,
      dateResetType: resetType,
      dateResetTimestamp: dataService.getCurrentTimestamp(),
      // For daily reset, we don't clear dirty flags, as data might have been entered on previous days.
      // dailyTotalsDirty and weeklyTotalsDirty will be updated by RECALCULATE_WEEKLY_TOTALS if values change.
    });
    logger.info(`Daily reset complete. Current day set to: ${systemTodayStr}`);
  }
  // Ensure selectedTrackerDate is currentDayDate if no other reset happened
  else if (
    currentState.selectedTrackerDate !== currentState.currentDayDate &&
    !stateChanged
  ) {
    logger.info(
      `Aligning selectedTrackerDate (${currentState.selectedTrackerDate}) with currentDayDate (${currentState.currentDayDate}).`
    );
    dispatch({
      type: ACTION_TYPES.SET_SELECTED_TRACKER_DATE,
      payload: { date: currentState.currentDayDate },
    });

    // unless this is the only change. For simplicity, let's not mark stateChanged=true for this.
  }

  if (stateChanged) {
    logger.info(
      `checkDateAndReset completed. Type: ${resetType}. State was changed.`
    );
    // Final state save is handled by individual dispatches typically,
    // but a final save after multiple dispatches can be good.
    saveStateToStorage();
  } else {
    logger.debug("checkDateAndReset: No date or week change requiring reset.");
  }

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
 * Archive the current week data to history.
 * This function assumes it's called BEFORE the state is updated for the new week.
 * @param {Object} completedWeekState - The state object representing the week to be archived.
 *                                      Should contain currentWeekStartDate, dailyCounts (map for the week),
 *                                      weeklyCounts (sum for the week), foodGroups, metadata.weekStartDay.
 * @param {number} [archiveTimestamp] - Optional timestamp for the archive operation.
 * @returns {Promise<void>} Promise that resolves when archive is complete.
 */
async function archiveCurrentWeek(completedWeekState, archiveTimestamp = null) {
  const stateToArchive = completedWeekState || getState();
  const timestamp = archiveTimestamp || dataService.getCurrentTimestamp();

  if (!stateToArchive.currentWeekStartDate) {
    logger.error(
      "Cannot archive week: currentWeekStartDate is missing from stateToArchive."
    );
    return Promise.reject(
      new Error("Missing currentWeekStartDate for archiving.")
    );
  }

  // Filter dailyCounts to only include days within the archived week
  const filteredDailyBreakdown = {};
  const weekStartDateObj = new Date(
    stateToArchive.currentWeekStartDate + "T00:00:00"
  );

  for (let i = 0; i < 7; i++) {
    const dayInArchivedWeekObj = new Date(weekStartDateObj);
    dayInArchivedWeekObj.setDate(weekStartDateObj.getDate() + i);

    const dayStr = dateUtils.formatDateToYYYYMMDD(dayInArchivedWeekObj);

    if (dayStr === "") {
      logger.error(
        "Failed to format date in archiveCurrentWeek, skipping day:",
        dayInArchivedWeekObj
      );
      continue;
    }

    // Check the original dailyCounts from the state being archived
    if (
      stateToArchive.dailyCounts &&
      stateToArchive.dailyCounts.hasOwnProperty(dayStr)
    ) {
      filteredDailyBreakdown[dayStr] =
        typeof stateToArchive.dailyCounts[dayStr] === "object"
          ? { ...stateToArchive.dailyCounts[dayStr] }
          : {};
    } else {
      // Ensure all 7 days have an entry, even if empty
      filteredDailyBreakdown[dayStr] = {};
    }
  }

  const weekDataForHistory = {
    weekStartDate: stateToArchive.currentWeekStartDate,
    dailyBreakdown: filteredDailyBreakdown, // <<< USE THE FILTERED OBJECT HERE
    totals: { ...stateToArchive.weeklyCounts },
  };

  logger.info(
    `Archiving week: ${stateToArchive.currentWeekStartDate}`,
    `DailyBreakdown keys being archived: ${
      Object.keys(weekDataForHistory.dailyBreakdown).length
    }`, // Should now be 7
    `Weekly Totals keys: ${Object.keys(weekDataForHistory.totals || {}).length}`
  );
  logger.debug(
    "Full dailyBreakdown for archive:",
    JSON.parse(JSON.stringify(weekDataForHistory.dailyBreakdown))
  );
  logger.debug(
    "Full totals for archive:",
    JSON.parse(JSON.stringify(weekDataForHistory.totals))
  );

  try {
    await dataService.saveWeekHistory(weekDataForHistory, {
      foodGroups: stateToArchive.foodGroups,
      updatedAt: timestamp,
      weekStartDay: stateToArchive.metadata?.weekStartDay || "Sunday",
    });
    logger.info(
      `Archived week ${stateToArchive.currentWeekStartDate} with timestamp ${timestamp}`
    );

    const historyData = await dataService.getAllWeekHistory();
    dispatch({
      type: ACTION_TYPES.SET_HISTORY,
      payload: { history: historyData || [] },
    });

    updateMetadata({
      historyDirty: true,
      lastModified: timestamp,
    });

    if (historyData && historyData.length > 0) {
      dispatch({
        type: ACTION_TYPES.SET_HISTORY_INDEX,
        payload: { index: 0 },
      });
    }
  } catch (error) {
    logger.error(
      `Failed to archive week ${stateToArchive.currentWeekStartDate}:`,
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
 * Start batching state updates to prevent intermediate UI renders
 */
function startBatching() {
  _batchingUpdates = true;
  logger.debug("Started batching state updates");
}

/**
 * End batching and trigger a final UI update
 */
function endBatching() {
  if (_batchingUpdates) {
    _batchingUpdates = false;
    logger.debug("Ended batching state updates - triggering final UI update");
    // Trigger a final notification with the current state
    notifySubscribers(_state, { type: "BATCH_COMPLETE" });
  }
}

/**
 * Reload state from persistent storage
 * @param {boolean} skipRecalculation - Skip automatic weekly totals recalculation
 * @returns {Promise<boolean>} Success indicator
 */
async function reload(skipRecalculation = false) {
  logger.info("Reloading state from data service");

  // Start batching to prevent intermediate UI updates
  startBatching();

  try {
    // Load fresh data from data service
    const freshData = dataService.loadState();
    logger.debug("Fresh data loaded:", {
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
    logger.info("History data loaded:", historyData.length, "weeks");

    dispatch({
      type: ACTION_TYPES.SET_HISTORY,
      payload: { history: historyData },
    });

    // Recalculate weekly totals to ensure consistency unless caller will handle it
    if (!skipRecalculation) {
      logger.debug("Auto-recalculating weekly totals after reload");
      recalculateWeeklyTotals();
    } else {
      logger.debug("Skipping auto-recalculation - caller will handle it");
    }

    logger.info("State reloaded successfully");
    return true;
  } finally {
    // Always end batching, even if an error occurs
    endBatching();
  }
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

  logger.debug(`==== ensureCurrentDate ====`);
  logger.debug(`Current date in state: ${state.currentDayDate}`);
  logger.debug(`System date: ${todayStr}`);
  logger.debug(`Dates match? ${state.currentDayDate === todayStr}`);

  // If current date in state doesn't match today, update it
  if (state.currentDayDate !== todayStr) {
    logger.info(
      `Correcting currentDayDate from ${state.currentDayDate} to ${todayStr}`
    );
    setCurrentDay(todayStr);
    return true;
  }

  logger.info(`No date correction needed`);
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
  // updateWeeklyCount,
  resetDailyCounts,
  resetWeeklyCounts,
  setCurrentDay,
  setCurrentWeek,
  recalculateWeeklyTotals,
  updateMetadata,

  // Date check & reset
  checkDateAndReset,
  archiveCurrentWeek,
  // ensureCurrentDate,

  // Helper functions
  getFoodGroup,
  reload, // Add reload to the exported methods

  // Batch update controls
  startBatching,
  endBatching,

  // Action types (for external use)
  ACTION_TYPES,
};

window.appStateManager = {
  dispatch,
  getState,
  ACTION_TYPES,
  updateDailyCount, // Action creator
  checkDateAndReset, // The function itself
  recalculateWeeklyTotals, // Good to have for other tests
};
