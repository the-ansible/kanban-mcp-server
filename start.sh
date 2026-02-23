#!/bin/bash
set -e

# Combined startup script for Kanban MCP Server
# This script:
# 1. Starts the Kanban API server in the background
# 2. Waits for it to be ready
# 3. Starts the MCP server (stdio mode)
# 4. Cleans up the API server when the MCP server exits

KANBAN_DIR="../life-system-kanban"
API_PID=""

# Cleanup function to stop the API server
cleanup() {
    echo "Stopping API server..." >&2
    if [ -n "$API_PID" ]; then
        kill $API_PID 2>/dev/null || true
        wait $API_PID 2>/dev/null || true
    fi
}

# Register cleanup on exit
trap cleanup EXIT INT TERM

# Check if Kanban directory exists
if [ ! -d "$KANBAN_DIR" ]; then
    echo "Error: Kanban directory not found at $KANBAN_DIR" >&2
    exit 1
fi

# Start the Kanban API server in the background
echo "Starting Kanban API server..." >&2
cd "$KANBAN_DIR"
npm run server > /tmp/kanban-api.log 2>&1 &
API_PID=$!
cd - > /dev/null

# Wait for API server to be ready
echo "Waiting for API server to be ready..." >&2
for i in {1..30}; do
    if curl -s http://localhost:3000/api/lanes > /dev/null 2>&1; then
        echo "API server is ready!" >&2
        break
    fi
    if [ $i -eq 30 ]; then
        echo "Error: API server failed to start within 30 seconds" >&2
        exit 1
    fi
    sleep 1
done

# Start the MCP server (stdio mode)
echo "Starting MCP server..." >&2
node dist/index.js

# Cleanup will be called automatically on exit
