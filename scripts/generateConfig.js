// scripts/generateConfig.js
const fs = require("fs");

const config = {
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  DROPBOX_APP_KEY: process.env.DROPBOX_APP_KEY,
};

const content = `export const CONFIG = ${JSON.stringify(config, null, 2)};\n`;

fs.writeFileSync("config.js", content);
console.log("✅ config.js generated");
