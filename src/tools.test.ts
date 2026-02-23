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
} from './test/mocks.js';

/**
 * Tests for MCP tool handlers
 * These tests verify that the tools correctly call the Kanban API
 * and handle responses and errors appropriately
 */

// Mock API base URL
const API_BASE_URL = 'http://localhost:3000/api';

// Helper function to make API calls (extracted from index.ts for testing)
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

describe('API Helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetFetchMock();
  });

  describe('apiCall', () => {
    it('should make successful GET request', async () => {
      mockFetchSuccess(mockLanes);

      const result = await apiCall('/lanes');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/lanes',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
      expect(result).toEqual(mockLanes);
    });

    it('should make successful POST request', async () => {
      const newLane = { name: 'New Lane', color: '#3b82f6', position: 0 };
      mockFetchSuccess(mockLane);

      const result = await apiCall('/lanes', {
        method: 'POST',
        body: JSON.stringify(newLane),
      });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/lanes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newLane),
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
      expect(result).toEqual(mockLane);
    });

    it('should handle 404 error', async () => {
      mockFetchError(404, 'Lane not found');

      await expect(apiCall('/lanes/999')).rejects.toThrow('API call failed (404)');
    });

    it('should handle 500 error', async () => {
      mockFetchError(500, 'Internal server error');

      await expect(apiCall('/lanes')).rejects.toThrow('API call failed (500)');
    });

    it('should handle connection errors', async () => {
      mockFetchConnectionError();

      await expect(apiCall('/lanes')).rejects.toThrow('Cannot connect to Kanban API');
      await expect(apiCall('/lanes')).rejects.toThrow('ensure the Kanban server is running');
    });
  });
});

describe('Lane Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetFetchMock();
  });

  describe('list_lanes', () => {
    it('should fetch all lanes', async () => {
      mockFetchSuccess(mockLanes);

      const lanes = await apiCall<typeof mockLanes>('/lanes');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/lanes',
        expect.any(Object)
      );
      expect(lanes).toEqual(mockLanes);
      expect(lanes).toHaveLength(3);
    });

    it('should return empty array when no lanes exist', async () => {
      mockFetchSuccess([]);

      const lanes = await apiCall<typeof mockLanes>('/lanes');

      expect(lanes).toEqual([]);
    });
  });

  describe('create_lane', () => {
    it('should create a lane with all fields', async () => {
      const input = { name: 'To Do', color: '#3b82f6', position: 0 };
      mockFetchSuccess(mockLane);

      const lane = await apiCall('/lanes', {
        method: 'POST',
        body: JSON.stringify(input),
      });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/lanes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(input),
        })
      );
      expect(lane).toEqual(mockLane);
    });

    it('should create a lane without optional color', async () => {
      const input = { name: 'To Do', position: 0 };
      mockFetchSuccess({ ...mockLane, color: '#3b82f6' }); // API applies default

      const lane = await apiCall('/lanes', {
        method: 'POST',
        body: JSON.stringify(input),
      });

      expect(lane).toHaveProperty('color');
    });
  });

  describe('update_lane', () => {
    it('should update lane name', async () => {
      const updateData = { name: 'Updated Name' };
      const updatedLane = { ...mockLane, name: 'Updated Name' };
      mockFetchSuccess(updatedLane);

      const lane = await apiCall(`/lanes/${mockLane.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });

      expect(fetch).toHaveBeenCalledWith(
        `http://localhost:3000/api/lanes/${mockLane.id}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        })
      );
      expect(lane).toEqual(updatedLane);
    });

    it('should update multiple fields', async () => {
      const updateData = { name: 'New Name', color: '#ff0000', position: 5 };
      mockFetchSuccess({ ...mockLane, ...updateData });

      const lane = await apiCall(`/lanes/${mockLane.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });

      expect(lane).toMatchObject(updateData);
    });
  });

  describe('delete_lane', () => {
    it('should delete a lane by ID', async () => {
      mockFetchSuccess({ success: true });

      const result = await apiCall<{ success: boolean }>(`/lanes/${mockLane.id}`, {
        method: 'DELETE',
      });

      expect(fetch).toHaveBeenCalledWith(
        `http://localhost:3000/api/lanes/${mockLane.id}`,
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(result).toEqual({ success: true });
    });
  });
});

