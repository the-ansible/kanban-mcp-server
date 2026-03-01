import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mockFetchSuccess,
  mockFetchError,
  resetFetchMock,
  mockCard,
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

function validateString(value: unknown, fieldName: string, required = true): void {
  if (required) { validateRequired(value, fieldName); }
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new ValidationError(`Field '${fieldName}' must be a string, got ${typeof value}`);
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    throw new ValidationError(`Field '${fieldName}' cannot be empty`);
  }
}

function validateNumber(value: unknown, fieldName: string, required = true): void {
  if (required) { validateRequired(value, fieldName); }
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
  if (!required && (value === undefined || value === null)) { return; }
  validateString(value, fieldName, required);
  if (typeof value === 'string') {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    if (!hexPattern.test(value)) {
      throw new ValidationError(`Field '${fieldName}' must be a valid hex color (e.g., #3b82f6), got '${value}'`);
    }
  }
}

async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers } });
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API call failed (${response.status}): ${error}`);
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Cannot connect to Kanban API at ${API_BASE_URL}.`);
    }
    throw error;
  }
}

interface Card { id: number; lane_id: number; name: string; color: string; position: number; created_at?: string; }

// Board-scoped card handlers
async function listCardsHandler(args: { board_id: number; lane_id?: number }) {
  validateInteger(args.board_id, 'board_id', true);
  if (args.lane_id !== undefined) { validateInteger(args.lane_id, 'lane_id', false); }
  const endpoint = args.lane_id ? `/boards/${args.board_id}/cards?lane_id=${args.lane_id}` : `/boards/${args.board_id}/cards`;
  const cards = await apiCall<Card[]>(endpoint);
  return { content: [{ type: 'text', text: JSON.stringify(cards, null, 2) }] };
}

async function createCardHandler(args: { board_id: number; lane_id: number; name: string; color?: string; position: number }) {
  validateInteger(args.board_id, 'board_id', true);
  validateInteger(args.lane_id, 'lane_id', true);
  validateString(args.name, 'name', true);
  validateInteger(args.position, 'position', true);
  if (args.color !== undefined) { validateHexColor(args.color, 'color', false); }
  const { board_id, ...body } = args;
  const card = await apiCall<Card>(`/boards/${board_id}/cards`, { method: 'POST', body: JSON.stringify(body) });
  return { content: [{ type: 'text', text: JSON.stringify(card, null, 2) }] };
}

async function updateCardHandler(args: { board_id: number; card_id: number; name?: string; color?: string; lane_id?: number; position?: number }) {
  validateInteger(args.board_id, 'board_id', true);
  validateInteger(args.card_id, 'card_id', true);
  const { board_id, card_id, ...updateData } = args;
  if (updateData.name !== undefined) { validateString(updateData.name, 'name', false); }
  if (updateData.color !== undefined) { validateHexColor(updateData.color, 'color', false); }
  if (updateData.lane_id !== undefined) { validateInteger(updateData.lane_id, 'lane_id', false); }
  if (updateData.position !== undefined) { validateInteger(updateData.position, 'position', false); }
  if (Object.keys(updateData).length === 0) {
    throw new ValidationError('At least one field must be provided to update (name, color, lane_id, or position)');
  }
  const card = await apiCall<Card>(`/boards/${board_id}/cards/${card_id}`, { method: 'PATCH', body: JSON.stringify(updateData) });
  return { content: [{ type: 'text', text: JSON.stringify(card, null, 2) }] };
}

