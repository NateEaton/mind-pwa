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

// cloudProviders/googleDriveProvider.js

import logger from "../core/logger.js";
import { CONFIG } from "../config.js";

class GoogleDriveProvider {
  constructor() {
    this.providerName = "GoogleDriveProvider";
    this.GOOGLE_CLIENT_ID = null;
    this.GOOGLE_API_KEY = null;
    this.SCOPES =
      "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email";
    this.DISCOVERY_DOCS = [
      "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
    ];
    this.gapi = null;
    this.tokenClient = null;
    this.currentUser = null;
    this.configLoaded = false;
  }

  async initialize() {
    try {
      this.GOOGLE_CLIENT_ID = CONFIG.GOOGLE_CLIENT_ID;
      this.GOOGLE_API_KEY = CONFIG.GOOGLE_API_KEY;

      // If config didn't load properly, don't proceed
      if (!this.GOOGLE_CLIENT_ID || !this.GOOGLE_API_KEY) {
        logger.warn("Google Drive API keys not available");
        return false;
      } else {
        this.configLoaded = true;
      }

      // Load the Google API client library
      return new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://apis.google.com/js/api.js";

        script.onload = () => {
          window.gapi.load(
            "client",
            async () => {
              try {
                await window.gapi.client.init({
                  apiKey: this.GOOGLE_API_KEY,
                  discoveryDocs: this.DISCOVERY_DOCS,
                  scope: this.SCOPES,
                });
                this.gapi = window.gapi;

                // Also load Google Identity Services
                const gisScript = document.createElement("script");
                gisScript.src = "https://accounts.google.com/gsi/client";
                gisScript.onload = () => {
                  this.tokenClient =
                    window.google.accounts.oauth2.initTokenClient({
                      client_id: this.GOOGLE_CLIENT_ID,
                      scope: this.SCOPES,
                      callback: "", // Will be set later
                    });
                  resolve(true);
                };
                gisScript.onerror = (err) => {
                  logger.error("Failed to load Google Identity Services:", err);
                  reject(new Error("Failed to load Google Identity Services"));
                };
                document.body.appendChild(gisScript);
              } catch (error) {
                logger.error("Failed to initialize GAPI client:", error);
                reject(error);
              }
            },
            (error) => {
              logger.error("Failed to load GAPI client:", error);
              reject(new Error("Failed to load GAPI client"));
            }
          );
        };

        script.onerror = (err) => {
          logger.error("Failed to load Google API:", err);
          reject(new Error("Failed to load Google API"));
        };
        document.body.appendChild(script);
      });
    } catch (error) {
      logger.error("Error in initialization sequence:", error);
      throw error; // Re-throw to allow calling code to handle
    }
  }

  async checkAuth() {
    try {
      logger.info("Checking Google authentication");
      const cachedTokenStr = localStorage.getItem("google_drive_token");
      const loginHint = localStorage.getItem("google_drive_login_hint");

      if (cachedTokenStr) {
        try {
          const cachedToken = JSON.parse(cachedTokenStr);
          logger.info("Found cached token, setting in gapi");
          logger.debug("[auth] Login hint available for refresh:", !!loginHint);

          // Set the token in gapi
          this.gapi.client.setToken(cachedToken);

          // Test if token works with a lightweight call
          try {
            // Using about.get is more efficient than listing files for a simple auth check.
            await this.gapi.client.drive.about.get({ fields: "user" });
            logger.info("Token from localStorage is valid!");
            return true;
          } catch (e) {
            // Only try to refresh on a 401 Unauthorized error.
            if (e.status === 401) {
              logger.warn(
                "Cached token not valid (401), attempting to refresh",
                e
              );
              // Try to silently refresh the token.
              return await this.refreshToken();
            }
            // For other errors (network, etc.), don't proceed.
            logger.error("Error validating token (not a 401 error):", e);
            return false;
          }
        } catch (e) {
          logger.error("Error parsing or validating cached token:", e);
          localStorage.removeItem("google_drive_token");
        }
      }

      // No token in storage.
      return false;
    } catch (error) {
      logger.warn("Not authenticated with Google Drive:", error);
      return false;
    }
  }

  async authenticate() {
    logger.info("Starting Google authentication");
    return new Promise((resolve) => {
      this.tokenClient.callback = async (resp) => {
        logger.debug("Auth callback received", resp);
        if (resp.error) {
          logger.error("Error authenticating with Google:", resp);
          // Signal that sync is not ready
          if (window.setSyncReady) window.setSyncReady(false);
          resolve(false);
          return;
        }

        // Get the actual token from gapi
        try {
          const token = this.gapi.client.getToken();
          if (token) {
            logger.debug("Got valid token, saving to localStorage");
            localStorage.setItem("google_drive_token", JSON.stringify(token));

            // Store login hint for future silent refresh
            try {
              const userInfo = await this.getUserInfo();
              if (userInfo?.email) {
                localStorage.setItem("google_drive_login_hint", userInfo.email);
                logger.info(
                  "[auth] Stored login hint for future silent refresh:",
                  userInfo.email
                );
              }
            } catch (hintError) {
              logger.warn("[auth] Failed to store login hint:", hintError);
              // Continue anyway - this is not critical for authentication
            }
          }
        } catch (e) {
          logger.error("Error saving token:", e);
        }

        // Signal that sync is ready
        if (window.setSyncReady) window.setSyncReady(true);

        logger.info("Authentication successful");
        resolve(true);
      };
      this.tokenClient.requestAccessToken({ prompt: "consent" });
    });
  }

  /**
   * Enhanced token refresh with login hint and fallback strategy
   * @returns {Promise<boolean>} True if refresh successful, false otherwise
   */
  async performTokenRefreshWithHintFallback() {
    try {
      logger.info(
        "[refreshToken] Starting enhanced token refresh with hint fallback"
      );

      // Get stored login hint
      const loginHint = localStorage.getItem("google_drive_login_hint");
      logger.debug("[refreshToken] Login hint available:", !!loginHint);

      // Attempt silent refresh with login hint
      const silentSuccess = await this.attemptSilentRefresh(loginHint);
      if (silentSuccess) {
        logger.info("[refreshToken] Silent refresh successful");
        return true;
      }

      // Fallback to account picker if silent refresh failed
      logger.info(
        "[refreshToken] Silent refresh failed, attempting fallback with account picker"
      );
      const fallbackSuccess = await this.attemptFallbackRefresh();

      if (fallbackSuccess) {
        logger.info("[refreshToken] Fallback refresh successful");
        return true;
      }

      logger.error("[refreshToken] Both silent and fallback refresh failed");
      return false;
    } catch (error) {
      logger.error("[refreshToken] Error in enhanced token refresh:", error);
      return false;
    }
  }

  /**
   * Attempt silent token refresh using login hint
   * @param {string} loginHint - The user's email for login hint
   * @returns {Promise<boolean>} True if successful, false otherwise
   */
  async attemptSilentRefresh(loginHint) {
    return new Promise((resolve) => {
      this.tokenClient.callback = async (resp) => {
        if (resp.error) {
          logger.debug("[refreshToken] Silent refresh failed:", resp.error);
          // Clear login hint if silent refresh fails - it may be invalid
          if (loginHint) {
            localStorage.removeItem("google_drive_login_hint");
            logger.debug("[refreshToken] Cleared invalid login hint");
          }
          resolve(false);
          return;
        }

        logger.info(
          "[refreshToken] Silent refresh successful, applying and saving new token"
        );

        // Update the gapi client with the new token
        this.gapi.client.setToken(resp);

        // Save the new token
        localStorage.setItem("google_drive_token", JSON.stringify(resp));

        resolve(true);
      };

      // Request silent refresh with login hint
      const requestParams = { prompt: "none" };
      if (loginHint) {
        requestParams.hint = loginHint;
      }

      logger.debug(
        "[refreshToken] Attempting silent refresh with params:",
        requestParams
      );
      this.tokenClient.requestAccessToken(requestParams);
    });
  }

  /**
   * Attempt fallback refresh with account picker
   * @returns {Promise<boolean>} True if successful, false otherwise
   */
  async attemptFallbackRefresh() {
    return new Promise((resolve) => {
      this.tokenClient.callback = async (resp) => {
        if (resp.error) {
          logger.error("[refreshToken] Fallback refresh failed:", resp.error);
          // On failure, remove all stored auth data to prevent retries
          this.clearStoredAuth();
          resolve(false);
          return;
        }

        logger.info(
          "[refreshToken] Fallback refresh successful, applying and saving new token"
        );

        // Update the gapi client with the new token
        this.gapi.client.setToken(resp);

        // Save the new token
        localStorage.setItem("google_drive_token", JSON.stringify(resp));

        // Update login hint if we got user info
        try {
          const userInfo = await this.getUserInfo();
          if (userInfo?.email) {
            localStorage.setItem("google_drive_login_hint", userInfo.email);
            logger.info(
              "[refreshToken] Updated login hint from fallback:",
              userInfo.email
            );
          }
        } catch (hintError) {
          logger.warn(
            "[refreshToken] Failed to update login hint from fallback:",
            hintError
          );
        }

        resolve(true);
      };

      logger.debug(
        "[refreshToken] Attempting fallback refresh with account picker"
      );
      this.tokenClient.requestAccessToken({ prompt: "select_account" });
    });
  }

  // Add a new method to GoogleDriveProvider for token refresh
  async refreshToken() {
    try {
      logger.info("Attempting enhanced token refresh with hint fallback");
      return await this.performTokenRefreshWithHintFallback();
    } catch (error) {
      logger.error("Error initiating enhanced token refresh flow:", error);
      return false;
    }
  }

  /**
   * Clear stored login hint and token
   */
  clearStoredAuth() {
    localStorage.removeItem("google_drive_token");
    localStorage.removeItem("google_drive_login_hint");
    logger.info("[auth] Cleared stored Google Drive authentication data");
  }

  /**
   * Handle 401 errors by attempting to refresh the token and retry the operation
   * @param {Function} operation - The operation to retry after token refresh
   * @returns {Promise} The result of the operation
   */
  async handleAuthError(operation) {
    try {
      logger.info("Handling 401 error, attempting token refresh");
      const refreshSuccess = await this.refreshToken();

      if (refreshSuccess) {
        logger.info("Token refreshed successfully, retrying operation");
        const result = await operation();
        logger.info("Operation retry successful after token refresh");
        return result;
      } else {
        logger.error("Token refresh failed, authentication required");
        // Clear stored auth data since refresh failed
        this.clearStoredAuth();
        throw new Error(
          "Authentication failed. Please reconnect your Google Drive account."
        );
      }
    } catch (error) {
      logger.error("Error in handleAuthError:", error);
      throw error;
    }
  }

  /**
   * Find or create a file in Google Drive with better error handling
   * @param {string} filename - The filename to find or create
   * @param {string} [mimeType="application/json"] - The MIME type for new files
   * @returns {Promise<Object>} File information object
   */
  async findOrCreateFile(filename, mimeType = "application/json") {
    const operation = async () => {
      try {
        // Search for the file in the app data folder
        logger.debug(
          `Searching for Google Drive file '${filename}' in appDataFolder...`
        );
        const response = await this.gapi.client.drive.files.list({
          spaces: "appDataFolder",
          fields: "files(id, name, modifiedTime, size)",
          q: `name='${filename}'`,
        });

        // Check if we got any results
        if (response.result.files && response.result.files.length > 0) {
          const file = response.result.files[0];
          logger.debug(
            `Found existing file: ${file.name} (ID: ${file.id}, Modified: ${
              file.modifiedTime
            }, Size: ${file.size || "unknown"} bytes)`
          );
          return file;
        }

        // If file not found, create it with an empty JSON object
        logger.info(`File '${filename}' not found, creating new file...`);
        const fileMetadata = {
          name: filename,
          parents: ["appDataFolder"],
          mimeType: mimeType,
        };

        try {
          const createResponse = await this.gapi.client.drive.files.create({
            resource: fileMetadata,
            fields: "id, name, modifiedTime, size",
          });

          const newFile = createResponse.result;
          logger.debug(`Created new file: ${newFile.name} (ID: ${newFile.id})`);

          // Upload empty JSON content to initialize the file
          try {
            await this.uploadFile(newFile.id, {});
            logger.info(
              `Initialized new file ${newFile.id} with empty content`
            );
          } catch (initError) {
            logger.warn(
              `Note: Initial content upload failed, but file was created: ${initError.message}`
            );
            // Continue anyway since the file exists
          }

          return newFile;
        } catch (createError) {
          // Handle specific creation errors
          if (createError.status === 403) {
            logger.error(
              "Permission error creating file - check app permissions"
            );
            throw new Error(
              "Google Drive permission denied. Check app permissions."
            );
          }

          if (createError.status === 401) {
            logger.error(
              "Authentication error creating file - token may be expired"
            );
            throw new Error(
              "Google Drive authentication failed. Please reconnect your account."
            );
          }

          throw createError;
        }
      } catch (error) {
        // Handle network errors
        if (
          error.name === "TypeError" &&
          error.message.includes("NetworkError")
        ) {
          logger.error("Network error:", error.message);
          throw new Error("Network error. Please check your connection.");
        }

        // Handle rate limiting
        if (error.status === 429) {
          logger.warn("Google Drive rate limit reached");
          throw new Error(
            "Google Drive rate limit reached. Please try again later."
          );
        }

        logger.error("Error finding/creating file:", error);
        throw error;
      }
    };

    try {
      return await operation();
    } catch (error) {
      if (error.status === 401) {
        return await this.handleAuthError(operation);
      }
      throw error;
    }
  }

  /**
   * Upload a file to Google Drive with better empty content handling
   * @param {string} fileId - The ID of the file to update
   * @param {Object} content - The content to upload
   * @returns {Promise<Object>} The upload result information
   */
  async uploadFile(fileId, content) {
    const operation = async () => {
      logger.info(`Uploading to Google Drive file ID: ${fileId}...`);

      // Handle empty content cases more gracefully
      if (!content) {
        logger.info(
          `No content provided for upload to ${fileId}, using empty object`
        );
        content = {}; // Use empty object instead of failing
      }

      // For empty objects, log but continue
      if (typeof content === "object" && Object.keys(content).length === 0) {
        logger.info(`Uploading empty object to ${fileId}`);
        // Continue with upload rather than throwing error
      }

      try {
        const contentStr = JSON.stringify(content);
        const accessToken = this.gapi.client.getToken().access_token;

        logger.debug(`Content size: ${contentStr.length} bytes`);

        // Upload the file, requesting valid fields in the response
        const response = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,version,headRevisionId,md5Checksum,modifiedTime`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
              "Content-Length": contentStr.length.toString(),
            },
            body: contentStr,
          }
        );

        // Handle errors
        if (!response.ok) {
          let errorText = "Unknown error";
          try {
            const errorData = await response.json();
            errorText = JSON.stringify(errorData);
          } catch (e) {
            errorText = await response.text();
          }

          // Check for specific error conditions
          if (response.status === 401) {
            logger.info(`Authentication error: Token may have expired`);
            throw new Error(
              `Google Drive authentication failed. Please reconnect your account.`
            );
          }

          if (response.status === 403) {
            logger.info(`Permission denied for file ${fileId}`);
            throw new Error(
              `Google Drive permission denied. Check app permissions.`
            );
          }

          if (response.status === 404) {
            logger.info(`File ${fileId} not found during upload`);
            throw new Error(`File not found. It may have been deleted.`);
          }

          if (response.status === 429) {
            logger.info(`Google Drive rate limit reached`);
            throw new Error(
              `Google Drive rate limit reached. Please try again later.`
            );
          }

          throw new Error(
            `Upload failed with status ${response.status}: ${errorText}`
          );
        }

        const result = await response.json();
        logger.info("Upload successful:", {
          id: result.id,
          name: result.name,
          version: result.version || "unknown",
        });

        // Return complete file info
        return {
          id: result.id,
          name: result.name,
          version: result.version,
          headRevisionId: result.headRevisionId,
          md5Checksum: result.md5Checksum,
          modifiedTime: result.modifiedTime,
        };
      } catch (error) {
        // Handle network errors
        if (error.name === "TypeError" && error.message.includes("fetch")) {
          logger.info("Network error during upload:", error.message);
          throw new Error(`Network error: Please check your connection.`);
        }

        logger.error("Upload failed:", error);
        throw error;
      }
    };

    try {
      return await operation();
    } catch (error) {
      if (
        error.status === 401 ||
        (error.message && error.message.includes("authentication failed"))
      ) {
        return await this.handleAuthError(operation);
      }
      throw error;
    }
  }

  /**
   * Download a file from Google Drive with better empty file handling
   * @param {string} fileId - The ID of the file to download
   * @returns {Promise<Object|null>} The file content or null if not found/empty
   */
  async downloadFile(fileId) {
    const operation = async () => {
      try {
        logger.info(`Downloading Google Drive file with ID: ${fileId}...`);

        // First, try to get the file metadata to check properties
        const metadataResponse = await this.gapi.client.drive.files.get({
          fileId: fileId,
          fields: "id,name,mimeType,size",
        });

        // Check if file is empty or very small based on metadata
        const fileMetadata = metadataResponse.result;
        logger.info("File metadata:", fileMetadata);

        if (fileMetadata.size === "0" || fileMetadata.size === 0) {
          logger.info(`File ${fileId} exists but is empty, returning null`);
          return null;
        }

        // Then download the content
        const response = await this.gapi.client.drive.files.get({
          fileId: fileId,
          alt: "media",
        });

        // Basic validation - no logger.error, just log
        if (!response || !response.body) {
          logger.info(
            `Empty API response for file ${fileId} - file may be empty or not accessible`
          );
          return null;
        }

        // Check for empty content but don't treat as error
        if (response.body === "{}" || response.body === "") {
          logger.info(`File ${fileId} contains empty object or string`);
          return {}; // Return empty object instead of null for empty JSON
        }

        // Process the response based on type
        let parsedContent;

        if (typeof response.body === "string") {
          // Handle string response
          if (response.body.trim() === "") {
            logger.info(`Downloaded empty string content from file ${fileId}`);
            return {};
          }

          try {
            // Try to parse as JSON
            parsedContent = JSON.parse(response.body);
            logger.info("Successfully parsed string response as JSON object");
          } catch (e) {
            logger.info("Response is not JSON, treating as plain text");
            parsedContent = response.body;
          }
        } else {
          // Handle object response
          parsedContent = response.body;
        }

        // Final validation of content - downgrade from error to info
        if (
          !parsedContent ||
          (typeof parsedContent === "object" &&
            Object.keys(parsedContent).length === 0)
        ) {
          logger.info(`File ${fileId} content is empty or invalid`);
          return {}; // Return empty object for consistency
        }

        // Successful download
        logger.info(`Successfully downloaded file ${fileId}`);
        return parsedContent;
      } catch (error) {
        if (error.status === 404) {
          logger.info(
            `File with ID ${fileId} not found - this is normal for first sync`
          );
          return null; // File not found, which is expected in some cases
        }

        // Only log as error for unexpected issues
        logger.error(`Error downloading file ${fileId}:`, error);
        throw error;
      }
    };

    try {
      return await operation();
    } catch (error) {
      if (error.status === 401) {
        return await this.handleAuthError(operation);
      }
      throw error;
    }
  }

  async getFileMetadata(fileId) {
    const operation = async () => {
      try {
        logger.info(`Getting metadata for Google Drive file: ${fileId}`);

        // Request specific fields we need, using valid fields from the API
        const response = await this.gapi.client.drive.files.get({
          fileId: fileId,
          fields:
            "id,name,version,headRevisionId,modifiedTime,size,mimeType,md5Checksum",
        });

        // Log the full response for debugging
        logger.info("Google Drive metadata response:", response.result);

        // Return essential metadata
        return {
          id: response.result.id,
          name: response.result.name,
          version: response.result.version,
          headRevisionId: response.result.headRevisionId,
          md5Checksum: response.result.md5Checksum,
          modifiedTime: response.result.modifiedTime,
          size: response.result.size || 0,
          mimeType: response.result.mimeType,
        };
      } catch (error) {
        if (error.status === 404) {
          logger.info(`File with ID ${fileId} not found`);
          return null;
        }

        logger.error(`Error getting metadata for file ${fileId}:`, error);
        throw error;
      }
    };

    try {
      return await operation();
    } catch (error) {
      if (error.status === 401) {
        return await this.handleAuthError(operation);
      }
      throw error;
    }
  }

  async clearAllAppDataFiles() {
    const operation = async () => {
      let deletedCount = 0;
      let pageToken = null;

      try {
        do {
          // Get files with pagination
          const listResponse = await this.gapi.client.drive.files.list({
            spaces: "appDataFolder",
            fields: "nextPageToken, files(id, name)",
            pageSize: 100, // Get up to 100 files per request
            pageToken: pageToken || undefined,
          });

          const files = listResponse.result.files || [];
          pageToken = listResponse.result.nextPageToken;

          if (files.length === 0 && deletedCount === 0) {
            logger.info("No files found to delete.");
            return 0;
          }

          // Delete each file
          for (const file of files) {
            try {
              logger.info(`Deleting file: ${file.name} (ID: ${file.id})`);
              await this.gapi.client.drive.files.delete({ fileId: file.id });
              deletedCount++;
            } catch (deleteError) {
              logger.error(`Error deleting file ${file.name}:`, deleteError);
              // Continue with other files
            }
          }
        } while (pageToken); // Continue if there are more pages

        logger.info(
          `Successfully deleted ${deletedCount} files from appDataFolder`
        );
        return deletedCount;
      } catch (error) {
        logger.error("Error clearing appDataFolder files:", error);
        throw error;
      }
    };

    try {
      return await operation();
    } catch (error) {
      if (error.status === 401) {
        return await this.handleAuthError(operation);
      }
      throw error;
    }
  }

  /**
   * Search for a file in Google Drive without creating it
   * @param {string} filename - The filename to search for
   * @returns {Promise<Object|null>} The file information or null if not found
   */
  async searchFile(filename) {
    const operation = async () => {
      try {
        logger.debug(
          `Searching for Google Drive file '${filename}' in appDataFolder...`
        );
        const response = await this.gapi.client.drive.files.list({
          spaces: "appDataFolder",
          fields: "files(id, name, modifiedTime, size)",
          q: `name='${filename}'`,
        });

        // Check if we got any results
        if (response.result.files && response.result.files.length > 0) {
          const file = response.result.files[0];
          logger.debug(
            `Found existing file: ${file.name} (ID: ${file.id}, Modified: ${file.modifiedTime})`
          );
          return file;
        }

        logger.info(`File '${filename}' not found in Google Drive`);
        return null;
      } catch (error) {
        logger.error("Error in Google Drive searchFile:", error);
        throw error;
      }
    };

    try {
      return await operation();
    } catch (error) {
      if (error.status === 401) {
        return await this.handleAuthError(operation);
      }
      throw error;
    }
  }

  /**
   * Get user information from Google Drive
   * @returns {Promise<Object|null>} User info object or null if failed
   */
  async getUserInfo() {
    try {
      if (!this.gapi?.client) {
        logger.warn("Google API client not available, cannot get user info");
        return null;
      }

      // Check if we have a valid token
      const token = this.gapi.client.getToken();
      if (!token) {
        logger.warn("No Google token available, cannot get user info");
        return null;
      }

      // Use the People API to get user information
      const response = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${token.access_token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const userInfo = await response.json();

      return {
        email: userInfo.email,
        name: userInfo.name || userInfo.email,
        id: userInfo.id,
        provider: "Google Drive",
      };
    } catch (error) {
      logger.error("Error getting Google user info:", error);
      return null;
    }
  }
}

export default GoogleDriveProvider;
