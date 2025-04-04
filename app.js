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

import { initDB, db, saveWeekHistory, getWeekHistory, getAllWeekHistory, getMonday } from './db.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const foodGroups = [
        // Daily Positive
        { id: 'whole_grains', name: 'Whole Grains', frequency: 'day', target: 3, unit: 'servings', type: 'positive' },
        { id: 'other_veg', name: 'Other Vegetables', frequency: 'day', target: 1, unit: 'serving', type: 'positive' },
        { id: 'olive_oil', name: 'Olive Oil', frequency: 'day', target: 1, unit: 'Tbsp (main oil)', type: 'positive' }, // Represent as 1 'use' per day

        // Weekly Positive
        { id: 'leafy_greens', name: 'Green Leafy Vegetables', frequency: 'week', target: 6, unit: 'servings', type: 'positive' },
        { id: 'nuts', name: 'Nuts', frequency: 'week', target: 5, unit: 'servings', type: 'positive' },
        { id: 'beans', name: 'Beans', frequency: 'week', target: 4, unit: 'servings', type: 'positive' }, // MIND often lists 3+, let's use 4
        { id: 'berries', name: 'Berries', frequency: 'week', target: 2, unit: 'servings', type: 'positive' },
        { id: 'poultry', name: 'Poultry', frequency: 'week', target: 2, unit: 'servings', type: 'positive' },
        { id: 'fish', name: 'Fish', frequency: 'week', target: 1, unit: 'serving', type: 'positive' },
        { id: 'wine', name: 'Wine (optional)', frequency: 'day', target: 1, unit: 'glass (max)', type: 'limit', isOptional: true }, // Technically daily limit, but track weekly total too? Track daily, sum weekly. Target 0-7 per week effectively.

        // Weekly Limit
        { id: 'red_meat', name: 'Red Meats', frequency: 'week', target: 3, unit: 'servings (max)', type: 'limit' }, // MIND uses <4, so max is 3
        { id: 'butter_margarine', name: 'Butter/Margarine', frequency: 'day', target: 1, unit: 'Tbsp (max)', type: 'limit' }, // Track daily, sum weekly. Max ~7 weekly.
        { id: 'cheese', name: 'Cheese', frequency: 'week', target: 1, unit: 'serving (max)', type: 'limit' },
        { id: 'pastries_sweets', name: 'Pastries & Sweets', frequency: 'week', target: 4, unit: 'servings (max)', type: 'limit' }, // MIND uses <5, so max is 4
        { id: 'fried_fast_food', name: 'Fried/Fast Food', frequency: 'week', target: 1, unit: 'serving (max)', type: 'limit' },
    ];

    // --- State Variables ---
    let state = {
        currentDayDate: null, // YYYY-MM-DD
        currentWeekStartDate: null, // YYYY-MM-DD (Monday)
        dailyCounts: {}, // { food_id: count }
        weeklyCounts: {}, // { food_id: count }
        history: [], // Array of past week objects { weekStartDate, totals: {...} }
        currentHistoryIndex: -1 // Index for viewed history week (-1 = none selected)
    };

    // --- DOM Elements ---
    const views = {
        'tracker': document.getElementById('tracker-view'), // Use strings for kebab-case keys
        'current-week': document.getElementById('current-week-view'),
        'history': document.getElementById('history-view')
    };
    const navButtons = document.querySelectorAll('nav button[data-view]');
    const dailyGoalsContainer = document.getElementById('daily-goals');
    const weeklyGoalsContainer = document.getElementById('weekly-goals');
    const foodGroupTemplate = document.getElementById('food-group-item-template');
    const currentDateEl = document.getElementById('current-date');
    const currentWeekStartDateEl = document.getElementById('current-week-start-date');
    const currentWeekSummaryContent = document.getElementById('current-week-summary-content');
    const historyContent = document.getElementById('history-content');
    const historyWeekLabel = document.getElementById('history-week-label');
    const prevWeekBtn = document.getElementById('prev-week-btn');
    const nextWeekBtn = document.getElementById('next-week-btn');
    const historyDatePicker = document.getElementById('history-date-picker');

    async function initializeApp() {
        console.log("Initializing app...");
    
        try {
            console.log("Calling initDB...");
            await initDB(); // Ensure IndexedDB is initialized
            console.log("DB initialized:", db);
    
            if (!db) {
                console.error("DB is still unavailable after initDB()");
                return;
            }
    
            registerServiceWorker();
            loadState();
            await checkDateAndResetCounters(); // Crucial step before rendering
            renderUI();
            setupEventListeners();
            loadHistoryData(); // Load history after initial render
            setActiveView('tracker'); // Start on tracker view
    
            console.log("App initialization complete.");
        } catch (error) {
            console.error("Error during app initialization:", error);
        }
    }
    
    // --- Service Worker ---
    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(registration => console.log('Service Worker registered with scope:', registration.scope))
                .catch(error => console.log('Service Worker registration failed:', error));
        }
    }

    // --- State Management ---
    function loadState() {
        const savedState = JSON.parse(localStorage.getItem('mindTrackerState')) || {};
        // Update date logic be local-centric to avoid timezone issues
        // const today = new Date().toISOString().split('T')[0];
        const initDate = new Date();
        const initYear = initDate.getFullYear();
        const initMonth = String(initDate.getMonth() + 1).padStart(2, '0');
        const initDay = String(initDate.getDate()).padStart(2, '0');
        const today = `${initYear}-${initMonth}-${initDay}`; // Create default date string from local components

        const currentMonday = getMonday(new Date()); // Use helper from db.js

        state.currentDayDate = savedState.currentDayDate || today;
        state.currentWeekStartDate = savedState.currentWeekStartDate || currentMonday;

        // Initialize counts if not present
        state.dailyCounts = savedState.dailyCounts || {};
        state.weeklyCounts = savedState.weeklyCounts || {};
        foodGroups.forEach(group => {
             if (group.frequency === 'day' || group.id === 'butter_margarine' || group.id === 'wine') { // Track these daily
                if (!(group.id in state.dailyCounts)) state.dailyCounts[group.id] = 0;
            }
            if (group.frequency === 'week' || group.frequency === 'day' || group.id === 'butter_margarine' || group.id === 'wine') { // All groups need weekly tracking (daily ones summed up)
                 if (!(group.id in state.weeklyCounts)) state.weeklyCounts[group.id] = 0;
            }
        });

        console.log("Loaded state:", state);
    }

    function saveState() {
        const stateToSave = {
            currentDayDate: state.currentDayDate,
            currentWeekStartDate: state.currentWeekStartDate,
            dailyCounts: state.dailyCounts,
            weeklyCounts: state.weeklyCounts
        };
        localStorage.setItem('mindTrackerState', JSON.stringify(stateToSave));
        console.log("Saved state:", stateToSave);
    }

    // --- Date & Reset Logic ---
    async function checkDateAndResetCounters() {
        const today = new Date();

        // Replace original logic with local-centric date handling to avoid timezone issues 
        // const todayStr = today.toISOString().split('T')[0];
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0'); // Add 1 for month, pad with leading zero
        const day = String(today.getDate()).padStart(2, '0'); // Pad day with leading zero
        const todayStr = `${year}-${month}-${day}`; // Construct YYYY-MM-DD from local components
        console.log("Calculated todayStr (local):", todayStr); // Add this log for verification        

        const currentMondayStr = getMonday(today); // Use helper from db.js

        let stateChanged = false;
        let weekResetOccurred = false;

        // Check for Week Reset FIRST (Sunday night to Monday morning)
        if (state.currentWeekStartDate !== currentMondayStr) {
            console.log(`Week reset triggered: Stored week ${state.currentWeekStartDate}, Current week ${currentMondayStr}`);
             // Archive the COMPLETED week (using the old state.currentWeekStartDate)
             await archiveWeek(state.currentWeekStartDate, state.weeklyCounts);

             // Reset weekly counts for the NEW week
            Object.keys(state.weeklyCounts).forEach(key => {
                state.weeklyCounts[key] = 0;
            });
             state.currentWeekStartDate = currentMondayStr; // Update to the new week start
             stateChanged = true;
             weekResetOccurred = true; // Flag that week reset happened

             // ALSO Reset daily counters as it's a new day within the new week
             console.log("Resetting daily counts due to week change.");
             Object.keys(state.dailyCounts).forEach(key => {
                state.dailyCounts[key] = 0;
             });
             state.currentDayDate = todayStr; // Update day as well
        }

        // Debugging log for pre-day check
        console.log(`PRE-DAY-CHECK: Stored Date = '${state.currentDayDate}', Today's Date = '${todayStr}', Comparison Result = ${state.currentDayDate !== todayStr}`);

        // Check for Day Reset (if week hasn't already reset the day)
        if (!weekResetOccurred && state.currentDayDate !== todayStr) {
            console.log(`Day reset triggered: Stored day ${state.currentDayDate}, Current day ${todayStr}`);
            // Add today's daily counts to the current week's totals BEFORE resetting daily
            foodGroups.forEach(group => {
                if (group.frequency === 'day' || group.id === 'butter_margarine' || group.id === 'wine') { // Only add counts for groups tracked daily
                    if (state.dailyCounts[group.id] && state.dailyCounts[group.id] > 0) {
                         state.weeklyCounts[group.id] = (state.weeklyCounts[group.id] || 0) + state.dailyCounts[group.id];
                         console.log(`Adding ${state.dailyCounts[group.id]} from ${group.id} (daily) to weekly total.`);
                    }
                }
            });

            // Reset daily counts
            Object.keys(state.dailyCounts).forEach(key => {
                state.dailyCounts[key] = 0;
            });
            state.currentDayDate = todayStr;
            stateChanged = true;
        }


        if (stateChanged) {
            // Debugging log to confirm state change
            console.log('State changed detected. Preparing to save state. Current date in state:', state.currentDayDate);
            saveState();
            if (weekResetOccurred) {
                await loadHistoryData(); // Reload history if a week was archived
            }
        } else {
            // Debugging log to confirm no state change
            console.log('No state change detected. Skipping saveState.');
        }
    }

    async function archiveWeek(weekStartDate, weeklyTotals) {
        console.log(`Archiving week starting: ${weekStartDate}`);
        // Deep clone totals to prevent modification issues
        const totalsToSave = JSON.parse(JSON.stringify(weeklyTotals));
        const weekData = {
            weekStartDate: weekStartDate,
            totals: totalsToSave,
             // Optional: Store targets at the time of archiving if they might change
            targets: foodGroups.reduce((acc, group) => {
                acc[group.id] = { target: group.target, frequency: group.frequency, type: group.type, unit: group.unit };
                return acc;
            }, {})
        };
        try {
            await saveWeekHistory(weekData);
            console.log("Week archived successfully to IndexedDB");
        } catch (error) {
            console.error("Failed to archive week:", error);
            // Consider alerting the user or implementing retry logic
        }
    }

    // --- Rendering ---
    function renderUI() {
        // Debugging log to confirm renderUI is being called
        console.log('renderUI: Using date from state:', state.currentDayDate);
        
        // Update current date display - REVISED to ensure it uses the local date format
        //currentDateEl.textContent = new Date(state.currentDayDate).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        // Construct the date object ensuring it's treated as local time midnight
        const displayDate = new Date(state.currentDayDate + 'T00:00:00');
        currentDateEl.textContent = displayDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        currentWeekStartDateEl.textContent = new Date(state.currentWeekStartDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' }); // Add time to avoid timezone issues

        // --- Updated Clearing Logic ---
        // Clear existing items, using the new single weekly container
        dailyGoalsContainer.innerHTML = '<h3>Daily Goals</h3>';
        weeklyGoalsContainer.innerHTML = '<h3>Weekly Goals</h3>'; // Clear the merged weekly container

        // Render food group items
        foodGroups.forEach(group => {
            const item = foodGroupTemplate.content.cloneNode(true).querySelector('.food-group-item');
            item.dataset.id = group.id;
            item.querySelector('.name').textContent = group.name;

            // --- Target Description Logic (Unchanged) ---
            let targetDesc = "";
            const targetVal = group.target;
            // Use 'day' frequency for Wine/Butter explicitly for description if needed, or rely on config
            const freqText = group.frequency === 'day' ? 'day' : 'week';
            const unitText = group.unit || 'servings';

            if (group.type === 'positive') {
                targetDesc = `Target: ≥ ${targetVal} ${unitText}/${freqText}`;
            } else { // limit
                targetDesc = `Limit: ≤ ${targetVal} ${unitText}/${freqText}`;
                if (group.isOptional) targetDesc += " (optional)";
            }
            item.querySelector('.target').textContent = targetDesc;

            // --- Input Value and Weekly Total Display Logic (Unchanged logic, but runs for items in both containers) ---
            const countInput = item.querySelector('.count-input');
            const weeklyTotalSpan = item.querySelector('.current-week-total');
            const weeklyTotalValue = item.querySelector('.wk-val');

            // Set current count and weekly total display BASED ON THE GROUP'S CONFIGURED FREQUENCY
            if (group.frequency === 'day') {
                // This applies to Whole Grains, Other Veg, Olive Oil, AND Wine, Butter/Margarine
                countInput.value = state.dailyCounts[group.id] || 0;
                countInput.dataset.frequency = 'day'; // CRITICAL: Mark input as daily
                weeklyTotalSpan.style.display = 'inline'; // Show weekly total for daily items
                weeklyTotalValue.textContent = state.weeklyCounts[group.id] || 0;
            } else { // group.frequency === 'week'
                // This applies to Leafy Greens, Nuts, Beans, etc., AND Red Meat, Cheese, Sweets, etc.
                countInput.value = state.weeklyCounts[group.id] || 0;
                countInput.dataset.frequency = 'week'; // CRITICAL: Mark input as weekly
                weeklyTotalSpan.style.display = 'none'; // Hide redundant weekly sub-total for weekly items
            }

            countInput.dataset.groupid = group.id; // Link input to group id

            // --- NEW Simplified Appending Logic ---
            // Append to the correct section based purely on frequency configuration
            if (group.frequency === 'day') {
                // All items configured for daily input go here (Positives AND Limits like Wine/Butter)
                dailyGoalsContainer.appendChild(item);
            } else if (group.frequency === 'week') {
                // All items configured for weekly input go here (Positives AND Limits)
                weeklyGoalsContainer.appendChild(item); // Append to the single weekly container
            }
            // Optional: Add an else for debugging if a group has an unexpected frequency
            // else { console.warn(`Food group '${group.name}' has unexpected frequency '${group.frequency}' and was not rendered.`); }
        });

        // Render Current Week Summary immediately (Unchanged call)
        renderCurrentWeekSummary();
    }

     function renderCurrentWeekSummary() {
        currentWeekSummaryContent.innerHTML = ''; // Clear previous
        const ul = document.createElement('ul');

         // Get effective weekly target (sum daily targets over 7 days)
         const getWeeklyTarget = (group) => {
             if (group.frequency === 'week') return group.target;
             // For daily goals, multiply by 7 for a weekly perspective
             if (group.frequency === 'day') return group.target * 7;
             return group.target; // Should cover specific cases like Wine/Butter if needed differently
         };

        foodGroups.forEach(group => {
            const li = document.createElement('li');
            const currentTotal = state.weeklyCounts[group.id] || 0;
            const weeklyTarget = getWeeklyTarget(group);
            let statusClass = '';

            if (group.type === 'positive') {
                if (currentTotal >= weeklyTarget) statusClass = 'goal-met';
                // else statusClass = 'goal-missed'; // Optional: highlight unmet positive goals too
            } else { // limit
                if (currentTotal <= weeklyTarget) statusClass = 'limit-ok';
                if (currentTotal > weeklyTarget * 0.75 && currentTotal <= weeklyTarget) statusClass = 'limit-near'; // If > 75% of limit
                if (currentTotal > weeklyTarget) statusClass = 'limit-exceeded';
            }

            if (statusClass) li.classList.add(statusClass);

            li.innerHTML = `
                <span class="food-name">${group.name}</span>
                <span class="servings">
                    Current: ${currentTotal} / Target ${group.type === 'limit' ? '≤' : '≥'} ${weeklyTarget} per week
                </span>
            `;
            ul.appendChild(li);
        });
        currentWeekSummaryContent.appendChild(ul);
    }


    function renderHistory(weekIndex = -1) {
         historyContent.innerHTML = ''; // Clear previous
         if (state.history.length === 0) {
            historyContent.innerHTML = '<p>No history data available yet.</p>';
            historyWeekLabel.textContent = "No History";
            prevWeekBtn.disabled = true;
            nextWeekBtn.disabled = true;
            historyDatePicker.value = '';
            return;
         }

         // If weekIndex is -1, default to the most recent week (index 0)
        if (weekIndex === -1 || weekIndex >= state.history.length) {
             state.currentHistoryIndex = 0;
        } else {
             state.currentHistoryIndex = weekIndex;
        }

         const weekData = state.history[state.currentHistoryIndex];
         if (!weekData) {
            historyContent.innerHTML = '<p>Error: Could not load selected week data.</p>';
             historyWeekLabel.textContent = "Error";
             prevWeekBtn.disabled = true;
             nextWeekBtn.disabled = true;
             return;
         }

         // Update Navigation
         const weekStartDate = new Date(weekData.weekStartDate + 'T00:00:00'); // Add time part for accurate display
         historyWeekLabel.textContent = `Week of ${weekStartDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}`;
         prevWeekBtn.disabled = state.currentHistoryIndex === 0;
         nextWeekBtn.disabled = state.currentHistoryIndex >= state.history.length - 1;
         // Set date picker to a date within the displayed week (e.g., the start date)
         historyDatePicker.value = weekData.weekStartDate;


         const ul = document.createElement('ul');
         // Use the targets stored *with* the history data if available, otherwise use current config
         const targets = weekData.targets || foodGroups.reduce((acc, group) => {
                acc[group.id] = { target: group.target, frequency: group.frequency, type: group.type, unit: group.unit };
                return acc;
            }, {});

         // Display in the same order as foodGroups config for consistency
         foodGroups.forEach(group => {
             const groupId = group.id;
             const total = weekData.totals[groupId] || 0;
             const targetInfo = targets[groupId]; // Get target info (from history or current)

             if (!targetInfo) return; // Skip if group didn't exist back then / no target info

             // Calculate the effective weekly target based on frequency stored/current
             let effectiveWeeklyTarget;
             if (targetInfo.frequency === 'week') {
                 effectiveWeeklyTarget = targetInfo.target;
             } else if (targetInfo.frequency === 'day') {
                 effectiveWeeklyTarget = targetInfo.target * 7; // Sum daily goal over 7 days
             } else {
                 effectiveWeeklyTarget = targetInfo.target; // Fallback
             }

             const li = document.createElement('li');
             let statusClass = '';

             if (targetInfo.type === 'positive') {
                 if (total >= effectiveWeeklyTarget) statusClass = 'goal-met';
                 else statusClass = 'goal-missed';
             } else { // limit
                if (total <= effectiveWeeklyTarget) statusClass = 'limit-ok';
                // Add 'near' state only if target > 0 to avoid issues with target=0 or target=1
                if (effectiveWeeklyTarget > 0 && total > effectiveWeeklyTarget * 0.75 && total <= effectiveWeeklyTarget) statusClass = 'limit-near';
                if (total > effectiveWeeklyTarget) statusClass = 'limit-exceeded';
             }

             if (statusClass) li.classList.add(statusClass);

             li.innerHTML = `
                <span class="food-name">${group.name}</span>
                <span class="servings">
                    Total: ${total} / Target ${targetInfo.type === 'limit' ? '≤' : '≥'} ${effectiveWeeklyTarget} per week
                </span>
            `;
             ul.appendChild(li);
         });

         historyContent.appendChild(ul);
    }


    // --- Event Handling ---
    function setupEventListeners() {
        // Navigation
        navButtons.forEach(button => {
            button.addEventListener('click', () => setActiveView(button.dataset.view));
        });

        // Counter buttons and input changes (using event delegation on containers)
        [dailyGoalsContainer, weeklyGoalsContainer].forEach(container => { 
            container.addEventListener('click', handleCounterClick);
            container.addEventListener('change', handleCounterInputChange); // For direct input changes
            container.addEventListener('input', handleCounterInputChange); // For live updates as user types (optional)
        });

        // History Navigation
        prevWeekBtn.addEventListener('click', () => {
            if (state.currentHistoryIndex > 0) {
                renderHistory(state.currentHistoryIndex - 1);
            }
        });
        nextWeekBtn.addEventListener('click', () => {
             if (state.currentHistoryIndex < state.history.length - 1) {
                renderHistory(state.currentHistoryIndex + 1);
            }
        });
        historyDatePicker.addEventListener('change', handleHistoryDatePick);
    }

     function handleCounterClick(event) {
        const button = event.target.closest('button');
        if (!button) return; // Exit if click wasn't on or inside a button

        const item = button.closest('.food-group-item');
        if (!item) return; // Exit if button wasn't inside a food group item

        const groupId = item.dataset.id;
        const input = item.querySelector('.count-input');
        const isDaily = input.dataset.frequency === 'day';
        let currentValue = parseInt(input.value, 10) || 0;

        if (button.classList.contains('increment-btn')) {
            currentValue++;
        } else if (button.classList.contains('decrement-btn')) {
            currentValue = Math.max(0, currentValue - 1); // Prevent negative values
        } else {
            return; // Ignore if it wasn't an increment/decrement button
        }

        updateCount(groupId, currentValue, isDaily, item);
    }

    function handleCounterInputChange(event) {
        const input = event.target;
        if (!input || !input.classList.contains('count-input')) return; // Check if it's the correct input

        const item = input.closest('.food-group-item');
         if (!item) return;

         const groupId = item.dataset.id; // Or input.dataset.groupid
        const isDaily = input.dataset.frequency === 'day';
        let newValue = parseInt(input.value, 10);

        // Validate input
        if (isNaN(newValue) || newValue < 0) {
            newValue = 0; // Reset to 0 if invalid or negative
            input.value = newValue; // Update the input field visually
        }

        updateCount(groupId, newValue, isDaily, item);
    }

     function updateCount(groupId, newValue, isDaily, itemElement) {
        if (isDaily) {
            // If daily count changed, update both daily and potentially weekly
            const oldValue = state.dailyCounts[groupId] || 0;
            const diff = newValue - oldValue;
            state.dailyCounts[groupId] = newValue;
            state.weeklyCounts[groupId] = (state.weeklyCounts[groupId] || 0) + diff; // Adjust weekly total by the difference
        } else {
            // If weekly count changed directly
            state.weeklyCounts[groupId] = newValue;
        }

        // Update UI elements within the specific item
        itemElement.querySelector('.count-input').value = newValue; // Ensure input reflects the state value
        if (isDaily) {
             const weeklyTotalValue = itemElement.querySelector('.wk-val');
             if(weeklyTotalValue) weeklyTotalValue.textContent = state.weeklyCounts[groupId] || 0;
        }

        saveState();
         renderCurrentWeekSummary(); // Update summary whenever counts change
        console.log(`Updated count for ${groupId}: Daily=${state.dailyCounts[groupId]}, Weekly=${state.weeklyCounts[groupId]}`);
    }

    function handleHistoryDatePick() {
        const selectedDateStr = historyDatePicker.value;
        if (!selectedDateStr) return;

        const selectedDate = new Date(selectedDateStr + "T00:00:00"); // Ensure consistent time for comparison
        const targetWeekStart = getMonday(selectedDate); // Find the Monday of the week containing the selected date

        // Find the index in our history array that matches this week start date
        const foundIndex = state.history.findIndex(week => week.weekStartDate === targetWeekStart);

        if (foundIndex !== -1) {
            renderHistory(foundIndex); // Render the found week
        } else {
            // Optional: Provide feedback if the selected week isn't in the history
            alert(`No history found for the week starting ${targetWeekStart}.\nShowing the last viewed/most recent week.`);
            // Reset date picker or leave it? Maybe leave it but show default week.
            if (state.currentHistoryIndex !== -1) {
                historyDatePicker.value = state.history[state.currentHistoryIndex].weekStartDate;
            } else if (state.history.length > 0) {
                 historyDatePicker.value = state.history[0].weekStartDate;
            } else {
                 historyDatePicker.value = '';
            }
            // renderHistory(state.currentHistoryIndex); // Re-render current history view
        }
    }


    // --- View Switching ---
    function setActiveView(viewId) {
        console.log("setActiveView called with viewId:", viewId); // Keep for debugging if you want
    
        // Hide all views
        Object.values(views).forEach(view => view.classList.remove('active-view'));
        // Deactivate all nav buttons
        navButtons.forEach(button => button.classList.remove('active'));
    
        // Show the selected view (use viewId directly as the key)
        const activeView = views[viewId]; // <<< CHANGE HERE (remove .replace)
        if (activeView) {
            console.log("Adding active-view class to:", activeView.id); // Optional log
            activeView.classList.add('active-view');
        } else {
            console.error(`Could not find view element for key: ${viewId}`); // Add error log
        }
    
        // Activate the corresponding nav button (This part should be fine)
        const activeButton = document.querySelector(`nav button[data-view="${viewId}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        } else {
             console.error(`Could not find button element for viewId: ${viewId}`); // Add error log
        }
    
        // --- Existing History/Current Week Logic ---
        if (viewId === 'history' && state.history.length === 0) {
             loadHistoryData();
        } else if (viewId === 'history') {
             renderHistory(state.currentHistoryIndex);
        } else if (viewId === 'current-week') { // <<< Note: viewId is 'current-week'
            renderCurrentWeekSummary(); // This should now run correctly
        }
    }

    // --- History Data Loading ---
    async function loadHistoryData() {
        try {
            state.history = await getAllWeekHistory(); // Fetch and sort (newest first)
            state.currentHistoryIndex = state.history.length > 0 ? 0 : -1; // Default view to most recent week
            console.log(`Loaded ${state.history.length} weeks of history.`);
             // Only render if the history view is currently active or becomes active
            if (views.history.classList.contains('active-view')) {
                 renderHistory();
            } else {
                 // If not active, just ensure nav buttons are updated based on whether history exists
                 prevWeekBtn.disabled = true; // Will be enabled by renderHistory if needed
                 nextWeekBtn.disabled = state.history.length <= 1;
            }
        } catch (error) {
            console.error("Failed to load history data:", error);
            historyContent.innerHTML = "<p>Error loading history data.</p>";
             prevWeekBtn.disabled = true;
             nextWeekBtn.disabled = true;
        }
    }


    // --- Start the App ---
    initializeApp();
});