// cloudProviders/googleDriveProvider.js
class GoogleDriveProvider {
  constructor() {
    this.CLIENT_ID =
      "3317861929-kdi9gcksdifd67cfa3j5jk55kp9jdh3v.apps.googleusercontent.com";
    this.API_KEY = "AIzaSyDXAO61SD6EMIrzeU57HUmQZWJH6vUy_64";
    this.SCOPES = "https://www.googleapis.com/auth/drive.appdata";
    this.DISCOVERY_DOCS = [
      "https://www.googleapis.com/discovery/v1/apis/drive/v3/rest",
    ];
    this.gapi = null;
    this.tokenClient = null;
    this.currentUser = null;
  }

  async initialize() {
    try {
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
                  apiKey: this.API_KEY,
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
                      client_id: this.CLIENT_ID,
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
      console.log(`Searching for file '${filename}' in appDataFolder...`);
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

  async downloadFile(fileId) {
    try {
      console.log(`Downloading file with ID: ${fileId}...`);
      const response = await this.gapi.client.drive.files.get({
        fileId: fileId,
        alt: "media",
      });
  
      const contentSize = JSON.stringify(response.result).length;
      console.log(
        `Downloaded file content (${contentSize} bytes)`,
        contentSize < 1000 ? response.result : "Content too large to log"
      );
      
      if (response.result) {
        console.log("Downloaded data structure:", Object.keys(response.result));
        if (response.result.weeklyCounts) {
          console.log("Weekly counts in downloaded data:", response.result.weeklyCounts);
        }
      }
  
      return response.result;
    } catch (error) {
      if (error.status === 404) {
        console.log(`File with ID ${fileId} not found`);
        return null; // File not found, which is okay for first sync
      }
      console.error(`Error downloading file ${fileId}:`, error);
      throw error;
    }
  }

  async uploadFile(fileId, content) {
    console.log(`Uploading to file ID: ${fileId}...`);
    // Log the content structure and first ~100 characters to verify it's not empty
    console.log("Content structure:", Object.keys(content));
    const contentStr = JSON.stringify(content);
    console.log("Content preview:", contentStr.substring(0, 100) + (contentStr.length > 100 ? "..." : ""));
    const contentSize = contentStr.length;
    console.log(`Content size: ${contentSize} bytes`);
  
    if (contentSize <= 2) {
      console.error("Attempted to upload empty content! Aborting upload.");
      throw new Error("Cannot upload empty content");
    }
  
    const contentBlob = new Blob([contentStr], {
      type: "application/json",
    });
  
    try {
      const response = await this.gapi.client.request({
        path: `/upload/drive/v3/files/${fileId}`,
        method: "PATCH",
        params: { uploadType: "media" },
        body: contentBlob,
      });
  
      console.log(`Upload successful:`, response.result);
      return response.result;
    } catch (error) {
      console.error(`Error uploading to file ${fileId}:`, error);
      throw error;
    }
  }

export default GoogleDriveProvider;
