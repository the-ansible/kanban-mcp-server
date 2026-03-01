#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// API base URL
const API_BASE_URL = 'http://localhost:3000/api';

// Types matching the Kanban API
interface Board {
  id: number;
  name: string;
  description: string | null;
  created_at?: string;
}

interface Lane {
  id: number;
  board_id: number;
  name: string;
  color: string;
  position: number;
  created_at?: string;
}

interface Card {
  id: number;
  lane_id: number;
  name: string;
  color: string;
  position: number;
  linked_board_id: number | null;
  created_at?: string;
}

interface LaneWithCards extends Lane {
  cards: Card[];
}

interface BoardWithLanes extends Board {
  lanes: LaneWithCards[];
}

// Validation helpers
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function validateRequired(value: unknown, fieldName: string): void {
  if (value === undefined || value === null) {
    throw new ValidationError(`Missing required field: ${fieldName}`);
  }
}

function validateString(value: unknown, fieldName: string, required = true): void {
  if (required) {
    validateRequired(value, fieldName);
  }
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new ValidationError(`Field '${fieldName}' must be a string, got ${typeof value}`);
  }
  if (required && typeof value === 'string' && value.trim().length === 0) {
    throw new ValidationError(`Field '${fieldName}' cannot be empty`);
  }
}

function validateNumber(value: unknown, fieldName: string, required = true): void {
  if (required) {
    validateRequired(value, fieldName);
  }
  if (value !== undefined && value !== null && typeof value !== 'number') {
    throw new ValidationError(`Field '${fieldName}' must be a number, got ${typeof value}`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new ValidationError(`Field '${fieldName}' must be a finite number`);
  }
  if (typeof value === 'number' && value < 0) {
    throw new ValidationError(`Field '${fieldName}' must be non-negative, got ${value}`);
  }
}

function validateInteger(value: unknown, fieldName: string, required = true): void {
  validateNumber(value, fieldName, required);
  if (typeof value === 'number' && !Number.isInteger(value)) {
    throw new ValidationError(`Field '${fieldName}' must be an integer, got ${value}`);
  }
}

function validateHexColor(value: unknown, fieldName: string, required = true): void {
  if (!required && (value === undefined || value === null)) {
    return;
  }
  validateString(value, fieldName, required);
  if (typeof value === 'string') {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    if (!hexPattern.test(value)) {
      throw new ValidationError(
        `Field '${fieldName}' must be a valid hex color (e.g., #3b82f6), got '${value}'`
      );
    }
  }
}

// Helper function to make API calls
async function apiCall<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API call failed (${response.status}): ${error}`);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Cannot connect to Kanban API at ${API_BASE_URL}. ` +
        `Please ensure the Kanban server is running on port 3000. ` +
        `You can start it with: cd life-system-kanban && npm run server`
      );
    }
    throw error;
  }
}

