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
 * TrackingEngine - Shared logic for food tracking calculations and UI updates
 */

import logger from "./logger.js";
import dateUtils from "../utils/dateUtils.js";

/**
 * Calculate weekly totals from daily breakdown data
 * @param {Object} dailyBreakdown - Object with YYYY-MM-DD keys containing daily counts
 * @param {Array} foodGroups - Array of food group objects
 * @param {string} weekStartDate - Week start date in YYYY-MM-DD format
 * @returns {Object} Weekly totals by food group ID
 */
function calculateWeeklyTotals(
  dailyBreakdown,
  foodGroups = [],
  weekStartDate = null
) {
  const weeklyTotals = {};

  // Initialize all food groups to 0
  foodGroups.forEach((group) => {
    weeklyTotals[group.id] = 0;
  });

  if (!dailyBreakdown || typeof dailyBreakdown !== "object") {
    return weeklyTotals;
  }

  // If weekStartDate is provided, only count days within that week
  if (weekStartDate) {
    const weekStartDateObj = dateUtils.parseDateString(weekStartDate);
    if (weekStartDateObj) {
      // Sum totals for the 7 days of the specified week
      for (let i = 0; i < 7; i++) {
        const dayObj = new Date(weekStartDateObj);
        dayObj.setDate(weekStartDateObj.getDate() + i);
        const dayStr = dateUtils.formatDateToYYYYMMDD(dayObj);

        if (dailyBreakdown[dayStr]) {
          Object.entries(dailyBreakdown[dayStr]).forEach(([groupId, count]) => {
            weeklyTotals[groupId] = (weeklyTotals[groupId] || 0) + (count || 0);
          });
        }
      }
    }
  } else {
    // Sum all available daily data
    Object.values(dailyBreakdown).forEach((dayData) => {
      if (dayData && typeof dayData === "object") {
        Object.entries(dayData).forEach(([groupId, count]) => {
          weeklyTotals[groupId] = (weeklyTotals[groupId] || 0) + (count || 0);
        });
      }
    });
  }

  return weeklyTotals;
}

/**
 * Get the badge color class based on food group progress
 * @param {Object} group - The food group data
 * @param {number} currentCount - The current count for this group
 * @param {number} daysIntoWeek - How many days into the week we are (1-7)
 * @returns {string} CSS class name for badge color
 */
function getBadgeColorClass(group, currentCount, daysIntoWeek = 7) {
  if (!group || typeof currentCount !== "number") {
    return "badge-secondary"; // Default color
  }

  // Ensure daysIntoWeek is within valid range
  daysIntoWeek = Math.max(1, Math.min(7, daysIntoWeek));

  if (group.type === "positive") {
    // Target-based item (we want to reach or exceed the target)
    const expectedTarget =
      group.frequency === "day" ? group.target * daysIntoWeek : group.target;

    if (currentCount >= expectedTarget) {
      // Target met or exceeded for current point in week
      return "badge-primary";
    } else {
      // Target in progress
      return "badge-secondary";
    }
  } else {
    // Limit-based item (we want to stay under the limit)

    // Special case: if count is 0, always use secondary color (not warning)
    if (currentCount === 0) {
      return "badge-secondary";
    }

    // Calculate the prorated max for daily items
    const maxAllowed =
      group.frequency === "day"
        ? group.target * daysIntoWeek // Daily limit × days into week
        : group.target; // Weekly limit as is

    if (currentCount > maxAllowed) {
      // Limit exceeded for current point in week
      return "badge-danger";
    } else if (currentCount >= maxAllowed - 1) {
      // Within 1 of limit
      return "badge-warning";
    } else {
      // Well below limit
      return "badge-secondary";
    }
  }
}

/**
 * Update the badge color classes on a DOM element
 * @param {HTMLElement} badge - The badge element to update
 * @param {Object} group - The food group data
 * @param {number} currentCount - The current count for this group
 * @param {number} daysIntoWeek - How many days into the week we are (1-7)
 */
function updateBadgeColor(badge, group, currentCount, daysIntoWeek = 7) {
  if (!badge || !group) {
    logger.warn("updateBadgeColor: Missing badge element or group data");
    return;
  }

  // Remove all existing color classes
  badge.classList.remove(
    "badge-primary",
    "badge-secondary",
    "badge-warning",
    "badge-danger"
  );

  // Add the appropriate color class
  const colorClass = getBadgeColorClass(group, currentCount, daysIntoWeek);
  badge.classList.add(colorClass);
}

/**
 * Calculate how many days into the week we are
 * @param {string} currentDate - Current date in YYYY-MM-DD format
 * @param {string} weekStartDate - Week start date in YYYY-MM-DD format
 * @returns {number} Days into week (1-7)
 */
function calculateDaysIntoWeek(currentDate, weekStartDate) {
  try {
    const currentDateObj = dateUtils.parseDateString(currentDate);
    const weekStartDateObj = dateUtils.parseDateString(weekStartDate);

    if (!currentDateObj || !weekStartDateObj) {
      logger.warn("calculateDaysIntoWeek: Invalid date format");
      return 7; // Default to full week
    }

    const daysSinceWeekStart = Math.floor(
      (currentDateObj - weekStartDateObj) / (24 * 60 * 60 * 1000)
    );

    return Math.max(1, Math.min(7, daysSinceWeekStart + 1)); // Clamp to 1-7 range
  } catch (error) {
    logger.error("Error calculating days into week:", error);
    return 7; // Default to full week
  }
}

/**
 * Get the effective weekly target for a food group
 * @param {Object} group - The food group data
 * @returns {number} Weekly target (daily target × 7 for daily items, or weekly target as-is)
 */
function getWeeklyTarget(group) {
  if (!group) return 0;

  if (group.frequency === "week") return group.target;
  if (group.frequency === "day") return group.target * 7; // 7 days per week
  return group.target; // Fallback for special cases
}

/**
 * Validate a count value for a food group
 * @param {*} count - The count value to validate
 * @param {Object} group - The food group data (optional, for future validation rules)
 * @returns {number} Valid count (0 if invalid input)
 */
function validateFoodGroupCount(count, group = null) {
  const numericCount = parseInt(count, 10);

  // Return 0 for invalid numbers or negative numbers
  if (isNaN(numericCount) || numericCount < 0) {
    return 0;
  }

  // Future: could add group-specific validation rules here
  // e.g., maximum reasonable values per food group

  return numericCount;
}

// Export public API
export default {
  calculateWeeklyTotals,
  getBadgeColorClass,
  updateBadgeColor,
  calculateDaysIntoWeek,
  getWeeklyTarget,
  validateFoodGroupCount,
};

// Named exports for convenience
export {
  calculateWeeklyTotals,
  getBadgeColorClass,
  updateBadgeColor,
  calculateDaysIntoWeek,
  getWeeklyTarget,
  validateFoodGroupCount,
};
