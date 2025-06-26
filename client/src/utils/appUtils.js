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

import logger from "../core/logger.js";

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
      logger.error("Vibration API error:", error);
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
      logger.info("Service Worker registered with scope:", registration.scope);
      return registration;
    } catch (error) {
      logger.error("Service Worker registration failed:", error);
      return null;
    }
  } else {
    logger.info("Service Workers not supported in this browser");
    return null;
  }
}

// Date functions moved to dateUtils.js

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

// isValidDateString moved to dateUtils.js

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
    const response = await fetch("/version.json?t=" + Date.now());
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const versionData = await response.json();

    // Update element if provided
    if (versionElement) {
      versionElement.textContent = `(v${versionData.commitHash})`;
    }

    logger.info("App Version Info:", versionData);
    return versionData;
  } catch (error) {
    logger.error("Failed to load version info:", error);

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
  debounce,
  getDeviceInfo,
  addTestModeBanner,
  removeTestModeBanner,
  loadAppVersion,
};