// Create MCP server
const server = new Server(
  {
    name: 'kanban-mcp-server',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define MCP tools
const tools: Tool[] = [
  // ── Board tools ────────────────────────────────────────────────
  {
    name: 'list_boards',
    description: 'Get all boards from the Kanban system',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_board',
    description: 'Create a new Kanban board',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The name of the board',
        },
        description: {
          type: 'string',
          description: 'Optional description of the board',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_board',
    description: 'Get a board with all its lanes and cards nested. Provides a full snapshot of the board.',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board to retrieve',
        },
      },
      required: ['board_id'],
    },
  },
  {
    name: 'update_board',
    description: 'Update a board\'s name or description',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board to update',
        },
        name: {
          type: 'string',
          description: 'New name for the board (optional)',
        },
        description: {
          type: 'string',
          description: 'New description for the board (optional)',
        },
      },
      required: ['board_id'],
    },
  },
  {
    name: 'delete_board',
    description: 'Delete a board and all its lanes and cards. WARNING: This is irreversible.',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board to delete',
        },
      },
      required: ['board_id'],
    },
  },

  // ── Lane tools (board-scoped) ─────────────────────────────────
  {
    name: 'list_lanes',
    description: 'Get all lanes for a board, ordered by position',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board',
        },
      },
      required: ['board_id'],
    },
  },
  {
    name: 'create_lane',
    description: 'Create a new lane on a board',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board to add the lane to',
        },
        name: {
          type: 'string',
          description: 'The name of the lane',
        },
        color: {
          type: 'string',
          description: 'Hex color code for the lane (e.g., #3b82f6). Defaults to #3b82f6 if not provided.',
        },
        position: {
          type: 'number',
          description: 'The position of the lane (0-based index for ordering)',
        },
      },
      required: ['board_id', 'name', 'position'],
    },
  },
  {
    name: 'update_lane',
    description: 'Update properties of an existing lane',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board the lane belongs to',
        },
        lane_id: {
          type: 'number',
          description: 'The ID of the lane to update',
        },
        name: {
          type: 'string',
          description: 'New name for the lane (optional)',
        },
        color: {
          type: 'string',
          description: 'New hex color code for the lane (optional)',
        },
        position: {
          type: 'number',
          description: 'New position for the lane (optional)',
        },
      },
      required: ['board_id', 'lane_id'],
    },
  },
  {
    name: 'delete_lane',
    description: 'Delete a lane by ID. WARNING: This will also delete all cards in the lane (CASCADE delete).',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board the lane belongs to',
        },
        lane_id: {
          type: 'number',
          description: 'The ID of the lane to delete',
        },
      },
      required: ['board_id', 'lane_id'],
    },
  },

  // ── Card tools (board-scoped) ─────────────────────────────────
  {
    name: 'list_cards',
    description: 'Get all cards for a board, optionally filtered by lane_id. Returns cards ordered by position.',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board',
        },
        lane_id: {
          type: 'number',
          description: 'Optional lane ID to filter cards. If not provided, returns all cards on the board.',
        },
      },
      required: ['board_id'],
    },
  },
  {
    name: 'create_card',
    description: 'Create a new card in a lane on a board',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board',
        },
        lane_id: {
          type: 'number',
          description: 'The ID of the lane where the card will be created',
        },
        name: {
          type: 'string',
          description: 'The name/title of the card',
        },
        color: {
          type: 'string',
          description: 'Hex color code for the card (e.g., #ffffff). Defaults to #ffffff if not provided.',
        },
        position: {
          type: 'number',
          description: 'The position of the card within the lane (0-based index for ordering)',
        },
        linked_board_id: {
          type: 'number',
          description: 'Optional ID of a board to link to this card. Creates a parent-child board relationship for hierarchical navigation.',
        },
      },
      required: ['board_id', 'lane_id', 'name', 'position'],
    },
  },
  {
    name: 'update_card',
    description: 'Update properties of an existing card',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board',
        },
        card_id: {
          type: 'number',
          description: 'The ID of the card to update',
        },
        name: {
          type: 'string',
          description: 'New name for the card (optional)',
        },
        color: {
          type: 'string',
          description: 'New hex color code for the card (optional)',
        },
        lane_id: {
          type: 'number',
          description: 'New lane ID to move the card to (optional)',
        },
        position: {
          type: 'number',
          description: 'New position for the card (optional)',
        },
        linked_board_id: {
          type: ['number', 'null'],
          description: 'ID of a board to link to this card, or null to remove an existing link',
        },
      },
      required: ['board_id', 'card_id'],
    },
  },
  {
    name: 'delete_card',
    description: 'Delete a card by ID',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board',
        },
        card_id: {
          type: 'number',
          description: 'The ID of the card to delete',
        },
      },
      required: ['board_id', 'card_id'],
    },
  },
  {
    name: 'move_card',
    description: 'Move a card to a different lane and/or position within a board.',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board',
        },
        card_id: {
          type: 'number',
          description: 'The ID of the card to move',
        },
        target_lane_id: {
          type: 'number',
          description: 'The ID of the target lane',
        },
        new_position: {
          type: 'number',
          description: 'The new position in the target lane (0-based index)',
        },
      },
      required: ['board_id', 'card_id', 'target_lane_id', 'new_position'],
    },
  },

  // ── Link tools ──────────────────────────────────────────────
  {
    name: 'link_card_to_board',
    description: 'Link a card to another board, creating a parent-child board hierarchy. The card becomes a clickable navigation point to the linked board.',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board the card belongs to',
        },
        card_id: {
          type: 'number',
          description: 'The ID of the card to link',
        },
        target_board_id: {
          type: 'number',
          description: 'The ID of the board to link to this card',
        },
      },
      required: ['board_id', 'card_id', 'target_board_id'],
    },
  },
  {
    name: 'unlink_card_from_board',
    description: 'Remove the board link from a card',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board the card belongs to',
        },
        card_id: {
          type: 'number',
          description: 'The ID of the card to unlink',
        },
      },
      required: ['board_id', 'card_id'],
    },
  },

  // ── Convenience tools ─────────────────────────────────────────
  {
    name: 'get_board_summary',
    description: 'Get a compact text summary of a board showing lanes and card counts. Useful for quick board overview.',
    inputSchema: {
      type: 'object',
      properties: {
        board_id: {
          type: 'number',
          description: 'The ID of the board',
        },
      },
      required: ['board_id'],
    },
  },
];

