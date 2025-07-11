#!/bin/bash
set -e

PROJECT_ROOT=$(pwd)
ENV_FILE="${PROJECT_ROOT}/.env"

echo "▶️  Starting PocketBase deployment process..."

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    echo "⚙️  Loading environment variables from .env file..."
    export $(grep -v '^#' "$ENV_FILE" | xargs)
else
    echo "⚠️  No .env file found, using defaults"
fi

# Build client application
echo "🚀 Building client application with PocketBase support..."
cd "${PROJECT_ROOT}/client"
npm install

# Build with PocketBase configuration
VITE_POCKETBASE_ENABLED=true VITE_POCKETBASE_URL=${VITE_POCKETBASE_URL:-http://localhost:8080} npm run build

echo "✅ Client build successful."

# Deploy to same location as your current setup
DEPLOY_TARGET_DIR="/volume1/web/mind-pwa-deploy"
echo "🚀 Deploying built files to ${DEPLOY_TARGET_DIR}..."
mkdir -p "$DEPLOY_TARGET_DIR"
rm -rf "${DEPLOY_TARGET_DIR:?}"/*
cp -R "${PROJECT_ROOT}/client/dist"/* "${DEPLOY_TARGET_DIR}/"

echo "🎉 PocketBase deployment complete!"
echo ""
echo "💡 To start the application:"
echo "   docker-compose -f docker-compose.pocketbase.yml up -d"
echo ""
echo "💡 Access the application at:"
echo "   Frontend: http://your-server:8080/"
echo "   PocketBase Admin: http://your-server:8080/_/"
echo "   API: http://your-server:8080/api/"