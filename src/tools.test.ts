import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mockFetchSuccess,
  mockFetchError,
  mockFetchConnectionError,
  resetFetchMock,
  mockLane,
  mockLanes,
  mockCard,
  mockCards,
  mockBoard,
  mockBoards,
} from './test/mocks.js';

const API_BASE_URL = 'http://localhost:3000/api';

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

describe('API Helper', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { resetFetchMock(); });

  describe('apiCall', () => {
    it('should make successful GET request', async () => {
      mockFetchSuccess(mockBoards);
      const result = await apiCall('/boards');
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/boards',
        expect.objectContaining({ headers: { 'Content-Type': 'application/json' } })
      );
      expect(result).toEqual(mockBoards);
    });

    it('should make successful POST request', async () => {
      const newBoard = { name: 'New Board' };
      mockFetchSuccess(mockBoard);
      const result = await apiCall('/boards', { method: 'POST', body: JSON.stringify(newBoard) });
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/boards',
        expect.objectContaining({ method: 'POST', body: JSON.stringify(newBoard), headers: { 'Content-Type': 'application/json' } })
      );
      expect(result).toEqual(mockBoard);
    });

    it('should handle 404 error', async () => {
      mockFetchError(404, 'Board not found');
      await expect(apiCall('/boards/999')).rejects.toThrow('API call failed (404)');
    });

    it('should handle 500 error', async () => {
      mockFetchError(500, 'Internal server error');
      await expect(apiCall('/boards')).rejects.toThrow('API call failed (500)');
    });

    it('should handle connection errors', async () => {
      mockFetchConnectionError();
      await expect(apiCall('/boards')).rejects.toThrow('Cannot connect to Kanban API');
      await expect(apiCall('/boards')).rejects.toThrow('ensure the Kanban server is running');
    });
  });
});

describe('Board Tools', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { resetFetchMock(); });

  describe('list_boards', () => {
    it('should fetch all boards', async () => {
      mockFetchSuccess(mockBoards);
      const boards = await apiCall<typeof mockBoards>('/boards');
      expect(boards).toEqual(mockBoards);
      expect(boards).toHaveLength(2);
    });

    it('should return empty array when no boards exist', async () => {
      mockFetchSuccess([]);
      const boards = await apiCall<typeof mockBoards>('/boards');
      expect(boards).toEqual([]);
    });
  });

  describe('create_board', () => {
    it('should create a board', async () => {
      const input = { name: 'New Board', description: 'A new board' };
      mockFetchSuccess(mockBoard);
      const board = await apiCall('/boards', { method: 'POST', body: JSON.stringify(input) });
      expect(board).toEqual(mockBoard);
    });
  });

  describe('get_board', () => {
    it('should fetch a board with nested lanes and cards', async () => {
      const boardWithLanes = {
        ...mockBoard,
        lanes: mockLanes.map(lane => ({
          ...lane,
          cards: mockCards.filter(card => card.lane_id === lane.id).sort((a, b) => a.position - b.position),
        })),
      };
      mockFetchSuccess(boardWithLanes);
      const board = await apiCall(`/boards/${mockBoard.id}`);
      expect(board).toEqual(boardWithLanes);
    });
  });

  describe('delete_board', () => {
    it('should delete a board by ID', async () => {
      mockFetchSuccess({ success: true });
      const result = await apiCall<{ success: boolean }>(`/boards/${mockBoard.id}`, { method: 'DELETE' });
      expect(result).toEqual({ success: true });
    });
  });
});

describe('Lane Tools (board-scoped)', () => {
  const boardId = 1;
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { resetFetchMock(); });

  describe('list_lanes', () => {
    it('should fetch all lanes for a board', async () => {
      mockFetchSuccess(mockLanes);
      const lanes = await apiCall<typeof mockLanes>(`/boards/${boardId}/lanes`);
      expect(fetch).toHaveBeenCalledWith(`http://localhost:3000/api/boards/${boardId}/lanes`, expect.any(Object));
      expect(lanes).toEqual(mockLanes);
    });
  });

  describe('create_lane', () => {
    it('should create a lane on a board', async () => {
      const input = { name: 'To Do', color: '#3b82f6', position: 0 };
      mockFetchSuccess(mockLane);
      const lane = await apiCall(`/boards/${boardId}/lanes`, { method: 'POST', body: JSON.stringify(input) });
      expect(lane).toEqual(mockLane);
    });
  });

  describe('update_lane', () => {
    it('should update lane name', async () => {
      const updateData = { name: 'Updated Name' };
      mockFetchSuccess({ ...mockLane, name: 'Updated Name' });
      const lane = await apiCall(`/boards/${boardId}/lanes/${mockLane.id}`, { method: 'PATCH', body: JSON.stringify(updateData) });
      expect(lane).toMatchObject(updateData);
    });
  });

  describe('delete_lane', () => {
    it('should delete a lane by ID', async () => {
      mockFetchSuccess({ success: true });
      const result = await apiCall<{ success: boolean }>(`/boards/${boardId}/lanes/${mockLane.id}`, { method: 'DELETE' });
      expect(result).toEqual({ success: true });
    });
  });
});

describe('Card Tools (board-scoped)', () => {
  const boardId = 1;
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { resetFetchMock(); });

  describe('list_cards', () => {
    it('should fetch all cards for a board', async () => {
      mockFetchSuccess(mockCards);
      const cards = await apiCall<typeof mockCards>(`/boards/${boardId}/cards`);
      expect(cards).toEqual(mockCards);
    });

    it('should fetch cards filtered by lane_id', async () => {
      const laneCards = mockCards.filter(c => c.lane_id === 1);
      mockFetchSuccess(laneCards);
      const cards = await apiCall<typeof mockCards>(`/boards/${boardId}/cards?lane_id=1`);
      expect(cards).toEqual(laneCards);
    });
  });

  describe('create_card', () => {
    it('should create a card', async () => {
      const input = { lane_id: 1, name: 'Test Card', color: '#ffffff', position: 0 };
      mockFetchSuccess(mockCard);
      const card = await apiCall(`/boards/${boardId}/cards`, { method: 'POST', body: JSON.stringify(input) });
      expect(card).toEqual(mockCard);
    });
  });

  describe('move_card', () => {
    it('should move a card', async () => {
      const moveInput = { cardId: 1, targetLaneId: 2, newPosition: 0 };
      const movedCard = { ...mockCard, lane_id: 2, position: 0 };
      mockFetchSuccess(movedCard);
      const card = await apiCall(`/boards/${boardId}/cards/move`, { method: 'POST', body: JSON.stringify(moveInput) });
      expect(card).toEqual(movedCard);
    });
  });
});
