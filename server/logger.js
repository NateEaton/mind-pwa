/*
 * MIND Diet Tracker PWA - Server Logger
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

// Standard log levels with numeric values for comparison
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
};

// Default configuration
let config = {
  defaultLevel: LOG_LEVELS.INFO,
  enabled: true,
  moduleConfig: {},
  useColors: true,
  showTimestamp: true,
};

// Color coding for different log levels (ANSI colors for terminal)
const COLORS = {
  ERROR: "\x1b[31m", // Red
  WARN: "\x1b[33m", // Yellow
  INFO: "\x1b[36m", // Cyan
  DEBUG: "\x1b[32m", // Green
  TRACE: "\x1b[37m", // White
  RESET: "\x1b[0m", // Reset
};

class ServerLogger {
  constructor(moduleName = "server") {
    this.moduleName = moduleName;
  }

  getEffectiveLevel() {
    if (config.moduleConfig[this.moduleName] !== undefined) {
      return config.moduleConfig[this.moduleName];
    }
    return config.defaultLevel;
  }

  shouldLog(level) {
    if (!config.enabled) return false;
    return level <= this.getEffectiveLevel();
  }

  formatMessage(level, message, args) {
    let timestamp = "";
    if (config.showTimestamp) {
      timestamp = `[${new Date().toISOString()}] `;
    }

    const levelName = Object.keys(LOG_LEVELS)[level];
    return `${timestamp}[${this.moduleName}] [${levelName}] ${message}`;
  }

  log(level, message, ...args) {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, args);
    const levelName = Object.keys(LOG_LEVELS)[level];

    // Use appropriate console method based on level
    switch (level) {
      case LOG_LEVELS.ERROR:
        if (config.useColors) {
          console.error(
            `${COLORS.ERROR}${formattedMessage}${COLORS.RESET}`,
            ...args
          );
        } else {
          console.error(formattedMessage, ...args);
        }
        break;
      case LOG_LEVELS.WARN:
        if (config.useColors) {
          console.warn(
            `${COLORS.WARN}${formattedMessage}${COLORS.RESET}`,
            ...args
          );
        } else {
          console.warn(formattedMessage, ...args);
        }
        break;
      case LOG_LEVELS.INFO:
        if (config.useColors) {
          console.log(
            `${COLORS.INFO}${formattedMessage}${COLORS.RESET}`,
            ...args
          );
        } else {
          console.log(formattedMessage, ...args);
        }
        break;
      case LOG_LEVELS.DEBUG:
        if (config.useColors) {
          console.log(
            `${COLORS.DEBUG}${formattedMessage}${COLORS.RESET}`,
            ...args
          );
        } else {
          console.log(formattedMessage, ...args);
        }
        break;
      case LOG_LEVELS.TRACE:
        if (config.useColors) {
          console.log(
            `${COLORS.TRACE}${formattedMessage}${COLORS.RESET}`,
            ...args
          );
        } else {
          console.log(formattedMessage, ...args);
        }
        break;
      default:
        console.log(formattedMessage, ...args);
    }
  }

  // Convenience methods
  error(message, ...args) {
    this.log(LOG_LEVELS.ERROR, message, ...args);
  }
  warn(message, ...args) {
    this.log(LOG_LEVELS.WARN, message, ...args);
  }
  info(message, ...args) {
    this.log(LOG_LEVELS.INFO, message, ...args);
  }
  debug(message, ...args) {
    this.log(LOG_LEVELS.DEBUG, message, ...args);
  }
  trace(message, ...args) {
    this.log(LOG_LEVELS.TRACE, message, ...args);
  }
}

// Factory function
function createLogger(moduleName) {
  return new ServerLogger(moduleName);
}

// Configure global or module-specific log levels
function configure(options) {
  if (options.defaultLevel !== undefined) {
    config.defaultLevel = options.defaultLevel;
  }
  if (options.enabled !== undefined) {
    config.enabled = options.enabled;
  }
  if (options.moduleConfig) {
    Object.assign(config.moduleConfig, options.moduleConfig);
  }
  if (options.useColors !== undefined) {
    config.useColors = options.useColors;
  }
  if (options.showTimestamp !== undefined) {
    config.showTimestamp = options.showTimestamp;
  }
}

// Create default logger
const defaultLogger = new ServerLogger();

export { LOG_LEVELS, createLogger, configure, defaultLogger as logger };
export default defaultLogger;
