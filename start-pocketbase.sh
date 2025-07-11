#!/bin/bash
set -e

echo "▶️  Starting PocketBase development environment..."

# Check if docker-compose.pocketbase.yml exists
if [ ! -f "docker-compose.pocketbase.yml" ]; then
    echo "❌ docker-compose.pocketbase.yml not found"
    exit 1
fi

# Check if schema file exists
if [ ! -f "pocketbase/pb_schema.json" ]; then
    echo "❌ pocketbase/pb_schema.json not found"
    exit 1
fi

# Stop any existing containers
echo "🛑 Stopping any existing PocketBase containers..."
docker-compose -f docker-compose.pocketbase.yml down

# Start the container
echo "🚀 Starting PocketBase container..."
docker-compose -f docker-compose.pocketbase.yml up -d

# Wait a moment for the container to start
echo "⏳ Waiting for PocketBase to start..."
sleep 5

# Check if container is running
if docker-compose -f docker-compose.pocketbase.yml ps | grep -q "Up"; then
    echo "✅ PocketBase is running!"
    
    # Check if this is first run (no database exists)
    if [ ! -f "/volume1/projects/mind-pwa/pocketbase/data.db" ]; then
        echo "🔧 First run detected - you'll need to:"
        echo "   1. Go to http://localhost:8080/_/ to set up admin account"
        echo "   2. Import schema from pocketbase/pb_schema.json in the admin UI"
        echo "   3. Or manually create collections as needed"
        echo ""
    fi
    
    echo "🌐 Access URLs:"
    echo "   Frontend: http://localhost:8080/"
    echo "   Admin UI: http://localhost:8080/_/"
    echo "   API: http://localhost:8080/api/"
    echo ""
    echo "📊 Useful commands:"
    echo "   View logs: docker-compose -f docker-compose.pocketbase.yml logs -f"
    echo "   Stop: docker-compose -f docker-compose.pocketbase.yml down"
else
    echo "❌ Failed to start PocketBase container"
    echo "🔍 Check logs: docker-compose -f docker-compose.pocketbase.yml logs"
    exit 1
fi