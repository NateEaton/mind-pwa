import express from "express";
import axios from "axios";
import cors from "cors";

// --- START DEBUG ---
console.log("--- Server Environment Variables ---");
console.log("DROPBOX_CLIENT_ID:", process.env.DROPBOX_CLIENT_ID);
console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID);
console.log("--- End Server Environment ---");
// --- END DEBUG ---

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors()); // Allows cross-origin requests from your PWA
app.use(express.json()); // Allows parsing of JSON in request bodies (for refresh tokens)

// --- Configuration from Environment Variables ---
const {
  APP_BASE_URL,
  DROPBOX_CLIENT_ID,
  DROPBOX_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} = process.env;

const DROPBOX_REDIRECT_URI = `${APP_BASE_URL}/api/dropbox/callback`;
const GOOGLE_REDIRECT_URI = `${APP_BASE_URL}/api/gdrive/callback`;

// --- Helper for Error Responses ---
const sendError = (res, provider, message) => {
  console.error(`[${provider}] Error:`, message);
  // Redirect back to the PWA with an error flag in the hash
  return res.redirect(
    `${APP_BASE_URL}/#error=${provider}_auth_failed&message=${encodeURIComponent(
      message
    )}`
  );
};

// =================================================================
// --- Dropbox Endpoints ---
// =================================================================

// 1. PWA redirects here to start the Dropbox login flow
app.get("/api/dropbox/auth", (req, res) => {
  const { state } = req.query; // Accept state parameter from client
  const authUrl = new URL("https://www.dropbox.com/oauth2/authorize");
  authUrl.searchParams.set("client_id", DROPBOX_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", DROPBOX_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("token_access_type", "offline"); // CRITICAL: This requests a refresh_token
  if (state) {
    authUrl.searchParams.set("state", state); // Pass state through to Dropbox
  }
  res.redirect(authUrl.toString());
});

// 2. Dropbox redirects here after user grants access
app.get("/api/dropbox/callback", async (req, res) => {
  const { code, state } = req.query; // Accept state from Dropbox callback
  if (!code) {
    return sendError(
      res,
      "dropbox",
      "Authorization code not received from Dropbox."
    );
  }

  try {
    const response = await axios.post(
      "https://api.dropboxapi.com/oauth2/token",
      null,
      {
        params: {
          code,
          grant_type: "authorization_code",
          redirect_uri: DROPBOX_REDIRECT_URI,
          client_id: DROPBOX_CLIENT_ID,
          client_secret: DROPBOX_CLIENT_SECRET,
        },
      }
    );

    const { access_token, refresh_token, expires_in } = response.data;
    // Include state in redirect back to client
    const redirectUrl = new URL(
      `${APP_BASE_URL}/#provider=dropbox&access_token=${access_token}&refresh_token=${refresh_token}&expires_in=${expires_in}`
    );
    if (state) {
      redirectUrl.hash += `&state=${encodeURIComponent(state)}`;
    }
    res.redirect(redirectUrl.toString());
  } catch (error) {
    sendError(
      res,
      "dropbox",
      error.response?.data?.error_description || "Token exchange failed."
    );
  }
});

// 3. PWA calls this endpoint to refresh an expired token
app.post("/api/dropbox/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: "Refresh token is required." });
  }

  try {
    const response = await axios.post(
      "https://api.dropboxapi.com/oauth2/token",
      null,
      {
        params: {
          refresh_token,
          grant_type: "refresh_token",
          client_id: DROPBOX_CLIENT_ID,
          client_secret: DROPBOX_CLIENT_SECRET,
        },
      }
    );
    res.json({
      access_token: response.data.access_token,
      expires_in: response.data.expires_in,
    });
  } catch (error) {
    console.error("Dropbox refresh token error:", error.response?.data);
    res
      .status(401)
      .json({
        error:
          "Failed to refresh Dropbox token. Re-authentication may be required.",
      });
  }
});

// =================================================================
// --- Google Drive Endpoints ---
// =================================================================

app.get("/api/gdrive/auth", (req, res) => {
  const { state } = req.query; // Accept state parameter from client
  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email"
  );
  authUrl.searchParams.set("access_type", "offline"); // CRITICAL: This requests a refresh_token
  authUrl.searchParams.set("prompt", "consent select_account"); // Ensures a refresh token is sent every time
  if (state) {
    authUrl.searchParams.set("state", state); // Pass state through to Google
  }
  res.redirect(authUrl.toString());
});

app.get("/api/gdrive/callback", async (req, res) => {
  const { code, state } = req.query; // Accept state from Google callback
  if (!code) {
    return sendError(
      res,
      "gdrive",
      "Authorization code not received from Google."
    );
  }

  try {
    const { data } = await axios.post(
      "https://oauth2.googleapis.com/token",
      null,
      {
        params: {
          code,
          grant_type: "authorization_code",
          redirect_uri: GOOGLE_REDIRECT_URI,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
        },
      }
    );

    const { access_token, refresh_token, expires_in } = data;
    // Include state in redirect back to client
    const redirectUrl = new URL(
      `${APP_BASE_URL}/#provider=gdrive&access_token=${access_token}&refresh_token=${refresh_token}&expires_in=${expires_in}`
    );
    if (state) {
      redirectUrl.hash += `&state=${encodeURIComponent(state)}`;
    }
    res.redirect(redirectUrl.toString());
  } catch (error) {
    sendError(
      res,
      "gdrive",
      error.response?.data?.error_description || "Token exchange failed."
    );
  }
});

app.post("/api/gdrive/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    return res.status(400).json({ error: "Refresh token is required." });
  }

  try {
    const { data } = await axios.post(
      "https://oauth2.googleapis.com/token",
      null,
      {
        params: {
          refresh_token,
          grant_type: "refresh_token",
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
        },
      }
    );
    res.json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (error) {
    console.error("Google refresh token error:", error.response?.data);
    res
      .status(401)
      .json({
        error:
          "Failed to refresh Google token. Re-authentication may be required.",
      });
  }
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`MIND PWA OAuth server listening on port ${PORT}`);
});
