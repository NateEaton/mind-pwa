#!/bin/bash
set -e

echo "▶️  Stopping any running containers..."

# Stop server containers if running
docker-compose down 2>/dev/null || true

# Stop client-only container if running
docker-compose -f docker-compose.client-only.yml down 2>/dev/null || true

echo "▶️  Starting client-only nginx container..."

docker-compose -f docker-compose.client-only.yml up -d

echo "✅ Client-only nginx container started."
echo "🌐 Access the app at: http://your-nas-ip:8080" 