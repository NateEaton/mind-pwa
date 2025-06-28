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

// cloudProviders/dropboxProvider.js

import logger from "../core/logger.js";

class DropboxProvider {
  constructor() {
    this.providerName = "DropboxProvider";
    this.ACCESS_TOKEN = null;
    this.dbx = null; // The Dropbox SDK client instance
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      // Check if SDK is already loaded
      if (window.Dropbox) {
        logger.debug("Dropbox SDK already loaded.");
        return resolve(true);
      }

      const script = document.createElement("script");
      script.src = "https://unpkg.com/dropbox/dist/Dropbox-sdk.min.js";
      script.onload = () => {
        if (window.Dropbox) {
          logger.info("Dropbox SDK loaded successfully.");
          resolve(true);
        } else {
          logger.error(
            "Dropbox SDK script loaded but window.Dropbox is undefined."
          );
          reject(new Error("Dropbox SDK failed to initialize."));
        }
      };
      script.onerror = () => {
        logger.error("Failed to load Dropbox SDK script.");
        reject(new Error("Failed to load Dropbox SDK."));
      };
      document.body.appendChild(script);
    });
  }

  // Centralizes the creation of the dbx client.
  _initializeDbxClient() {
    if (this.ACCESS_TOKEN) {
      this.dbx = new window.Dropbox.Dropbox({ accessToken: this.ACCESS_TOKEN });
      logger.debug("Dropbox client initialized with new access token.");
    } else {
      this.dbx = null;
    }
  }

  async checkAuth() {
    this.ACCESS_TOKEN = localStorage.getItem("dropbox_access_token");
    if (!this.ACCESS_TOKEN) return false;

    // IMPORTANT: Ensure Dropbox SDK is loaded before trying to use it.
    if (!window.Dropbox) {
      await this.initialize();
    }

    this._initializeDbxClient();

    // Test the token
    try {
      await this.dbx.usersGetCurrentAccount();
      logger.info("Dropbox token from storage is valid.");
      return true;
    } catch (error) {
      if (error?.status === 401) {
        logger.warn(
          "Dropbox token is expired. Will attempt refresh on first API call."
        );
        // We can return true here and let handleAuthError deal with the refresh.
        // Or, to be more proactive:
        // return await this.refreshToken().catch(() => false);
        return false; // Let's keep it simple: if token fails, it's not authenticated.
      }
      return false;
    }
  }

  async authenticate() {
    logger.info("Redirecting to server for Dropbox authentication.");
    window.location.href = "/api/dropbox/auth";
    return new Promise(() => {}); // This will never resolve
  }

  async refreshToken() {
    const refreshToken = localStorage.getItem("dropbox_refresh_token");
    if (!refreshToken) {
      logger.error("No Dropbox refresh token available.");
      throw new Error("authentication_required");
    }

    try {
      logger.info("Refreshing Dropbox access token via server...");
      const response = await fetch("/api/dropbox/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        throw new Error("Token refresh failed on server.");
      }

      const { access_token } = await response.json();
      localStorage.setItem("dropbox_access_token", access_token);
      this.ACCESS_TOKEN = access_token;
      this._initializeDbxClient(); // Re-create the client with the new token
      logger.info("Dropbox token refreshed successfully.");
      return true;
    } catch (error) {
      logger.error("Dropbox token refresh failed:", error);
      this.clearStoredAuth();
      throw new Error("authentication_required");
    }
  }

  clearStoredAuth() {
    localStorage.removeItem("dropbox_access_token");
    localStorage.removeItem("dropbox_refresh_token");
    this.ACCESS_TOKEN = null;
    this.dbx = null;
    logger.info("Cleared stored Dropbox authentication data.");
  }

  /**
   * Handle 401 errors by attempting to refresh the token and retry the operation
   * @param {Function} operation - The operation to retry after token refresh
   * @returns {Promise} The result of the operation
   */
  async handleAuthError(operation) {
    try {
      logger.info("Handling Dropbox 401 error, attempting token refresh");
      const refreshSuccess = await this.refreshToken();

      if (refreshSuccess) {
        logger.info("Dropbox token refreshed successfully, retrying operation");
        // The operation was the original function that failed. Retry it.
        return await operation();
      } else {
        // This 'else' is important for clarity, though the catch block would also handle it.
        logger.error(
          "Dropbox token refresh failed, user must re-authenticate."
        );
        this.clearStoredAuth();
        throw new Error(
          "Authentication failed. Please reconnect your Dropbox account."
        );
      }
    } catch (error) {
      // This will catch errors from both refreshToken() and the retried operation().
      logger.error("Error during the auth handling process:", error);
      // Re-throw the error to ensure the calling function (e.g., syncData) knows that the entire process failed.
      throw error;
    }
  }

  /**
   * Find or create a file in Dropbox with better error handling
   * @param {string} filename - The filename to find or create
   * @returns {Promise<Object>} The file information
   */
  async findOrCreateFile(filename) {
    if (!this.dbx) this._initializeDbxClient();
    if (!this.dbx) {
      return Promise.reject(
        new Error("Dropbox client not initialized. Cannot perform operation.")
      );
    }

    const operation = async () => {
      try {
        logger.debug(`Searching for Dropbox file '${filename}'...`);
        // Try to get file metadata
        const path = `/${filename}`;
        try {
          const response = await this.dbx.filesGetMetadata({ path });
          logger.debug(
            `Found existing file: ${response.result.name} (ID: ${response.result.id})`
          );
          return {
            id: response.result.id,
            name: response.result.name,
            modifiedTime: response.result.server_modified,
          };
        } catch (error) {
          // Check specifically for "not found" error from Dropbox API
          if (error.status === 409) {
            logger.warn(`File '${filename}' not found, creating new file...`);

            // Create parent folders first if needed
            if (filename.includes("/")) {
              try {
                const folderPath = path.substring(0, path.lastIndexOf("/"));
                if (folderPath) {
                  await this.dbx
                    .filesCreateFolderV2({
                      path: folderPath,
                      autorename: false,
                    })
                    .catch((e) =>
                      logger.info(`Parent folder creation result: ${e.message}`)
                    );
                }
              } catch (folderError) {
                logger.info(
                  `Note: Folder creation attempted: ${folderError.message}`
                );
                // Continue anyway - folder might already exist
              }
            }

            // Now create the file with a direct path and overwrite mode
            try {
              const createResponse = await this.dbx.filesUpload({
                path,
                contents: JSON.stringify({}),
                mode: "overwrite", // Use overwrite instead of add for more reliability
                autorename: false,
              });

              logger.debug(
                `Created new file: ${createResponse.result.name} (ID: ${createResponse.result.id})`
              );
              return {
                id: createResponse.result.id,
                name: createResponse.result.name,
                modifiedTime: createResponse.result.server_modified,
              };
            } catch (createError) {
              // Add detail to the error to help debug
              logger.error(`Error creating file '${filename}':`, createError);
              throw new Error(
                `Failed to create Dropbox file '${filename}': ${createError.message}`
              );
            }
          } else {
            // Not a "not found" error, rethrow
            throw error;
          }
        }
      } catch (error) {
        logger.error("Error in Dropbox findOrCreateFile:", error);
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
   * Download a file from Dropbox with better empty file handling
   * @param {string} fileId - The path of the file to download
   * @returns {Promise<Object|null>} The file content or null if not found/empty
   */
  async downloadFile(fileId) {
    if (!this.dbx) this._initializeDbxClient();
    if (!this.dbx) {
      return Promise.reject(
        new Error("Dropbox client not initialized. Cannot perform operation.")
      );
    }

    const operation = async () => {
      try {
        logger.debug(`Downloading Dropbox file with ID: ${fileId}...`);

        // Use a try-catch specifically for the download
        try {
          const response = await this.dbx.filesDownload({ path: fileId });

          return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => {
              try {
                // Handle empty content special cases
                if (!reader.result || reader.result.trim() === "") {
                  logger.info(
                    `Empty content for ${fileId}, returning empty object`
                  );
                  resolve({});
                  return;
                }

                // Try to parse as JSON
                try {
                  const data = JSON.parse(reader.result);
                  logger.debug(
                    `Successfully downloaded and parsed file ${fileId}`
                  );
                  resolve(data);
                } catch (parseError) {
                  logger.warn(
                    `Content is not valid JSON: ${parseError.message}`
                  );
                  // Return empty object for invalid JSON
                  resolve({});
                }
              } catch (error) {
                logger.warn(`Error processing content: ${error.message}`);
                resolve({});
              }
            };

            reader.onerror = () => {
              logger.warn(`Error reading file ${fileId}`);
              resolve({});
            };

            reader.readAsText(response.result.fileBlob);
          });
        } catch (error) {
          // Specifically handle 409 errors from Dropbox for missing files
          if (error.status === 409) {
            logger.info(`File ${fileId} not found - returning empty object`);
            return {};
          }
          throw error;
        }
      } catch (error) {
        logger.error(`Unexpected error downloading Dropbox file:`, error);
        // Return empty object instead of null for consistency
        return {};
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
   * Upload a file to Dropbox with better empty content handling
   * @param {string} fileId - The path to upload to
   * @param {Object} content - The content to upload
   * @returns {Promise<Object>} The upload result information
   */
  async uploadFile(fileId, content) {
    if (!this.dbx) this._initializeDbxClient();
    if (!this.dbx) {
      return Promise.reject(
        new Error("Dropbox client not initialized. Cannot perform operation.")
      );
    }

    const operation = async () => {
      logger.info(`Uploading to Dropbox file ID: ${fileId}...`);

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
        logger.debug(`Content size: ${contentStr.length} bytes`);

        const response = await this.dbx.filesUpload({
          path: fileId,
          contents: contentStr,
          mode: "overwrite",
        });

        logger.info(`Upload successful: ${response.result.name}`);
        logger.info("Upload response rev:", response.result.rev);

        // Return complete result info with rev - no need to download again for verification
        return {
          id: response.result.id,
          name: response.result.name,
          rev: response.result.rev,
          modifiedTime: response.result.server_modified,
        };
      } catch (error) {
        // Check for recoverable errors
        if (
          error.status === 409 &&
          error.error?.error?.[".tag"] === "path_write_error"
        ) {
          logger.info(`Path conflict for ${fileId}, attempting to resolve...`);

          try {
            // Try to create parent folders if needed
            const pathParts = fileId.split("/");
            if (pathParts.length > 2) {
              const parentPath = pathParts.slice(0, -1).join("/");
              await this.dbx
                .filesCreateFolderV2({
                  path: parentPath,
                  autorename: false,
                })
                .catch((e) =>
                  logger.info(`Folder creation attempt result: ${e.message}`)
                );

              // Retry upload
              const retryResponse = await this.dbx.filesUpload({
                path: fileId,
                contents: JSON.stringify(content),
                mode: "overwrite",
              });

              logger.info(
                `Upload retry successful: ${retryResponse.result.name}`
              );
              return {
                id: retryResponse.result.id,
                name: retryResponse.result.name,
                rev: retryResponse.result.rev,
                modifiedTime: retryResponse.result.server_modified,
              };
            }
          } catch (retryError) {
            logger.warn(`Retry failed: ${retryError.message}`);
            // Fall through to main error handler
          }
        }

        logger.error(`Error uploading to file ${fileId}:`, error);
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
    if (!this.dbx) this._initializeDbxClient();
    if (!this.dbx) {
      return Promise.reject(
        new Error("Dropbox client not initialized. Cannot perform operation.")
      );
    }

    const operation = async () => {
      try {
        logger.info(`Getting metadata for Dropbox file: ${fileId}`);
        const response = await this.dbx.filesGetMetadata({ path: fileId });

        // Log the full response to debug
        logger.info("Dropbox metadata response:", response.result);

        // Return essential metadata including revision
        return {
          id: response.result.id,
          name: response.result.name,
          rev: response.result.rev, // Ensure this property exists in response
          modifiedTime: response.result.server_modified,
          size: response.result.size || 0,
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

  // Add this method to the DropboxProvider class
  async clearAllAppDataFiles() {
    if (!this.dbx) this._initializeDbxClient();
    if (!this.dbx) {
      return Promise.reject(
        new Error("Dropbox client not initialized. Cannot perform operation.")
      );
    }

    const operation = async () => {
      let deletedCount = 0;

      try {
        // List files in the app folder
        const listResponse = await this.dbx.filesListFolder({
          path: "", // Empty string refers to the app folder root
        });

        const files = listResponse.result.entries || [];

        if (files.length === 0) {
          logger.info("No Dropbox files found to delete.");
          return 0;
        }

        // Delete each file
        for (const file of files) {
          try {
            logger.info(
              `Deleting Dropbox file: ${file.name} (Path: ${file.path_display})`
            );
            await this.dbx.filesDelete({ path: file.path_lower });
            deletedCount++;
          } catch (deleteError) {
            logger.error(
              `Error deleting Dropbox file ${file.name}:`,
              deleteError
            );
            // Continue with other files
          }
        }

        logger.info(
          `Successfully deleted ${deletedCount} files from Dropbox app folder`
        );
        return deletedCount;
      } catch (error) {
        logger.error("Error clearing Dropbox app folder files:", error);
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
   * Search for a file in Dropbox without creating it
   * @param {string} filename - The filename to search for
   * @returns {Promise<Object|null>} The file information or null if not found
   */
  async searchFile(filename) {
    if (!this.dbx) this._initializeDbxClient();
    if (!this.dbx) {
      return Promise.reject(
        new Error("Dropbox client not initialized. Cannot perform operation.")
      );
    }

    const operation = async () => {
      try {
        logger.debug(`Searching for Dropbox file '${filename}'...`);
        const path = `/${filename}`;

        try {
          const response = await this.dbx.filesGetMetadata({ path });
          logger.debug(
            `Found existing file: ${response.result.name} (ID: ${response.result.id})`
          );
          return {
            id: response.result.id,
            name: response.result.name,
            modifiedTime: response.result.server_modified,
          };
        } catch (error) {
          // Check specifically for "not found" error from Dropbox API
          if (error.status === 409) {
            logger.info(`File '${filename}' not found in Dropbox`);
            return null;
          }
          throw error;
        }
      } catch (error) {
        logger.error("Error in Dropbox searchFile:", error);
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
   * Get user information from Dropbox
   * @returns {Promise<Object|null>} User info object or null if failed
   */
  async getUserInfo() {
    if (!this.dbx) this._initializeDbxClient();
    if (!this.dbx) {
      return Promise.reject(
        new Error("Dropbox client not initialized. Cannot perform operation.")
      );
    }

    const operation = async () => {
      try {
        if (!this.ACCESS_TOKEN || !this.dbx) {
          logger.warn("Not authenticated with Dropbox, cannot get user info");
          return null;
        }

        const response = await this.dbx.usersGetCurrentAccount();
        const userInfo = response.result;

        return {
          email: userInfo.email,
          name: userInfo.name?.display_name || userInfo.email,
          id: userInfo.account_id,
          provider: "Dropbox",
        };
      } catch (error) {
        logger.error("Error getting Dropbox user info:", error);
        return null;
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
}

export default DropboxProvider;
