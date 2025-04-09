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

// --- START OF app.js (Rewritten with Edit Totals Feature) ---

// Imports (assuming db.js has clearHistoryStore and getWeekStartDate)
import { initDB, db, saveWeekHistory, getWeekHistory, getAllWeekHistory, getWeekStartDate, clearHistoryStore } from './db.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Configuration ---
    const foodGroups = [
        // Add ALL descriptions here as done previously...
        { id: 'whole_grains', name: 'Whole Grains', frequency: 'day', target: 3, unit: 'servings', type: 'positive', description: 'Serving examples: 1 slice whole-grain bread, ½ cup cooked whole grains (oats, quinoa, brown rice), ½ cup whole-grain cereal, 3 cups popped popcorn.' },
        { id: 'other_veg', name: 'Other Vegetables', frequency: 'day', target: 1, unit: 'serving', type: 'positive', description: 'Serving examples: ½ cup cooked or 1 cup raw non-starchy vegetables (broccoli, peppers, carrots, tomatoes, zucchini, onions, etc.). Excludes potatoes.' },
        { id: 'olive_oil', name: 'Olive Oil', frequency: 'day', target: 1, unit: 'Tbsp (main oil)', type: 'positive', description: 'Use extra virgin olive oil (EVOO) as your principal oil for cooking, dressings, etc. Aim for at least 1 Tbsp use daily.' },
        { id: 'leafy_greens', name: 'Green Leafy Vegetables', frequency: 'week', target: 6, unit: 'servings', type: 'positive', description: 'Serving examples: 1 cup raw or ½ cup cooked leafy greens (spinach, kale, collards, romaine, arugula, etc.).' },
        { id: 'nuts', name: 'Nuts', frequency: 'week', target: 5, unit: 'servings', type: 'positive', description: 'Serving examples: ¼ cup nuts or 2 Tbsp nut butter (almonds, walnuts, pecans preferred; avoid heavily salted/sugared nuts).' },
        { id: 'beans', name: 'Beans', frequency: 'week', target: 4, unit: 'servings', type: 'positive', description: 'Serving examples: ½ cup cooked beans, lentils, or legumes (kidney, black, pinto beans, chickpeas, soybeans, etc.).' },
        { id: 'berries', name: 'Berries', frequency: 'week', target: 2, unit: 'servings', type: 'positive', description: 'Serving examples: ½ cup fresh or frozen berries (blueberries strongly recommended, strawberries, raspberries, blackberries).' },
        { id: 'poultry', name: 'Poultry', frequency: 'week', target: 2, unit: 'servings', type: 'positive', description: 'Serving examples: 3-4 oz cooked chicken or turkey (prefer skinless, not fried).' },
        { id: 'fish', name: 'Fish', frequency: 'week', target: 1, unit: 'serving', type: 'positive', description: 'Serving examples: 3-4 oz cooked fish (prefer oily fish like salmon, mackerel, sardines; avoid fried fish).' },
        { id: 'wine', name: 'Wine (optional)', frequency: 'day', target: 1, unit: 'glass (max)', type: 'limit', isOptional: true, description: 'Optional: Limit to no more than one standard glass (approx. 5 oz) per day. Red wine is often specified.' },
        { id: 'red_meat', name: 'Red Meats', frequency: 'week', target: 3, unit: 'servings (max)', type: 'limit', description: 'Limit to less than 4 servings/week (target ≤3). Serving ~3-4 oz cooked. Includes beef, pork, lamb, and processed meats.' },
        { id: 'butter_margarine', name: 'Butter/Margarine', frequency: 'day', target: 1, unit: 'Tbsp (max)', type: 'limit', description: 'Limit butter to less than 1 Tbsp per day. Avoid stick margarine entirely.' },
        { id: 'cheese', name: 'Cheese', frequency: 'week', target: 1, unit: 'serving (max)', type: 'limit', description: 'Limit full-fat cheese to less than 1 serving/week (target ≤1). Serving ~1-1.5 oz.' },
        { id: 'pastries_sweets', name: 'Pastries & Sweets', frequency: 'week', target: 4, unit: 'servings (max)', type: 'limit', description: 'Limit pastries and sweets to less than 5 servings/week (target ≤4). Includes cakes, cookies, candies, ice cream, sugary drinks etc.' },
        { id: 'fried_fast_food', name: 'Fried/Fast Food', frequency: 'week', target: 1, unit: 'serving (max)', type: 'limit', description: 'Limit fried food (especially commercial) and fast food to less than 1 serving/week (target ≤1).' },
    ];

    // --- State Variables ---
    let state = {
        currentDayDate: null,
        currentWeekStartDate: null,
        weekSetting: 'Sunday', // Default week start
        dailyCounts: {}, // Only used by updateCount temporarily
        weeklyCounts: {},
        history: [],
        currentHistoryIndex: -1
    };
    // State for Edit Modal
    let editingWeekDataRef = null; // Reference to the data being edited (either 'state' or 'state.history[i]')
    let editingSource = null;      // 'current' or 'history'
    let editedTotals = {};         // Temporary object holding edits within the modal

    // --- DOM Elements ---
    const views = {
        'tracker': document.getElementById('tracker-view'),
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
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const mainMenu = document.getElementById('main-menu');
    const exportBtn = document.getElementById('export-btn');
    const importBtnTrigger = document.getElementById('import-btn-trigger');
    const importFileInput = document.getElementById('import-file-input');
    const aboutBtn = document.getElementById('about-btn');
    const settingsBtn = document.getElementById('settings-btn');
    // Generic Modal Elements
    const genericModal = document.getElementById('generic-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalBody = document.getElementById('modal-body');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    // Toast Elements
    const toastContainer = document.getElementById('toast-container');
    const toastMessage = document.getElementById('toast-message');
    let toastTimeout = null;
    // *** NEW Elements for Edit Totals ***
    const editCurrentWeekBtn = document.getElementById('edit-current-week-btn'); // Assumes you add this button to current-week-view HTML
    const editHistoryWeekBtn = document.getElementById('edit-history-week-btn'); // Assumes you add this button to history-view HTML
    const editTotalsModal = document.getElementById('edit-totals-modal');
    const editTotalsTitle = document.getElementById('edit-totals-title');
    const editTotalsList = document.getElementById('edit-totals-list');
    const editTotalsItemTemplate = document.getElementById('edit-totals-item-template');
    const editTotalsCloseBtn = document.getElementById('edit-totals-close-btn');
    const editTotalsCancelBtn = document.getElementById('edit-totals-cancel-btn');
    const editTotalsSaveBtn = document.getElementById('edit-totals-save-btn');
    // Version display element
    const appVersionEl = document.getElementById('app-version');


    async function initializeApp() {
        console.log("Initializing app...");
        try {
            await initDB();
            console.log("DB initialized:", db);
            if (!db) throw new Error("Database initialization failed.");

            registerServiceWorker();
            loadState();
            await checkDateAndResetCounters();
            renderUI(); // Renders initial tracker view + summary view
            setupEventListeners();
            await loadHistoryData();
            // Ensure history edit button state is correct based on initial load
            renderHistory(state.currentHistoryIndex); // Render initial history view state, which controls edit button
            setActiveView('tracker');
            await displayAppVersion();

            console.log("App initialization complete.");
        } catch (error) {
            console.error("Error during app initialization:", error);
            showToast(`Initialization Error: ${error.message}`, 'error', 5000);
        }
    }

    function registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('Service Worker registered:', reg.scope))
                .catch(err => console.log('Service Worker registration failed:', err));
        }
    }

    function loadState() {
        const savedState = JSON.parse(localStorage.getItem('mindTrackerState')) || {};
        const initDate = new Date();
        const initYear = initDate.getFullYear();
        const initMonth = String(initDate.getMonth() + 1).padStart(2, '0');
        const initDay = String(initDate.getDate()).padStart(2, '0');
        const today = `${initYear}-${initMonth}-${initDay}`;

        // Respect saved setting or default to Sunday
        state.weekSetting = savedState.weekSetting || 'Sunday';
        const currentWeekStart = getWeekStartDate(new Date(), state.weekSetting);

        state.currentDayDate = savedState.currentDayDate || today;
        state.currentWeekStartDate = savedState.currentWeekStartDate || currentWeekStart;

        state.dailyCounts = savedState.dailyCounts || {};
        state.weeklyCounts = savedState.weeklyCounts || {};
        foodGroups.forEach(group => {
            if (group.frequency === 'day') {
                if (!(group.id in state.dailyCounts)) state.dailyCounts[group.id] = 0;
            }
            if (!(group.id in state.weeklyCounts)) state.weeklyCounts[group.id] = 0;
        });

        // Recalculate weekly counts based on daily entries if needed (relevant if daily nav is added)
        // For now, just ensure weeklyCounts exists. If state loaded, assume weeklyCounts is correct.

        state.history = [];
        state.currentHistoryIndex = -1;
        console.log("Loaded state (initial):", JSON.parse(JSON.stringify(state))); // Use stringify for clean log
    }

    function saveState() {
        const stateToSave = {
            currentDayDate: state.currentDayDate,
            currentWeekStartDate: state.currentWeekStartDate,
            weekSetting: state.weekSetting, // Save the week start setting
            dailyCounts: state.dailyCounts,
            weeklyCounts: state.weeklyCounts
        };
        localStorage.setItem('mindTrackerState', JSON.stringify(stateToSave));
        console.log("Saved state to localStorage:", stateToSave);
    }

    async function checkDateAndResetCounters() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`;
        console.log("Calculated todayStr (local):", todayStr);

        const currentWeekStartStr = getWeekStartDate(today, state.weekSetting); // Use setting

        let stateChanged = false;
        let weekResetOccurred = false;

        if (state.currentWeekStartDate !== currentWeekStartStr) {
            console.log(`Week reset triggered: Stored week ${state.currentWeekStartDate}, Current week ${currentWeekStartStr}`);
            await archiveWeek(state.currentWeekStartDate, state.weeklyCounts); // Archive uses final weeklyCounts

            // Clear daily counts and reset weekly counts for new week
            state.dailyCounts = {};
            Object.keys(state.weeklyCounts).forEach(key => { state.weeklyCounts[key] = 0; });
            foodGroups.forEach(group => { // Ensure all keys exist, reset to 0
                 if (group.frequency === 'day') state.dailyCounts[group.id] = 0;
                 state.weeklyCounts[group.id] = 0;
            });

            state.currentWeekStartDate = currentWeekStartStr;
            state.currentDayDate = todayStr; // Start new week on current day
            stateChanged = true;
            weekResetOccurred = true;
        }

        console.log(`PRE-DAY-CHECK: Stored Date = '${state.currentDayDate}', Today's Date = '${todayStr}', Comparison Result = ${state.currentDayDate !== todayStr}`);
        if (!weekResetOccurred && state.currentDayDate !== todayStr) {
            console.log(`Day reset triggered: Stored day ${state.currentDayDate}, Current day ${todayStr}`);
            // Today's input doesn't affect previous day's weekly total here.
            // Weekly total is managed directly or via modal edit.
            // We just need to reset the daily counts for the *new* current day.
            state.dailyCounts = {}; // Clear daily counts
            foodGroups.forEach(group => { // Ensure all keys exist for daily items
                 if (group.frequency === 'day') state.dailyCounts[group.id] = 0;
            });
            state.currentDayDate = todayStr;
            stateChanged = true;
        }

        if (stateChanged) {
            console.log('State changed detected during date check. Saving state. Current date:', state.currentDayDate);
            saveState();
            if (weekResetOccurred) {
                 await loadHistoryData(); // Reload history in case archive happened
            }
        } else {
            console.log('No state change detected during date check.');
        }
    }

    async function archiveWeek(weekStartDate, weeklyTotals) {
        console.log(`Archiving week starting: ${weekStartDate}`);
        const totalsToSave = JSON.parse(JSON.stringify(weeklyTotals));
        const weekData = {
            weekStartDate: weekStartDate,
            weekStartDaySetting: state.weekSetting || 'Sunday', // Store setting used
            totals: totalsToSave,
            targets: foodGroups.reduce((acc, group) => {
                acc[group.id] = { target: group.target, frequency: group.frequency, type: group.type, unit: group.unit, name: group.name };
                return acc;
            }, {})
        };
        try {
            await saveWeekHistory(weekData);
            console.log("Week archived successfully to IndexedDB");
        } catch (error) {
            console.error("Failed to archive week:", error);
            showToast(`Failed to archive week ${weekStartDate}: ${error.message}`, 'error');
        }
    }

    // Renders the main tracker view items
    function renderTrackerItems() {
        dailyGoalsContainer.innerHTML = '<h3>Daily Goals</h3>';
        weeklyGoalsContainer.innerHTML = '<h3>Weekly Goals</h3>';

        foodGroups.forEach(group => {
            const item = foodGroupTemplate.content.cloneNode(true).querySelector('.food-group-item');
            item.dataset.id = group.id;
            item.querySelector('.name').textContent = group.name;

            const infoBtn = item.querySelector('.info-btn');
            if (infoBtn) infoBtn.dataset.groupId = group.id;

            let targetDesc = "";
            const targetVal = group.target;
            const freqText = group.frequency === 'day' ? 'day' : 'week';
            const unitText = group.unit || 'servings';

            if (group.type === 'positive') { targetDesc = `Target: ≥ ${targetVal} ${unitText}/${freqText}`; }
            else { targetDesc = `Limit: ≤ ${targetVal} ${unitText}/${freqText}`; if (group.isOptional) targetDesc += " (optional)"; }
            item.querySelector('.target').textContent = targetDesc;

            const countInput = item.querySelector('.count-input');
            const weeklyTotalSpan = item.querySelector('.current-week-total');
            const weeklyTotalValue = item.querySelector('.wk-val');

            // Input always reflects the CURRENT day's count for daily items
            if (group.frequency === 'day') {
                countInput.value = state.dailyCounts[group.id] || 0;
                countInput.dataset.frequency = 'day';
                weeklyTotalSpan.style.display = 'inline';
                weeklyTotalValue.textContent = state.weeklyCounts[group.id] || 0; // Show current WEEK total
            } else {
                // Weekly items directly show/edit the weekly total
                countInput.value = state.weeklyCounts[group.id] || 0;
                countInput.dataset.frequency = 'week';
                weeklyTotalSpan.style.display = 'none';
            }
            countInput.dataset.groupid = group.id;

            if (group.frequency === 'day') { dailyGoalsContainer.appendChild(item); }
            else if (group.frequency === 'week') { weeklyGoalsContainer.appendChild(item); }
        });
    }

    function renderUI() {
        try {
            const displayDate = new Date(state.currentDayDate + 'T00:00:00');
            console.log('renderUI: Rendering date from state:', state.currentDayDate);
            currentDateEl.textContent = displayDate.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        } catch (e) {
            console.error("Error formatting display date:", e);
            currentDateEl.textContent = "Error";
        }
        // Display week start date based on setting
        const weekStartDateDisplay = new Date(state.currentWeekStartDate + 'T00:00:00');
        currentWeekStartDateEl.textContent = weekStartDateDisplay.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });


        renderTrackerItems(); // Render the list items
        renderCurrentWeekSummary(); // Render the summary below lists
    }

    function renderCurrentWeekSummary() {
        currentWeekSummaryContent.innerHTML = ''; // Clear previous
        const ul = document.createElement('ul');
        const getWeeklyTarget = (group) => {
            if (group.frequency === 'week') return group.target;
            if (group.frequency === 'day') return group.target * 7;
            return group.target;
        };

        foodGroups.forEach(group => {
            const li = document.createElement('li');
            const currentTotal = state.weeklyCounts[group.id] || 0; // Read from weeklyCounts
            const weeklyTarget = getWeeklyTarget(group);
            let statusClass = '';

            if (group.type === 'positive') { if (currentTotal >= weeklyTarget) statusClass = 'goal-met'; }
            else { if (currentTotal <= weeklyTarget) statusClass = 'limit-ok'; if (weeklyTarget > 0 && currentTotal > weeklyTarget * 0.75 && currentTotal <= weeklyTarget) statusClass = 'limit-near'; if (currentTotal > weeklyTarget) statusClass = 'limit-exceeded'; }
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
        // Ensure Edit button state is correct (enabled when view is active)
        if(editCurrentWeekBtn) editCurrentWeekBtn.disabled = false;
    }

    function renderHistory(weekIndex = -1) {
        historyContent.innerHTML = '';
        // Default edit button state to disabled
        if(editHistoryWeekBtn) editHistoryWeekBtn.disabled = true;

        if (!state.history || state.history.length === 0) {
            historyContent.innerHTML = '<p>No history data available yet.</p>';
            historyWeekLabel.textContent = "No History";
            prevWeekBtn.disabled = true;
            nextWeekBtn.disabled = true;
            historyDatePicker.value = '';
            return;
        }

        if (weekIndex === -1 || weekIndex >= state.history.length) { state.currentHistoryIndex = 0; }
        else { state.currentHistoryIndex = weekIndex; }

        const weekData = state.history[state.currentHistoryIndex];
        if (!weekData) {
             historyContent.innerHTML = '<p>Error: Could not load selected week data.</p>';
             historyWeekLabel.textContent = "Error";
             prevWeekBtn.disabled = true;
             nextWeekBtn.disabled = true;
             return;
        }

        // *** Enable the Edit button now that we have valid data ***
        if(editHistoryWeekBtn) editHistoryWeekBtn.disabled = false;

        const weekStartDate = new Date(weekData.weekStartDate + 'T00:00:00');
        historyWeekLabel.textContent = `Week of ${weekStartDate.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}`;
        prevWeekBtn.disabled = state.currentHistoryIndex <= 0;
        nextWeekBtn.disabled = state.currentHistoryIndex >= state.history.length - 1;
        historyDatePicker.value = weekData.weekStartDate;

        const ul = document.createElement('ul');
        const historyTargets = weekData.targets || foodGroups.reduce((acc, group) => { /* fallback */ acc[group.id] = { ...group }; return acc; }, {});
        const foodGroupsToDisplay = foodGroups.filter(group => (historyTargets && historyTargets[group.id]) || (weekData.totals && typeof weekData.totals[group.id] !== 'undefined'));

        foodGroupsToDisplay.forEach(group => {
            const groupId = group.id;
            const total = weekData.totals ? (weekData.totals[groupId] || 0) : 0;
            const targetInfo = historyTargets[groupId];
            if (!targetInfo) return;

            let effectiveWeeklyTarget;
            if (targetInfo.frequency === 'week') { effectiveWeeklyTarget = targetInfo.target; }
            else if (targetInfo.frequency === 'day') { effectiveWeeklyTarget = targetInfo.target * 7; }
            else { effectiveWeeklyTarget = targetInfo.target; }

            const li = document.createElement('li');
            let statusClass = '';
            if (targetInfo.type === 'positive') { if (total >= effectiveWeeklyTarget) statusClass = 'goal-met'; else statusClass = 'goal-missed'; }
            else { if (total <= effectiveWeeklyTarget) statusClass = 'limit-ok'; if (effectiveWeeklyTarget > 0 && total > effectiveWeeklyTarget * 0.75 && total <= effectiveWeeklyTarget) statusClass = 'limit-near'; if (total > effectiveWeeklyTarget) statusClass = 'limit-exceeded'; }
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

    function setupEventListeners() {
        navButtons.forEach(button => { button.addEventListener('click', () => setActiveView(button.dataset.view)); });

        [dailyGoalsContainer, weeklyGoalsContainer].forEach(container => {
            container.addEventListener('click', handleCounterClick); // For +/-
            container.addEventListener('change', handleCounterInputChange); // For direct input
            container.addEventListener('input', handleCounterInputChange); // Live input
            container.addEventListener('click', handleInfoClick);      // For info icons
        });

        modalCloseBtn.addEventListener('click', closeModal);
        genericModal.addEventListener('click', (event) => { if (event.target === genericModal) closeModal(); });

        prevWeekBtn.addEventListener('click', () => { if (state.currentHistoryIndex > 0) renderHistory(state.currentHistoryIndex - 1); });
        nextWeekBtn.addEventListener('click', () => { if (state.currentHistoryIndex < state.history.length - 1) renderHistory(state.currentHistoryIndex + 1); });
        historyDatePicker.addEventListener('change', handleHistoryDatePick);

        menuToggleBtn.addEventListener('click', toggleMenu);
        exportBtn.addEventListener('click', handleExport);
        importBtnTrigger.addEventListener('click', triggerImport);
        importFileInput.addEventListener('change', handleImportFileSelect);
        aboutBtn.addEventListener('click', handleAboutClick);
        settingsBtn.addEventListener('click', handleSettings);

        document.addEventListener('click', handleOutsideMenuClick);

        // *** ADD LISTENERS for Edit Totals Modal ***
        if(editCurrentWeekBtn) editCurrentWeekBtn.addEventListener('click', () => openEditTotalsModal('current'));
        if(editHistoryWeekBtn) editHistoryWeekBtn.addEventListener('click', () => openEditTotalsModal('history'));
        editTotalsCloseBtn.addEventListener('click', closeEditTotalsModal);
        editTotalsCancelBtn.addEventListener('click', closeEditTotalsModal);
        editTotalsSaveBtn.addEventListener('click', saveEditedTotals);
        editTotalsList.addEventListener('click', handleEditTotalsItemClick); // Delegate clicks inside modal list

        // Add listener for haptic feedback helper function (optional, can be added later)
        // document.body.addEventListener('click', triggerHapticFeedback); // Example - Too broad
    }

    // --- Haptic Feedback Helper (Optional - Can add later) ---
    // function triggerHapticFeedback(duration = 30) { ... }

    function handleCounterClick(event) {
        const button = event.target.closest('button.decrement-btn, button.increment-btn'); // More specific selector
        if (!button) return;

        const item = button.closest('.food-group-item');
        if (!item) return;
        const groupId = item.dataset.id;
        const input = item.querySelector('.count-input');
        const isDaily = input.dataset.frequency === 'day';
        let currentValue = parseInt(input.value, 10) || 0;
        let valueChanged = false;

        if (button.classList.contains('increment-btn')) {
            currentValue++;
            valueChanged = true;
        } else if (button.classList.contains('decrement-btn')) {
            const oldValue = currentValue;
            currentValue = Math.max(0, currentValue - 1);
            if (currentValue < oldValue) valueChanged = true;
        }

        // Optional: Add haptic feedback here if valueChanged
        // if (valueChanged) { triggerHapticFeedback(); }

        updateCount(groupId, currentValue, isDaily, item);
    }

    function handleCounterInputChange(event) {
        const input = event.target;
        if (!input || !input.classList.contains('count-input')) return;
        const item = input.closest('.food-group-item');
        if (!item) return;
        const groupId = item.dataset.id;
        const isDaily = input.dataset.frequency === 'day';
        let newValue = parseInt(input.value, 10);

        if (isNaN(newValue) || newValue < 0) {
            newValue = 0; input.value = newValue;
        }
        updateCount(groupId, newValue, isDaily, item);
    }

    function updateCount(groupId, newValue, isDaily, itemElement) {
        const group = foodGroups.find(g => g.id === groupId);
        if (!group) return;

        if (isDaily) {
            const oldValue = state.dailyCounts[groupId] || 0;
            const diff = newValue - oldValue;
            state.dailyCounts[groupId] = newValue;
            // Update weekly total based on daily change
            state.weeklyCounts[groupId] = (state.weeklyCounts[groupId] || 0) + diff;
        } else {
            // Weekly item input directly updates weekly total
            state.weeklyCounts[groupId] = newValue;
        }

        // Update UI elements within the specific item on TRACKER view
        itemElement.querySelector('.count-input').value = newValue;
        if (isDaily) {
            const weeklyTotalValue = itemElement.querySelector('.wk-val');
            if (weeklyTotalValue) weeklyTotalValue.textContent = state.weeklyCounts[groupId] || 0;
        }

        saveState(); // Save updated daily AND weekly counts
        renderCurrentWeekSummary(); // Update summary view reflects weekly counts
        console.log(`Updated count for ${groupId}: Daily=${state.dailyCounts[groupId]}, Weekly=${state.weeklyCounts[groupId]}`);
    }

    function handleHistoryDatePick() {
         const selectedDateStr = historyDatePicker.value;
         if (!selectedDateStr) return;
         const selectedDate = new Date(selectedDateStr + "T00:00:00");
         const targetWeekStart = getWeekStartDate(selectedDate, state.weekSetting); // Use setting
         const foundIndex = state.history.findIndex(week => week.weekStartDate === targetWeekStart);

         if (foundIndex !== -1) { renderHistory(foundIndex); }
         else { showToast(`No history found for week starting ${targetWeekStart}.`, 'error'); /* Keep current date picker value */ }
    }

    function setActiveView(viewId) {
        console.log("setActiveView:", viewId);
        Object.values(views).forEach(view => view.classList.remove('active-view'));
        navButtons.forEach(button => button.classList.remove('active'));

        const activeView = views[viewId];
        if (activeView) activeView.classList.add('active-view');
        else console.error(`Could not find view element for key: ${viewId}`);

        const activeButton = document.querySelector(`nav button[data-view="${viewId}"]`);
        if (activeButton) activeButton.classList.add('active');
        else console.error(`Could not find button for viewId: ${viewId}`);

        // Ensure edit button state is correct when view becomes active
        if (viewId === 'history') {
            renderHistory(state.currentHistoryIndex); // Rerender history ensures button state is right
        } else if (viewId === 'current-week') {
            renderCurrentWeekSummary(); // Rerender summary ensures button state is right
        }

        closeMenu();
        closeModal(); // Close generic modal on view change
        closeEditTotalsModal(); // Close edit modal on view change
    }

    async function loadHistoryData() {
         try {
            state.history = await getAllWeekHistory(); // Uses imported function
            state.currentHistoryIndex = state.history.length > 0 ? 0 : -1;
            console.log(`Loaded ${state.history.length} weeks of history.`);
            // Update history view *if* it's the active one
            if (views.history.classList.contains('active-view')) {
                 renderHistory(state.currentHistoryIndex);
            } else {
                 // Just update nav button state if history view not active
                 prevWeekBtn.disabled = state.currentHistoryIndex <= 0;
                 nextWeekBtn.disabled = state.currentHistoryIndex >= state.history.length - 1;
                 if(editHistoryWeekBtn) editHistoryWeekBtn.disabled = state.currentHistoryIndex === -1;
            }
        } catch (error) {
            console.error("Failed to load history data:", error);
            if(views.history.classList.contains('active-view')) {
                historyContent.innerHTML = "<p>Error loading history data.</p>";
            }
            prevWeekBtn.disabled = true;
            nextWeekBtn.disabled = true;
            if(editHistoryWeekBtn) editHistoryWeekBtn.disabled = true;
            showToast(`Failed to load history: ${error.message}`, 'error');
        }
    }

    function showToast(message, type = 'success', duration = 3000) {
        if (toastTimeout) { clearTimeout(toastTimeout); }
        toastMessage.textContent = message;
        toastMessage.className = 'toast';
        toastMessage.classList.add(`toast-${type}`);
        toastMessage.classList.add('toast-show');
        toastTimeout = setTimeout(() => {
            toastMessage.classList.remove('toast-show');
            toastTimeout = null;
        }, duration);
    }

    function toggleMenu() { mainMenu.classList.toggle('menu-open'); }
    function closeMenu() { mainMenu.classList.remove('menu-open'); }
    function handleOutsideMenuClick(event) { if (!mainMenu.contains(event.target) && !menuToggleBtn.contains(event.target) && mainMenu.classList.contains('menu-open')) closeMenu(); }

    function handleInfoClick(event) {
        const infoButton = event.target.closest('.info-btn');
        if (!infoButton) return;
        const groupId = infoButton.dataset.groupId;
        if (!groupId) return;
        const group = foodGroups.find(g => g.id === groupId);
        if (!group || !group.description) { showToast("Details not available.", "error"); return; }
        const descriptionHtml = group.description.replace(/\n/g, '<br>');
        openModal(group.name, descriptionHtml);
    }

    function handleAboutClick() {
        closeMenu();
        const aboutTitle = "About MIND Diet Tracker";
        const aboutContent = `<p>Track adherence to MIND Diet principles.</p><p>Data stored locally.</p><p>Version: <span id="modal-app-version">(loading...)</span></p>`;
        openModal(aboutTitle, aboutContent);
        const modalVersionEl = document.getElementById('modal-app-version');
        if(modalVersionEl && appVersionEl) modalVersionEl.textContent = appVersionEl.textContent;
    }

    function openModal(title, htmlContent) {
        modalTitle.textContent = title;
        modalBody.innerHTML = htmlContent;
        genericModal.classList.add('modal-open');
        modalCloseBtn.focus();
    }

    function closeModal() { genericModal.classList.remove('modal-open'); }

    // --- Export/Import/Settings Functions (Assumed complete and correct from previous steps) ---
    async function handleExport() { /* ... Full export logic ... */
        closeMenu(); try { console.log("Exporting..."); const csJ = localStorage.getItem('mindTrackerState'); const cs = csJ ? JSON.parse(csJ) : {}; const hD = await getAllWeekHistory(); const dE = { appInfo: {appName: "MIND Diet Tracker PWA", exportDate: new Date().toISOString(), version: 1}, currentState: cs, history: hD||[] }; if (Object.keys(dE.currentState).length === 0 && dE.history.length === 0) { showToast("No data to export.", "error"); return; } const jS = JSON.stringify(dE, null, 2); const blob = new Blob([jS], {type:'application/json'}); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; const ts = new Date().toISOString().split('T')[0]; link.download = `mind-diet-tracker-data-${ts}.json`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); console.log("Export success."); showToast("Data exported successfully!", "success"); setActiveView('tracker'); } catch (e) { console.error("Export error:", e); showToast(`Export failed: ${e.message}`, "error"); }
    }
    function triggerImport() { closeMenu(); importFileInput.click(); }
    async function handleImportFileSelect(event) { /* ... Full import logic ... */
         const file = event.target.files[0]; if (!file) return; if (!file.type || file.type !== "application/json") { showToast("Invalid file type.", "error"); importFileInput.value = ''; return; } const reader = new FileReader(); reader.onload = async (e) => { const fileContent = e.target.result; try { const importedData = JSON.parse(fileContent); if (typeof importedData !== 'object' || importedData === null || !importedData.currentState || !Array.isArray(importedData.history)) { throw new Error("Invalid file structure."); } const confirmationMessage = `WARNING:\n\nREPLACE ALL current data with content from "${file.name}"?\n\nCannot be undone.\n\nProceed?`; if (!confirm(confirmationMessage)) { console.log("Import cancelled."); importFileInput.value = ''; return; } console.log("Starting import..."); console.log("Clearing data..."); await clearHistoryStore(); localStorage.removeItem('mindTrackerState'); state.dailyCounts={}; state.weeklyCounts={}; state.history=[]; state.currentHistoryIndex=-1; console.log("Data cleared."); console.log("Restoring..."); if (importedData.currentState) { localStorage.setItem('mindTrackerState', JSON.stringify(importedData.currentState)); console.log("Current state restored."); } else { console.warn("No 'currentState' in file."); } let importCount = 0; if (importedData.history && importedData.history.length > 0) { for (const weekData of importedData.history) { try { if (weekData && typeof weekData.weekStartDate === 'string' && typeof weekData.totals === 'object') { await saveWeekHistory(weekData); importCount++; } else { console.warn("Skipping invalid history record:", weekData); } } catch (saveError) { console.error(`Error saving history week ${weekData.weekStartDate || 'unknown'}:`, saveError); } } console.log(`${importCount} history records restored.`); } else { console.log("No history records in file."); } console.log("Reloading state & UI..."); loadState(); await loadHistoryData(); renderUI(); setActiveView('tracker'); console.log("Import complete."); showToast(`Import successful! ${importCount} history records imported.`, "success", 4000); } catch (error) { console.error("Import error:", error); showToast(`Import failed: ${error.message}`, "error", 5000); loadState(); await loadHistoryData(); renderUI(); } finally { importFileInput.value = ''; } }; reader.onerror = (e) => { console.error("File read error:", e); showToast("Error reading file.", "error"); importFileInput.value = ''; }; reader.readAsText(file);
     }
    function handleSettings() { closeMenu(); showToast("Settings view not yet implemented.", "success"); }


    // ***** ADD NEW FUNCTIONS for Edit Totals Modal *****

    function openEditTotalsModal(source) {
        console.log(`Opening edit modal for source: ${source}`);
        let title = "Edit Weekly Totals";
        let dataToEdit = null;

        if (source === 'current') {
            editingWeekDataRef = state; // Reference the main state object
            dataToEdit = state.weeklyCounts;
            title = `Edit Totals for Current Week (Starting ${state.currentWeekStartDate})`;
            editingSource = 'current';
        } else if (source === 'history') {
            if (state.currentHistoryIndex === -1 || !state.history[state.currentHistoryIndex]) {
                showToast("No history week selected to edit.", "error");
                return;
            }
            editingWeekDataRef = state.history[state.currentHistoryIndex]; // Reference the specific history object
            dataToEdit = editingWeekDataRef.totals;
            title = `Edit Totals for Week of ${editingWeekDataRef.weekStartDate}`;
            editingSource = 'history';
        } else {
            console.error("Invalid source for edit modal:", source);
            return;
        }

        // Deep copy the totals to the temporary editing object
        editedTotals = JSON.parse(JSON.stringify(dataToEdit || {}));
        // Ensure all food groups have an entry in editedTotals, even if 0
        foodGroups.forEach(group => {
             if (!(group.id in editedTotals)) {
                 editedTotals[group.id] = 0;
             }
        });


        editTotalsTitle.textContent = title;
        renderEditTotalsList(); // Populate the list in the modal
        editTotalsModal.classList.add('modal-open');
        editTotalsSaveBtn.focus(); // Focus save button
    }

    function renderEditTotalsList() {
        editTotalsList.innerHTML = ''; // Clear previous items

        foodGroups.forEach(group => {
            const item = editTotalsItemTemplate.content.cloneNode(true).querySelector('.edit-totals-item');
            item.dataset.id = group.id; // Set data-id on the item container

            const nameSpan = item.querySelector('.edit-item-name');
            const totalSpan = item.querySelector('.edit-current-total');
            // Add dataset to buttons as well for easier access in handler
            item.querySelector('.edit-decrement-btn').dataset.groupId = group.id;
            item.querySelector('.edit-increment-btn').dataset.groupId = group.id;


            if (nameSpan) nameSpan.textContent = group.name;
            if (totalSpan) totalSpan.textContent = editedTotals[group.id] || 0; // Display value from temp state

            editTotalsList.appendChild(item);
        });
    }

    function handleEditTotalsItemClick(event) {
        const button = event.target.closest('.edit-decrement-btn, .edit-increment-btn');
        if (!button) return; // Exit if click wasn't on a button

        const groupId = button.dataset.groupId;
        if (!groupId) return; // Exit if button has no groupId

        let currentValue = editedTotals[groupId] || 0;

        if (button.classList.contains('edit-increment-btn')) {
            currentValue++;
        } else if (button.classList.contains('edit-decrement-btn')) {
            currentValue = Math.max(0, currentValue - 1); // Prevent negative
        }

        // Update the temporary state object
        editedTotals[groupId] = currentValue;

        // Update the displayed number in the modal UI for this item
        const itemElement = button.closest('.edit-totals-item');
        if (itemElement) {
            const totalSpan = itemElement.querySelector('.edit-current-total');
            if (totalSpan) totalSpan.textContent = currentValue;
        }
    }

    async function saveEditedTotals() {
        console.log(`Saving edited totals for source: ${editingSource}`);
        if (!editingSource || !editingWeekDataRef) {
            console.error("Cannot save, editing context is missing.");
            showToast("Error saving changes.", "error");
            closeEditTotalsModal();
            return;
        }

        try {
            // Get the final edited totals
            const finalTotals = JSON.parse(JSON.stringify(editedTotals)); // Deep copy

            if (editingSource === 'current') {
                // Update the main state's weekly counts
                state.weeklyCounts = finalTotals;
                saveState(); // Persist changes to localStorage
                // Re-render relevant UI parts
                renderCurrentWeekSummary();
                renderTrackerItems(); // To update weekly subtotals on tracker view
                showToast("Current week totals updated.", "success");
            } else if (editingSource === 'history') {
                // Update the totals within the referenced history object
                editingWeekDataRef.totals = finalTotals;
                // Save the entire updated history object back to IndexedDB
                await saveWeekHistory(editingWeekDataRef);
                // Refresh the history view display
                renderHistory(state.currentHistoryIndex);
                showToast(`Totals updated for week ${editingWeekDataRef.weekStartDate}.`, "success");
            }

            closeEditTotalsModal(); // Close modal on success

        } catch (error) {
            console.error(`Error saving edited totals for ${editingSource}:`, error);
            showToast(`Failed to save changes: ${error.message}`, "error");
            // Don't close modal on error, let user retry or cancel
        }
    }

    function closeEditTotalsModal() {
        editTotalsModal.classList.remove('modal-open');
        // Reset temporary editing state
        editingWeekDataRef = null;
        editingSource = null;
        editedTotals = {};
        editTotalsList.innerHTML = ''; // Clear list
    }

    // --- Version Display Function ---
    async function displayAppVersion() {
        if (!appVersionEl) return;
        try {
            const response = await fetch('version.json?t=' + Date.now()); // Cache buster
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const versionData = await response.json();
            appVersionEl.textContent = `(v${versionData.commitHash})`;
            console.log('App Version Info:', versionData);
        } catch (error) {
            console.error('Failed to load version info:', error);
            appVersionEl.textContent = '(v?.?.?)';
        }
    }


    // --- Start the App ---
    initializeApp();
}); // End of DOMContentLoaded listener

// --- END OF app.js ---