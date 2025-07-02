#!/bin/bash
set -e

echo "▶️  Stopping any running containers..."

# Stop client-only container if running
docker-compose -f docker-compose.client-only.yml down 2>/dev/null || true

# Stop server containers if running
docker-compose down 2>/dev/null || true

echo "▶️  Starting server containers..."

docker-compose up -d

echo "✅ Server containers started."
