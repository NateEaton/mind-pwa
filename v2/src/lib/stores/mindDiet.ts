import { writable, derived, get } from 'svelte/store';
import type { DailyCounts, WeeklyCounts, HistoryEntry, AppSettings, AppMetadata } from '$lib/types';
import { DataService } from '$lib/services/DataService';
import { calculateWeeklyTotals } from '$lib/services/TrackingEngine';
import {
	getToday,
	formatDateToYYYYMMDD,
	getWeekStartDate,
	getWeekDates
} from '$lib/utils/dateUtils';
import { foodGroups } from '$lib/data/foodGroups';

/**
 * Main MIND Diet state stores
 *
 * This module provides reactive Svelte stores for all application state,
 * replacing the old StateManager pub/sub pattern with Svelte's built-in reactivity.
 */

// Initialize from localStorage
const initialSettings = DataService.loadSettings();
const initialDailyCounts = DataService.loadDailyCounts();
const initialHistory = DataService.loadHistory();
const initialMetadata = DataService.loadMetadata();

// --- Core State Stores ---

/**
 * App settings (theme, week start day, sync preferences)
 */
export const settings = writable<AppSettings>(initialSettings);

/**
 * Daily food group counts: { "YYYY-MM-DD": { foodGroupId: count } }
 */
export const dailyCounts = writable<DailyCounts>(initialDailyCounts);

/**
 * Historical weekly data
 */
export const history = writable<HistoryEntry[]>(initialHistory);

/**
 * App metadata (last modified, sync info, device ID)
 */
export const metadata = writable<AppMetadata>(initialMetadata);

/**
 * Current date being viewed/edited
 */
export const currentDate = writable<Date>(getToday());

// --- Derived Stores (Computed Values) ---

/**
 * Current date as YYYY-MM-DD string
 */
export const currentDateString = derived(currentDate, ($currentDate) =>
	formatDateToYYYYMMDD($currentDate)
);

/**
 * Week start date for the current date
 */
export const currentWeekStartDate = derived(
	[currentDate, settings],
	([$currentDate, $settings]) => {
		const weekStartString = getWeekStartDate($currentDate, $settings.weekStartDay);
		return weekStartString || formatDateToYYYYMMDD($currentDate);
	}
);

/**
 * Array of dates in the current week
 */
export const currentWeekDates = derived(currentWeekStartDate, ($currentWeekStartDate) => {
	return getWeekDates($currentWeekStartDate);
});

/**
 * Weekly totals for the current week
 */
export const currentWeekCounts = derived(
	[dailyCounts, currentWeekStartDate],
	([$dailyCounts, $currentWeekStartDate]) => {
		return calculateWeeklyTotals($dailyCounts, $currentWeekStartDate, foodGroups);
	}
);

/**
 * Daily counts for the current date
 */
export const currentDayCounts = derived(
	[dailyCounts, currentDateString],
	([$dailyCounts, $currentDateString]) => {
		return $dailyCounts[$currentDateString] || {};
	}
);

/**
 * Check if current date is today
 */
export const isToday = derived(currentDate, ($currentDate) => {
	const today = getToday();
	return formatDateToYYYYMMDD($currentDate) === formatDateToYYYYMMDD(today);
});

// --- Persistence: Auto-save to localStorage ---

dailyCounts.subscribe((value) => {
	DataService.saveDailyCounts(value);
});

history.subscribe((value) => {
	DataService.saveHistory(value);
});

settings.subscribe((value) => {
	DataService.saveSettings(value);
});

metadata.subscribe((value) => {
	DataService.saveMetadata(value);
});

// --- Actions (State Mutations) ---

