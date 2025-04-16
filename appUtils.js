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
 * AppUtils - Common utility functions for the application
 */

/**
 * Trigger haptic feedback for device vibration
 * @param {number} duration - Duration of vibration in milliseconds
 * @returns {boolean} True if vibration was triggered
 */
function triggerHapticFeedback(duration = 50) {
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate(duration);
      return true;
    } catch (error) {
      console.error("Vibration API error:", error);
      return false;
    }
  }
  return false;
}

/**
 * Register the service worker for the application
 * @returns {Promise<ServiceWorkerRegistration|null>} Promise resolving to the registration or null if failed
 */
async function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.register(
        "serviceWorker.js"
      );
      console.log("Service Worker registered with scope:", registration.scope);
      return registration;
    } catch (error) {
      console.error("Service Worker registration failed:", error);
      return null;
    }
  } else {
    console.log("Service Workers not supported in this browser");
    return null;
  }
}

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
    console.error("Error formatting date:", error);
    return date.toLocaleDateString();
  }
}

/**
 * Debounce a function to limit how often it can be called
 * @param {Function} func - The function to debounce
 * @param {number} delay - The debounce delay in milliseconds
 * @returns {Function} The debounced function
 */
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

/**
 * Get the device and environment information
 * @returns {Object} Object with device and environment information
 */
function getDeviceInfo() {
  const info = {
    userAgent: navigator.userAgent,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    pixelRatio: window.devicePixelRatio || 1,
    language: navigator.language,
    platform: navigator.platform,
    memoryInfo: navigator.deviceMemory
      ? `${navigator.deviceMemory}GB`
      : "unknown",
    online: navigator.onLine,
  };

  // Add progressive web app information if available
  if (window.matchMedia) {
    info.prefersDarkMode = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    info.prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    info.isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  }

  return info;
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
 * Add a test mode banner to the application
 * @param {string} message - The message to display in the banner
 * @returns {HTMLElement} The created banner element
 */
function addTestModeBanner(message) {
  // Remove any existing banner first
  removeTestModeBanner();

  // Create a new banner
  const banner = document.createElement("div");
  banner.id = "test-mode-banner";
  banner.textContent = message;
  banner.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: #ffcc00;
    color: #000;
    text-align: center;
    padding: 5px;
    font-weight: bold;
    z-index: 1000;
  `;

  document.body.appendChild(banner);
  return banner;
}

/**
 * Remove the test mode banner if it exists
 */
function removeTestModeBanner() {
  const banner = document.getElementById("test-mode-banner");
  if (banner) {
    banner.remove();
  }
}

/**
 * Load the application version from version.json
 * @param {HTMLElement} versionElement - Optional element to update with version info
 * @returns {Promise<Object|null>} Promise resolving to version data or null if failed
 */
async function loadAppVersion(versionElement = null) {
  try {
    const response = await fetch("version.json?t=" + Date.now());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const versionData = await response.json();

    // Update element if provided
    if (versionElement) {
      versionElement.textContent = `(v${versionData.commitHash})`;
    }

    console.log("App Version Info:", versionData);
    return versionData;
  } catch (error) {
    console.error("Failed to load version info:", error);

    // Update element with fallback if provided
    if (versionElement) {
      versionElement.textContent = "(v?.?.?)";
    }

    return null;
  }
}

// Export public API
export default {
  triggerHapticFeedback,
  registerServiceWorker,
  formatDate,
  debounce,
  getDeviceInfo,
  isValidDateString,
  addTestModeBanner,
  removeTestModeBanner,
  loadAppVersion,
};
