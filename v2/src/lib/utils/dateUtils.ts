/**
 * DateUtils - Centralized date utility functions
 */

interface FormatDateOptions {
	includeWeekday?: boolean;
	includeYear?: boolean;
	shortForm?: boolean;
}

/**
 * Format a date object to a human-readable string
 */
export function formatDate(date: Date, options: FormatDateOptions = {}): string {
	const { includeWeekday = true, includeYear = false, shortForm = true } = options;

	if (!date) return '';

	try {
		const formatOptions: Intl.DateTimeFormatOptions = {};

		if (includeWeekday) {
			formatOptions.weekday = shortForm ? 'short' : 'long';
		}

		formatOptions.month = shortForm ? 'short' : 'long';
		formatOptions.day = 'numeric';

		if (includeYear) {
			formatOptions.year = 'numeric';
		}

		return date.toLocaleDateString(undefined, formatOptions);
	} catch (error) {
		console.error('Error formatting date:', error);
		return date.toLocaleDateString();
	}
}

/**
 * Format date to YYYY-MM-DD string
 */
export function formatDateToYYYYMMDD(dateObj: Date): string {
	if (!dateObj || !(dateObj instanceof Date)) return '';

	const year = dateObj.getFullYear();
	const month = String(dateObj.getMonth() + 1).padStart(2, '0');
	const day = String(dateObj.getDate()).padStart(2, '0');

	return `${year}-${month}-${day}`;
}

/**
 * Get the start date of the week containing the given date
 */
export function getWeekStartDate(
	d: Date | string,
	startDayPref: 'Sunday' | 'Monday' = 'Sunday'
): string | null {
	if (!d) {
		console.error('getWeekStartDate: Invalid date provided:', d);
		return null;
	}

	// Handle both Date objects and YYYY-MM-DD strings
	let dateObj: Date;
	if (d instanceof Date) {
		dateObj = new Date(d);
	} else if (typeof d === 'string') {
		// Assume YYYY-MM-DD format and parse in local time
		dateObj = new Date(d + 'T00:00:00');
	} else {
		console.error('getWeekStartDate: Invalid date type provided:', typeof d, d);
		return null;
	}

	if (isNaN(dateObj.getTime())) {
		console.error('getWeekStartDate: Invalid date provided:', d);
		return null;
	}

	try {
		const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

		let daysToSubtract: number;
		if (startDayPref === 'Monday') {
			// Monday = 0, Tuesday = 1, ..., Sunday = 6
			daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
		} else {
			// Sunday = 0, Monday = 1, ..., Saturday = 6
			daysToSubtract = dayOfWeek;
		}

		dateObj.setDate(dateObj.getDate() - daysToSubtract);
		return formatDateToYYYYMMDD(dateObj);
	} catch (error) {
		console.error('Error calculating week start date:', error);
		return null;
	}
}

/**
 * Get the end date of the week given a week start date
 */
export function getWeekEndDate(weekStartDate: string): string | null {
	if (!weekStartDate || typeof weekStartDate !== 'string') {
		console.error('getWeekEndDate: Invalid week start date:', weekStartDate);
		return null;
	}

	try {
		const startDate = new Date(weekStartDate + 'T00:00:00');
		if (isNaN(startDate.getTime())) {
			console.error('getWeekEndDate: Invalid date format:', weekStartDate);
			return null;
		}

		const endDate = new Date(startDate);
		endDate.setDate(startDate.getDate() + 6);
		return formatDateToYYYYMMDD(endDate);
	} catch (error) {
		console.error('Error calculating week end date:', error);
		return null;
	}
}

/**
 * Get array of dates in a week
 */
export function getWeekDates(weekStartDate: Date | string): Date[] {
	const dates: Date[] = [];
	const startDate =
		typeof weekStartDate === 'string'
			? new Date(weekStartDate + 'T00:00:00')
			: new Date(weekStartDate);

	for (let i = 0; i < 7; i++) {
		const date = new Date(startDate);
		date.setDate(startDate.getDate() + i);
		dates.push(date);
	}

	return dates;
}

/**
 * Check if a date string is a valid date in YYYY-MM-DD format
 */
export function isValidDateString(dateString: string): boolean {
	if (typeof dateString !== 'string') return false;

	// Check format using regex
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;

	// Check if it's a valid date
	const date = new Date(dateString + 'T00:00:00');
	if (Number.isNaN(date.getTime())) return false;

	// Check if year-month-day components match the input
	const parts = dateString.split('-').map((part) => parseInt(part, 10));
	return (
		date.getFullYear() === parts[0] &&
		date.getMonth() + 1 === parts[1] &&
		date.getDate() === parts[2]
	);
}

/**
 * Get today's date as a YYYY-MM-DD string
 */
export function getTodayDateString(): string {
	return formatDateToYYYYMMDD(new Date());
}

/**
 * Parse a YYYY-MM-DD string into a Date object
 */
export function parseDateString(dateString: string): Date | null {
	if (!isValidDateString(dateString)) return null;

	try {
		return new Date(dateString + 'T00:00:00');
	} catch (error) {
		console.error('Error parsing date string:', error);
		return null;
	}
}

/**
 * Get today's date (midnight)
 */
export function getToday(): Date {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
	return formatDateToYYYYMMDD(date1) === formatDateToYYYYMMDD(date2);
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

/**
 * Subtract days from a date
 */
export function subtractDays(date: Date, days: number): Date {
	return addDays(date, -days);
}

/**
 * Get the difference in days between two dates
 */
export function daysBetween(date1: Date, date2: Date): number {
	const msPerDay = 1000 * 60 * 60 * 24;
	const utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
	const utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
	return Math.floor((utc2 - utc1) / msPerDay);
}
