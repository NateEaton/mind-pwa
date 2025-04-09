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

import { initDB, db, saveWeekHistory, getWeekHistory, getAllWeekHistory, getWeekStartDate, clearHistoryStore } from './db.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
     const foodGroups = [
         // Daily Positive
        { id: 'whole_grains', name: 'Whole Grains', frequency: 'day', target: 3, unit: 'servings', type: 'positive',
          description: 'Serving examples: 1 slice whole-grain bread, ½ cup cooked whole grains (oats, quinoa, brown rice), ½ cup whole-grain cereal, 3 cups popped popcorn.' },
        { id: 'other_veg', name: 'Other Vegetables', frequency: 'day', target: 1, unit: 'serving', type: 'positive',
          description: 'Serving examples: ½ cup cooked or 1 cup raw non-starchy vegetables (broccoli, peppers, carrots, tomatoes, zucchini, onions, etc.). Excludes potatoes.' },
        { id: 'olive_oil', name: 'Olive Oil', frequency: 'day', target: 1, unit: 'Tbsp (main oil)', type: 'positive',
          description: 'Use extra virgin olive oil (EVOO) as your principal oil for cooking, dressings, etc. Aim for at least 1 Tbsp use daily.' },

         // Weekly Positive
        { id: 'leafy_greens', name: 'Green Leafy Vegetables', frequency: 'week', target: 6, unit: 'servings', type: 'positive',
          description: 'Serving examples: 1 cup raw or ½ cup cooked leafy greens (spinach, kale, collards, romaine, arugula, etc.).' },
        { id: 'nuts', name: 'Nuts', frequency: 'week', target: 5, unit: 'servings', type: 'positive',
          description: 'Serving examples: ¼ cup nuts or 2 Tbsp nut butter (almonds, walnuts, pecans preferred; avoid heavily salted/sugared nuts).' },
        { id: 'beans', name: 'Beans', frequency: 'week', target: 4, unit: 'servings', type: 'positive',
          description: 'Serving examples: ½ cup cooked beans, lentils, or legumes (kidney, black, pinto beans, chickpeas, soybeans, etc.).' },
        { id: 'berries', name: 'Berries', frequency: 'week', target: 2, unit: 'servings', type: 'positive',
          description: 'Serving examples: ½ cup fresh or frozen berries (blueberries strongly recommended, strawberries, raspberries, blackberries).' },
        { id: 'poultry', name: 'Poultry', frequency: 'week', target: 2, unit: 'servings', type: 'positive',
          description: 'Serving examples: 3-4 oz cooked chicken or turkey (prefer skinless, not fried).' },
        { id: 'fish', name: 'Fish', frequency: 'week', target: 1, unit: 'serving', type: 'positive',
          description: 'Serving examples: 3-4 oz cooked fish (prefer oily fish like salmon, mackerel, sardines; avoid fried fish).' },
        { id: 'wine', name: 'Wine', frequency: 'day', target: 1, unit: 'glass (max)', type: 'limit', isOptional: true,
          description: 'Optional: Limit to no more than one standard glass (approx. 5 oz) per day. Red wine is often specified.' },

         // Weekly Limit
        { id: 'red_meat', name: 'Red Meats', frequency: 'week', target: 3, unit: 'servings (max)', type: 'limit',
          description: 'Limit to less than 4 servings/week (target ≤3). Serving ~3-4 oz cooked. Includes beef, pork, lamb, and processed meats.' },
        { id: 'butter_margarine', name: 'Butter/Margarine', frequency: 'day', target: 1, unit: 'Tbsp (max)', type: 'limit',
          description: 'Limit butter to less than 1 Tbsp per day. Avoid stick margarine entirely.' },
        { id: 'cheese', name: 'Cheese', frequency: 'week', target: 1, unit: 'serving (max)', type: 'limit',
          description: 'Limit full-fat cheese to less than 1 serving/week (target ≤1). Serving ~1-1.5 oz.' },
        { id: 'pastries_sweets', name: 'Pastries & Sweets', frequency: 'week', target: 4, unit: 'servings (max)', type: 'limit',
          description: 'Limit pastries and sweets to less than 5 servings/week (target ≤4). Includes cakes, cookies, candies, ice cream, sugary drinks etc.' },
        { id: 'fried_fast_food', name: 'Fried/Fast Food', frequency: 'week', target: 1, unit: 'serving (max)', type: 'limit',
          description: 'Limit fried food (especially commercial) and fast food to less than 1 serving/week (target ≤1).' },
     ];

    // --- State Variables ---
    let state = {
        currentDayDate: null, // YYYY-MM-DD
        currentWeekStartDate: null, // YYYY-MM-DD (Sunday)
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

    // ***** ADD NEW DOM ELEMENT REFERENCES *****
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const mainMenu = document.getElementById('main-menu');
    const exportBtn = document.getElementById('export-btn');
    const importBtnTrigger = document.getElementById('import-btn-trigger'); // Button that triggers file input
    const importFileInput = document.getElementById('import-file-input');  // Hidden file input
    const aboutBtn = document.getElementById('about-btn');
    const genericModal = document.getElementById('generic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body'); // Use the div for content
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const settingsBtn = document.getElementById('settings-btn');
    // Toast Elements
    const toastContainer = document.getElementById('toast-container'); // Optional if needed for complex logic
    const toastMessage = document.getElementById('toast-message');
    let toastTimeout = null; // To manage the toast hide timer
    // ****************************************

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
    
            await displayAppVersion();

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
            // ***** SHOW INITIALIZATION ERRORS VIA TOAST *****
            showToast(`Initialization Error: ${error.message}`, 'error', 5000); // Show longer
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

        const currentWeekStart = getWeekStartDate(new Date()); // *** USE RENAMED FUNCTION (relies on default 'Sunday') ***

        state.currentDayDate = savedState.currentDayDate || today;
        state.currentWeekStartDate = savedState.currentWeekStartDate || currentWeekStart;

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

        // Initialize other state parts if needed (ensure history is loaded later)
        state.history = []; // History loaded async via loadHistoryData
        state.currentHistoryIndex = -1;

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

        const currentWeekStartStr = getWeekStartDate(today); // *** USE RENAMED FUNCTION (relies on default 'Sunday') ***

        let stateChanged = false;
        let weekResetOccurred = false;

        // Check for Week Reset FIRST (Saturday night to Sunday morning)
        if (state.currentWeekStartDate !== currentWeekStartStr) {
            console.log(`Week reset triggered: Stored week ${state.currentWeekStartDate}, Current week ${currentWeekStartStr}`);
            // Archive the COMPLETED week (using the old state.currentWeekStartDate)
             await archiveWeek(state.currentWeekStartDate, state.weeklyCounts);

             // Reset weekly counts for the NEW week
            Object.keys(state.weeklyCounts).forEach(key => {
                state.weeklyCounts[key] = 0;
            });
             state.currentWeekStartDate = currentWeekStartStr; // Update to the new week start
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
            weekStartDate: weekStartDate, // Key for the record
            weekStartDaySetting: state.weekSetting || 'Sunday', // Store the setting used (default if not set)
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
            showToast(`Failed to archive week ${weekStartDate}: ${error.message}`, 'error');
            // Consider alerting the user or implementing retry logic
        }
    }

    // --- Haptic Feedback Helper ---
    function triggerHapticFeedback(duration = 50) { // Default to 50ms
        if ('vibrate' in navigator) {
            try {
                navigator.vibrate(duration);
            } catch (e) {
                console.error("Vibration failed:", e);
            }
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
            
            // ***** ADD DATASET TO INFO BUTTON *****
            const infoBtn = item.querySelector('.info-btn');
            if (infoBtn) { // Check if button exists in template
                infoBtn.dataset.groupId = group.id; // Store the ID for lookup
            }
            // *************************************
                        
            item.querySelector('.name').textContent = group.name;

            // --- Target Description Logic (Unchanged) ---
            let targetDesc = "";
            const targetVal = group.target;
            // Use 'day' frequency for Wine/Butter explicitly for description if needed, or rely on config
            const freqText = group.frequency === 'day' ? 'day' : 'week';
            const unitText = group.unit || 'servings';

            if (group.type === 'positive') {
                targetDesc = `≥ ${targetVal} ${unitText}/${freqText}`;
            } else { // limit
                targetDesc = `≤ ${targetVal} ${unitText}/${freqText}`;
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
         historyWeekLabel.textContent = `Week of ${weekStartDate.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}`; // Show start weekday
         prevWeekBtn.disabled = state.currentHistoryIndex === 0;
         nextWeekBtn.disabled = state.currentHistoryIndex >= state.history.length - 1;
         // Set date picker to a date within the displayed week (e.g., the start date)
         historyDatePicker.value = weekData.weekStartDate;

        // Use stored targets if available, else current foodGroups config as fallback
        const historyTargets = weekData.targets || foodGroups.reduce((acc, group) => {
            // This fallback runs only if weekData.targets is null or undefined
            console.log(`History Warning: Using current config fallback for targets in week ${weekData.weekStartDate}`);
            acc[group.id] = {
                target: group.target,
                frequency: group.frequency,
                type: group.type,
                unit: group.unit,
                name: group.name // Important to include name here too
            };
            return acc;
        }, {});

         const ul = document.createElement('ul');
         // Use the targets stored *with* the history data if available, otherwise use current config
         const targets = weekData.targets || foodGroups.reduce((acc, group) => {
                acc[group.id] = { target: group.target, frequency: group.frequency, type: group.type, unit: group.unit };
                return acc;
            }, {});

         // Display in the same order as foodGroups config for consistency

         // Get the list of food group IDs that exist in the history data's targets or totals
         const foodGroupsToDisplay = foodGroups.filter(group => historyTargets[group.id] || (weekData.totals && typeof weekData.totals[group.id] !== 'undefined'));

        foodGroupsToDisplay.forEach(group => {

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
                <span class="food-name">${targetInfo.name || group.name}</span>               
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

        // *** ADD LISTENER for INFO BUTTON clicks (via delegation) ***
        [dailyGoalsContainer, weeklyGoalsContainer].forEach(container => {
            container.addEventListener('click', handleInfoClick);
        });
        // *** ADD LISTENERS for MODAL ***
        modalCloseBtn.addEventListener('click', closeModal);
        genericModal.addEventListener('click', (event) => { // Click on background/overlay
            if (event.target === genericModal) closeModal();
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

        // ***** ADD NEW MENU/IMPORT/EXPORT EVENT LISTENERS *****
        menuToggleBtn.addEventListener('click', toggleMenu);
        exportBtn.addEventListener('click', handleExport);
        importBtnTrigger.addEventListener('click', triggerImport); // Listen on the trigger button
        importFileInput.addEventListener('change', handleImportFileSelect); // Listen on the actual file input
        settingsBtn.addEventListener('click', handleSettings);
        aboutBtn.addEventListener('click', handleAboutClick); // *** ADD LISTENER for About Button ***

        // Optional: Close menu when clicking outside
        document.addEventListener('click', handleOutsideMenuClick);
        // *******************************************************

    }

    function handleCounterClick(event) {
        const button = event.target.closest('button');
        if (!button) return;
    
        const item = button.closest('.food-group-item');
        if (!item) return;
    
        const groupId = item.dataset.id;
        const input = item.querySelector('.count-input');
        const isDaily = input.dataset.frequency === 'day';
        let currentValue = parseInt(input.value, 10) || 0;
        let valueChanged = false; // Flag to track if value actually changed
    
        if (button.classList.contains('increment-btn')) {
            currentValue++;
            valueChanged = true; // Value increased
        } else if (button.classList.contains('decrement-btn')) {
            const oldValue = currentValue;
            currentValue = Math.max(0, currentValue - 1);
            if (currentValue < oldValue) { // Only flag if value actually decreased
                valueChanged = true;
            }
        } else {
            return; // Not an increment/decrement button
        }
    
        // --- Trigger haptic feedback IF the value changed ---
        if (valueChanged) {
            triggerHapticFeedback(30); // Use a shorter vibration (e.g., 30ms) for quick clicks
        }
        // ---------------------------------------------------
    
        // Update state and UI (this function likely already exists)
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

        const selectedDate = new Date(selectedDateStr + "T00:00:00"); // Use local time
        const targetWeekStart = getWeekStartDate(selectedDate); // *** USE RENAMED FUNCTION (relies on default 'Sunday') ***

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

        // Close menu and modal when switching views
        closeMenu();

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
            showToast(`Failed to load history: ${error.message}`, 'error');
            historyContent.innerHTML = "<p>Error loading history data.</p>";
             prevWeekBtn.disabled = true;
             nextWeekBtn.disabled = true;
        }
    }

    // ***** ADD NEW FUNCTIONS for Menu, Toasts, Export, Import, Settings *****

    // --- Toast Notification Function ---
    function showToast(message, type = 'success', duration = 3000) {
        if (toastTimeout) { clearTimeout(toastTimeout); } // Clear previous toast timeout

        toastMessage.textContent = message;
        toastMessage.className = 'toast'; // Reset classes
        toastMessage.classList.add(`toast-${type}`); // toast-success or toast-error
        toastMessage.classList.add('toast-show'); // Make visible

        toastTimeout = setTimeout(() => {
            toastMessage.classList.remove('toast-show');
            toastTimeout = null;
        }, duration);
    }

    // --- Menu Handling ---
    function toggleMenu() {
        mainMenu.classList.toggle('menu-open');
    }

    function closeMenu() {
        mainMenu.classList.remove('menu-open');
    }

    function handleOutsideMenuClick(event) {
        // Close menu if click is outside the menu and not on the toggle button itself
        if (!mainMenu.contains(event.target) && !menuToggleBtn.contains(event.target) && mainMenu.classList.contains('menu-open')) {
            closeMenu();
        }
    }

    // ***** ADD NEW MODAL, ABOUT, INFO FUNCTIONS *****

    // Handles clicks within the goal containers to check for info button clicks
    function handleInfoClick(event) {
        const infoButton = event.target.closest('.info-btn'); // Find the clicked info button
        if (!infoButton) return; // Click wasn't on an info button

        const groupId = infoButton.dataset.groupId;
        if (!groupId) return;

        const group = foodGroups.find(g => g.id === groupId);
        if (!group || !group.description) {
            showToast("Details not available.", "error");
            return;
        }
        // Prepare content with line breaks
        const descriptionHtml = group.description.replace(/\n/g, '<br>');
        openModal(group.name, descriptionHtml); // Use the generic modal opener
    }

    // Handles click on the "About" menu item
    function handleAboutClick() {
        closeMenu();
        const aboutTitle = "About MIND Diet Tracker";
        
        // Create the base about content
        const aboutContent = `
            <p>This app helps you track your adherence to the MIND Diet principles.</p>
            <p>Track daily and weekly servings, view summaries, and check your history.</p>
            <p>Data is stored locally in your browser.</p>
            <p>Version: <span id="modal-app-version">(unknown)</span></p>
            
            <!-- Development information section -->
            <div id="dev-info" style="margin-top: 15px; padding-top: 10px; border-top: 1px dashed #ccc; font-family: monospace; font-size: 12px;">
                <h4 style="margin: 5px 0;">Development Information</h4>
                <div>Viewport: <span id="dev-viewport-size"></span></div>
                <div>Screen: <span id="dev-screen-size"></span></div>
                <div>Device Pixel Ratio: <span id="dev-pixel-ratio"></span></div>
                <div>User Agent: <span id="dev-user-agent"></span></div>
            </div>
        `;
        
        openModal(aboutTitle, aboutContent);

        // Fetch and display version inside the modal (similar to footer)
        const modalVersionEl = document.getElementById('modal-app-version');
        if(modalVersionEl) {
            const footerVersionEl = document.getElementById('app-version'); // Get version from footer span
            modalVersionEl.textContent = footerVersionEl ? footerVersionEl.textContent : '(unknown)';
        }
        
        // Update the development information
        updateDevInfo();
        
        // Add window resize listener to update dev info when window size changes
        window.addEventListener('resize', updateDevInfo);
    }

    // Function to update development information
    function updateDevInfo() {
        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        document.getElementById('dev-viewport-size').textContent = `${viewportWidth}px × ${viewportHeight}px`;
        
        // Get screen dimensions
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        document.getElementById('dev-screen-size').textContent = `${screenWidth}px × ${screenHeight}px`;
        
        // Get device pixel ratio
        const pixelRatio = window.devicePixelRatio || 1;
        document.getElementById('dev-pixel-ratio').textContent = pixelRatio;
        
        // Get user agent
        document.getElementById('dev-user-agent').textContent = navigator.userAgent;
    }

    // Generic function to open the modal
    function openModal(title, htmlContent) {
        modalTitle.textContent = title;
        modalBody.innerHTML = htmlContent; // Use innerHTML to allow <br>, etc.
        genericModal.classList.add('modal-open');
        modalCloseBtn.focus(); // Focus close button for accessibility
    }

    // Generic function to close the modal
    function closeModal() {
        genericModal.classList.remove('modal-open');
        // Optional: Clear content after closing animation finishes
        // setTimeout(() => {
        //     modalTitle.textContent = '';
        //     modalBody.innerHTML = '';
        // }, 300); // Match CSS transition duration if needed
    }


    // --- Export Functionality ---
    async function handleExport() {
        closeMenu(); // Close menu first
        try {
            console.log("Exporting data...");
            // 1. Get current state from localStorage
            const currentStateJson = localStorage.getItem('mindTrackerState');
            const currentState = currentStateJson ? JSON.parse(currentStateJson) : {};

            // 2. Get history from IndexedDB
            const historyData = await getAllWeekHistory(); // Use correctly imported name

            // 3. Combine data into a single export object
            const dataToExport = {
                appInfo: { // Optional info about the export
                    appName: "MIND Diet Tracker PWA",
                    exportDate: new Date().toISOString(),
                    version: 1 // Version of the export format
                },
                currentState: currentState,
                history: historyData || [] // Ensure history is an array
            };

            // Check if there's actually any data
            if (Object.keys(dataToExport.currentState).length === 0 && dataToExport.history.length === 0) {
                showToast("No data available to export.", "error"); // Use error style for info
                return;
            }

            // 4. Create JSON file and trigger download
            const jsonString = JSON.stringify(dataToExport, null, 2); // Pretty print JSON
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const timestamp = new Date().toISOString().split('T')[0];
            link.download = `mind-diet-tracker-data-${timestamp}.json`; // Filename
            document.body.appendChild(link); // Required for Firefox compatibility
            link.click();
            document.body.removeChild(link); // Clean up the link element
            URL.revokeObjectURL(url); // Release the object URL

            console.log("Data exported successfully.");
            showToast("Data exported successfully!", "success");
            setActiveView('tracker'); // Return to tracker view after export

        } catch (error) {
            console.error("Error exporting data:", error);
            showToast(`Export failed: ${error.message}`, "error");
        }
    }

    // --- Import Functionality ---
    // Function to trigger the hidden file input
    function triggerImport() {
        closeMenu();
        importFileInput.click(); // Open file selection dialog
    }

    // Function to handle the file selection and processing
    async function handleImportFileSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            console.log("No file selected for import.");
            return; // Exit if no file was chosen
        }

        // Validate file type
        if (!file.type || file.type !== "application/json") {
            showToast("Invalid file type. Please select a '.json' file.", "error");
            importFileInput.value = ''; // Clear the input
            return;
        }

        const reader = new FileReader();

        // Define what happens when the file is successfully read
        reader.onload = async (e) => {
            const fileContent = e.target.result;
            try {
                const importedData = JSON.parse(fileContent);

                // Basic validation of the imported structure
                if (typeof importedData !== 'object' || importedData === null || !importedData.currentState || !Array.isArray(importedData.history)) {
                     throw new Error("Invalid file structure. Required: 'currentState' object and 'history' array.");
                }

                // --- Confirmation Dialog ---
                const confirmationMessage = `WARNING:\n\nThis will REPLACE ALL current tracking data (daily counts, weekly counts, and all saved history) with the data from the file "${file.name}".\n\nThis action cannot be undone.\n\nDo you want to proceed with the import?`;
                if (!confirm(confirmationMessage)) {
                    console.log("Import cancelled by user.");
                    importFileInput.value = ''; // Clear input
                    return; // User clicked Cancel
                }

                console.log("Starting import process...");

                // --- 1. Clear Existing Data ---
                console.log("Clearing existing data...");
                await clearHistoryStore(); // Clear IndexedDB history store
                localStorage.removeItem('mindTrackerState'); // Clear current state from localStorage
                // Reset in-memory state as well
                state.dailyCounts = {};
                state.weeklyCounts = {};
                state.history = [];
                state.currentHistoryIndex = -1;
                console.log("Existing data cleared.");

                // --- 2. Restore Data ---
                console.log("Restoring data...");
                // Restore current state directly to localStorage
                if (importedData.currentState) {
                    // Basic check on restored state structure if needed
                    localStorage.setItem('mindTrackerState', JSON.stringify(importedData.currentState));
                    console.log("Current state restored to localStorage.");
                } else {
                     console.warn("No 'currentState' found in imported file.");
                }

                // Restore history records one by one to IndexedDB
                let importCount = 0;
                if (importedData.history && importedData.history.length > 0) {
                    for (const weekData of importedData.history) {
                        try {
                            // Add minimal validation for each history record
                            if (weekData && typeof weekData.weekStartDate === 'string' && typeof weekData.totals === 'object') {
                                await saveWeekHistory(weekData);
                                importCount++;
                            } else {
                                console.warn("Skipping invalid/incomplete history record during import:", weekData);
                            }
                        } catch (saveError) {
                            console.error(`Error saving history week ${weekData.weekStartDate || 'unknown'} during import:`, saveError);
                            // Decide if you want to stop the whole import on a single record error
                            // throw new Error(`Failed to save history record: ${saveError.message}`); // Option to stop
                        }
                    }
                    console.log(`${importCount} history records restored to IndexedDB.`);
                } else {
                     console.log("No history records found in imported file or history array is empty.");
                }

                // --- 3. Reload State & UI from restored data ---
                console.log("Reloading application state and UI from imported data...");
                loadState(); // Reload the global 'state' object from the new localStorage
                await loadHistoryData(); // Reload the state.history array from the new IndexedDB data
                renderUI(); // Re-render UI with the newly loaded state
                setActiveView('tracker'); // Switch view to tracker

                console.log("Import process completed.");
                showToast(`Import successful! ${importCount} history records imported.`, "success", 4000); // Show longer success message

            } catch (error) {
                console.error("Error importing data:", error);
                showToast(`Import failed: ${error.message}`, "error", 5000); // Show longer error message
                // Attempt to reload previous state (might be empty if clear succeeded but restore failed)
                loadState();
                await loadHistoryData();
                renderUI();
            } finally {
                // ALWAYS clear the file input after attempting import, regardless of success/failure
                importFileInput.value = '';
            }
        };

        // Define what happens if there's an error reading the file
        reader.onerror = (e) => {
            console.error("Error reading file:", e);
            showToast("Error reading the selected file.", "error");
            importFileInput.value = ''; // Clear the input
        };

        // Start reading the file as text
        reader.readAsText(file);
    }


    // --- Settings Placeholder ---
    function handleSettings() {
        closeMenu();
        // Implement settings logic later
        showToast("Settings view not yet implemented.", "success"); // Use 'success' style for info
        // Could potentially navigate to a settings view if one existed:
        // setActiveView('settings');
    }

    async function displayAppVersion() {
        const versionEl = document.getElementById('app-version');
        if (!versionEl) return;
        try {
            const response = await fetch('version.json?t=' + Date.now()); // Cache buster
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const versionData = await response.json();
            versionEl.textContent = `(v${versionData.commitHash})`;
            console.log('App Version Info:', versionData);
        } catch (error) {
            console.error('Failed to load version info:', error);
            versionEl.textContent = '(v?.?.?)';
        }
    }

    // --- Start the App ---
    initializeApp();
});