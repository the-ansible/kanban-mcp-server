import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mockFetchSuccess,
  mockFetchError,
  resetFetchMock,
  mockCard,
  mockCards,
} from './test/mocks.js';

/**
 * Unit tests for Card MCP tools
 * These tests verify that the card tools (list_cards, create_card, update_card, delete_card, move_card)
 * correctly validate inputs, make API calls, and return formatted responses.
 */

// Mock the MCP server internals
const API_BASE_URL = 'http://localhost:3000/api';

// Replicate validation helpers from index.ts
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
  if (typeof value === 'string' && value.trim().length === 0) {
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

// API call helper
async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
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

// Types
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

// Tool handler implementations (replicated from index.ts for testing)
async function listCardsHandler(args: { lane_id?: number }) {
  const { lane_id } = args;
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

async function createCardHandler(args: CreateCardInput) {
  const input = args;
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

async function updateCardHandler(args: UpdateCardInput & { id: number }) {
  const { id, ...updateData } = args;
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

async function deleteCardHandler(args: { id: number }) {
  const { id } = args;
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

async function moveCardHandler(args: MoveCardInput) {
  const input = args;
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

// Tests
describe('Card MCP Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetFetchMock();
  });

  describe('list_cards', () => {
    it('should return all cards when no filter is provided', async () => {
      mockFetchSuccess(mockCards);

      const result = await listCardsHandler({});

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual(mockCards);
    });

    it('should filter cards by lane_id when provided', async () => {
      const filteredCards = [mockCards[0], mockCards[1]];
      mockFetchSuccess(filteredCards);

      const result = await listCardsHandler({ lane_id: 1 });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards?lane_id=1',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text)).toEqual(filteredCards);
    });

    it('should validate lane_id is a valid integer', async () => {
      await expect(listCardsHandler({ lane_id: -1 })).rejects.toThrow(
        ValidationError
      );
      await expect(listCardsHandler({ lane_id: -1 })).rejects.toThrow(
        'must be non-negative'
      );
    });
  });

  describe('create_card', () => {
    it('should create a card with all fields', async () => {
      const newCard = {
        lane_id: 1,
        name: 'New Card',
        color: '#ff0000',
        position: 0,
      };
      mockFetchSuccess({ ...mockCard, ...newCard });

      const result = await createCardHandler(newCard);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(newCard),
        })
      );
      expect(result.content[0].type).toBe('text');
      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.name).toBe('New Card');
      expect(parsedResult.color).toBe('#ff0000');
    });

    it('should create a card without color (optional field)', async () => {
      const newCard = {
        lane_id: 1,
        name: 'New Card',
        position: 0,
      };
      mockFetchSuccess({ ...mockCard, ...newCard });

      const result = await createCardHandler(newCard);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(newCard),
        })
      );
      expect(result.content[0].type).toBe('text');
    });

    it('should throw error when lane_id is missing', async () => {
      const invalidCard = {
        name: 'New Card',
        position: 0,
      } as CreateCardInput;

      await expect(createCardHandler(invalidCard)).rejects.toThrow(ValidationError);
      await expect(createCardHandler(invalidCard)).rejects.toThrow(
        'Missing required field: lane_id'
      );
    });

    it('should throw error when name is missing', async () => {
      const invalidCard = {
        lane_id: 1,
        position: 0,
      } as CreateCardInput;

      await expect(createCardHandler(invalidCard)).rejects.toThrow(ValidationError);
      await expect(createCardHandler(invalidCard)).rejects.toThrow(
        'Missing required field: name'
      );
    });

    it('should throw error when position is missing', async () => {
      const invalidCard = {
        lane_id: 1,
        name: 'New Card',
      } as CreateCardInput;

      await expect(createCardHandler(invalidCard)).rejects.toThrow(ValidationError);
      await expect(createCardHandler(invalidCard)).rejects.toThrow(
        'Missing required field: position'
      );
    });

    it('should throw error when name is empty string', async () => {
      const invalidCard = {
        lane_id: 1,
        name: '   ',
        position: 0,
      };

      await expect(createCardHandler(invalidCard)).rejects.toThrow(ValidationError);
      await expect(createCardHandler(invalidCard)).rejects.toThrow(
        "Field 'name' cannot be empty"
      );
    });

    it('should throw error when color has invalid format', async () => {
      const invalidCard = {
        lane_id: 1,
        name: 'New Card',
        color: 'red',
        position: 0,
      };

      await expect(createCardHandler(invalidCard)).rejects.toThrow(ValidationError);
      await expect(createCardHandler(invalidCard)).rejects.toThrow(
        'must be a valid hex color'
      );
    });

    it('should throw error when lane_id is not a number', async () => {
      const invalidCard = {
        lane_id: '1' as unknown as number,
        name: 'New Card',
        position: 0,
      };

      await expect(createCardHandler(invalidCard)).rejects.toThrow(ValidationError);
      await expect(createCardHandler(invalidCard)).rejects.toThrow(
        "Field 'lane_id' must be a number"
      );
    });

    it('should throw error when position is negative', async () => {
      const invalidCard = {
        lane_id: 1,
        name: 'New Card',
        position: -1,
      };

      await expect(createCardHandler(invalidCard)).rejects.toThrow(ValidationError);
      await expect(createCardHandler(invalidCard)).rejects.toThrow(
        'must be non-negative'
      );
    });

    it('should throw error when position is not an integer', async () => {
      const invalidCard = {
        lane_id: 1,
        name: 'New Card',
        position: 1.5,
      };

      await expect(createCardHandler(invalidCard)).rejects.toThrow(ValidationError);
      await expect(createCardHandler(invalidCard)).rejects.toThrow(
        "Field 'position' must be an integer"
      );
    });
  });

  describe('update_card', () => {
    it('should update card name', async () => {
      const updatedCard = { ...mockCard, name: 'Updated Card' };
      mockFetchSuccess(updatedCard);

      const result = await updateCardHandler({ id: 1, name: 'Updated Card' });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated Card' }),
        })
      );
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text).name).toBe('Updated Card');
    });

    it('should update card color', async () => {
      const updatedCard = { ...mockCard, color: '#00ff00' };
      mockFetchSuccess(updatedCard);

      const result = await updateCardHandler({ id: 1, color: '#00ff00' });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ color: '#00ff00' }),
        })
      );
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text).color).toBe('#00ff00');
    });

    it('should update card lane_id', async () => {
      const updatedCard = { ...mockCard, lane_id: 2 };
      mockFetchSuccess(updatedCard);

      const result = await updateCardHandler({ id: 1, lane_id: 2 });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ lane_id: 2 }),
        })
      );
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text).lane_id).toBe(2);
    });

    it('should update card position', async () => {
      const updatedCard = { ...mockCard, position: 5 };
      mockFetchSuccess(updatedCard);

      const result = await updateCardHandler({ id: 1, position: 5 });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ position: 5 }),
        })
      );
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text).position).toBe(5);
    });

    it('should update multiple fields at once', async () => {
      const updatedCard = {
        ...mockCard,
        name: 'Updated Card',
        color: '#00ff00',
        position: 3,
      };
      mockFetchSuccess(updatedCard);

      const result = await updateCardHandler({
        id: 1,
        name: 'Updated Card',
        color: '#00ff00',
        position: 3,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            name: 'Updated Card',
            color: '#00ff00',
            position: 3,
          }),
        })
      );
      expect(result.content[0].type).toBe('text');
    });

    it('should throw error when id is missing', async () => {
      const invalidUpdate = { name: 'Updated Card' } as UpdateCardInput & { id: number };

      await expect(updateCardHandler(invalidUpdate)).rejects.toThrow(ValidationError);
      await expect(updateCardHandler(invalidUpdate)).rejects.toThrow(
        'Missing required field: id'
      );
    });

    it('should throw error when no fields are provided to update', async () => {
      await expect(updateCardHandler({ id: 1 })).rejects.toThrow(ValidationError);
      await expect(updateCardHandler({ id: 1 })).rejects.toThrow(
        'At least one field must be provided to update'
      );
    });

    it('should throw error when color is invalid', async () => {
      await expect(
        updateCardHandler({ id: 1, color: 'invalid' })
      ).rejects.toThrow(ValidationError);
      await expect(
        updateCardHandler({ id: 1, color: 'invalid' })
      ).rejects.toThrow('must be a valid hex color');
    });

    it('should handle API 404 error when card not found', async () => {
      mockFetchError(404, 'Card not found');

      await expect(updateCardHandler({ id: 999, name: 'Updated Card' })).rejects.toThrow(
        'API call failed (404): Card not found'
      );
    });

    it('should throw error when name is empty string', async () => {
      await expect(
        updateCardHandler({ id: 1, name: '  ' })
      ).rejects.toThrow(ValidationError);
      await expect(
        updateCardHandler({ id: 1, name: '  ' })
      ).rejects.toThrow("Field 'name' cannot be empty");
    });

    it('should throw error when position is negative', async () => {
      await expect(
        updateCardHandler({ id: 1, position: -1 })
      ).rejects.toThrow(ValidationError);
      await expect(
        updateCardHandler({ id: 1, position: -1 })
      ).rejects.toThrow('must be non-negative');
    });

    it('should throw error when lane_id is not an integer', async () => {
      await expect(
        updateCardHandler({ id: 1, lane_id: 1.5 })
      ).rejects.toThrow(ValidationError);
      await expect(
        updateCardHandler({ id: 1, lane_id: 1.5 })
      ).rejects.toThrow("Field 'lane_id' must be an integer");
    });
  });

  describe('delete_card', () => {
    it('should delete a card successfully', async () => {
      mockFetchSuccess({ success: true });

      const result = await deleteCardHandler({ id: 1 });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards/1',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(result.content[0].type).toBe('text');
      expect(JSON.parse(result.content[0].text).success).toBe(true);
    });

    it('should throw error when id is missing', async () => {
      const invalidDelete = {} as { id: number };

      await expect(deleteCardHandler(invalidDelete)).rejects.toThrow(ValidationError);
      await expect(deleteCardHandler(invalidDelete)).rejects.toThrow(
        'Missing required field: id'
      );
    });

    it('should throw error when id is not a number', async () => {
      const invalidDelete = { id: '1' as unknown as number };

      await expect(deleteCardHandler(invalidDelete)).rejects.toThrow(ValidationError);
      await expect(deleteCardHandler(invalidDelete)).rejects.toThrow(
        "Field 'id' must be a number"
      );
    });

    it('should handle API 404 error when card not found', async () => {
      mockFetchError(404, 'Card not found');

      await expect(deleteCardHandler({ id: 999 })).rejects.toThrow(
        'API call failed (404): Card not found'
      );
    });
  });

  describe('move_card', () => {
    it('should move a card successfully', async () => {
      const movedCard = { ...mockCard, lane_id: 2, position: 0 };
      mockFetchSuccess(movedCard);

      const result = await moveCardHandler({
        cardId: 1,
        targetLaneId: 2,
        newPosition: 0,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cards/move',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            cardId: 1,
            targetLaneId: 2,
            newPosition: 0,
          }),
        })
      );
      expect(result.content[0].type).toBe('text');
      const parsedResult = JSON.parse(result.content[0].text);
      expect(parsedResult.lane_id).toBe(2);
      expect(parsedResult.position).toBe(0);
    });

    it('should throw error when cardId is missing', async () => {
      const invalidMove = {
        targetLaneId: 2,
        newPosition: 0,
      } as MoveCardInput;

      await expect(moveCardHandler(invalidMove)).rejects.toThrow(ValidationError);
      await expect(moveCardHandler(invalidMove)).rejects.toThrow(
        'Missing required field: cardId'
      );
    });

    it('should throw error when targetLaneId is missing', async () => {
      const invalidMove = {
        cardId: 1,
        newPosition: 0,
      } as MoveCardInput;

      await expect(moveCardHandler(invalidMove)).rejects.toThrow(ValidationError);
      await expect(moveCardHandler(invalidMove)).rejects.toThrow(
        'Missing required field: targetLaneId'
      );
    });

    it('should throw error when newPosition is missing', async () => {
      const invalidMove = {
        cardId: 1,
        targetLaneId: 2,
      } as MoveCardInput;

      await expect(moveCardHandler(invalidMove)).rejects.toThrow(ValidationError);
      await expect(moveCardHandler(invalidMove)).rejects.toThrow(
        'Missing required field: newPosition'
      );
    });

    it('should throw error when cardId is not a number', async () => {
      const invalidMove = {
        cardId: '1' as unknown as number,
        targetLaneId: 2,
        newPosition: 0,
      };

      await expect(moveCardHandler(invalidMove)).rejects.toThrow(ValidationError);
      await expect(moveCardHandler(invalidMove)).rejects.toThrow(
        "Field 'cardId' must be a number"
      );
    });

    it('should throw error when targetLaneId is negative', async () => {
      const invalidMove = {
        cardId: 1,
        targetLaneId: -1,
        newPosition: 0,
      };

      await expect(moveCardHandler(invalidMove)).rejects.toThrow(ValidationError);
      await expect(moveCardHandler(invalidMove)).rejects.toThrow(
        'must be non-negative'
      );
    });

    it('should throw error when newPosition is not an integer', async () => {
      const invalidMove = {
        cardId: 1,
        targetLaneId: 2,
        newPosition: 1.5,
      };

      await expect(moveCardHandler(invalidMove)).rejects.toThrow(ValidationError);
      await expect(moveCardHandler(invalidMove)).rejects.toThrow(
        "Field 'newPosition' must be an integer"
      );
    });

    it('should handle API error when move fails', async () => {
      mockFetchError(400, 'Invalid move operation');

      await expect(
        moveCardHandler({
          cardId: 1,
          targetLaneId: 999,
          newPosition: 0,
        })
      ).rejects.toThrow('API call failed (400): Invalid move operation');
    });
  });
});
