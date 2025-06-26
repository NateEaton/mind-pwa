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

# --- Step 1: Prepare Docker Arguments ---
echo "⚙️  Preparing environment variables for Docker..."
DOCKER_ENV_ARGS=""
# Read the .env file line by line, ensuring we strip quotes and handle comments
while IFS= read -r line || [[ -n "$line" ]]; do
    # Skip comments and empty lines
    if [[ "$line" =~ ^# || -z "$line" ]]; then
        continue
    fi
    # Add the -e flag for each valid line
    DOCKER_ENV_ARGS+=" -e $line"
done < <(grep -v '^#' "$ENV_FILE") # Use process substitution to feed the filtered file to the loop

echo "   - Arguments prepared."

# --- Step 2: Build the client application using Docker ---
echo "🚀 Building the Vite client inside a Docker container..."

# Run from the project root. This is the correct monorepo approach.
# The ${DOCKER_ENV_ARGS} variable will now be a clean list of -e VAR="value" flags.
# Can run with or without sudo depending on needs of environment. 
docker run --rm \
  ${DOCKER_ENV_ARGS} \
  -v "${PROJECT_ROOT}:/app" \
  -w "/app" \
  node:18-alpine \
  sh -c "npm install && npm run build"

echo "✅ Build successful. Output generated in ${PROJECT_ROOT}/client/dist"

# --- Step 3: Deploy the built files ---
echo "🚀 Deploying built files to ${DEPLOY_TARGET_DIR}..."
rm -rf "${DEPLOY_TARGET_DIR:?}"/*
cp -R "${PROJECT_ROOT}/client/dist"/* "${DEPLOY_TARGET_DIR}/"

echo "🎉 Deployment complete!"