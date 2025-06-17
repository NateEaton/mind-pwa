/*
 * MIND Diet Tracker PWA - UI Components
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

import { templates, renderTemplate } from "./templates.js";

/**
 * UI Components - Template rendering utilities and helper functions
 */

/**
 * Get target description for a food group
 * @param {Object} group - The food group object
 * @returns {string} - Formatted target description
 */
export function getTargetDescription(group) {
  const targetVal = group.target;
  const freqText = group.frequency === "day" ? "day" : "week";
  const unitText = group.unit || "servings";

  if (group.type === "positive") {
    return `Target: ≥ ${targetVal} ${unitText}/${freqText}`;
  } else {
    return `Limit: ≤ ${targetVal} ${unitText}/${freqText}`;
  }
}

/**
 * Get badge class for a food group based on progress
 * @param {Object} group - The food group object
 * @param {number} count - The current count
 * @param {Object} state - The current state (for weekly calculations)
 * @returns {string} - CSS class for the badge
 */
export function getBadgeClass(group, count, state = null) {
  if (group.type === "positive") {
    // For positive targets, check if we're on track for the week
    if (state && group.frequency === "day") {
      const currentDate = new Date(`${state.currentDayDate}T00:00:00`);
      const weekStartDate = new Date(`${state.currentWeekStartDate}T00:00:00`);
      const daysSinceWeekStart = Math.floor(
        (currentDate - weekStartDate) / (24 * 60 * 60 * 1000)
      );
      const daysIntoWeek = Math.max(0, daysSinceWeekStart) + 1;

      const targetForCurrentPoint = group.target * daysIntoWeek;
      return count >= targetForCurrentPoint
        ? "badge-primary"
        : "badge-secondary";
    } else {
      return count >= group.target ? "badge-primary" : "badge-secondary";
    }
  } else {
    // For limits
    if (count === 0) return "badge-secondary";

    if (state && group.frequency === "day") {
      const currentDate = new Date(`${state.currentDayDate}T00:00:00`);
      const weekStartDate = new Date(`${state.currentWeekStartDate}T00:00:00`);
      const daysSinceWeekStart = Math.floor(
        (currentDate - weekStartDate) / (24 * 60 * 60 * 1000)
      );
      const daysIntoWeek = Math.max(0, daysSinceWeekStart) + 1;

      const maxAllowed = group.target * daysIntoWeek;
      if (count > maxAllowed) return "badge-danger";
      if (count >= maxAllowed - 1) return "badge-warning";
      return "badge-secondary";
    } else {
      if (count > group.target) return "badge-danger";
      if (count >= group.target - 1) return "badge-warning";
      return "badge-secondary";
    }
  }
}

/**
 * Get status class for current week cards
 * @param {Object} group - The food group object
 * @param {number} currentTotal - The current total
 * @param {number} weeklyTarget - The weekly target
 * @returns {string} - CSS class for the card
 */
export function getCurrentWeekStatusClass(group, currentTotal, weeklyTarget) {
  if (group.type === "positive") {
    return currentTotal >= weeklyTarget ? "goal-met" : "";
  } else {
    if (currentTotal > weeklyTarget) return "limit-exceeded";
    if (currentTotal > weeklyTarget * 0.75 && currentTotal <= weeklyTarget)
      return "limit-near";
    return "";
  }
}

/**
 * Get status class for history cards
 * @param {Object} targetInfo - The target information
 * @param {number} total - The total count
 * @param {number} effectiveWeeklyTarget - The effective weekly target
 * @returns {string} - CSS class for the card
 */
export function getHistoryStatusClass(
  targetInfo,
  total,
  effectiveWeeklyTarget
) {
  if (targetInfo.type === "positive") {
    return total >= effectiveWeeklyTarget ? "goal-met" : "goal-missed";
  } else {
    if (total <= effectiveWeeklyTarget) {
      if (effectiveWeeklyTarget > 0 && total > effectiveWeeklyTarget * 0.75) {
        return "limit-near";
      }
      return "limit-ok";
    } else {
      return "limit-exceeded";
    }
  }
}

/**
 * Render a food group item
 * @param {Object} group - The food group object
 * @param {number} dailyCount - The daily count for this group
 * @param {number} weeklyTotal - The weekly total for this group
 * @param {Object} state - The current state (for badge calculations)
 * @returns {string} - Rendered HTML
 */
