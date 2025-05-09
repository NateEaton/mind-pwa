// cloudProviders/dropboxProvider.js
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
      console.log("Dropbox config loaded successfully");
    } catch (configError) {
      console.warn("Failed to load config.js:", configError);
      this.configLoaded = false;
      return false;
    }

    // If config didn't load properly, don't proceed
    if (!this.DROPBOX_APP_KEY) {
      console.warn("Dropbox API key not available");
      return false;
    }

    // Load the Dropbox SDK
    return new Promise((resolve, reject) => {
      try {
        console.log("Loading Dropbox SDK...");
        const script = document.createElement("script");
        script.src = "https://unpkg.com/dropbox/dist/Dropbox-sdk.min.js";
        script.onload = () => {
          try {
            console.log("Dropbox SDK loaded successfully");
            // Check if the SDK loaded correctly
            if (!window.Dropbox) {
              console.error(
                "Dropbox SDK loaded but window.Dropbox is undefined"
              );
              reject(new Error("Dropbox SDK failed to initialize properly"));
              return;
            }

            // Initialize with the app key
            this.dbx = new window.Dropbox.Dropbox({
              clientId: this.DROPBOX_APP_KEY,
            });
            console.log("Dropbox client initialized:", this.dbx);

            // Log available authentication methods for debugging
            console.log("Available auth methods:", {
              authGetAuthenticationUrl:
                typeof this.dbx.auth?.getAuthenticationUrl,
              getAuthenticationUrl: typeof this.dbx.getAuthenticationUrl,
            });

            resolve(true);
          } catch (error) {
            console.error("Error initializing Dropbox client:", error);
            reject(error);
          }
        };
        script.onerror = (error) => {
          console.error("Failed to load Dropbox SDK:", error);
          reject(new Error("Failed to load Dropbox SDK"));
        };
        document.body.appendChild(script);
      } catch (error) {
        console.error("Error during Dropbox SDK script creation:", error);
        reject(error);
      }
    });
  }

  // In checkAuth method of dropboxProvider.js
  async checkAuth() {
    try {
      console.log("Checking Dropbox authentication");

      // Check for stored token
      const storedToken = localStorage.getItem("dropbox_access_token");
      if (storedToken) {
        try {
          this.ACCESS_TOKEN = storedToken;
          this.dbx = new window.Dropbox.Dropbox({
            accessToken: this.ACCESS_TOKEN,
          });
          // Verify token is still valid
          await this.dbx.usersGetCurrentAccount();
          console.log("Dropbox token is valid");
          return true;
        } catch (error) {
          console.warn("Stored Dropbox token is invalid:", error);
          this.ACCESS_TOKEN = null;
          localStorage.removeItem("dropbox_access_token");
          return false;
        }
      }
      console.log("No stored Dropbox token found");
      return false;
    } catch (error) {
      console.warn("Error checking Dropbox auth:", error);
      return false;
    }
  }

  async authenticate() {
    console.log("Starting Dropbox authentication");

    // If we already have a token from redirect, use it
    const storedToken = localStorage.getItem("dropbox_access_token");
    if (storedToken) {
      try {
        this.ACCESS_TOKEN = storedToken;
        this.dbx = new window.Dropbox.Dropbox({ accessToken: storedToken });

        // Verify token is valid with a test call
        await this.dbx.usersGetCurrentAccount();

        console.log("Dropbox authentication successful with stored token");
        return true;
      } catch (error) {
        console.warn("Stored token is invalid, will request new one:", error);
        localStorage.removeItem("dropbox_access_token");
      }
    }

    console.log("Starting new Dropbox auth flow");
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

      console.log("Generated auth URL with state:", authUrl);
      window.location.href = authUrl;
      return false; // We're redirecting, so auth is not complete yet
    } catch (error) {
      console.error("Failed to start Dropbox auth flow:", error);

      // Try fallback method if the first approach failed
      try {
        console.log("Trying fallback authentication method");
        const authUrl = this.dbx.getAuthenticationUrl(this.REDIRECT_URI);
        window.location.href = authUrl;
        return false;
      } catch (fallbackError) {
        console.error("All authentication methods failed:", fallbackError);
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
      console.log(`Searching for Dropbox file '${filename}'...`);
      // Try to get file metadata
      const path = `/${filename}`;
      try {
        const response = await this.dbx.filesGetMetadata({ path });
        console.log(
          `Found existing file: ${response.result.name} (ID: ${response.result.id})`
        );
        return {
          id: response.result.id,
          name: response.result.name,
          modifiedTime: response.result.server_modified,
        };
      } catch (error) {
        // Check specifically for "not found" error
        if (
          error.status === 409 &&
          error.error?.error?.[".tag"] === "path_lookup"
        ) {
          console.log(`File '${filename}' not found, creating new file...`);

          // Create an empty file
          try {
            const createResponse = await this.dbx.filesUpload({
              path,
              contents: JSON.stringify({}),
              mode: "add",
              autorename: false,
            });

            console.log(
              `Created new file: ${createResponse.result.name} (ID: ${createResponse.result.id})`
            );
            return {
              id: createResponse.result.id,
              name: createResponse.result.name,
              modifiedTime: createResponse.result.server_modified,
            };
          } catch (createError) {
            // Handle creation errors specifically
            if (
              createError.status === 409 &&
              createError.error?.error?.[".tag"] === "path_write_error"
            ) {
              console.log(
                `Error creating file - path issue, attempting workaround...`
              );

              // Try with a different approach - first check if parent folders exist
              try {
                const pathParts = path.split("/");
                if (pathParts.length > 2) {
                  const parentPath = pathParts.slice(0, -1).join("/");
                  await this.dbx
                    .filesCreateFolderV2({
                      path: parentPath,
                      autorename: false,
                    })
                    .catch((e) =>
                      console.log(`Parent folder creation: ${e.message}`)
                    );
                }

                // Retry creation
                const retryResponse = await this.dbx.filesUpload({
                  path,
                  contents: JSON.stringify({}),
                  mode: "add",
                  autorename: false,
                });

                console.log(
                  `Created new file after retry: ${retryResponse.result.name}`
                );
                return {
                  id: retryResponse.result.id,
                  name: retryResponse.result.name,
                  modifiedTime: retryResponse.result.server_modified,
                };
              } catch (finalError) {
                console.warn(
                  `Final creation attempt failed: ${finalError.message}`
                );
                throw finalError;
              }
            } else {
              throw createError;
            }
          }
        } else {
          // Not a "not found" error, rethrow
          throw error;
        }
      }
    } catch (error) {
      // Last resort error handler
      console.error("Error finding/creating Dropbox file:", error);

      // For connection issues or auth problems, give helpful message
      if (error.status === 401 || error.name === "AuthError") {
        console.log("Authentication error - token may have expired");
        throw new Error(
          "Dropbox authentication failed. Please reconnect your account."
        );
      }

      // For rate limiting
      if (error.status === 429) {
        console.log("Dropbox rate limit reached - need to wait");
        throw new Error("Dropbox rate limit reached. Please try again later.");
      }

      // Default error handling
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
      console.log(`Downloading Dropbox file with ID: ${fileId}...`);

      // Try to get metadata first to check if file is empty
      try {
        const metadataResponse = await this.dbx.filesGetMetadata({
          path: fileId,
        });
        console.log(`File metadata:`, metadataResponse.result);

        // Check if file size indicates it's empty
        if (metadataResponse.result.size === 0) {
          console.log(
            `File ${fileId} exists but is empty (0 bytes), returning empty object`
          );
          return {};
        }
      } catch (metaError) {
        // If we can't get metadata, continue with download attempt
        // but don't treat as error - file might not exist yet
        if (metaError.status === 409) {
          console.log(
            `File ${fileId} not found during metadata check - this is normal for first sync`
          );
        } else {
          console.log(`Couldn't get file metadata: ${metaError.message}`);
        }
      }

      // Attempt to download the file
      const response = await this.dbx.filesDownload({ path: fileId });

      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          try {
            // Process the raw content
            if (!reader.result) {
              console.log(
                `No content received from Dropbox for file ${fileId}`
              );
              resolve({}); // Return empty object instead of null
              return;
            }

            // Check for empty string
            if (reader.result.trim() === "") {
              console.log(
                `Empty content received from Dropbox for file ${fileId}`
              );
              resolve({}); // Return empty object for consistency
              return;
            }

            // Try to parse as JSON
            try {
              const data = JSON.parse(reader.result);

              // Check if empty object
              if (Object.keys(data).length === 0) {
                console.log(`File ${fileId} contains empty JSON object`);
                resolve({}); // Return empty object consistently
                return;
              }

              console.log(
                `Successfully downloaded and parsed file ${fileId} (${reader.result.length} bytes)`
              );
              resolve(data);
            } catch (parseError) {
              console.log(`Content is not valid JSON: ${parseError.message}`);
              // If not JSON, return as-is
              resolve(reader.result);
            }
          } catch (error) {
            console.warn(
              `Error processing file content for ${fileId}: ${error.message}`
            );
            resolve({}); // Return empty object on processing error
          }
        };

        reader.onerror = () => {
          console.warn(`Error reading file ${fileId}`);
          resolve({}); // Return empty object on read error
        };

        reader.readAsText(response.result.fileBlob);
      });
    } catch (error) {
      // Handle specific error codes gracefully
      if (
        error.status === 404 ||
        (error.status === 409 && error.error?.error?.[".tag"] === "path_lookup")
      ) {
        console.log(`File ${fileId} not found - this is normal for first sync`);
        return null; // File not found
      }

      // Handle other request errors
      if (error.status) {
        console.log(`Error downloading file ${fileId}: Status ${error.status}`);
        return null;
      }

      // Only log unexpected errors as errors
      console.error(`Unexpected error downloading file ${fileId}:`, error);
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
    console.log(`Uploading to Dropbox file ID: ${fileId}...`);

    // Handle empty content cases more gracefully
    if (!content) {
      console.log(
        `No content provided for upload to ${fileId}, using empty object`
      );
      content = {}; // Use empty object instead of failing
    }

    // For empty objects, log but continue
    if (typeof content === "object" && Object.keys(content).length === 0) {
      console.log(`Uploading empty object to ${fileId}`);
      // Continue with upload rather than throwing error
    }

    try {
      const contentStr = JSON.stringify(content);
      console.log(`Content size: ${contentStr.length} bytes`);

      const response = await this.dbx.filesUpload({
        path: fileId,
        contents: contentStr,
        mode: "overwrite",
      });

      console.log(`Upload successful: ${response.result.name}`);
      console.log("Upload response rev:", response.result.rev);

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
        console.log(`Path conflict for ${fileId}, attempting to resolve...`);

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
                console.log(`Folder creation attempt result: ${e.message}`)
              );

            // Retry upload
            const retryResponse = await this.dbx.filesUpload({
              path: fileId,
              contents: JSON.stringify(content),
              mode: "overwrite",
            });

            console.log(
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
          console.warn(`Retry failed: ${retryError.message}`);
          // Fall through to main error handler
        }
      }

      console.error(`Error uploading to file ${fileId}:`, error);
      throw error;
    }
  }

  async getFileMetadata(fileId) {
    try {
      console.log(`Getting metadata for Dropbox file: ${fileId}`);
      const response = await this.dbx.filesGetMetadata({ path: fileId });

      // Log the full response to debug
      console.log("Dropbox metadata response:", response.result);

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
        console.log(`File with ID ${fileId} not found`);
        return null;
      }
      console.error(`Error getting metadata for file ${fileId}:`, error);
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
        console.log("No Dropbox files found to delete.");
        return 0;
      }

      // Delete each file
      for (const file of files) {
        try {
          console.log(
            `Deleting Dropbox file: ${file.name} (Path: ${file.path_display})`
          );
          await this.dbx.filesDelete({ path: file.path_lower });
          deletedCount++;
        } catch (deleteError) {
          console.error(
            `Error deleting Dropbox file ${file.name}:`,
            deleteError
          );
          // Continue with other files
        }
      }

      console.log(
        `Successfully deleted ${deletedCount} files from Dropbox app folder`
      );
      return deletedCount;
    } catch (error) {
      console.error("Error clearing Dropbox app folder files:", error);
      throw error;
    }
  }
}

export default DropboxProvider;
