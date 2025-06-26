// update-version.js
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

try {
  // Use --short directly if supported, otherwise slice
  const commitHash = execSync("git rev-parse --short HEAD").toString().trim();
  const buildTime = new Date().toISOString();
  const versionData = {
    commitHash: commitHash,
    buildTime: buildTime,
  };
  const outputPath = path.join(__dirname, '..', 'client', 'public', 'version.json'); 
  fs.writeFileSync(outputPath, JSON.stringify(versionData, null, 2));
  console.log(`Updated version.json with commit ${commitHash}`);
} catch (error) {
  console.error("Failed to update version.json:", error);
  process.exit(1); // Signal error to the hook
}
