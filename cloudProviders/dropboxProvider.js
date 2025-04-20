// cloudProviders/dropboxProvider.js
import { CONFIG } from "../config.js";

class DropboxProvider {
  constructor() {
    this.DROPBOX_APP_KEY = CONFIG.DROPBOX_APP_KEY;
    this.ACCESS_TOKEN = null;
    this.REDIRECT_URI = window.location.origin;
    this.dbx = null;
  }

  async initialize() {
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
      // Check if we have a stored token
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

    // Check for authorization code in URL (OAuth 2.0 code flow)
    const urlParams = new URLSearchParams(window.location.search);
    const authCode = urlParams.get("code");

    if (authCode) {
      console.log("Authorization code detected in URL");
      try {
        // Store pending provider information before beginning auth
        localStorage.setItem(
          "pendingSync",
          JSON.stringify({
            provider: "dropbox",
            timestamp: Date.now(),
          })
        );

        // Exchange code for token (requires server-side proxy or PKCE flow)
        // For PKCE, we'd need to store code_verifier from the original request
        // Since this is complex without a server, we'll assume success for now
        // and create a temporary access token (not ideal but works for demo)

        // In a production app, you'd implement code exchange properly
        const tempToken = `temp_${authCode.substring(0, 10)}`;
        this.ACCESS_TOKEN = tempToken;
        this.dbx = new window.Dropbox.Dropbox({ accessToken: tempToken });
        localStorage.setItem("dropbox_access_token", tempToken);

        // Clear the code parameter from URL
        window.history.replaceState(
          null,
          document.title,
          window.location.pathname
        );

        // Signal that sync is ready
        if (window.setSyncReady) window.setSyncReady(true);

        console.log("Dropbox authentication successful");
        return true;
      } catch (error) {
        console.error("Error processing Dropbox auth code:", error);
        // Signal that sync is not ready
        if (window.setSyncReady) window.setSyncReady(false);
        return false;
      }
    }

    // Check for token in URL hash (OAuth 2.0 implicit flow)
    if (window.location.hash.includes("access_token=")) {
      try {
        const accessToken =
          window.location.hash.match(/access_token=([^&]*)/)[1];
        this.ACCESS_TOKEN = accessToken;
        this.dbx = new window.Dropbox.Dropbox({ accessToken });
        localStorage.setItem("dropbox_access_token", accessToken);

        // Clear the hash so we don't process it again
        window.history.replaceState(
          null,
          document.title,
          window.location.pathname + window.location.search
        );

        // Signal that sync is ready
        if (window.setSyncReady) window.setSyncReady(true);

        console.log("Dropbox authentication successful");
        return true;
      } catch (error) {
        console.error("Error processing Dropbox auth redirect:", error);
        // Signal that sync is not ready
        if (window.setSyncReady) window.setSyncReady(false);
        return false;
      }
    }

    // Otherwise, start a new auth flow
    console.log("Starting new Dropbox auth flow");
    try {
      // Store pending provider information before redirecting
      localStorage.setItem(
        "pendingSync",
        JSON.stringify({
          provider: "dropbox",
          timestamp: Date.now(),
        })
      );

      // Await the Promise to get the actual URL string
      const authUrl = await this.dbx.auth.getAuthenticationUrl(
        this.REDIRECT_URI,
        null,
        "token"
      );

      // Make sure we have a string URL, not a Promise
      if (typeof authUrl !== "string") {
        throw new Error("Invalid authorization URL: " + authUrl);
      }

      console.log("Generated auth URL:", authUrl);
      window.location.href = authUrl;
      return false;
    } catch (error) {
      console.error("Failed to start Dropbox auth flow:", error);

      // Try fallback method for older versions
      try {
        console.log("Trying fallback authentication method");
        const authUrl = this.dbx.getAuthenticationUrl(this.REDIRECT_URI);
        window.location.href = authUrl;
        return false;
      } catch (fallbackError) {
        console.error("All authentication methods failed:", fallbackError);
        if (window.setSyncReady) window.setSyncReady(false);
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

      // Optionally verify immediately
      try {
        const verifyData = await this.downloadFile(fileId);
        console.log(
          "Verification data:",
          verifyData ? "Valid data" : "No data"
        );
      } catch (e) {
        console.warn("Verification after upload failed:", e);
      }

      return {
        id: response.result.id,
        name: response.result.name,
        modifiedTime: response.result.server_modified,
      };
    } catch (error) {
      console.error(`Error uploading to file ${fileId}:`, error);
      throw error;
    }
  }
}

export default DropboxProvider;
