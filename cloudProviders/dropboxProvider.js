// cloudProviders/dropboxProvider.js

import logger from "../logger.js";

class DropboxProvider {
  constructor() {
    this.DROPBOX_APP_KEY = null;
    this.ACCESS_TOKEN = null;
    this.REDIRECT_URI = window.location.origin;
    this.dbx = null;
    this.configLoaded = false;
  }

  async initialize() {
    // Dynamically load config
    try {
      const configModule = await import("../config.js");
      this.DROPBOX_APP_KEY = configModule.CONFIG.DROPBOX_APP_KEY;
      this.configLoaded = true;
      logger.info("Dropbox config loaded successfully");
    } catch (configError) {
      logger.warn("Failed to load config.js:", configError);
      this.configLoaded = false;
      return false;
    }

    // If config didn't load properly, don't proceed
    if (!this.DROPBOX_APP_KEY) {
      logger.warn("Dropbox API key not available");
      return false;
    }

    // Load the Dropbox SDK
    return new Promise((resolve, reject) => {
      try {
        logger.info("Loading Dropbox SDK...");
        const script = document.createElement("script");
        script.src = "https://unpkg.com/dropbox/dist/Dropbox-sdk.min.js";
        script.onload = () => {
          try {
            logger.info("Dropbox SDK loaded successfully");
            // Check if the SDK loaded correctly
            if (!window.Dropbox) {
              logger.error(
                "Dropbox SDK loaded but window.Dropbox is undefined"
              );
              reject(new Error("Dropbox SDK failed to initialize properly"));
              return;
            }

            // Initialize with the app key
            this.dbx = new window.Dropbox.Dropbox({
              clientId: this.DROPBOX_APP_KEY,
            });
            logger.info("Dropbox client initialized:", this.dbx);

            // Log available authentication methods for debugging
            logger.info("Available auth methods:", {
              authGetAuthenticationUrl:
                typeof this.dbx.auth?.getAuthenticationUrl,
              getAuthenticationUrl: typeof this.dbx.getAuthenticationUrl,
            });

            resolve(true);
          } catch (error) {
            logger.error("Error initializing Dropbox client:", error);
            reject(error);
          }
        };
        script.onerror = (error) => {
          logger.error("Failed to load Dropbox SDK:", error);
          reject(new Error("Failed to load Dropbox SDK"));
        };
        document.body.appendChild(script);
      } catch (error) {
        logger.error("Error during Dropbox SDK script creation:", error);
        reject(error);
      }
    });
  }

  // In checkAuth method of dropboxProvider.js
  async checkAuth() {
    try {
      logger.info("Checking Dropbox authentication");

      // Check for stored token
      const storedToken = localStorage.getItem("dropbox_access_token");
      if (storedToken) {
        try {
          this.ACCESS_TOKEN = storedToken;
          this.dbx = new window.Dropbox.Dropbox({
            accessToken: this.ACCESS_TOKEN,
          });

          // Store token creation time if not already stored
          const tokenCreationTime = localStorage.getItem(
            "dropbox_token_created_at"
          );
          if (!tokenCreationTime) {
            localStorage.setItem(
              "dropbox_token_created_at",
              Date.now().toString()
            );
          }

          // Check token age
          const tokenAge =
            Date.now() - parseInt(tokenCreationTime || Date.now(), 10);
          const TOKEN_MAX_AGE = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

          if (tokenAge > TOKEN_MAX_AGE) {
            logger.info("Dropbox token is old, forcing refresh");
            throw new Error("Token expired due to age");
          }

          // Verify token is still valid with API call
          await this.dbx.usersGetCurrentAccount();
          logger.info("Dropbox token is valid");
          return true;
        } catch (error) {
          logger.warn("Stored Dropbox token is invalid or expired:", error);
          this.ACCESS_TOKEN = null;
          localStorage.removeItem("dropbox_access_token");
          localStorage.removeItem("dropbox_token_created_at");
          return false;
        }
      }
      logger.info("No stored Dropbox token found");
      return false;
    } catch (error) {
      logger.warn("Error checking Dropbox auth:", error);
      return false;
    }
  }

  async authenticate() {
    logger.info("Starting Dropbox authentication");

    // If we already have a token from redirect, use it
    const storedToken = localStorage.getItem("dropbox_access_token");
    if (storedToken) {
      try {
        this.ACCESS_TOKEN = storedToken;
        this.dbx = new window.Dropbox.Dropbox({ accessToken: storedToken });

        // Store token creation time if not already stored
        if (!localStorage.getItem("dropbox_token_created_at")) {
          localStorage.setItem(
            "dropbox_token_created_at",
            Date.now().toString()
          );
        }

        // Verify token is valid with a test call
        await this.dbx.usersGetCurrentAccount();

        logger.info("Dropbox authentication successful with stored token");
        return true;
      } catch (error) {
        logger.warn("Stored token is invalid, will request new one:", error);
        localStorage.removeItem("dropbox_access_token");
        localStorage.removeItem("dropbox_token_created_at");
      }
    }

    logger.info("Starting new Dropbox auth flow");
    try {
      // Create state parameter to encode the current UI state
      const stateParam = btoa(
        JSON.stringify({
          context: "settings_dialog",
          timestamp: Date.now(),
        })
      );

      // Generate auth URL with state parameter
      const authUrl = await this.dbx.auth.getAuthenticationUrl(
        this.REDIRECT_URI,
        stateParam, // Pass the state parameter
        "token"
      );

      // Make sure we have a string URL, not a Promise
      if (typeof authUrl !== "string") {
        throw new Error("Invalid authorization URL: " + authUrl);
      }

      logger.debug("Generated auth URL with state:", authUrl);
      window.location.href = authUrl;
      return false; // We're redirecting, so auth is not complete yet
    } catch (error) {
      logger.error("Failed to start Dropbox auth flow:", error);

      // Try fallback method if the first approach failed
      try {
        logger.warn("Trying fallback authentication method");
        const authUrl = this.dbx.getAuthenticationUrl(this.REDIRECT_URI);
        window.location.href = authUrl;
        return false;
      } catch (fallbackError) {
        logger.error("All authentication methods failed:", fallbackError);
        throw new Error(
          "Failed to start Dropbox authentication: " + error.message
        );
      }
    }
  }

  /**
   * Find or create a file in Dropbox with better error handling
   * @param {string} filename - The filename to find or create
   * @returns {Promise<Object>} The file information
   */
  async findOrCreateFile(filename) {
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
  }

  /**
   * Download a file from Dropbox with better empty file handling
   * @param {string} fileId - The path of the file to download
   * @returns {Promise<Object|null>} The file content or null if not found/empty
   */
  async downloadFile(fileId) {
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
                logger.warn(`Content is not valid JSON: ${parseError.message}`);
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
  }

  /**
   * Upload a file to Dropbox with better empty content handling
   * @param {string} fileId - The path to upload to
   * @param {Object} content - The content to upload
   * @returns {Promise<Object>} The upload result information
   */
  async uploadFile(fileId, content) {
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
  }

  async getFileMetadata(fileId) {
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
  }

  // Add this method to the DropboxProvider class
  async clearAllAppDataFiles() {
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
  }

  /**
   * Search for a file in Dropbox without creating it
   * @param {string} filename - The filename to search for
   * @returns {Promise<Object|null>} The file information or null if not found
   */
  async searchFile(filename) {
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
  }
}

export default DropboxProvider;
