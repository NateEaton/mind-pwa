// cloudProviders/dropboxProvider.js
class DropboxProvider {
  constructor() {
    this.APP_KEY = "YOUR_DROPBOX_APP_KEY";
    this.ACCESS_TOKEN = null;
    this.REDIRECT_URI = window.location.origin;
    this.dbx = null;
  }

  async initialize() {
    // Load the Dropbox SDK
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/dropbox/dist/Dropbox-sdk.min.js";
      script.onload = () => {
        try {
          this.dbx = new window.Dropbox.Dropbox({ clientId: this.APP_KEY });
          resolve(true);
        } catch (error) {
          reject(error);
        }
      };
      script.onerror = () => reject(new Error("Failed to load Dropbox SDK"));
      document.body.appendChild(script);
    });
  }

  async checkAuth() {
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
        return true;
      } catch (error) {
        console.warn("Stored Dropbox token is invalid:", error);
        this.ACCESS_TOKEN = null;
        localStorage.removeItem("dropbox_access_token");
        return false;
      }
    }
    return false;
  }

  async authenticate() {
    return new Promise((resolve) => {
      // If we have a hash in the URL, this might be a redirect back from auth
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

          resolve(true);
          return;
        } catch (error) {
          console.error("Error processing Dropbox auth redirect:", error);
        }
      }

      // Otherwise, start a new auth flow
      const authUrl = this.dbx.getAuthenticationUrl(this.REDIRECT_URI);
      window.location.href = authUrl;

      // This will redirect away, so resolve is never called
      // The auth flow continues when the page reloads
    });
  }

  async findOrCreateFile(filename) {
    try {
      // Try to get file metadata
      const path = `/${filename}`;
      try {
        const response = await this.dbx.filesGetMetadata({ path });
        return {
          id: response.result.id,
          name: response.result.name,
          modifiedTime: response.result.server_modified,
        };
      } catch (error) {
        // File doesn't exist, create it
        if (error.status === 409) {
          // Create an empty file
          const createResponse = await this.dbx.filesUpload({
            path,
            contents: JSON.stringify({}),
            mode: "add",
            autorename: false,
          });

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

  async downloadFile(fileId) {
    try {
      const response = await this.dbx.filesDownload({ path: fileId });

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            resolve(data);
          } catch (error) {
            reject(new Error("Error parsing file content"));
          }
        };
        reader.onerror = () => reject(new Error("Error reading file"));
        reader.readAsText(response.result.fileBlob);
      });
    } catch (error) {
      if (error.status === 404) {
        return null; // File not found
      }
      throw error;
    }
  }

  async uploadFile(fileId, content) {
    try {
      const contentStr = JSON.stringify(content);
      const response = await this.dbx.filesUpload({
        path: fileId,
        contents: contentStr,
        mode: "overwrite",
      });

      return {
        id: response.result.id,
        name: response.result.name,
        modifiedTime: response.result.server_modified,
      };
    } catch (error) {
      console.error("Error uploading file to Dropbox:", error);
      throw error;
    }
  }
}

export default DropboxProvider;