// Handle tool list requests
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool execution requests
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── Board operations ────────────────────────────────────────

      case 'list_boards': {
        const boards = await apiCall<Board[]>('/boards');
        return {
          content: [{ type: 'text', text: JSON.stringify(boards, null, 2) }],
        };
      }

      case 'create_board': {
        const { name: boardName, description } = args as { name: string; description?: string };
        validateString(boardName, 'name', true);
        if (description !== undefined) {
          validateString(description, 'description', false);
        }

        const board = await apiCall<Board>('/boards', {
          method: 'POST',
          body: JSON.stringify({ name: boardName, description }),
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(board, null, 2) }],
        };
      }

      case 'get_board': {
        const { board_id } = args as { board_id: number };
        validateInteger(board_id, 'board_id', true);

        const board = await apiCall<BoardWithLanes>(`/boards/${board_id}`);
        return {
          content: [{ type: 'text', text: JSON.stringify(board, null, 2) }],
        };
      }

      case 'update_board': {
        const { board_id, ...updateData } = args as { board_id: number; name?: string; description?: string };
        validateInteger(board_id, 'board_id', true);

        if (updateData.name !== undefined) {
          validateString(updateData.name, 'name', false);
        }
        if (updateData.description !== undefined) {
          validateString(updateData.description, 'description', false);
        }

        if (Object.keys(updateData).length === 0) {
          throw new ValidationError('At least one field must be provided to update (name or description)');
        }

        const board = await apiCall<Board>(`/boards/${board_id}`, {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(board, null, 2) }],
        };
      }

      case 'delete_board': {
        const { board_id } = args as { board_id: number };
        validateInteger(board_id, 'board_id', true);

        const result = await apiCall<{ success: boolean }>(`/boards/${board_id}`, {
          method: 'DELETE',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      // ── Lane operations (board-scoped) ──────────────────────────

      case 'list_lanes': {
        const { board_id } = args as { board_id: number };
        validateInteger(board_id, 'board_id', true);

        const lanes = await apiCall<Lane[]>(`/boards/${board_id}/lanes`);
        return {
          content: [{ type: 'text', text: JSON.stringify(lanes, null, 2) }],
        };
      }

      case 'create_lane': {
        const { board_id, name: laneName, color, position } = args as {
          board_id: number; name: string; color?: string; position: number;
        };
        validateInteger(board_id, 'board_id', true);
        validateString(laneName, 'name', true);
        validateInteger(position, 'position', true);
        if (color !== undefined) {
          validateHexColor(color, 'color', false);
        }

        const lane = await apiCall<Lane>(`/boards/${board_id}/lanes`, {
          method: 'POST',
          body: JSON.stringify({ name: laneName, color, position }),
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(lane, null, 2) }],
        };
      }

      case 'update_lane': {
        const { board_id, lane_id, ...updateData } = args as {
          board_id: number; lane_id: number; name?: string; color?: string; position?: number;
        };
        validateInteger(board_id, 'board_id', true);
        validateInteger(lane_id, 'lane_id', true);

        if (updateData.name !== undefined) {
          validateString(updateData.name, 'name', false);
        }
        if (updateData.color !== undefined) {
          validateHexColor(updateData.color, 'color', false);
        }
        if (updateData.position !== undefined) {
          validateInteger(updateData.position, 'position', false);
        }

        if (Object.keys(updateData).length === 0) {
          throw new ValidationError('At least one field must be provided to update (name, color, or position)');
        }

        const lane = await apiCall<Lane>(`/boards/${board_id}/lanes/${lane_id}`, {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(lane, null, 2) }],
        };
      }

      case 'delete_lane': {
        const { board_id, lane_id } = args as { board_id: number; lane_id: number };
        validateInteger(board_id, 'board_id', true);
        validateInteger(lane_id, 'lane_id', true);

        const result = await apiCall<{ success: boolean }>(`/boards/${board_id}/lanes/${lane_id}`, {
          method: 'DELETE',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      // ── Card operations (board-scoped) ──────────────────────────

      case 'list_cards': {
        const { board_id, lane_id } = args as { board_id: number; lane_id?: number };
        validateInteger(board_id, 'board_id', true);
        if (lane_id !== undefined) {
          validateInteger(lane_id, 'lane_id', false);
        }

        const endpoint = lane_id
          ? `/boards/${board_id}/cards?lane_id=${lane_id}`
          : `/boards/${board_id}/cards`;
        const cards = await apiCall<Card[]>(endpoint);
        return {
          content: [{ type: 'text', text: JSON.stringify(cards, null, 2) }],
        };
      }

      case 'create_card': {
        const { board_id, lane_id, name: cardName, color, position, linked_board_id } = args as {
          board_id: number; lane_id: number; name: string; color?: string; position: number; linked_board_id?: number;
        };
        validateInteger(board_id, 'board_id', true);
        validateInteger(lane_id, 'lane_id', true);
        validateString(cardName, 'name', true);
        validateInteger(position, 'position', true);
        if (color !== undefined) {
          validateHexColor(color, 'color', false);
        }
        if (linked_board_id !== undefined) {
          validateInteger(linked_board_id, 'linked_board_id', false);
        }

        const card = await apiCall<Card>(`/boards/${board_id}/cards`, {
          method: 'POST',
          body: JSON.stringify({ lane_id, name: cardName, color, position, linked_board_id }),
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(card, null, 2) }],
        };
      }

      case 'update_card': {
        const { board_id, card_id, ...updateData } = args as {
          board_id: number; card_id: number; name?: string; color?: string; lane_id?: number; position?: number; linked_board_id?: number | null;
        };
        validateInteger(board_id, 'board_id', true);
        validateInteger(card_id, 'card_id', true);

        if (updateData.name !== undefined) {
          validateString(updateData.name, 'name', false);
        }
        if (updateData.color !== undefined) {
          validateHexColor(updateData.color, 'color', false);
        }
        if (updateData.lane_id !== undefined) {
          validateInteger(updateData.lane_id, 'lane_id', false);
        }
        if (updateData.position !== undefined) {
          validateInteger(updateData.position, 'position', false);
        }
        if (updateData.linked_board_id !== undefined && updateData.linked_board_id !== null) {
          validateInteger(updateData.linked_board_id, 'linked_board_id', false);
        }

        if (Object.keys(updateData).length === 0) {
          throw new ValidationError('At least one field must be provided to update (name, color, lane_id, position, or linked_board_id)');
        }

        const card = await apiCall<Card>(`/boards/${board_id}/cards/${card_id}`, {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(card, null, 2) }],
        };
      }

      case 'delete_card': {
        const { board_id, card_id } = args as { board_id: number; card_id: number };
        validateInteger(board_id, 'board_id', true);
        validateInteger(card_id, 'card_id', true);

        const result = await apiCall<{ success: boolean }>(`/boards/${board_id}/cards/${card_id}`, {
          method: 'DELETE',
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'move_card': {
        const { board_id, card_id, target_lane_id, new_position } = args as {
          board_id: number; card_id: number; target_lane_id: number; new_position: number;
        };
        validateInteger(board_id, 'board_id', true);
        validateInteger(card_id, 'card_id', true);
        validateInteger(target_lane_id, 'target_lane_id', true);
        validateInteger(new_position, 'new_position', true);

        const card = await apiCall<Card>(`/boards/${board_id}/cards/move`, {
          method: 'POST',
          body: JSON.stringify({ cardId: card_id, targetLaneId: target_lane_id, newPosition: new_position }),
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(card, null, 2) }],
        };
      }

      // ── Link operations ────────────────────────────────────────

      case 'link_card_to_board': {
        const { board_id, card_id, target_board_id } = args as {
          board_id: number; card_id: number; target_board_id: number;
        };
        validateInteger(board_id, 'board_id', true);
        validateInteger(card_id, 'card_id', true);
        validateInteger(target_board_id, 'target_board_id', true);

        const card = await apiCall<Card>(`/boards/${board_id}/cards/${card_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ linked_board_id: target_board_id }),
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(card, null, 2) }],
        };
      }

      case 'unlink_card_from_board': {
        const { board_id, card_id } = args as { board_id: number; card_id: number };
        validateInteger(board_id, 'board_id', true);
        validateInteger(card_id, 'card_id', true);

        const card = await apiCall<Card>(`/boards/${board_id}/cards/${card_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ linked_board_id: null }),
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(card, null, 2) }],
        };
      }

      // ── Convenience operations ──────────────────────────────────

      case 'get_board_summary': {
        const { board_id } = args as { board_id: number };
        validateInteger(board_id, 'board_id', true);

        const board = await apiCall<BoardWithLanes>(`/boards/${board_id}`);

        const totalCards = board.lanes.reduce((sum, lane) => sum + lane.cards.length, 0);
        const summary = [
          `Board: ${board.name}`,
          board.description ? `Description: ${board.description}` : null,
          `===================`,
          `Total Lanes: ${board.lanes.length}`,
          `Total Cards: ${totalCards}`,
          ``,
          `Lanes:`,
        ].filter(Boolean);

        for (const lane of board.lanes) {
          const count = lane.cards.length;
          summary.push(`  • ${lane.name}: ${count} card${count !== 1 ? 's' : ''}`);
          for (const card of lane.cards) {
            summary.push(`    - ${card.name}`);
          }
        }

        return {
          content: [{ type: 'text', text: summary.join('\n') }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Kanban MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