async function deleteCardHandler(args: { board_id: number; card_id: number }) {
  validateInteger(args.board_id, 'board_id', true);
  validateInteger(args.card_id, 'card_id', true);
  const result = await apiCall<{ success: boolean }>(`/boards/${args.board_id}/cards/${args.card_id}`, { method: 'DELETE' });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

async function moveCardHandler(args: { board_id: number; card_id: number; target_lane_id: number; new_position: number }) {
  validateInteger(args.board_id, 'board_id', true);
  validateInteger(args.card_id, 'card_id', true);
  validateInteger(args.target_lane_id, 'target_lane_id', true);
  validateInteger(args.new_position, 'new_position', true);
  const card = await apiCall<Card>(`/boards/${args.board_id}/cards/move`, {
    method: 'POST',
    body: JSON.stringify({ cardId: args.card_id, targetLaneId: args.target_lane_id, newPosition: args.new_position }),
  });
  return { content: [{ type: 'text', text: JSON.stringify(card, null, 2) }] };
}

describe('Card MCP Tools', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { resetFetchMock(); });

  describe('list_cards', () => {
    it('should return all cards when no lane filter', async () => {
      mockFetchSuccess(mockCards);
      const result = await listCardsHandler({ board_id: 1 });
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards/1/cards', expect.any(Object));
      expect(JSON.parse(result.content[0].text)).toEqual(mockCards);
    });

    it('should filter cards by lane_id', async () => {
      const filteredCards = [mockCards[0], mockCards[1]];
      mockFetchSuccess(filteredCards);
      const result = await listCardsHandler({ board_id: 1, lane_id: 1 });
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards/1/cards?lane_id=1', expect.any(Object));
      expect(JSON.parse(result.content[0].text)).toEqual(filteredCards);
    });

    it('should validate lane_id is a valid integer', async () => {
      await expect(listCardsHandler({ board_id: 1, lane_id: -1 })).rejects.toThrow('must be non-negative');
    });
  });

  describe('create_card', () => {
    it('should create a card with all fields', async () => {
      mockFetchSuccess({ ...mockCard, name: 'New Card', color: '#ff0000' });
      const result = await createCardHandler({ board_id: 1, lane_id: 1, name: 'New Card', color: '#ff0000', position: 0 });
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards/1/cards', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ lane_id: 1, name: 'New Card', color: '#ff0000', position: 0 }),
      }));
      expect(JSON.parse(result.content[0].text).name).toBe('New Card');
    });

    it('should create a card without optional color', async () => {
      mockFetchSuccess(mockCard);
      const result = await createCardHandler({ board_id: 1, lane_id: 1, name: 'New Card', position: 0 });
      expect(result.content[0].type).toBe('text');
    });

    it('should throw error when lane_id is missing', async () => {
      await expect(createCardHandler({ board_id: 1, name: 'New Card', position: 0 } as any)).rejects.toThrow('Missing required field: lane_id');
    });

    it('should throw error when name is missing', async () => {
      await expect(createCardHandler({ board_id: 1, lane_id: 1, position: 0 } as any)).rejects.toThrow('Missing required field: name');
    });

    it('should throw error when position is missing', async () => {
      await expect(createCardHandler({ board_id: 1, lane_id: 1, name: 'New Card' } as any)).rejects.toThrow('Missing required field: position');
    });

    it('should throw error when name is empty string', async () => {
      await expect(createCardHandler({ board_id: 1, lane_id: 1, name: '   ', position: 0 })).rejects.toThrow("Field 'name' cannot be empty");
    });

    it('should throw error when color has invalid format', async () => {
      await expect(createCardHandler({ board_id: 1, lane_id: 1, name: 'New Card', color: 'red', position: 0 })).rejects.toThrow('must be a valid hex color');
    });

    it('should throw error when lane_id is not a number', async () => {
      await expect(createCardHandler({ board_id: 1, lane_id: '1' as any, name: 'New Card', position: 0 })).rejects.toThrow("Field 'lane_id' must be a number");
    });

    it('should throw error when position is negative', async () => {
      await expect(createCardHandler({ board_id: 1, lane_id: 1, name: 'New Card', position: -1 })).rejects.toThrow('must be non-negative');
    });

    it('should throw error when position is not an integer', async () => {
      await expect(createCardHandler({ board_id: 1, lane_id: 1, name: 'New Card', position: 1.5 })).rejects.toThrow("Field 'position' must be an integer");
    });
  });

  describe('update_card', () => {
    it('should update card name', async () => {
      mockFetchSuccess({ ...mockCard, name: 'Updated Card' });
      const result = await updateCardHandler({ board_id: 1, card_id: 1, name: 'Updated Card' });
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards/1/cards/1', expect.objectContaining({
        method: 'PATCH', body: JSON.stringify({ name: 'Updated Card' }),
      }));
      expect(JSON.parse(result.content[0].text).name).toBe('Updated Card');
    });

    it('should update card color', async () => {
      mockFetchSuccess({ ...mockCard, color: '#00ff00' });
      const result = await updateCardHandler({ board_id: 1, card_id: 1, color: '#00ff00' });
      expect(JSON.parse(result.content[0].text).color).toBe('#00ff00');
    });

    it('should update card lane_id', async () => {
      mockFetchSuccess({ ...mockCard, lane_id: 2 });
      const result = await updateCardHandler({ board_id: 1, card_id: 1, lane_id: 2 });
      expect(JSON.parse(result.content[0].text).lane_id).toBe(2);
    });

    it('should update card position', async () => {
      mockFetchSuccess({ ...mockCard, position: 5 });
      const result = await updateCardHandler({ board_id: 1, card_id: 1, position: 5 });
      expect(JSON.parse(result.content[0].text).position).toBe(5);
    });

    it('should update multiple fields at once', async () => {
      mockFetchSuccess({ ...mockCard, name: 'Updated Card', color: '#00ff00', position: 3 });
      const result = await updateCardHandler({ board_id: 1, card_id: 1, name: 'Updated Card', color: '#00ff00', position: 3 });
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards/1/cards/1', expect.objectContaining({
        method: 'PATCH', body: JSON.stringify({ name: 'Updated Card', color: '#00ff00', position: 3 }),
      }));
    });

    it('should throw error when card_id is missing', async () => {
      await expect(updateCardHandler({ board_id: 1, name: 'Updated Card' } as any)).rejects.toThrow('Missing required field: card_id');
    });

    it('should throw error when no fields are provided to update', async () => {
      await expect(updateCardHandler({ board_id: 1, card_id: 1 })).rejects.toThrow('At least one field must be provided to update');
    });

    it('should throw error when color is invalid', async () => {
      await expect(updateCardHandler({ board_id: 1, card_id: 1, color: 'invalid' })).rejects.toThrow('must be a valid hex color');
    });

    it('should handle API 404 error when card not found', async () => {
      mockFetchError(404, 'Card not found');
      await expect(updateCardHandler({ board_id: 1, card_id: 999, name: 'Updated Card' })).rejects.toThrow('API call failed (404): Card not found');
    });

    it('should throw error when name is empty string', async () => {
      await expect(updateCardHandler({ board_id: 1, card_id: 1, name: '  ' })).rejects.toThrow("Field 'name' cannot be empty");
    });

    it('should throw error when position is negative', async () => {
      await expect(updateCardHandler({ board_id: 1, card_id: 1, position: -1 })).rejects.toThrow('must be non-negative');
    });

    it('should throw error when lane_id is not an integer', async () => {
      await expect(updateCardHandler({ board_id: 1, card_id: 1, lane_id: 1.5 })).rejects.toThrow("Field 'lane_id' must be an integer");
    });
  });

  describe('delete_card', () => {
    it('should delete a card successfully', async () => {
      mockFetchSuccess({ success: true });
      const result = await deleteCardHandler({ board_id: 1, card_id: 1 });
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards/1/cards/1', expect.objectContaining({ method: 'DELETE' }));
      expect(JSON.parse(result.content[0].text).success).toBe(true);
    });

    it('should throw error when card_id is missing', async () => {
      await expect(deleteCardHandler({ board_id: 1 } as any)).rejects.toThrow('Missing required field: card_id');
    });

    it('should throw error when card_id is not a number', async () => {
      await expect(deleteCardHandler({ board_id: 1, card_id: '1' as any })).rejects.toThrow("Field 'card_id' must be a number");
    });

    it('should handle API 404 error when card not found', async () => {
      mockFetchError(404, 'Card not found');
      await expect(deleteCardHandler({ board_id: 1, card_id: 999 })).rejects.toThrow('API call failed (404): Card not found');
    });
  });

  describe('move_card', () => {
    it('should move a card successfully', async () => {
      const movedCard = { ...mockCard, lane_id: 2, position: 0 };
      mockFetchSuccess(movedCard);
      const result = await moveCardHandler({ board_id: 1, card_id: 1, target_lane_id: 2, new_position: 0 });
      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards/1/cards/move', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ cardId: 1, targetLaneId: 2, newPosition: 0 }),
      }));
      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.lane_id).toBe(2);
      expect(parsedResult.position).toBe(0);
    });

    it('should throw error when card_id is missing', async () => {
      await expect(moveCardHandler({ board_id: 1, target_lane_id: 2, new_position: 0 } as any)).rejects.toThrow('Missing required field: card_id');
    });

    it('should throw error when target_lane_id is missing', async () => {
      await expect(moveCardHandler({ board_id: 1, card_id: 1, new_position: 0 } as any)).rejects.toThrow('Missing required field: target_lane_id');
    });

    it('should throw error when new_position is missing', async () => {
      await expect(moveCardHandler({ board_id: 1, card_id: 1, target_lane_id: 2 } as any)).rejects.toThrow('Missing required field: new_position');
    });

    it('should throw error when card_id is not a number', async () => {
      await expect(moveCardHandler({ board_id: 1, card_id: '1' as any, target_lane_id: 2, new_position: 0 })).rejects.toThrow("Field 'card_id' must be a number");
    });

    it('should throw error when target_lane_id is negative', async () => {
      await expect(moveCardHandler({ board_id: 1, card_id: 1, target_lane_id: -1, new_position: 0 })).rejects.toThrow('must be non-negative');
    });

    it('should throw error when new_position is not an integer', async () => {
      await expect(moveCardHandler({ board_id: 1, card_id: 1, target_lane_id: 2, new_position: 1.5 })).rejects.toThrow("Field 'new_position' must be an integer");
    });

    it('should handle API error when move fails', async () => {
      mockFetchError(400, 'Invalid move operation');
      await expect(moveCardHandler({ board_id: 1, card_id: 1, target_lane_id: 999, new_position: 0 })).rejects.toThrow('API call failed (400): Invalid move operation');
    });
  });
});
