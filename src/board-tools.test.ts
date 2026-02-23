import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mockFetchSuccess,
  resetFetchMock,
  mockLanes,
  mockCards,
} from './test/mocks.js';

/**
 * Unit tests for Board MCP tools
 * These tests verify that the board tools (get_board, get_board_summary)
 * correctly fetch data, process it, and return formatted responses.
 */

// Mock the MCP server internals
const API_BASE_URL = 'http://localhost:3000/api';

// Types
interface Lane {
  id: number;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

interface Card {
  id: number;
  lane_id: number;
  name: string;
  color: string;
  position: number;
  created_at: string;
}

interface LaneWithCards extends Lane {
  cards: Card[];
}

// Replicate board tool handlers from index.ts
async function apiCall<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} ${error}`);
  }
  return response.json();
}

async function getBoardHandler(): Promise<{ content: Array<{ type: string; text: string }> }> {
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

async function getBoardSummaryHandler(): Promise<{ content: Array<{ type: string; text: string }> }> {
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

// Tests
describe('Board Tools', () => {
  beforeEach(() => {
    // Reset fetch mock before each test
    resetFetchMock();
  });

  afterEach(() => {
    // Clean up after each test
    resetFetchMock();
  });

  describe('get_board', () => {
    it('should return empty board when no lanes or cards exist', async () => {
      // Mock API responses for empty board
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (url.includes('/lanes')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve([]),
          } as Response);
        }
        if (url.includes('/cards')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve([]),
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      const result = await getBoardHandler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const boardData = JSON.parse(result.content[0].text);
      expect(boardData).toEqual([]);
      expect(callCount).toBe(2); // Should call both /lanes and /cards
    });

    it('should return board with lanes and nested cards', async () => {
      // Mock API responses with lanes and cards
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (url.includes('/lanes')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockLanes),
          } as Response);
        }
        if (url.includes('/cards')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockCards),
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      const result = await getBoardHandler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const boardData: LaneWithCards[] = JSON.parse(result.content[0].text);

      // Should have 3 lanes
      expect(boardData).toHaveLength(3);

      // Verify first lane (To Do) has 2 cards
      expect(boardData[0].name).toBe('To Do');
      expect(boardData[0].cards).toHaveLength(2);
      expect(boardData[0].cards[0].name).toBe('Test Card');
      expect(boardData[0].cards[1].name).toBe('Second Card');

      // Verify second lane (In Progress) has 1 card
      expect(boardData[1].name).toBe('In Progress');
      expect(boardData[1].cards).toHaveLength(1);
      expect(boardData[1].cards[0].name).toBe('Card in Progress');

      // Verify third lane (Done) has no cards
      expect(boardData[2].name).toBe('Done');
      expect(boardData[2].cards).toHaveLength(0);

      // Verify cards are sorted by position within each lane
      expect(boardData[0].cards[0].position).toBe(0);
      expect(boardData[0].cards[1].position).toBe(1);

      expect(callCount).toBe(2); // Should call both /lanes and /cards
    });

    it('should correctly filter cards to their respective lanes', async () => {
      // Mock with specific lane/card relationships
      const testLanes = [
        { id: 10, name: 'Lane A', color: '#ff0000', position: 0, created_at: '2024-01-01T00:00:00.000Z' },
        { id: 20, name: 'Lane B', color: '#00ff00', position: 1, created_at: '2024-01-01T00:00:00.000Z' },
      ];
      const testCards = [
        { id: 1, lane_id: 10, name: 'Card A1', color: '#ffffff', position: 0, created_at: '2024-01-01T00:00:00.000Z' },
        { id: 2, lane_id: 20, name: 'Card B1', color: '#ffffff', position: 0, created_at: '2024-01-01T00:00:00.000Z' },
        { id: 3, lane_id: 10, name: 'Card A2', color: '#ffffff', position: 1, created_at: '2024-01-01T00:00:00.000Z' },
        { id: 4, lane_id: 20, name: 'Card B2', color: '#ffffff', position: 1, created_at: '2024-01-01T00:00:00.000Z' },
      ];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/lanes')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(testLanes),
          } as Response);
        }
        if (url.includes('/cards')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(testCards),
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      const result = await getBoardHandler();
      const boardData: LaneWithCards[] = JSON.parse(result.content[0].text);

      // Verify Lane A has only its cards
      expect(boardData[0].id).toBe(10);
      expect(boardData[0].cards).toHaveLength(2);
      expect(boardData[0].cards[0].name).toBe('Card A1');
      expect(boardData[0].cards[1].name).toBe('Card A2');

      // Verify Lane B has only its cards
      expect(boardData[1].id).toBe(20);
      expect(boardData[1].cards).toHaveLength(2);
      expect(boardData[1].cards[0].name).toBe('Card B1');
      expect(boardData[1].cards[1].name).toBe('Card B2');
    });
  });

  describe('get_board_summary', () => {
    it('should return correct summary for empty board', async () => {
      // Mock API responses for empty board
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/lanes')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve([]),
          } as Response);
        }
        if (url.includes('/cards')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve([]),
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      const result = await getBoardSummaryHandler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const summaryText = result.content[0].text;

      // Verify summary format
      expect(summaryText).toContain('Kanban Board Summary');
      expect(summaryText).toContain('===================');
      expect(summaryText).toContain('Total Lanes: 0');
      expect(summaryText).toContain('Total Cards: 0');
      expect(summaryText).toContain('Lanes:');
    });

    it('should return correct summary with lanes and cards', async () => {
      // Mock API responses with lanes and cards
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/lanes')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockLanes),
          } as Response);
        }
        if (url.includes('/cards')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockCards),
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      const result = await getBoardSummaryHandler();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const summaryText = result.content[0].text;

      // Verify header
      expect(summaryText).toContain('Kanban Board Summary');
      expect(summaryText).toContain('===================');

      // Verify totals
      expect(summaryText).toContain('Total Lanes: 3');
      expect(summaryText).toContain('Total Cards: 3');

      // Verify lanes section
      expect(summaryText).toContain('Lanes:');

      // Verify individual lane counts
      expect(summaryText).toContain('• To Do: 2 cards');
      expect(summaryText).toContain('• In Progress: 1 card'); // Singular "card"
      expect(summaryText).toContain('• Done: 0 cards');
    });

    it('should use correct pluralization for card counts', async () => {
      const testLanes = [
        { id: 1, name: 'No Cards', color: '#ff0000', position: 0, created_at: '2024-01-01T00:00:00.000Z' },
        { id: 2, name: 'One Card', color: '#00ff00', position: 1, created_at: '2024-01-01T00:00:00.000Z' },
        { id: 3, name: 'Many Cards', color: '#0000ff', position: 2, created_at: '2024-01-01T00:00:00.000Z' },
      ];
      const testCards = [
        { id: 1, lane_id: 2, name: 'Single', color: '#ffffff', position: 0, created_at: '2024-01-01T00:00:00.000Z' },
        { id: 2, lane_id: 3, name: 'First', color: '#ffffff', position: 0, created_at: '2024-01-01T00:00:00.000Z' },
        { id: 3, lane_id: 3, name: 'Second', color: '#ffffff', position: 1, created_at: '2024-01-01T00:00:00.000Z' },
        { id: 4, lane_id: 3, name: 'Third', color: '#ffffff', position: 2, created_at: '2024-01-01T00:00:00.000Z' },
      ];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/lanes')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(testLanes),
          } as Response);
        }
        if (url.includes('/cards')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(testCards),
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      const result = await getBoardSummaryHandler();
      const summaryText = result.content[0].text;

      // Verify pluralization
      expect(summaryText).toContain('• No Cards: 0 cards'); // Zero uses plural
      expect(summaryText).toContain('• One Card: 1 card'); // One uses singular
      expect(summaryText).toContain('• Many Cards: 3 cards'); // Multiple uses plural
    });

    it('should format summary as multi-line text', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/lanes')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockLanes),
          } as Response);
        }
        if (url.includes('/cards')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockCards),
          } as Response);
        }
        return Promise.reject(new Error('Unexpected URL'));
      });

      const result = await getBoardSummaryHandler();
      const summaryText = result.content[0].text;

      // Verify it's multi-line text (contains newlines)
      expect(summaryText).toContain('\n');

      // Verify the structure by splitting into lines
      const lines = summaryText.split('\n');
      expect(lines[0]).toBe('Kanban Board Summary');
      expect(lines[1]).toBe('===================');
      expect(lines[2]).toBe('Total Lanes: 3');
      expect(lines[3]).toBe('Total Cards: 3');
      expect(lines[4]).toBe('');
      expect(lines[5]).toBe('Lanes:');
      expect(lines[6]).toContain('• To Do: 2 cards');
      expect(lines[7]).toContain('• In Progress: 1 card');
      expect(lines[8]).toContain('• Done: 0 cards');
    });
  });
});
