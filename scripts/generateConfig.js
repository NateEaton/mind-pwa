import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Step back to root (if this script is in /scripts or similar)
const outputPath = path.join(__dirname, "..", "config.js");

const config = {
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  DROPBOX_APP_KEY: process.env.DROPBOX_APP_KEY,
  DEV_MODE: process.env.DEV_MODE === "true" || false, // Default to false (production)
};

const content = `export const CONFIG = ${JSON.stringify(config, null, 2)};\n`;

fs.writeFileSync(outputPath, content);
console.log(`✅ config.js generated at ${outputPath}`);
