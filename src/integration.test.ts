import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';

/**
 * Integration tests for MCP protocol compliance
 *
 * These tests verify that the MCP server correctly implements the Model Context Protocol:
 * - Server initialization and stdio transport
 * - ListTools request/response format
 * - CallTool request/response format
 * - Error handling and reporting
 */

describe('MCP Protocol Compliance', () => {
  let serverProcess: ChildProcess;
  let stdoutData: string[] = [];
  let stderrData: string[] = [];

  beforeAll(async () => {
    // Start the MCP server as a subprocess
    const serverPath = resolve(__dirname, 'index.ts');
    serverProcess = spawn('npx', ['tsx', serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Collect stdout (JSON-RPC responses)
    serverProcess.stdout?.on('data', (data) => {
      stdoutData.push(data.toString());
    });

    // Collect stderr (server logs)
    serverProcess.stderr?.on('data', (data) => {
      stderrData.push(data.toString());
    });

    // Wait for server to start (look for startup message in stderr)
    await new Promise<void>((resolve) => {
      const checkStartup = () => {
        const allStderr = stderrData.join('');
        if (allStderr.includes('Kanban MCP server running on stdio')) {
          resolve();
        } else {
          setTimeout(checkStartup, 100);
        }
      };
      checkStartup();
    });
  });

  afterAll(() => {
    // Cleanup: kill the server process
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  it('should start and log startup message to stderr', () => {
    const allStderr = stderrData.join('');
    expect(allStderr).toContain('Kanban MCP server running on stdio');
  });

  it('should respond to ListTools request with valid MCP response', async () => {
    // Send a valid MCP ListTools request
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    };

    // Write request to stdin
    serverProcess.stdin?.write(JSON.stringify(request) + '\n');

    // Wait for response on stdout
    const response = await waitForJsonRpcResponse(1);

    // Validate MCP response format
    expect(response).toBeDefined();
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(1);
    expect(response.result).toBeDefined();
    expect(response.result.tools).toBeInstanceOf(Array);
    expect(response.result.tools.length).toBeGreaterThan(0);

    // Validate that each tool has required MCP fields
    for (const tool of response.result.tools) {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(tool.inputSchema).toHaveProperty('type');
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema).toHaveProperty('properties');
      expect(tool.inputSchema).toHaveProperty('required');
    }

    // Verify specific tools exist
    const toolNames = response.result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('list_lanes');
    expect(toolNames).toContain('create_lane');
    expect(toolNames).toContain('list_cards');
    expect(toolNames).toContain('get_board');
  });

  it('should respond to CallTool request with valid MCP response', async () => {
    // Send a valid MCP CallTool request (list_lanes)
    const request = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'list_lanes',
        arguments: {},
      },
    };

    // Write request to stdin
    serverProcess.stdin?.write(JSON.stringify(request) + '\n');

    // Wait for response on stdout
    const response = await waitForJsonRpcResponse(2);

    // Validate MCP response format
    expect(response).toBeDefined();
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(2);
    expect(response.result).toBeDefined();
    expect(response.result.content).toBeInstanceOf(Array);
    expect(response.result.content.length).toBeGreaterThan(0);

    // Validate content items
    for (const item of response.result.content) {
      expect(item).toHaveProperty('type');
      expect(item.type).toBe('text');
      expect(item).toHaveProperty('text');
      expect(typeof item.text).toBe('string');
    }
  });

  it('should return error response for invalid tool name', async () => {
    // Send CallTool request with non-existent tool
    const request = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'invalid_tool_name',
        arguments: {},
      },
    };

    // Write request to stdin
    serverProcess.stdin?.write(JSON.stringify(request) + '\n');

    // Wait for response on stdout
    const response = await waitForJsonRpcResponse(3);

    // Validate error response format
    expect(response).toBeDefined();
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(3);
    expect(response.result).toBeDefined();
    expect(response.result.content).toBeInstanceOf(Array);
    expect(response.result.isError).toBe(true);

    // Error message should be in content
    const errorText = response.result.content[0].text;
    expect(errorText).toContain('Error');
    expect(errorText).toContain('invalid_tool_name');
  });

  it('should return error response for missing required parameters', async () => {
    // Send CallTool request with missing required parameter
    const request = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'create_lane',
        arguments: {
          // Missing required 'name' and 'position' fields
        },
      },
    };

    // Write request to stdin
    serverProcess.stdin?.write(JSON.stringify(request) + '\n');

    // Wait for response on stdout
    const response = await waitForJsonRpcResponse(4);

    // Validate error response format
    expect(response).toBeDefined();
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe(4);
    expect(response.result).toBeDefined();
    expect(response.result.content).toBeInstanceOf(Array);
    expect(response.result.isError).toBe(true);

    // Error message should mention missing field
    const errorText = response.result.content[0].text;
    expect(errorText).toContain('Error');
    expect(errorText.toLowerCase()).toMatch(/missing|required/);
  });

  // Helper function to wait for a JSON-RPC response with specific ID
  async function waitForJsonRpcResponse(id: number, timeout = 5000): Promise<any> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      // Join all stdout data and try to parse JSON-RPC messages
      const allStdout = stdoutData.join('');
      const lines = allStdout.split('\n');

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.id === id) {
              return parsed;
            }
          } catch (e) {
            // Not valid JSON, skip
          }
        }
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for JSON-RPC response with id ${id}`);
  }
});
