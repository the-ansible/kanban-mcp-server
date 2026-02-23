# Kanban MCP Server

MCP (Model Context Protocol) server for the Life System Kanban API. Enables Claude Code to interact with the Kanban board using natural language.

## Quick Start

### Combined Startup (Recommended)

Start both the Kanban API server and MCP server with a single command:

```bash
# Install dependencies first
npm install

# Build TypeScript
npm run build

# Start both API and MCP server (automatic cleanup)
npm run start:combined
```

This script:
1. Starts the Kanban API server in the background
2. Waits for it to be ready (checks port 3000)
3. Launches the MCP server in stdio mode
4. Automatically stops the API server when MCP exits

### Manual Startup

You can also start the servers separately:

```bash
# Terminal 1: Start Kanban API server
cd ../life-system-kanban
npm run server

# Terminal 2: Start MCP server
cd ../mcp-server
npm start
```

### Development

```bash
# Install dependencies
npm install

# Run in development mode (requires API server running separately)
npm run dev

# Build TypeScript
npm run build
```

### Testing

```bash
# Run tests once (for CI/CD)
npm run test:run

# Run tests in watch mode
npm test

# Run with coverage
npm test -- --coverage
```

**Test Status:** ✅ 42 tests passing in ~450ms

See [TEST_GUIDE.md](./TEST_GUIDE.md) for detailed testing documentation.

## Project Structure

```
mcp-server/
├── src/
│   ├── index.ts              # Main MCP server implementation
│   ├── test/
│   │   └── mocks.ts          # Mock utilities for testing
│   ├── validation.test.ts     # Validation tests (20 tests)
│   └── tools.test.ts          # Tool tests (22 tests)
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── vitest.config.ts           # Test configuration
├── README.md                  # This file
└── TEST_GUIDE.md              # Comprehensive testing guide
```

## MCP Tools

### Lane Management (4 tools)
- `list_lanes` - Get all lanes
- `create_lane` - Create a new lane
- `update_lane` - Update lane properties
- `delete_lane` - Delete a lane (cascades to cards)

### Card Management (5 tools)
- `list_cards` - Get all cards (optionally filtered by lane)
- `create_card` - Create a new card
- `update_card` - Update card properties
- `delete_card` - Delete a card
- `move_card` - Move card to different lane/position

### Board Operations (2 tools)
- `get_board` - Get complete board state with nested cards
- `get_board_summary` - Get text summary with counts

## Dependencies

### Runtime
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `typescript` - TypeScript compiler
- `tsx` - TypeScript execution

### Development
- `vitest` - Fast test framework
- `@types/node` - Node.js type definitions

## Configuration

### API Connection
The server connects to the Kanban API at:
```
http://localhost:3000/api
```

The Kanban API must be running for the MCP server to function. Use either:
- **Combined startup:** `npm run start:combined` (handles API server automatically)
- **Manual startup:** `cd ../life-system-kanban && npm run server`

### MCP Registration
To use this server with Claude Code, register it in `~/.claude/.mcp.json`:

**Option 1: Combined startup (recommended)**
```json
{
  "mcpServers": {
    "kanban": {
      "command": "node",
      "args": ["/agent/data/files/mcp-server/start.js"],
      "cwd": "/agent/data/files/mcp-server"
    }
  }
}
```

**Option 2: Manual (requires API server already running)**
```json
{
  "mcpServers": {
    "kanban": {
      "command": "node",
      "args": ["/agent/data/files/mcp-server/dist/index.js"]
    }
  }
}
```

## Features

### Input Validation
All tools validate inputs before making API calls:
- Required field presence
- Type checking (string, number, integer)
- Format validation (hex colors: #RRGGBB)
- Range checking (non-negative integers)

### Error Handling
Comprehensive error handling with helpful messages:
- Missing required fields
- Invalid data types
- API connection failures (with guidance)
- HTTP error responses (404, 500, etc.)

### Testing
Mock-based testing eliminates external dependencies:
- All HTTP calls mocked using Vitest
- 42 tests covering validation and all tools
- Fast execution (~450ms)
- CI/CD ready

## Development Status

**Status:** Test Infrastructure Complete ✅

**Completed:**
1. ✅ Install dependencies
2. ✅ Run Kanban test suite
3. ✅ Initialize MCP server project
4. ✅ Implement card management tools
5. ✅ Implement board-level operations
6. ✅ Add error handling and validation
7. ✅ Set up test infrastructure
8. ✅ Create combined startup scripts (start.sh, start.js)

**Next Steps:**
1. Register MCP server in `~/.claude/.mcp.json`
2. Test MCP server integration with Kanban API
3. Update memory and CLAUDE.md to prevent cleanup

## Documentation

- **[TEST_GUIDE.md](./TEST_GUIDE.md)** - Comprehensive testing guide
- **[VALIDATION.md](./VALIDATION.md)** - Input validation documentation
- **Project Status:** `/agent/data/files/plans/7f9fc9b8-ccfe-4463-9bff-05b15448ca86/status.md`

## Architecture

The MCP server uses stdio transport to communicate with Claude Code:
1. Claude Code launches the server as a subprocess
2. Communication happens via stdin/stdout using JSON-RPC
3. Server exposes 11 tools that wrap the Kanban REST API
4. Each tool validates inputs and makes HTTP calls to the API
5. Results are returned as JSON or error messages

## License

Part of the Jane personal assistant system.