export function renderFoodGroupItem(
  group,
  dailyCount,
  weeklyTotal,
  state = null
) {
  return renderTemplate(templates.foodGroupItem, {
    id: group.id,
    name: group.name,
    target: getTargetDescription(group),
    count: dailyCount,
    weeklyTotal: weeklyTotal,
  });
}

/**
 * Render a day selector button
 * @param {string} letter - The day letter (S, M, T, etc.)
 * @param {string} date - The date string (YYYY-MM-DD)
 * @param {boolean} active - Whether this day is currently selected
 * @param {string} ariaLabel - The aria-label for accessibility
 * @returns {string} - Rendered HTML
 */
export function renderDaySelectorButton(letter, date, active, ariaLabel) {
  return renderTemplate(templates.daySelectorButton, {
    letter: letter,
    date: date,
    active: active,
    ariaLabel: ariaLabel,
  });
}

/**
 * Render a current week summary card
 * @param {Object} group - The food group object
 * @param {number} currentTotal - The current total
 * @param {number} weeklyTarget - The weekly target
 * @returns {string} - Rendered HTML
 */
export function renderCurrentWeekCard(group, currentTotal, weeklyTarget) {
  const statusClass = getCurrentWeekStatusClass(
    group,
    currentTotal,
    weeklyTarget
  );

  return renderTemplate(templates.currentWeekCard, {
    name: group.name,
    currentTotal: currentTotal,
    target: `${group.type === "limit" ? "≤" : "≥"} ${weeklyTarget}`,
    statusClass: statusClass,
  });
}

/**
 * Render a history card
 * @param {Object} targetInfo - The target information
 * @param {number} total - The total count
 * @param {number} effectiveWeeklyTarget - The effective weekly target
 * @returns {string} - Rendered HTML
 */
export function renderHistoryCard(targetInfo, total, effectiveWeeklyTarget) {
  const statusClass = getHistoryStatusClass(
    targetInfo,
    total,
    effectiveWeeklyTarget
  );

  return renderTemplate(templates.historyCard, {
    name: targetInfo.name,
    total: total,
    target: `${
      targetInfo.type === "limit" ? "≤" : "≥"
    } ${effectiveWeeklyTarget}`,
    statusClass: statusClass,
  });
}

/**
 * Render an edit totals modal item
 * @param {Object} group - The food group object
 * @param {number} count - The count for the selected day
 * @param {number} weeklyTotal - The weekly total
 * @param {Object} state - The current state (for badge calculations)
 * @returns {string} - Rendered HTML
 */
export function renderEditTotalsItem(group, count, weeklyTotal, state = null) {
  const badgeClass = getBadgeClass(group, weeklyTotal, state);

  return renderTemplate(templates.editTotalsItem, {
    id: group.id,
    name: group.name,
    count: count,
    weeklyTotal: weeklyTotal,
    badgeClass: badgeClass,
  });
}

/**
 * Render a summary cards container
 * @param {Array} cards - Array of rendered card HTML strings
 * @returns {string} - Rendered HTML
 */
export function renderSummaryCardsContainer(cards) {
  return renderTemplate(templates.summaryCardsContainer, {
    cards: cards.join(""),
  });
}

/**
 * Update badge color on an existing element
 * @param {HTMLElement} badge - The badge element
 * @param {Object} group - The food group object
 * @param {number} count - The current count
 * @param {Object} state - The current state (for weekly calculations)
 */
export function updateBadgeColor(badge, group, count, state = null) {
  badge.classList.remove(
    "badge-primary",
    "badge-secondary",
    "badge-warning",
    "badge-danger"
  );
  badge.classList.add(getBadgeClass(group, count, state));
}

/**
 * Format a date for display
 * @param {string} dateStr - The date string (YYYY-MM-DD)
 * @param {string} format - The format type ('short', 'modal', 'title')
 * @returns {string} - Formatted date string
 */
export function formatDate(dateStr, format = "short") {
  try {
    const date = new Date(dateStr + "T00:00:00");

    switch (format) {
      case "short":
        return `${date.toLocaleDateString(undefined, {
          weekday: "short",
        })}, ${date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}`;
      case "modal":
        return date.toLocaleDateString(undefined, {
          weekday: "short",
          month: "numeric",
          day: "numeric",
        });
      case "title":
        return date.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      default:
        return date.toLocaleDateString();
    }
  } catch (e) {
    console.error("Error formatting date:", dateStr, e);
    return "Invalid Date";
  }
}
