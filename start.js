#!/usr/bin/env node

/**
 * Combined startup script for Kanban MCP Server
 * This script:
 * 1. Starts the Kanban API server in the background
 * 2. Waits for it to be ready
 * 3. Starts the MCP server (stdio mode)
 * 4. Cleans up the API server when the MCP server exits
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const KANBAN_DIR = join(__dirname, '../life-system-kanban');
let apiProcess = null;

// Cleanup function
function cleanup() {
  if (apiProcess) {
    console.error('Stopping API server...');
    apiProcess.kill();
    apiProcess = null;
  }
}

// Register cleanup handlers
process.on('exit', cleanup);
process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

// Check if API server is already running
async function isApiServerRunning() {
  try {
    const response = await fetch('http://localhost:3000/api/lanes');
    return response.ok || response.status === 404;
  } catch (err) {
    return false;
  }
}

// Check if API server is ready
async function waitForApiServer(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch('http://localhost:3000/api/lanes');
      if (response.ok || response.status === 404) {
        return true;
      }
    } catch (err) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

async function main() {
  // Check if Kanban directory exists
  if (!existsSync(KANBAN_DIR)) {
    console.error(`Error: Kanban directory not found at ${KANBAN_DIR}`);
    process.exit(1);
  }

  // Check if API server is already running
  const alreadyRunning = await isApiServerRunning();
  if (alreadyRunning) {
    console.error('API server is already running on port 3000');
  } else {
    // Start the Kanban API server using npx to ensure tsx is in PATH
    console.error('Starting Kanban API server...');
    apiProcess = spawn('npx', ['tsx', 'src/server/index.ts'], {
      cwd: KANBAN_DIR,
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    apiProcess.stderr.on('data', (data) => {
      // Log API server errors to stderr
      console.error(`API: ${data.toString().trim()}`);
    });

    apiProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`API server exited with code ${code}`);
        process.exit(1);
      }
    });

    // Wait for API server to be ready
    console.error('Waiting for API server to be ready...');
    const ready = await waitForApiServer();
    if (!ready) {
      console.error('Error: API server failed to start within 30 seconds');
      cleanup();
      process.exit(1);
    }
    console.error('API server is ready!');
  }

  // Start the MCP server
  console.error('Starting MCP server...');
  const mcpProcess = spawn('node', ['dist/index.js'], {
    cwd: __dirname,
    stdio: 'inherit',
  });

  mcpProcess.on('exit', (code) => {
    cleanup();
    process.exit(code || 0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  cleanup();
  process.exit(1);
});