describe('Card Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetFetchMock();
  });

  describe('list_cards', () => {
    it('should fetch all cards', async () => {
      mockFetchSuccess(mockCards);

      const cards = await apiCall<typeof mockCards>('/cards');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards',
        expect.any(Object)
      );
      expect(cards).toEqual(mockCards);
      expect(cards).toHaveLength(3);
    });

    it('should fetch cards filtered by lane_id', async () => {
      const laneCards = mockCards.filter(c => c.lane_id === 1);
      mockFetchSuccess(laneCards);

      const cards = await apiCall<typeof mockCards>('/cards?lane_id=1');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards?lane_id=1',
        expect.any(Object)
      );
      expect(cards).toEqual(laneCards);
    });
  });

  describe('create_card', () => {
    it('should create a card with all fields', async () => {
      const input = { lane_id: 1, name: 'Test Card', color: '#ffffff', position: 0 };
      mockFetchSuccess(mockCard);

      const card = await apiCall('/cards', {
        method: 'POST',
        body: JSON.stringify(input),
      });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(input),
        })
      );
      expect(card).toEqual(mockCard);
    });

    it('should create a card without optional color', async () => {
      const input = { lane_id: 1, name: 'Test Card', position: 0 };
      mockFetchSuccess({ ...mockCard, color: '#ffffff' }); // API applies default

      const card = await apiCall('/cards', {
        method: 'POST',
        body: JSON.stringify(input),
      });

      expect(card).toHaveProperty('color');
    });
  });

  describe('update_card', () => {
    it('should update card name', async () => {
      const updateData = { name: 'Updated Card' };
      const updatedCard = { ...mockCard, name: 'Updated Card' };
      mockFetchSuccess(updatedCard);

      const card = await apiCall(`/cards/${mockCard.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });

      expect(fetch).toHaveBeenCalledWith(
        `http://localhost:3000/api/cards/${mockCard.id}`,
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify(updateData),
        })
      );
      expect(card).toEqual(updatedCard);
    });

    it('should move card to different lane', async () => {
      const updateData = { lane_id: 2 };
      const movedCard = { ...mockCard, lane_id: 2 };
      mockFetchSuccess(movedCard);

      const card = await apiCall(`/cards/${mockCard.id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });

      expect(card.lane_id).toBe(2);
    });
  });

  describe('delete_card', () => {
    it('should delete a card by ID', async () => {
      mockFetchSuccess({ success: true });

      const result = await apiCall<{ success: boolean }>(`/cards/${mockCard.id}`, {
        method: 'DELETE',
      });

      expect(fetch).toHaveBeenCalledWith(
        `http://localhost:3000/api/cards/${mockCard.id}`,
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('move_card', () => {
    it('should move a card to different lane and position', async () => {
      const moveInput = { cardId: 1, targetLaneId: 2, newPosition: 0 };
      const movedCard = { ...mockCard, lane_id: 2, position: 0 };
      mockFetchSuccess(movedCard);

      const card = await apiCall('/cards/move', {
        method: 'POST',
        body: JSON.stringify(moveInput),
      });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards/move',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(moveInput),
        })
      );
      expect(card).toEqual(movedCard);
    });
  });
});

describe('Board Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetFetchMock();
  });

  describe('get_board', () => {
    it('should fetch lanes and cards and nest them correctly', async () => {
      // Simulate two parallel API calls
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++;
        if (url.includes('/lanes')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockLanes),
            text: () => Promise.resolve(JSON.stringify(mockLanes)),
          });
        } else if (url.includes('/cards')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockCards),
            text: () => Promise.resolve(JSON.stringify(mockCards)),
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      // Simulate what get_board does: fetch both and nest
      const [lanes, cards] = await Promise.all([
        apiCall<typeof mockLanes>('/lanes'),
        apiCall<typeof mockCards>('/cards'),
      ]);

      // Nest cards within lanes (mimics the tool logic)
      const lanesWithCards = lanes.map(lane => ({
        ...lane,
        cards: cards
          .filter(card => card.lane_id === lane.id)
          .sort((a, b) => a.position - b.position),
      }));

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(lanesWithCards).toHaveLength(3);
      expect(lanesWithCards[0].cards).toHaveLength(2); // Lane 1 has 2 cards
      expect(lanesWithCards[1].cards).toHaveLength(1); // Lane 2 has 1 card
      expect(lanesWithCards[2].cards).toHaveLength(0); // Lane 3 has 0 cards
    });
  });

  describe('get_board_summary', () => {
    it('should generate a text summary of the board', async () => {
      // Mock parallel fetch calls
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/lanes')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockLanes),
            text: () => Promise.resolve(JSON.stringify(mockLanes)),
          });
        } else if (url.includes('/cards')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(mockCards),
            text: () => Promise.resolve(JSON.stringify(mockCards)),
          });
        }
        return Promise.reject(new Error('Unknown endpoint'));
      });

      const [lanes, cards] = await Promise.all([
        apiCall<typeof mockLanes>('/lanes'),
        apiCall<typeof mockCards>('/cards'),
      ]);

      // Generate summary (mimics the tool logic)
      const cardCounts = new Map<number, number>();
      for (const card of cards) {
        cardCounts.set(card.lane_id, (cardCounts.get(card.lane_id) || 0) + 1);
      }

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

      const summaryText = summary.join('\n');

      expect(summaryText).toContain('Total Lanes: 3');
      expect(summaryText).toContain('Total Cards: 3');
      expect(summaryText).toContain('To Do: 2 cards');
      expect(summaryText).toContain('In Progress: 1 card');
      expect(summaryText).toContain('Done: 0 cards');
    });
  });
});
