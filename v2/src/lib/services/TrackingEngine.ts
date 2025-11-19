import type { FoodGroup, DailyCounts, WeeklyCounts } from '$lib/types';
import { getWeekDates, formatDateToYYYYMMDD, parseDateString } from '$lib/utils/dateUtils';

/**
 * TrackingEngine - Business logic for MIND diet tracking calculations
 */

/**
 * Calculate weekly totals from daily counts
 */
export function calculateWeeklyTotals(
	dailyCounts: DailyCounts,
	weekStartDate: Date | string,
	foodGroups: FoodGroup[]
): WeeklyCounts {
	const weeklyTotals: WeeklyCounts = {};

	// Initialize all food groups to 0
	foodGroups.forEach((group) => {
		weeklyTotals[group.id] = 0;
	});

	// Get the 7 dates of the week
	const weekDates = getWeekDates(weekStartDate);

	// Sum up daily counts for each day of the week
	weekDates.forEach((date) => {
		const dateKey = formatDateToYYYYMMDD(date);
		const dayCounts = dailyCounts[dateKey];

		if (dayCounts) {
			Object.entries(dayCounts).forEach(([foodId, count]) => {
				weeklyTotals[foodId] = (weeklyTotals[foodId] || 0) + count;
			});
		}
	});

	return weeklyTotals;
}

/**
 * Check if daily target is met
 */
export function isDailyTargetMet(count: number, foodGroup: FoodGroup): boolean {
	if (foodGroup.frequency !== 'day' || foodGroup.type !== 'positive') {
		return false;
	}
	return count >= foodGroup.target;
}

/**
 * Check if weekly target is met
 */
export function isWeeklyTargetMet(count: number, foodGroup: FoodGroup): boolean {
	if (foodGroup.frequency !== 'week' || foodGroup.type !== 'positive') {
		return false;
	}
	return count >= foodGroup.target;
}

/**
 * Check if daily limit is exceeded
 */
export function isDailyLimitExceeded(count: number, foodGroup: FoodGroup): boolean {
	if (foodGroup.frequency !== 'day' || foodGroup.type !== 'limit') {
		return false;
	}
	return count > foodGroup.target;
}

/**
 * Check if weekly limit is exceeded
 */
export function isWeeklyLimitExceeded(count: number, foodGroup: FoodGroup): boolean {
	if (foodGroup.frequency !== 'week' || foodGroup.type !== 'limit') {
		return false;
	}
	return count > foodGroup.target;
}

/**
 * Status levels for visual feedback
 */
export type StatusLevel = 'success' | 'warning' | 'danger' | 'neutral';

/**
 * Get status level for a food group count
 */
export function getStatusLevel(
	count: number,
	foodGroup: FoodGroup,
	daysIntoWeek: number = 7
): StatusLevel {
	if (count === 0) return 'neutral';

	if (foodGroup.type === 'positive') {
		// Target-based: we want to meet or exceed the target
		const expectedTarget =
			foodGroup.frequency === 'day' ? foodGroup.target * daysIntoWeek : foodGroup.target;

		return count >= expectedTarget ? 'success' : 'neutral';
	} else {
		// Limit-based: we want to stay under the limit
		const maxAllowed =
			foodGroup.frequency === 'day'
				? foodGroup.target * daysIntoWeek
				: foodGroup.target;

		if (count > maxAllowed) {
			return 'danger'; // Limit exceeded
		} else if (count >= maxAllowed - 1) {
			return 'warning'; // Close to limit
		} else {
			return 'neutral'; // Well below limit
		}
	}
}

/**
 * Get CSS color for status level
 */
export function getStatusColor(
	count: number,
	foodGroup: FoodGroup,
	daysIntoWeek: number = 7
): string {
	const level = getStatusLevel(count, foodGroup, daysIntoWeek);

	const colors: Record<StatusLevel, string> = {
		success: '#10b981', // green
		warning: '#f59e0b', // yellow/orange
		danger: '#ef4444', // red
		neutral: '#6b7280' // gray
	};

	return colors[level];
}

/**
 * Calculate how many days into the week we are
 */
export function calculateDaysIntoWeek(currentDate: string, weekStartDate: string): number {
	try {
		const currentDateObj = parseDateString(currentDate);
		const weekStartDateObj = parseDateString(weekStartDate);

		if (!currentDateObj || !weekStartDateObj) {
			console.warn('calculateDaysIntoWeek: Invalid date format');
			return 7; // Default to full week
		}

		const daysSinceWeekStart = Math.floor(
			(currentDateObj.getTime() - weekStartDateObj.getTime()) / (24 * 60 * 60 * 1000)
		);

		return Math.max(1, Math.min(7, daysSinceWeekStart + 1)); // Clamp to 1-7 range
	} catch (error) {
		console.error('Error calculating days into week:', error);
		return 7; // Default to full week
	}
}

/**
 * Get the weekly target for a food group
 */
export function getWeeklyTarget(foodGroup: FoodGroup): number {
	if (foodGroup.frequency === 'week') return foodGroup.target;
	if (foodGroup.frequency === 'day') return foodGroup.target * 7;
	return foodGroup.target;
}

/**
 * Validate a count value
 */
export function validateFoodGroupCount(count: any): number {
	const numericCount = parseInt(String(count), 10);

	if (isNaN(numericCount) || numericCount < 0) {
		return 0;
	}

	// Optional: add maximum reasonable limits
	if (numericCount > 999) {
		return 999;
	}

	return numericCount;
}

/**
 * Get progress percentage for a food group
 */
export function getProgressPercentage(
	count: number,
	foodGroup: FoodGroup,
	daysIntoWeek: number = 7
): number {
	const target =
		foodGroup.frequency === 'day' ? foodGroup.target * daysIntoWeek : foodGroup.target;

	if (target === 0) return 0;

	return Math.min(100, Math.round((count / target) * 100));
}

/**
 * Check if a food group is on track (for positive food groups)
 */
export function isOnTrack(
	count: number,
	foodGroup: FoodGroup,
	daysIntoWeek: number
): boolean {
	if (foodGroup.type !== 'positive') return true;

	const expectedTarget =
		foodGroup.frequency === 'day' ? foodGroup.target * daysIntoWeek : foodGroup.target;

	return count >= expectedTarget * 0.8; // At least 80% of expected
}

/**
 * Get a summary message for a food group
 */
export function getSummaryMessage(
	count: number,
	foodGroup: FoodGroup,
	daysIntoWeek: number = 7
): string {
	if (foodGroup.type === 'positive') {
		const target = getWeeklyTarget(foodGroup);
		const remaining = Math.max(0, target - count);

		if (count >= target) {
			return '✓ Target met!';
		} else {
			return `${remaining} more needed`;
		}
	} else {
		const remaining = Math.max(0, foodGroup.target - count);

		if (count > foodGroup.target) {
			return '⚠ Limit exceeded';
		} else if (remaining === 0) {
			return 'At limit';
		} else {
			return `${remaining} remaining`;
		}
	}
}
