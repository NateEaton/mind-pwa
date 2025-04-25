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

  // Update findOrCreateFile method
  async findOrCreateFile(filename) {
    try {
      console.log(`Searching for Dropbox file '${filename}' in Dropbox...`);
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
        // File doesn't exist, create it
        if (error.status === 409) {
          console.log(`File '${filename}' not found, creating new file...`);
          // Create an empty file
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
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error("Error finding/creating Dropbox file:", error);
      throw error;
    }
  }

  // Update downloadFile method
  async downloadFile(fileId) {
    try {
      console.log(`Downloading Dropbox file with ID: ${fileId}...`);
      const response = await this.dbx.filesDownload({ path: fileId });

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            // Process the raw content
            if (!reader.result || reader.result.trim() === "") {
              console.log("Received empty content from Dropbox");
              resolve(null);
              return;
            }

            const data = JSON.parse(reader.result);
            console.log(
              `Downloaded file content (${reader.result.length} bytes)`
            );
            resolve(data);
          } catch (error) {
            console.error("Error parsing file content:", error);
            reject(new Error("Error parsing file content"));
          }
        };
        reader.onerror = () => {
          console.error("Error reading file");
          reject(new Error("Error reading file"));
        };
        reader.readAsText(response.result.fileBlob);
      });
    } catch (error) {
      if (error.status === 404) {
        console.log(`File with ID ${fileId} not found`);
        return null; // File not found
      }
      console.error(`Error downloading file ${fileId}:`, error);
      throw error;
    }
  }

  // Update uploadFile method
  // In dropboxProvider.js - update the uploadFile method
  // In dropboxProvider.js
  async uploadFile(fileId, content) {
    console.log(`Uploading to Dropbox file ID: ${fileId}...`);

    if (
      !content ||
      (typeof content === "object" && Object.keys(content).length === 0)
    ) {
      console.error("Cannot upload empty content:", content);
      throw new Error("Cannot upload empty or null content");
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
}

export default DropboxProvider;
