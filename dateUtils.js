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

/**
 * DateUtils - Centralized date utility functions
 */

import logger from "./logger.js";

/**
 * Format a date object to a human-readable string
 * @param {Date} date - The date to format
 * @param {Object} options - Format options
 * @param {boolean} [options.includeWeekday=true] - Whether to include the weekday
 * @param {boolean} [options.includeYear=false] - Whether to include the year
 * @param {boolean} [options.shortForm=true] - Whether to use abbreviated forms
 * @returns {string} Formatted date string
 */
function formatDate(date, options = {}) {
  const {
    includeWeekday = true,
    includeYear = false,
    shortForm = true,
  } = options;

  if (!date) return "";

  try {
    // Create format options for toLocaleDateString
    const formatOptions = {};

    if (includeWeekday) {
      formatOptions.weekday = shortForm ? "short" : "long";
    }

    formatOptions.month = shortForm ? "short" : "long";
    formatOptions.day = "numeric";

    if (includeYear) {
      formatOptions.year = "numeric";
    }

    return date.toLocaleDateString(undefined, formatOptions);
  } catch (error) {
    logger.error("Error formatting date:", error);
    return date.toLocaleDateString();
  }
}

/**
 * Format date to YYYY-MM-DD string
 * @param {Date} dateObj - The date object to format
 * @returns {string} Formatted date string or empty string if invalid
 */
function formatDateToYYYYMMDD(dateObj) {
  if (!dateObj || !(dateObj instanceof Date)) return "";
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get the start date of the week containing the given date
 * @param {Date|string} d - The date to find the week start for (Date object or YYYY-MM-DD string)
 * @param {string} [startDayPref="Sunday"] - The preferred start day ("Sunday" or "Monday")
 * @returns {string} Week start date in YYYY-MM-DD format
 */
function getWeekStartDate(d, startDayPref = "Sunday") {
  if (!d) {
    logger.error("getWeekStartDate: Invalid date provided:", d);
    return null;
  }

  // Handle both Date objects and YYYY-MM-DD strings
  let dateObj;
  if (d instanceof Date) {
    dateObj = new Date(d);
  } else if (typeof d === "string") {
    // Assume YYYY-MM-DD format and parse in local time
    dateObj = new Date(d + "T00:00:00");
  } else {
    logger.error("getWeekStartDate: Invalid date type provided:", typeof d, d);
    return null;
  }

  if (isNaN(dateObj.getTime())) {
    logger.error("getWeekStartDate: Invalid date provided:", d);
    return null;
  }

  try {
    const dayOfWeek = dateObj.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    let daysToSubtract;
    if (startDayPref === "Monday") {
      // Monday = 0, Tuesday = 1, ..., Sunday = 6
      daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    } else {
      // Sunday = 0, Monday = 1, ..., Saturday = 6
      daysToSubtract = dayOfWeek;
    }

    dateObj.setDate(dateObj.getDate() - daysToSubtract);
    return formatDateToYYYYMMDD(dateObj);
  } catch (error) {
    logger.error("Error calculating week start date:", error);
    return null;
  }
}

/**
 * Get the end date of the week given a week start date
 * @param {string} weekStartDate - Week start date in YYYY-MM-DD format
 * @returns {string} Week end date in YYYY-MM-DD format
 */
function getWeekEndDate(weekStartDate) {
  if (!weekStartDate || typeof weekStartDate !== "string") {
    logger.error("getWeekEndDate: Invalid week start date:", weekStartDate);
    return null;
  }

  try {
    const startDate = new Date(weekStartDate + "T00:00:00");
    if (isNaN(startDate.getTime())) {
      logger.error("getWeekEndDate: Invalid date format:", weekStartDate);
      return null;
    }

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    return formatDateToYYYYMMDD(endDate);
  } catch (error) {
    logger.error("Error calculating week end date:", error);
    return null;
  }
}

/**
 * Check if a date string is a valid date in YYYY-MM-DD format
 * @param {string} dateString - The date string to validate
 * @returns {boolean} True if the date string is valid
 */
function isValidDateString(dateString) {
  if (typeof dateString !== "string") return false;

  // Check format using regex
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;

  // Check if it's a valid date
  const date = new Date(dateString + "T00:00:00");
  if (Number.isNaN(date.getTime())) return false;

  // Check if year-month-day components match the input
  const parts = dateString.split("-").map((part) => parseInt(part, 10));
  return (
    date.getFullYear() === parts[0] &&
    date.getMonth() + 1 === parts[1] &&
    date.getDate() === parts[2]
  );
}

/**
 * Get today's date as a YYYY-MM-DD string
 * @returns {string} Today's date in YYYY-MM-DD format
 */
function getTodayDateString() {
  return formatDateToYYYYMMDD(new Date());
}

/**
 * Parse a YYYY-MM-DD string into a Date object
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Date|null} Date object or null if invalid
 */
function parseDateString(dateString) {
  if (!isValidDateString(dateString)) return null;

  try {
    return new Date(dateString + "T00:00:00");
  } catch (error) {
    logger.error("Error parsing date string:", error);
    return null;
  }
}

/**
 * Check if test mode is enabled (proxy to dataService)
 * Note: This creates a soft dependency on dataService, but avoids circular imports
 * @returns {boolean} True if test mode is enabled
 */
function isTestModeEnabled() {
  // Try multiple ways to access dataService to handle different loading scenarios
  if (typeof window !== "undefined") {
    if (
      window.appDataService &&
      typeof window.appDataService.isTestModeEnabled === "function"
    ) {
      return window.appDataService.isTestModeEnabled();
    }
    if (
      window.dataService &&
      typeof window.dataService.isTestModeEnabled === "function"
    ) {
      return window.dataService.isTestModeEnabled();
    }
  }
  return false;
}

/**
 * Get the current date, respecting test mode
 * @returns {Date} Current date (or test date if test mode is enabled)
 */
function getCurrentDate() {
  // Try multiple ways to access dataService to handle different loading scenarios
  if (typeof window !== "undefined") {
    if (
      window.appDataService &&
      typeof window.appDataService.getCurrentDate === "function"
    ) {
      return window.appDataService.getCurrentDate();
    }
    if (
      window.dataService &&
      typeof window.dataService.getCurrentDate === "function"
    ) {
      return window.dataService.getCurrentDate();
    }
  }
  return new Date();
}

// Export public API
export default {
  formatDate,
  formatDateToYYYYMMDD,
  getWeekStartDate,
  getWeekEndDate,
  isValidDateString,
  getTodayDateString,
  parseDateString,
  isTestModeEnabled,
  getCurrentDate,
};

// Named exports for convenience
export {
  formatDate,
  formatDateToYYYYMMDD,
  getWeekStartDate,
  getWeekEndDate,
  isValidDateString,
  getTodayDateString,
  parseDateString,
  isTestModeEnabled,
  getCurrentDate,
};
