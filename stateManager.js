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
  INITIALIZE_STATE: 'INITIALIZE_STATE',
  
  // Food counts
  UPDATE_DAILY_COUNT: 'UPDATE_DAILY_COUNT',
  UPDATE_WEEKLY_COUNT: 'UPDATE_WEEKLY_COUNT',
  
  // Date changes
  SET_CURRENT_DAY: 'SET_CURRENT_DAY',
  SET_CURRENT_WEEK: 'SET_CURRENT_WEEK',
  
  // Bulk operations
  RESET_DAILY_COUNTS: 'RESET_DAILY_COUNTS',
  RESET_WEEKLY_COUNTS: 'RESET_WEEKLY_COUNTS',
  
  // History operations
  SET_HISTORY: 'SET_HISTORY',
  SET_HISTORY_INDEX: 'SET_HISTORY_INDEX',
  
  // Import/Export
  IMPORT_STATE: 'IMPORT_STATE'
};

// Default initial state
const defaultState = {
  currentDayDate: null, // YYYY-MM-DD
  currentWeekStartDate: null, // YYYY-MM-DD (Sunday)
  dailyCounts: {}, // { food_id: count }
  weeklyCounts: {}, // { food_id: count }
  history: [], // Array of past week objects { weekStartDate, totals: {...} }
  currentHistoryIndex: -1, // Index for viewed history week (-1 = none selected)
  foodGroups: [] // Reference to food groups configuration
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
  if (typeof callback !== 'function') {
    throw new Error('Subscriber callback must be a function');
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
  _subscribers.forEach(callback => {
    try {
      callback(state, action);
    } catch (error) {
      console.error('Error in subscriber callback:', error);
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
    console.error('Invalid action:', action);
    return _state;
  }

  const prevState = { ..._state };
  const nextState = reducer(prevState, action);
  
  // Only update and notify if state actually changed
  if (JSON.stringify(prevState) !== JSON.stringify(nextState)) {
    _state = nextState;
    
    // Persist state changes to storage if needed
    if (action.type !== ACTION_TYPES.INITIALIZE_STATE && 
        action.type !== ACTION_TYPES.SET_HISTORY &&
        action.type !== ACTION_TYPES.SET_HISTORY_INDEX) {
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
          [groupId]: count
        },
        weeklyCounts: {
          ...state.weeklyCounts,
          [groupId]: (state.weeklyCounts[groupId] || 0) + diff
        }
      };
      
    case ACTION_TYPES.UPDATE_WEEKLY_COUNT:
      return {
        ...state,
        weeklyCounts: {
          ...state.weeklyCounts,
          [action.payload.groupId]: action.payload.count
        }
      };
      
    case ACTION_TYPES.SET_CURRENT_DAY:
      return {
        ...state,
        currentDayDate: action.payload.date
      };
      
    case ACTION_TYPES.SET_CURRENT_WEEK:
      return {
        ...state,
        currentWeekStartDate: action.payload.date
      };
      
    case ACTION_TYPES.RESET_DAILY_COUNTS:
      // Reset all daily counts to 0
      const resetDailyCounts = {};
      Object.keys(state.dailyCounts).forEach(key => {
        resetDailyCounts[key] = 0;
      });
      
      return {
        ...state,
        dailyCounts: resetDailyCounts
      };
      
    case ACTION_TYPES.RESET_WEEKLY_COUNTS:
      // Reset all weekly counts to 0
      const resetWeeklyCounts = {};
      Object.keys(state.weeklyCounts).forEach(key => {
        resetWeeklyCounts[key] = 0;
      });
      
      return {
        ...state,
        weeklyCounts: resetWeeklyCounts
      };
      
    case ACTION_TYPES.SET_HISTORY:
      return {
        ...state,
        history: action.payload.history
      };
      
    case ACTION_TYPES.SET_HISTORY_INDEX:
      return {
        ...state,
        currentHistoryIndex: action.payload.index
      };
      
    case ACTION_TYPES.IMPORT_STATE:
      // Complete replacement of state with imported data
      return {
        ...action.payload
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
  const stateToSave = {
    currentDayDate: _state.currentDayDate,
    currentWeekStartDate: _state.currentWeekStartDate,
    dailyCounts: _state.dailyCounts,
    weeklyCounts: _state.weeklyCounts
  };
  
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
    history: []
  };
  
  // Dispatch initialization action
  dispatch({
    type: ACTION_TYPES.INITIALIZE_STATE,
    payload: initialState
  });
  
  // Load history data
  try {
    const historyData = await dataService.getAllWeekHistory();
    
    dispatch({
      type: ACTION_TYPES.SET_HISTORY,
      payload: { history: historyData }
    });
    
    // Set default history index if history exists
    if (historyData.length > 0) {
      dispatch({
        type: ACTION_TYPES.SET_HISTORY_INDEX,
        payload: { index: 0 }
      });
    }
  } catch (error) {
    console.error('Failed to load history data:', error);
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
  return dispatch({
    type: ACTION_TYPES.UPDATE_DAILY_COUNT,
    payload: { groupId, count }
  });
}

/**
 * Action creator for updating weekly count
 * @param {string} groupId - The food group ID
 * @param {number} count - The new count value
 * @returns {Object} The action object
 */
function updateWeeklyCount(groupId, count) {
  return dispatch({
    type: ACTION_TYPES.UPDATE_WEEKLY_COUNT,
    payload: { groupId, count }
  });
}

/**
 * Action creator for resetting daily counts
 * @returns {Object} The action object
 */
function resetDailyCounts() {
  return dispatch({
    type: ACTION_TYPES.RESET_DAILY_COUNTS,
    payload: {}
  });
}

/**
 * Action creator for resetting weekly counts
 * @returns {Object} The action object
 */
function resetWeeklyCounts() {
  return dispatch({
    type: ACTION_TYPES.RESET_WEEKLY_COUNTS,
    payload: {}
  });
}

/**
 * Action creator for setting current day date
 * @param {string} date - The current day date (YYYY-MM-DD)
 * @returns {Object} The action object
 */
function setCurrentDay(date) {
  return dispatch({
    type: ACTION_TYPES.SET_CURRENT_DAY,
    payload: { date }
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
    payload: { date }
  });
}

/**
 * Check and update dates based on current time
 * @returns {Promise<boolean>} True if date changes occurred
 */
async function checkDateAndReset() {
  const state = getState();
  const today = dataService.getCurrentDate();
  const todayStr = dataService.getTodayDateString();
  const currentWeekStartStr = dataService.getWeekStartDate(today);
  
  let stateChanged = false;
  let weekResetOccurred = false;
  
  // Check for week change
  if (state.currentWeekStartDate !== currentWeekStartStr) {
    console.log(`Week reset: ${state.currentWeekStartDate} -> ${currentWeekStartStr}`);
    
    // Archive the completed week before resetting
    await archiveCurrentWeek();
    
    // Set new week start date
    setCurrentWeek(currentWeekStartStr);
    
    // Reset weekly counts
    resetWeeklyCounts();
    
    // Reset daily counts and set new day (handled by week change)
    resetDailyCounts();
    setCurrentDay(todayStr);
    
    stateChanged = true;
    weekResetOccurred = true;
  }
  
  // Check for day change (if week didn't already reset)
  if (!weekResetOccurred && state.currentDayDate !== todayStr) {
    console.log(`Day reset: ${state.currentDayDate} -> ${todayStr}`);
    
    // Add daily counts to weekly before resetting
    const { dailyCounts, weeklyCounts } = state;
    
    // Find all daily-tracked food groups
    const dailyGroups = state.foodGroups.filter(group => 
      group.frequency === 'day' || group.id === 'butter_margarine' || group.id === 'wine'
    );
    
    // Update weekly counts for each daily group
    dailyGroups.forEach(group => {
      const groupId = group.id;
      if (dailyCounts[groupId] && dailyCounts[groupId] > 0) {
        const newWeeklyCount = (weeklyCounts[groupId] || 0) + dailyCounts[groupId];
        updateWeeklyCount(groupId, newWeeklyCount);
      }
    });
    
    // Reset daily counts
    resetDailyCounts();
    
    // Set new day
    setCurrentDay(todayStr);
    
    stateChanged = true;
  }
  
  return stateChanged;
}

/**
 * Archive the current week's data to history
 * @returns {Promise<void>}
 */
async function archiveCurrentWeek() {
  const state = getState();
  
  // Create week data object for archiving
  const weekData = {
    weekStartDate: state.currentWeekStartDate,
    weekStartDaySetting: 'Sunday', // Default day setting
    totals: { ...state.weeklyCounts },
    
    // Store targets for future reference
    targets: state.foodGroups.reduce((acc, group) => {
      acc[group.id] = {
        target: group.target,
        frequency: group.frequency,
        type: group.type,
        unit: group.unit,
      };
      return acc;
    }, {})
  };
  
  try {
    // Save week data to history store
    await dataService.saveWeekHistory(weekData);
    console.log(`Archived week ${state.currentWeekStartDate}`);
    
    // Refresh history data
    const historyData = await dataService.getAllWeekHistory();
    
    dispatch({
      type: ACTION_TYPES.SET_HISTORY,
      payload: { history: historyData }
    });
    
    // Reset history index to show most recent
    if (historyData.length > 0) {
      dispatch({
        type: ACTION_TYPES.SET_HISTORY_INDEX,
        payload: { index: 0 }
      });
    }
  } catch (error) {
    console.error(`Failed to archive week ${state.currentWeekStartDate}:`, error);
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
  return state.foodGroups.find(group => group.id === id) || null;
}

// Add to stateManager
async reload() {
  console.log("Reloading state from data service");
  
  // Load fresh data from data service
  const freshData = this.dataService.loadState();
  console.log("Fresh data loaded:", {
    dayDate: freshData.currentDayDate,
    weekStartDate: freshData.currentWeekStartDate,
    dailyCounts: Object.keys(freshData.dailyCounts || {}),
    weeklyCounts: Object.keys(freshData.weeklyCounts || {})
  });
  
  // Update state with fresh data
  this.dispatch({
    type: this.ACTION_TYPES.SET_STATE,
    payload: freshData
  });
  
  // Also reload history if needed
  const historyData = await this.dataService.getAllWeekHistory();
  console.log("History data loaded:", historyData.length, "weeks");
  
  this.dispatch({
    type: this.ACTION_TYPES.SET_HISTORY,
    payload: { history: historyData }
  });
  
  console.log("State reloaded successfully");
  return true;
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
  
  // Helper functions
  getFoodGroup,
  
  // Action types (for external use)
  ACTION_TYPES
};
