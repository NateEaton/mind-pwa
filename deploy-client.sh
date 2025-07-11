#!/bin/bash
set -e

PROJECT_ROOT=$(pwd)
ENV_FILE="${PROJECT_ROOT}/.env"

echo "▶️  Starting client-only deployment process (local-only mode)..."

# Check if .env file exists and load it
if [ -f "$ENV_FILE" ]; then
    echo "⚙️  Loading environment variables from .env file..."
    export $(grep -v '^#' "$ENV_FILE" | xargs)
else
    echo "⚠️  No .env file found, using default values"
fi

# --- Step 1: Install client dependencies only ---
echo "⚙️  Installing client dependencies..."
cd client
npm install

# --- Step 2: Build the client application (client-only mode) ---
echo "🚀 Building the Vite client (client-only mode)..."
# Build with PocketBase disabled for client-only mode
VITE_POCKETBASE_ENABLED=false npm run build

echo "✅ Client-only build successful."

# --- Step 3: Deploy the built files ---
DEPLOY_TARGET_DIR="/volume1/web/mind-pwa-deploy"
echo "🚀 Deploying built files to ${DEPLOY_TARGET_DIR}..."
mkdir -p "$DEPLOY_TARGET_DIR"
rm -rf "${DEPLOY_TARGET_DIR:?}"/*
cp -R "${PROJECT_ROOT}/client/dist"/* "${DEPLOY_TARGET_DIR}/"

echo "🎉 Client-only deployment complete!"
echo ""
echo "💡 This build includes:"
echo "   ✅ Theme selection (light/dark/auto)"
echo "   ✅ Local data storage"
echo "   ✅ Import/export functionality"
echo "   ✅ PocketBase sync capabilities" 