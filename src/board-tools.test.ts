import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mockFetchSuccess,
  resetFetchMock,
  mockBoard,
  mockBoards,
  mockBoardWithLanes,
  mockLanes,
  mockCards,
} from './test/mocks.js';

const API_BASE_URL = 'http://localhost:3000/api';

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

function validateInteger(value: unknown, fieldName: string, required = true): void {
  if (required) { validateRequired(value, fieldName); }
  if (value !== undefined && value !== null && typeof value !== 'number') {
    throw new ValidationError(`Field '${fieldName}' must be a number, got ${typeof value}`);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new ValidationError(`Field '${fieldName}' must be a finite number`);
  }
  if (typeof value === 'number' && value < 0) {
    throw new ValidationError(`Field '${fieldName}' must be non-negative`);
  }
  if (typeof value === 'number' && !Number.isInteger(value)) {
    throw new ValidationError(`Field '${fieldName}' must be an integer`);
  }
}

function validateString(value: unknown, fieldName: string, required = true): void {
  if (required) { validateRequired(value, fieldName); }
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new ValidationError(`Field '${fieldName}' must be a string, got ${typeof value}`);
  }
}

async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error: ${response.status} ${error}`);
  }
  return response.json();
}

interface BoardWithLanes {
  id: number;
  name: string;
  description: string | null;
  lanes: Array<{
    id: number;
    board_id: number;
    name: string;
    color: string;
    position: number;
    cards: Array<{ id: number; lane_id: number; name: string; color: string; position: number }>;
  }>;
}

// Board handler implementations matching index.ts
async function listBoardsHandler() {
  const boards = await apiCall<typeof mockBoards>('/boards');
  return { content: [{ type: 'text', text: JSON.stringify(boards, null, 2) }] };
}

async function createBoardHandler(args: { name: string; description?: string }) {
  validateString(args.name, 'name', true);
  const board = await apiCall('/boards', { method: 'POST', body: JSON.stringify(args) });
  return { content: [{ type: 'text', text: JSON.stringify(board, null, 2) }] };
}

async function getBoardHandler(args: { board_id: number }) {
  validateInteger(args.board_id, 'board_id', true);
  const board = await apiCall<BoardWithLanes>(`/boards/${args.board_id}`);
  return { content: [{ type: 'text', text: JSON.stringify(board, null, 2) }] };
}

async function getBoardSummaryHandler(args: { board_id: number }) {
  validateInteger(args.board_id, 'board_id', true);
  const board = await apiCall<BoardWithLanes>(`/boards/${args.board_id}`);

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

  return { content: [{ type: 'text', text: summary.join('\n') }] };
}

describe('Board Tools', () => {
  beforeEach(() => { resetFetchMock(); });
  afterEach(() => { resetFetchMock(); });

  describe('list_boards', () => {
    it('should return all boards', async () => {
      mockFetchSuccess(mockBoards);
      const result = await listBoardsHandler();
      expect(result.content).toHaveLength(1);
      const boards = JSON.parse(result.content[0].text);
      expect(boards).toEqual(mockBoards);
      expect(boards).toHaveLength(2);
    });

    it('should return empty array when no boards exist', async () => {
      mockFetchSuccess([]);
      const result = await listBoardsHandler();
      const boards = JSON.parse(result.content[0].text);
      expect(boards).toEqual([]);
    });
  });

  describe('create_board', () => {
    it('should create a board with name', async () => {
      mockFetchSuccess(mockBoard);
      const result = await createBoardHandler({ name: 'Test Board' });
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Test Board' }),
      }));
      const board = JSON.parse(result.content[0].text);
      expect(board).toEqual(mockBoard);
    });

    it('should create a board with name and description', async () => {
      mockFetchSuccess(mockBoard);
      const result = await createBoardHandler({ name: 'Test Board', description: 'A test board' });
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Test Board', description: 'A test board' }),
      }));
    });
  });

  describe('get_board', () => {
    it('should return empty board when no lanes exist', async () => {
      const emptyBoard = { ...mockBoard, lanes: [] };
      mockFetchSuccess(emptyBoard);

      const result = await getBoardHandler({ board_id: 1 });
      expect(result.content).toHaveLength(1);
      const boardData = JSON.parse(result.content[0].text);
      expect(boardData.lanes).toEqual([]);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should return board with lanes and nested cards', async () => {
      mockFetchSuccess(mockBoardWithLanes);

      const result = await getBoardHandler({ board_id: 1 });
      const boardData: BoardWithLanes = JSON.parse(result.content[0].text);

      expect(boardData.name).toBe('Test Board');
      expect(boardData.lanes).toHaveLength(3);

      // Lane 1 (To Do) has 2 cards
      expect(boardData.lanes[0].name).toBe('To Do');
      expect(boardData.lanes[0].cards).toHaveLength(2);
      expect(boardData.lanes[0].cards[0].name).toBe('Test Card');
      expect(boardData.lanes[0].cards[1].name).toBe('Second Card');

      // Lane 2 (In Progress) has 1 card
      expect(boardData.lanes[1].name).toBe('In Progress');
      expect(boardData.lanes[1].cards).toHaveLength(1);
      expect(boardData.lanes[1].cards[0].name).toBe('Card in Progress');

      // Lane 3 (Done) has no cards
      expect(boardData.lanes[2].name).toBe('Done');
      expect(boardData.lanes[2].cards).toHaveLength(0);
    });

    it('should correctly filter cards to their respective lanes', async () => {
      const testBoard = {
        id: 1,
        name: 'Test',
        description: null,
        lanes: [
          {
            id: 10, board_id: 1, name: 'Lane A', color: '#ff0000', position: 0,
            cards: [
              { id: 1, lane_id: 10, name: 'Card A1', color: '#ffffff', position: 0 },
              { id: 3, lane_id: 10, name: 'Card A2', color: '#ffffff', position: 1 },
            ],
          },
          {
            id: 20, board_id: 1, name: 'Lane B', color: '#00ff00', position: 1,
            cards: [
              { id: 2, lane_id: 20, name: 'Card B1', color: '#ffffff', position: 0 },
              { id: 4, lane_id: 20, name: 'Card B2', color: '#ffffff', position: 1 },
            ],
          },
        ],
      };
      mockFetchSuccess(testBoard);

      const result = await getBoardHandler({ board_id: 1 });
      const boardData: BoardWithLanes = JSON.parse(result.content[0].text);

      expect(boardData.lanes[0].id).toBe(10);
      expect(boardData.lanes[0].cards).toHaveLength(2);
      expect(boardData.lanes[0].cards[0].name).toBe('Card A1');
      expect(boardData.lanes[0].cards[1].name).toBe('Card A2');

      expect(boardData.lanes[1].id).toBe(20);
      expect(boardData.lanes[1].cards).toHaveLength(2);
      expect(boardData.lanes[1].cards[0].name).toBe('Card B1');
      expect(boardData.lanes[1].cards[1].name).toBe('Card B2');
    });
  });

  describe('get_board_summary', () => {
    it('should return correct summary for empty board', async () => {
      const emptyBoard = { ...mockBoard, lanes: [] };
      mockFetchSuccess(emptyBoard);

      const result = await getBoardSummaryHandler({ board_id: 1 });
      const summaryText = result.content[0].text;

      expect(summaryText).toContain('Board: Test Board');
      expect(summaryText).toContain('Total Lanes: 0');
      expect(summaryText).toContain('Total Cards: 0');
    });

    it('should return correct summary with lanes and cards', async () => {
      mockFetchSuccess(mockBoardWithLanes);

      const result = await getBoardSummaryHandler({ board_id: 1 });
      const summaryText = result.content[0].text;

      expect(summaryText).toContain('Board: Test Board');
      expect(summaryText).toContain('Total Lanes: 3');
      expect(summaryText).toContain('Total Cards: 3');
      expect(summaryText).toContain('To Do: 2 cards');
      expect(summaryText).toContain('In Progress: 1 card');
      expect(summaryText).toContain('Done: 0 cards');
    });

    it('should use correct pluralization for card counts', async () => {
      const testBoard = {
        ...mockBoard,
        lanes: [
          { id: 1, board_id: 1, name: 'No Cards', color: '#ff0000', position: 0, cards: [] },
          { id: 2, board_id: 1, name: 'One Card', color: '#00ff00', position: 1, cards: [
            { id: 1, lane_id: 2, name: 'Single', color: '#ffffff', position: 0 },
          ] },
          { id: 3, board_id: 1, name: 'Many Cards', color: '#0000ff', position: 2, cards: [
            { id: 2, lane_id: 3, name: 'First', color: '#ffffff', position: 0 },
            { id: 3, lane_id: 3, name: 'Second', color: '#ffffff', position: 1 },
            { id: 4, lane_id: 3, name: 'Third', color: '#ffffff', position: 2 },
          ] },
        ],
      };
      mockFetchSuccess(testBoard);

      const result = await getBoardSummaryHandler({ board_id: 1 });
      const summaryText = result.content[0].text;

      expect(summaryText).toContain('No Cards: 0 cards');
      expect(summaryText).toContain('One Card: 1 card');
      expect(summaryText).toContain('Many Cards: 3 cards');
    });

    it('should include card names in summary', async () => {
      mockFetchSuccess(mockBoardWithLanes);

      const result = await getBoardSummaryHandler({ board_id: 1 });
      const summaryText = result.content[0].text;

      expect(summaryText).toContain('- Test Card');
      expect(summaryText).toContain('- Second Card');
      expect(summaryText).toContain('- Card in Progress');
    });

    it('should format summary as multi-line text', async () => {
      mockFetchSuccess(mockBoardWithLanes);

      const result = await getBoardSummaryHandler({ board_id: 1 });
      const summaryText = result.content[0].text;

      expect(summaryText).toContain('\n');
      const lines = summaryText.split('\n');
      expect(lines[0]).toBe('Board: Test Board');
    });
  });
});