export const mindDietActions = {
	/**
	 * Update count for a food group on a specific date
	 */
	updateDailyCount(date: string, foodGroupId: string, count: number) {
		dailyCounts.update((counts) => {
			const newCounts = { ...counts };
			if (!newCounts[date]) {
				newCounts[date] = {};
			}
			newCounts[date][foodGroupId] = Math.max(0, count);

			// Remove the date entry if all counts are 0
			if (Object.values(newCounts[date]).every((c) => c === 0)) {
				delete newCounts[date];
			}

			return newCounts;
		});

		// Update metadata
		metadata.update((m) => ({
			...m,
			lastModified: new Date().toISOString()
		}));
	},

	/**
	 * Increment count for a food group
	 */
	incrementCount(date: string, foodGroupId: string) {
		const counts = get(dailyCounts);
		const currentCount = counts[date]?.[foodGroupId] || 0;
		this.updateDailyCount(date, foodGroupId, currentCount + 1);
	},

	/**
	 * Decrement count for a food group
	 */
	decrementCount(date: string, foodGroupId: string) {
		const counts = get(dailyCounts);
		const currentCount = counts[date]?.[foodGroupId] || 0;
		if (currentCount > 0) {
			this.updateDailyCount(date, foodGroupId, currentCount - 1);
		}
	},

	/**
	 * Reset all counts for a specific date
	 */
	resetDayCount(date: string) {
		dailyCounts.update((counts) => {
			const newCounts = { ...counts };
			delete newCounts[date];
			return newCounts;
		});

		metadata.update((m) => ({
			...m,
			lastModified: new Date().toISOString()
		}));
	},

	/**
	 * Set the current date
	 */
	setCurrentDate(date: Date) {
		currentDate.set(date);
	},

	/**
	 * Navigate to previous day
	 */
	previousDay() {
		currentDate.update((d) => {
			const newDate = new Date(d);
			newDate.setDate(newDate.getDate() - 1);
			return newDate;
		});
	},

	/**
	 * Navigate to next day
	 */
	nextDay() {
		currentDate.update((d) => {
			const newDate = new Date(d);
			newDate.setDate(newDate.getDate() + 1);
			return newDate;
		});
	},

	/**
	 * Navigate to today
	 */
	goToToday() {
		currentDate.set(getToday());
	},

	/**
	 * Navigate to previous week
	 */
	previousWeek() {
		currentDate.update((d) => {
			const newDate = new Date(d);
			newDate.setDate(newDate.getDate() - 7);
			return newDate;
		});
	},

	/**
	 * Navigate to next week
	 */
	nextWeek() {
		currentDate.update((d) => {
			const newDate = new Date(d);
			newDate.setDate(newDate.getDate() + 7);
			return newDate;
		});
	},

	/**
	 * Update app settings
	 */
	updateSettings(newSettings: Partial<AppSettings>) {
		settings.update((s) => ({ ...s, ...newSettings }));

		metadata.update((m) => ({
			...m,
			lastModified: new Date().toISOString()
		}));
	},

	/**
	 * Archive current week to history
	 */
	archiveCurrentWeek() {
		const $currentWeekStartDate = get(currentWeekStartDate);
		const $dailyCounts = get(dailyCounts);
		const $currentWeekCounts = get(currentWeekCounts);

		const weekDates = getWeekDates($currentWeekStartDate);
		const dailyEntries: { [date: string]: { [foodGroupId: string]: number } } = {};

		// Collect daily entries for this week
		weekDates.forEach((date) => {
			const dateKey = formatDateToYYYYMMDD(date);
			if ($dailyCounts[dateKey]) {
				dailyEntries[dateKey] = { ...$dailyCounts[dateKey] };
			}
		});

		const historyEntry: HistoryEntry = {
			weekStartDate: $currentWeekStartDate,
			weeklyCounts: { ...$currentWeekCounts },
			dailyEntries,
			lastModified: new Date().toISOString()
		};

		history.update((h) => {
			// Check if entry for this week already exists
			const existingIndex = h.findIndex((entry) => entry.weekStartDate === historyEntry.weekStartDate);

			if (existingIndex >= 0) {
				// Update existing
				const newHistory = [...h];
				newHistory[existingIndex] = historyEntry;
				return newHistory;
			} else {
				// Add new, sorted by date descending
				return [historyEntry, ...h].sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));
			}
		});

		metadata.update((m) => ({
			...m,
			lastModified: new Date().toISOString()
		}));
	},

	/**
	 * Delete a history entry
	 */
	deleteHistoryEntry(weekStartDate: string) {
		history.update((h) => h.filter((entry) => entry.weekStartDate !== weekStartDate));

		metadata.update((m) => ({
			...m,
			lastModified: new Date().toISOString()
		}));
	},

	/**
	 * Load a week from history for editing
	 */
	loadHistoryWeek(weekStartDate: string) {
		const $history = get(history);
		const entry = $history.find((e) => e.weekStartDate === weekStartDate);

		if (entry) {
			// Merge the historical week's daily entries into current dailyCounts
			dailyCounts.update((counts) => {
				const newCounts = { ...counts };
				Object.entries(entry.dailyEntries).forEach(([date, dayCounts]) => {
					newCounts[date] = { ...dayCounts };
				});
				return newCounts;
			});

			// Navigate to that week
			const weekDate = new Date(weekStartDate + 'T00:00:00');
			currentDate.set(weekDate);
		}
	},

	/**
	 * Export all data as JSON
	 */
	exportData(): string {
		const data = DataService.exportData();
		return JSON.stringify(data, null, 2);
	},

	/**
	 * Import data from JSON string
	 */
	importData(jsonString: string): boolean {
		try {
			const data = JSON.parse(jsonString);
			const success = DataService.importData(data);

			if (success) {
				// Reload all stores from localStorage
				settings.set(DataService.loadSettings());
				dailyCounts.set(DataService.loadDailyCounts());
				history.set(DataService.loadHistory());
				metadata.set(DataService.loadMetadata());
			}

			return success;
		} catch (error) {
			console.error('Error importing data:', error);
			return false;
		}
	},

	/**
	 * Clear all data
	 */
	clearAllData(confirmed: boolean = false) {
		if (!confirmed && typeof window !== 'undefined') {
			const userConfirmed = confirm(
				'Are you sure you want to clear all data? This cannot be undone.'
			);
			if (!userConfirmed) return;
		}

		DataService.clearAllData();

		// Reset all stores to defaults
		settings.set({
			weekStartDay: 'Sunday',
			theme: 'auto',
			cloudSyncEnabled: false
		});
		dailyCounts.set({});
		history.set([]);
		metadata.set({
			lastModified: null,
			weekStartDay: 'Sunday',
			deviceId: DataService.getDeviceId()
		});
		currentDate.set(getToday());
	},

	/**
	 * Get a summary of all data
	 */
	getDataSummary() {
		const $dailyCounts = get(dailyCounts);
		const $history = get(history);

		const totalDays = Object.keys($dailyCounts).length;
		const totalWeeksInHistory = $history.length;
		const storageSize = DataService.getStorageSize();

		return {
			totalDays,
			totalWeeksInHistory,
			storageSize,
			hasData: DataService.hasData()
		};
	}
};
