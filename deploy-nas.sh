#!/bin/bash
set -e

PROJECT_ROOT=$(pwd)
ENV_FILE="${PROJECT_ROOT}/.env"
DEPLOY_TARGET_DIR="/volume1/web/mind-pwa-deploy"

echo "▶️  Starting deployment process..."
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ ERROR: Environment file not found at ${ENV_FILE}"
    exit 1
fi
mkdir -p "$DEPLOY_TARGET_DIR"

# --- Step 1: Load environment variables ---
echo "⚙️  Loading environment variables..."
export $(grep -v '^#' "$ENV_FILE" | xargs)

# --- Step 2: Install ALL Monorepo Dependencies ---
echo "⚙️  Installing all monorepo dependencies..."
npm install

# --- Step 3: Build the client application ---
echo "🚀 Building the Vite client..."
npm run build

echo "✅ Build successful."

# --- Step 4: Deploy the built files ---
echo "🚀 Deploying built files to ${DEPLOY_TARGET_DIR}..."
rm -rf "${DEPLOY_TARGET_DIR:?}"/*
cp -R "${PROJECT_ROOT}/client/dist"/* "${DEPLOY_TARGET_DIR}/"

echo "🎉 Deployment complete! You can now start your stack with './rebuild-containers.sh'."