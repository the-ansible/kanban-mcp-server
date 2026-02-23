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
interface Lane {
  id: number;
  name: string;
  color: string;
  position: number;
  created_at?: string;
}

interface CreateLaneInput {
  name: string;
  color?: string;
  position: number;
}

interface UpdateLaneInput {
  name?: string;
  color?: string;
  position?: number;
}

interface Card {
  id: number;
  lane_id: number;
  name: string;
  color: string;
  position: number;
  created_at?: string;
}

interface CreateCardInput {
  lane_id: number;
  name: string;
  color?: string;
  position: number;
}

interface UpdateCardInput {
  lane_id?: number;
  name?: string;
  color?: string;
  position?: number;
}

interface MoveCardInput {
  cardId: number;
  targetLaneId: number;
  newPosition: number;
}

interface LaneWithCards extends Lane {
  cards: Card[];
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
    // Check if it's a connection error
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
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define MCP tools
const tools: Tool[] = [
  {
    name: 'list_lanes',
    description: 'Get all lanes from the Kanban board, ordered by position',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'create_lane',
    description: 'Create a new lane on the Kanban board',
    inputSchema: {
      type: 'object',
      properties: {
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
      required: ['name', 'position'],
    },
  },
  {
    name: 'update_lane',
    description: 'Update properties of an existing lane',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
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
      required: ['id'],
    },
  },
  {
    name: 'delete_lane',
    description: 'Delete a lane by ID. WARNING: This will also delete all cards in the lane (CASCADE delete).',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'The ID of the lane to delete',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_cards',
    description: 'Get all cards from the Kanban board, optionally filtered by lane_id. Returns cards ordered by position.',
    inputSchema: {
      type: 'object',
      properties: {
        lane_id: {
          type: 'number',
          description: 'Optional lane ID to filter cards. If not provided, returns all cards.',
        },
      },
      required: [],
    },
  },
  {
    name: 'create_card',
    description: 'Create a new card in a lane on the Kanban board',
    inputSchema: {
      type: 'object',
      properties: {
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
      },
      required: ['lane_id', 'name', 'position'],
    },
  },
  {
    name: 'update_card',
    description: 'Update properties of an existing card',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
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
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_card',
    description: 'Delete a card by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'The ID of the card to delete',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'move_card',
    description: 'Move a card to a different lane and/or position. This is the recommended way to move cards between lanes.',
    inputSchema: {
      type: 'object',
      properties: {
        cardId: {
          type: 'number',
          description: 'The ID of the card to move',
        },
        targetLaneId: {
          type: 'number',
          description: 'The ID of the target lane',
        },
        newPosition: {
          type: 'number',
          description: 'The new position in the target lane (0-based index)',
        },
      },
      required: ['cardId', 'targetLaneId', 'newPosition'],
    },
  },
  {
    name: 'get_board',
    description: 'Get the complete Kanban board state with all lanes and their cards nested. This provides a full snapshot of the board in a single call.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_board_summary',
    description: 'Get a compact text summary of the Kanban board showing lanes and card counts. Useful for quick board overview.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
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
      case 'list_lanes': {
        const lanes = await apiCall<Lane[]>('/lanes');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(lanes, null, 2),
            },
          ],
        };
      }

      case 'create_lane': {
        const input = args as unknown as CreateLaneInput;
        validateString(input.name, 'name', true);
        validateInteger(input.position, 'position', true);
        if (input.color !== undefined) {
          validateHexColor(input.color, 'color', false);
        }

        const lane = await apiCall<Lane>('/lanes', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(lane, null, 2),
            },
          ],
        };
      }

      case 'update_lane': {
        const { id, ...updateData } = args as unknown as UpdateLaneInput & { id: number };
        validateInteger(id, 'id', true);

        // Validate optional update fields
        if (updateData.name !== undefined) {
          validateString(updateData.name, 'name', false);
        }
        if (updateData.color !== undefined) {
          validateHexColor(updateData.color, 'color', false);
        }
        if (updateData.position !== undefined) {
          validateInteger(updateData.position, 'position', false);
        }

        // Ensure at least one field is being updated
        if (Object.keys(updateData).length === 0) {
          throw new ValidationError(
            'At least one field must be provided to update (name, color, or position)'
          );
        }

        const lane = await apiCall<Lane>(`/lanes/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(lane, null, 2),
            },
          ],
        };
      }

      case 'delete_lane': {
        const { id } = args as unknown as { id: number };
        validateInteger(id, 'id', true);

        const result = await apiCall<{ success: boolean }>(`/lanes/${id}`, {
          method: 'DELETE',
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'list_cards': {
        const { lane_id } = args as unknown as { lane_id?: number };
        if (lane_id !== undefined) {
          validateInteger(lane_id, 'lane_id', false);
        }

        const endpoint = lane_id ? `/cards?lane_id=${lane_id}` : '/cards';
        const cards = await apiCall<Card[]>(endpoint);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(cards, null, 2),
            },
          ],
        };
      }

      case 'create_card': {
        const input = args as unknown as CreateCardInput;
        validateInteger(input.lane_id, 'lane_id', true);
        validateString(input.name, 'name', true);
        validateInteger(input.position, 'position', true);
        if (input.color !== undefined) {
          validateHexColor(input.color, 'color', false);
        }

        const card = await apiCall<Card>('/cards', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }

      case 'update_card': {
        const { id, ...updateData } = args as unknown as UpdateCardInput & { id: number };
        validateInteger(id, 'id', true);

        // Validate optional update fields
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

        // Ensure at least one field is being updated
        if (Object.keys(updateData).length === 0) {
          throw new ValidationError(
            'At least one field must be provided to update (name, color, lane_id, or position)'
          );
        }

        const card = await apiCall<Card>(`/cards/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(updateData),
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }

      case 'delete_card': {
        const { id } = args as unknown as { id: number };
        validateInteger(id, 'id', true);

        const result = await apiCall<{ success: boolean }>(`/cards/${id}`, {
          method: 'DELETE',
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'move_card': {
        const input = args as unknown as MoveCardInput;
        validateInteger(input.cardId, 'cardId', true);
        validateInteger(input.targetLaneId, 'targetLaneId', true);
        validateInteger(input.newPosition, 'newPosition', true);

        const card = await apiCall<Card>('/cards/move', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(card, null, 2),
            },
          ],
        };
      }

      case 'get_board': {
        // Fetch lanes and all cards in parallel
        const [lanes, cards] = await Promise.all([
          apiCall<Lane[]>('/lanes'),
          apiCall<Card[]>('/cards'),
        ]);

        // Nest cards within their lanes
        const lanesWithCards: LaneWithCards[] = lanes.map(lane => ({
          ...lane,
          cards: cards
            .filter(card => card.lane_id === lane.id)
            .sort((a, b) => a.position - b.position),
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(lanesWithCards, null, 2),
            },
          ],
        };
      }

      case 'get_board_summary': {
        // Fetch lanes and all cards in parallel
        const [lanes, cards] = await Promise.all([
          apiCall<Lane[]>('/lanes'),
          apiCall<Card[]>('/cards'),
        ]);

        // Count cards per lane
        const cardCounts = new Map<number, number>();
        for (const card of cards) {
          cardCounts.set(card.lane_id, (cardCounts.get(card.lane_id) || 0) + 1);
        }

        // Build text summary
        const totalCards = cards.length;
        const summary = [
          `Kanban Board Summary`,
          `===================`,
          `Total Lanes: ${lanes.length}`,
          `Total Cards: ${totalCards}`,
          ``,
          `Lanes:`,
        ];

        for (const lane of lanes) {
          const count = cardCounts.get(lane.id) || 0;
          summary.push(`  • ${lane.name}: ${count} card${count !== 1 ? 's' : ''}`);
        }

        return {
          content: [
            {
              type: 'text',
              text: summary.join('\n'),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
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
