// cloudProviders/googleDriveProvider.js
class GoogleDriveProvider {
  constructor() {
    this.GOOGLE_CLIENT_ID = null;
    this.GOOGLE_API_KEY = null;
    this.SCOPES = "https://www.googleapis.com/auth/drive.appdata";
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
      // Dynamically load config
      try {
        const configModule = await import("../config.js");
        this.GOOGLE_CLIENT_ID = configModule.CONFIG.GOOGLE_CLIENT_ID;
        this.GOOGLE_API_KEY = configModule.CONFIG.GOOGLE_API_KEY;
        this.configLoaded = true;
        console.log("Google Drive config loaded successfully");
      } catch (configError) {
        console.warn("Failed to load config.js:", configError);
        this.configLoaded = false;
        return false;
      }

      // If config didn't load properly, don't proceed
      if (!this.GOOGLE_CLIENT_ID || !this.GOOGLE_API_KEY) {
        console.warn("Google Drive API keys not available");
        return false;
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
                  console.error(
                    "Failed to load Google Identity Services:",
                    err
                  );
                  reject(new Error("Failed to load Google Identity Services"));
                };
                document.body.appendChild(gisScript);
              } catch (error) {
                console.error("Failed to initialize GAPI client:", error);
                reject(error);
              }
            },
            (error) => {
              console.error("Failed to load GAPI client:", error);
              reject(new Error("Failed to load GAPI client"));
            }
          );
        };

        script.onerror = (err) => {
          console.error("Failed to load Google API:", err);
          reject(new Error("Failed to load Google API"));
        };
        document.body.appendChild(script);
      });
    } catch (error) {
      console.error("Error in initialization sequence:", error);
      throw error; // Re-throw to allow calling code to handle
    }
  }

  async checkAuth() {
    try {
      console.log("Checking Google authentication");
      // Try to get cached token from localStorage first
      const cachedTokenStr = localStorage.getItem("google_drive_token");

      if (cachedTokenStr) {
        try {
          const cachedToken = JSON.parse(cachedTokenStr);
          console.log("Found cached token, setting in gapi");

          // Set the token in gapi
          this.gapi.client.setToken(cachedToken);

          // Test if token works
          try {
            await this.gapi.client.drive.files.list({
              pageSize: 1,
              spaces: "appDataFolder",
            });
            console.log("Token is valid!");
            return true;
          } catch (e) {
            console.warn("Cached token not valid, attempting to refresh", e);

            // Try to silently refresh the token
            return await this.refreshToken();
          }
        } catch (e) {
          console.error("Error parsing cached token:", e);
          localStorage.removeItem("google_drive_token");
        }
      }

      // If we get here, either no token or invalid token
      return false;
    } catch (error) {
      console.warn("Not authenticated with Google Drive:", error);
      return false;
    }
  }

  // Add a new method to GoogleDriveProvider for token refresh
  async refreshToken() {
    try {
      console.log("Attempting to silently refresh token");

      return new Promise((resolve) => {
        // Set up a temporary callback for silent token refresh
        this.tokenClient.callback = async (resp) => {
          if (resp.error) {
            console.error("Silent token refresh failed:", resp);
            resolve(false);
            return;
          }

          // Get the new token
          try {
            const token = this.gapi.client.getToken();
            if (token) {
              console.log("Got new token via silent refresh, saving");
              localStorage.setItem("google_drive_token", JSON.stringify(token));
              resolve(true);
              return;
            }
          } catch (e) {
            console.error("Error saving refreshed token:", e);
          }

          resolve(false);
        };

        // Request token silently (no UI prompt)
        this.tokenClient.requestAccessToken({ prompt: "" });
      });
    } catch (error) {
      console.error("Error during token refresh:", error);
      return false;
    }
  }

  async authenticate() {
    console.log("Starting Google authentication");
    return new Promise((resolve) => {
      this.tokenClient.callback = async (resp) => {
        console.log("Auth callback received", resp);
        if (resp.error) {
          console.error("Error authenticating with Google:", resp);
          // Signal that sync is not ready
          if (window.setSyncReady) window.setSyncReady(false);
          resolve(false);
          return;
        }

        // Get the actual token from gapi
        try {
          const token = this.gapi.client.getToken();
          if (token) {
            console.log("Got valid token, saving to localStorage");
            localStorage.setItem("google_drive_token", JSON.stringify(token));
          }
        } catch (e) {
          console.error("Error saving token:", e);
        }

        // Signal that sync is ready
        if (window.setSyncReady) window.setSyncReady(true);

        console.log("Authentication successful");
        resolve(true);
      };
      this.tokenClient.requestAccessToken({ prompt: "consent" });
    });
  }

  async findOrCreateFile(filename, mimeType = "application/json") {
    try {
      // Search for the file in the app data folder
      console.log(
        `Searching for Google Drive file '${filename}' in appDataFolder...`
      );
      const response = await this.gapi.client.drive.files.list({
        spaces: "appDataFolder",
        fields: "files(id, name, modifiedTime)",
        q: `name='${filename}'`,
      });

      console.log(`Search results for '${filename}':`, response.result.files);

      if (response.result.files && response.result.files.length > 0) {
        const file = response.result.files[0];
        console.log(
          `Found existing file: ${file.name} (ID: ${file.id}, Modified: ${file.modifiedTime})`
        );
        return file;
      }

      // If file not found, create it
      console.log(`File '${filename}' not found, creating new file...`);
      const fileMetadata = {
        name: filename,
        parents: ["appDataFolder"],
      };

      const createResponse = await this.gapi.client.drive.files.create({
        resource: fileMetadata,
        fields: "id, name, modifiedTime",
      });

      console.log(
        `Created new file: ${createResponse.result.name} (ID: ${createResponse.result.id})`
      );
      return createResponse.result;
    } catch (error) {
      console.error("Error finding/creating file:", error);
      throw error;
    }
  }

  async uploadFile(fileId, content) {
    console.log(`Uploading to Google Drive file ID: ${fileId}...`);

    if (
      !content ||
      (typeof content === "object" && Object.keys(content).length === 0)
    ) {
      console.error("Cannot upload empty content:", content);
      throw new Error("Cannot upload empty or null content");
    }

    try {
      const contentStr = JSON.stringify(content);
      const accessToken = this.gapi.client.getToken().access_token;

      // Upload the file
      const response = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,etag,modifiedTime`,
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

      const result = await response.json();
      console.log("Upload result:", result);
      console.log("Upload etag:", result.etag);

      // Return complete file info including ETag
      return {
        id: result.id,
        name: result.name,
        etag: result.etag, // Store this for future comparisons
        modifiedTime: result.modifiedTime,
      };
    } catch (error) {
      console.error("Upload failed:", error);
      throw error;
    }
  }

  async downloadFile(fileId) {
    try {
      console.log(`Downloading Google Drive file with ID: ${fileId}...`);

      // First, try to get the file metadata to check properties
      const metadataResponse = await this.gapi.client.drive.files.get({
        fileId: fileId,
        fields: "id,name,mimeType,size",
      });

      console.log("File metadata:", metadataResponse.result);

      // Then download the content
      const response = await this.gapi.client.drive.files.get({
        fileId: fileId,
        alt: "media",
      });

      // Validate response
      if (!response || !response.body) {
        console.error("Empty response from Google Drive API");
        return null;
      }

      // Log the raw response for debugging
      //console.log("Raw response body type:", typeof response.body);
      //console.log(
      //  "Raw response sample:",
      //  typeof response.body === "string"
      //    ? response.body.substring(0, 100)
      //    : JSON.stringify(response.body).substring(0, 100)
      //);
      console.log("Raw response:", typeof response.body, response.body);
      if (response.body === "{}" || response.body === "" || !response.body) {
        console.log("Received empty JSON object from Google Drive");
        return null;
      }

      // Process the response based on type
      let parsedContent;

      if (typeof response.body === "string") {
        // Handle string response
        if (response.body.trim() === "") {
          console.error("Downloaded empty string from Google Drive");
          return null;
        }

        try {
          // Try to parse as JSON
          parsedContent = JSON.parse(response.body);
          console.log("Parsed string response as JSON object");
        } catch (e) {
          console.warn("Could not parse response as JSON:", e);
          // Return the string if it's not empty
          parsedContent = response.body;
        }
      } else {
        // Handle object response
        parsedContent = response.body;
      }

      // Final validation of content
      if (
        !parsedContent ||
        (typeof parsedContent === "object" &&
          Object.keys(parsedContent).length === 0)
      ) {
        console.error("Downloaded empty content from Google Drive");
        return null;
      }

      console.log("Downloaded content:", parsedContent);
      return parsedContent;
    } catch (error) {
      if (error.status === 404) {
        console.log(`File with ID ${fileId} not found`);
        return null; // File not found, which is okay for first sync
      }
      console.error(`Error downloading file ${fileId}:`, error);
      throw error;
    }
  }

  async getFileMetadata(fileId) {
    try {
      console.log(`Getting metadata for Google Drive file: ${fileId}`);

      // Request specific fields we need
      const response = await this.gapi.client.drive.files.get({
        fileId: fileId,
        fields: "id,name,etag,modifiedTime,size,mimeType",
      });

      // Log the full response for debugging
      console.log("Google Drive metadata response:", response.result);

      // Return essential metadata including etag
      return {
        id: response.result.id,
        name: response.result.name,
        etag: response.result.etag, // Google Drive specific ETag
        modifiedTime: response.result.modifiedTime,
        size: response.result.size || 0,
        mimeType: response.result.mimeType,
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

export default GoogleDriveProvider;
