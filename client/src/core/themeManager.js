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
 * Theme Manager - Handles application theming and appearance settings
 */

import dataService from "./dataService.js";
import logger from "./logger.js";

// Available themes
const THEMES = {
  LIGHT: "light",
  DARK: "dark",
  AUTO: "auto",
};

// Module state
let currentTheme = THEMES.AUTO; // Default to auto theme
let systemPrefersDark = false;
let mediaQuery = null;
let initialized = false;

/**
 * Initialize the theme manager
 */
async function initialize() {
  if (initialized) return;
  
  try {
    // Set up system preference detection FIRST
    setupSystemPreferenceDetection();
    
    // Load saved theme preference
    const savedTheme = await dataService.getPreference("theme", THEMES.AUTO);
    currentTheme = savedTheme;

    // Apply the theme
    await applyTheme(currentTheme);

    initialized = true;
    logger.info(`Theme manager initialized with theme: ${currentTheme}, system prefers dark: ${systemPrefersDark}`);
  } catch (error) {
    logger.error("Error initializing theme manager:", error);
    // Fall back to light theme
    await applyTheme(THEMES.LIGHT);
    initialized = true;
  }
}

/**
 * Set up detection for system dark mode preference
 */
function setupSystemPreferenceDetection() {
  // Check if the browser supports prefers-color-scheme
  if (window.matchMedia) {
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    systemPrefersDark = mediaQuery.matches;
    
    logger.info(`System dark mode preference detected: ${systemPrefersDark}`);

    // Listen for changes
    mediaQuery.addEventListener("change", (e) => {
      systemPrefersDark = e.matches;
      logger.info(`System dark mode preference changed: ${systemPrefersDark}`);
      
      if (currentTheme === THEMES.AUTO) {
        logger.info("Auto theme detected, applying theme change");
        applyTheme(THEMES.AUTO);
      }
    });
  } else {
    logger.warn("Browser does not support prefers-color-scheme detection");
  }
}

/**
 * Apply a theme to the application
 * @param {string} theme - The theme to apply
 */
async function applyTheme(theme) {
  try {
    let effectiveTheme = theme;

    // Handle auto theme
    if (theme === THEMES.AUTO) {
      effectiveTheme = systemPrefersDark ? THEMES.DARK : THEMES.LIGHT;
      logger.info(`Auto theme resolved: ${effectiveTheme} (system prefers dark: ${systemPrefersDark})`);
    }

    // Apply theme to document
    document.documentElement.setAttribute("data-theme", effectiveTheme);
    
    // CRITICAL: Set color-scheme property to override system preferences
    document.documentElement.style.colorScheme = effectiveTheme;
    
    // Force CSS recalculation
    document.documentElement.style.display = 'none';
    document.documentElement.offsetHeight; // Trigger reflow
    document.documentElement.style.display = '';

    // Update current theme
    currentTheme = theme;

    // Save preference
    await dataService.savePreference("theme", theme);

    logger.info(`Applied theme: ${theme} (effective: ${effectiveTheme})`);
    
    // Dispatch theme change event
    window.dispatchEvent(new CustomEvent('themeApplied', {
      detail: { theme, effectiveTheme }
    }));
  } catch (error) {
    logger.error("Error applying theme:", error);
  }
}

/**
 * Get the current theme
 * @returns {string} The current theme
 */
function getCurrentTheme() {
  return currentTheme;
}

/**
 * Get the effective theme (resolves auto to light/dark)
 * @returns {string} The effective theme
 */
function getEffectiveTheme() {
  if (currentTheme === THEMES.AUTO) {
    return systemPrefersDark ? THEMES.DARK : THEMES.LIGHT;
  }
  return currentTheme;
}

/**
 * Get available themes
 * @returns {Object} Available themes
 */
function getAvailableThemes() {
  return { ...THEMES };
}

/**
 * Check if system prefers dark mode
 * @returns {boolean} True if system prefers dark mode
 */
function getSystemPrefersDark() {
  return systemPrefersDark;
}

// =============================================================================
// PUBLIC API
// =============================================================================

export default {
  initialize,
  applyTheme,
  getCurrentTheme,
  getEffectiveTheme,
  getAvailableThemes,
  getSystemPrefersDark,
  get initialized() { return initialized; },
  THEMES,
};
