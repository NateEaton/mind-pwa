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

/*
 * Logger module - Provides configurable logging functionality
 */

// Standard log levels with numeric values for comparison
let LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
};

// Default configuration
let config = {
  defaultLevel: LOG_LEVELS.INFO, // Default level for all loggers
  enabled: true, // Master switch to enable/disable all logging
  moduleConfig: {}, // Module-specific configurations
  useColors: true, // Use colors in console output
  showTimestamp: true, // Include timestamps in log messages
  logToStorage: false, // Option to store logs in localStorage
  maxStoredLogs: 1000, // Maximum number of logs to store
};

// Color coding for different log levels
let COLORS = {
  ERROR: "color: #FF5252; font-weight: bold",
  WARN: "color: #FFC107; font-weight: bold",
  INFO: "color: #00B0FF",
  DEBUG: "color: #4CAF50",
  TRACE: "color: #9E9E9E",
};

// Class for creating loggers
class Logger {
  constructor(moduleName = "app") {
    this.moduleName = moduleName;
    this.storedLogs = [];
  }

  // Get the effective log level for this module
  getEffectiveLevel() {
    // Check module-specific config first
    if (config.moduleConfig[this.moduleName] !== undefined) {
      return config.moduleConfig[this.moduleName];
    }
    // Fall back to default level
    return config.defaultLevel;
  }

  // Check if a given log level should be logged
  shouldLog(level) {
    if (!config.enabled) return false;
    return level <= this.getEffectiveLevel();
  }

  // Format a log message
  formatMessage(level, message, args) {
    let timestamp = "";
    if (config.showTimestamp) {
      timestamp = `[${new Date().toISOString()}] `;
    }

    return `${timestamp}[${this.moduleName}] [${
      Object.keys(LOG_LEVELS)[level]
    }] ${message}`;
  }

  // Store log in internal buffer and localStorage if configured
  storeLog(level, message) {
    if (!config.logToStorage) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: Object.keys(LOG_LEVELS)[level],
      module: this.moduleName,
      message: message,
    };

    this.storedLogs.push(logEntry);

    // Trim if exceeding max size
    if (this.storedLogs.length > config.maxStoredLogs) {
      this.storedLogs.shift();
    }

    // Optionally store in localStorage
    try {
      localStorage.setItem(
        "appLogs",
        JSON.stringify(this.storedLogs.slice(-100))
      );
    } catch (e) {
      // Silently fail if localStorage isn't available
    }
  }

  // Main log method that handles all logging
  log(level, message, ...args) {
    // Support both log(message) and log(level, message) formats
    if (typeof level === "string" && arguments.length === 1) {
      args = [];
      message = level;
      level = LOG_LEVELS.INFO;
    } else if (typeof level === "string" && typeof message !== "string") {
      args = [message, ...args];
      message = level;
      level = LOG_LEVELS.INFO;
    }

    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(level, message, args);
    this.storeLog(level, formattedMessage);

    // Use appropriate console method based on level
    switch (level) {
      case LOG_LEVELS.ERROR:
        console.error(formattedMessage, ...args);
        break;
      case LOG_LEVELS.WARN:
        console.warn(formattedMessage, ...args);
        break;
      case LOG_LEVELS.INFO:
        if (config.useColors) {
          console.log(`%c${formattedMessage}`, COLORS.INFO, ...args);
        } else {
          console.log(formattedMessage, ...args);
        }
        break;
      case LOG_LEVELS.DEBUG:
        if (config.useColors) {
          console.log(`%c${formattedMessage}`, COLORS.DEBUG, ...args);
        } else {
          console.log(formattedMessage, ...args);
        }
        break;
      case LOG_LEVELS.TRACE:
        if (config.useColors) {
          console.log(`%c${formattedMessage}`, COLORS.TRACE, ...args);
        } else {
          console.log(formattedMessage, ...args);
        }
        break;
      default:
        console.log(formattedMessage, ...args);
    }
  }

  // Convenience methods for different log levels
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

  // For direct replacement of console.log
  // This provides backward compatibility
  console(message, ...args) {
    this.log(LOG_LEVELS.INFO, message, ...args);
  }
}

// Create a default logger instance
const defaultLogger = new Logger();

// Factory function to create module-specific loggers
function createLogger(moduleName) {
  return new Logger(moduleName);
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

  if (options.logToStorage !== undefined) {
    config.logToStorage = options.logToStorage;
  }

  // Log the updated configuration
  defaultLogger.debug("Logger configuration updated", config);
}

// Export the module
export { LOG_LEVELS, createLogger, configure, defaultLogger as logger };

// Export convenience methods on the default export for easy access
export default {
  ...LOG_LEVELS,
  createLogger,
  configure,
  log: defaultLogger.log.bind(defaultLogger),
  error: defaultLogger.error.bind(defaultLogger),
  warn: defaultLogger.warn.bind(defaultLogger),
  info: defaultLogger.info.bind(defaultLogger),
  debug: defaultLogger.debug.bind(defaultLogger),
  trace: defaultLogger.trace.bind(defaultLogger),
  console: defaultLogger.console.bind(defaultLogger),
};
