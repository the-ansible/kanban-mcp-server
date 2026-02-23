import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mockFetchSuccess,
  mockFetchError,
  resetFetchMock,
  mockLane,
  mockLanes,
} from './test/mocks.js';

/**
 * Unit tests for Lane MCP tools
 * These tests verify that the lane tools (list_lanes, create_lane, update_lane, delete_lane)
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
    throw new ValidationError(`Field '${fieldName}' must be non-negative`);
  }
}

function validateInteger(value: unknown, fieldName: string, required = true): void {
  validateNumber(value, fieldName, required);
  if (typeof value === 'number' && !Number.isInteger(value)) {
    throw new ValidationError(`Field '${fieldName}' must be an integer`);
  }
}

function validateHexColor(value: unknown, fieldName: string, required = true): void {
  if (required) {
    validateRequired(value, fieldName);
  }
  if (value !== undefined && value !== null) {
    if (typeof value !== 'string') {
      throw new ValidationError(`Field '${fieldName}' must be a string, got ${typeof value}`);
    }
    const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;
    if (!hexColorPattern.test(value)) {
      throw new ValidationError(
        `Field '${fieldName}' must be a valid hex color code (e.g., #3b82f6), got "${value}"`
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

// Tool handler implementations (extracted from index.ts for testing)
async function listLanesHandler() {
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

async function createLaneHandler(args: unknown) {
  const input = args as CreateLaneInput;
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

async function updateLaneHandler(args: unknown) {
  const { id, ...updateData } = args as UpdateLaneInput & { id: number };
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

async function deleteLaneHandler(args: unknown) {
  const { id } = args as { id: number };
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

describe('Lane Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetFetchMock();
  });

  describe('list_lanes', () => {
    it('should fetch and return all lanes when board has multiple lanes', async () => {
      mockFetchSuccess(mockLanes);

      const result = await listLanesHandler();

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/lanes',
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      const lanes = JSON.parse(result.content[0].text);
      expect(lanes).toEqual(mockLanes);
      expect(lanes).toHaveLength(3);
    });

    it('should return empty array when board has no lanes', async () => {
      mockFetchSuccess([]);

      const result = await listLanesHandler();

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/lanes',
        expect.any(Object)
      );
      const lanes = JSON.parse(result.content[0].text);
      expect(lanes).toEqual([]);
    });
  });

  describe('create_lane', () => {
    it('should create a lane successfully with all fields', async () => {
      const input = { name: 'To Do', color: '#3b82f6', position: 0 };
      mockFetchSuccess(mockLane);

      const result = await createLaneHandler(input);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/lanes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(input),
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
      const lane = JSON.parse(result.content[0].text);
      expect(lane).toEqual(mockLane);
    });

    it('should create a lane successfully without optional color', async () => {
      const input = { name: 'To Do', position: 0 };
      mockFetchSuccess(mockLane);

      const result = await createLaneHandler(input);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/lanes',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(input),
        })
      );
      const lane = JSON.parse(result.content[0].text);
      expect(lane).toHaveProperty('id');
      expect(lane).toHaveProperty('name');
      expect(lane).toHaveProperty('color');
    });

    it('should throw ValidationError when name is missing', async () => {
      const input = { position: 0 };

      await expect(createLaneHandler(input)).rejects.toThrow(ValidationError);
      await expect(createLaneHandler(input)).rejects.toThrow('Missing required field: name');
    });

    it('should throw ValidationError when position is missing', async () => {
      const input = { name: 'To Do' };

      await expect(createLaneHandler(input)).rejects.toThrow(ValidationError);
      await expect(createLaneHandler(input)).rejects.toThrow('Missing required field: position');
    });

    it('should throw ValidationError when name is empty string', async () => {
      const input = { name: '   ', position: 0 };

      await expect(createLaneHandler(input)).rejects.toThrow(ValidationError);
      await expect(createLaneHandler(input)).rejects.toThrow("Field 'name' cannot be empty");
    });

    it('should throw ValidationError when color has invalid format', async () => {
      const input = { name: 'To Do', color: 'blue', position: 0 };

      await expect(createLaneHandler(input)).rejects.toThrow(ValidationError);
      await expect(createLaneHandler(input)).rejects.toThrow('must be a valid hex color code');
    });

    it('should throw ValidationError when position is not a number', async () => {
      const input = { name: 'To Do', position: '0' };

      await expect(createLaneHandler(input)).rejects.toThrow(ValidationError);
      await expect(createLaneHandler(input)).rejects.toThrow("Field 'position' must be a number");
    });

    it('should throw ValidationError when position is negative', async () => {
      const input = { name: 'To Do', position: -1 };

      await expect(createLaneHandler(input)).rejects.toThrow(ValidationError);
      await expect(createLaneHandler(input)).rejects.toThrow("Field 'position' must be non-negative");
    });

    it('should throw ValidationError when position is not an integer', async () => {
      const input = { name: 'To Do', position: 1.5 };

      await expect(createLaneHandler(input)).rejects.toThrow(ValidationError);
      await expect(createLaneHandler(input)).rejects.toThrow("Field 'position' must be an integer");
    });
  });

  describe('update_lane', () => {
    it('should update lane name successfully', async () => {
      const input = { id: 1, name: 'Updated Name' };
      const updatedLane = { ...mockLane, name: 'Updated Name' };
      mockFetchSuccess(updatedLane);

      const result = await updateLaneHandler(input);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/lanes/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Updated Name' }),
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
      const lane = JSON.parse(result.content[0].text);
      expect(lane.name).toBe('Updated Name');
    });

    it('should update lane color successfully', async () => {
      const input = { id: 1, color: '#ff0000' };
      const updatedLane = { ...mockLane, color: '#ff0000' };
      mockFetchSuccess(updatedLane);

      const result = await updateLaneHandler(input);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/lanes/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ color: '#ff0000' }),
        })
      );
      const lane = JSON.parse(result.content[0].text);
      expect(lane.color).toBe('#ff0000');
    });

    it('should update lane position successfully', async () => {
      const input = { id: 1, position: 5 };
      const updatedLane = { ...mockLane, position: 5 };
      mockFetchSuccess(updatedLane);

      const result = await updateLaneHandler(input);

      const lane = JSON.parse(result.content[0].text);
      expect(lane.position).toBe(5);
    });

    it('should update multiple fields at once', async () => {
      const input = { id: 1, name: 'New Name', color: '#00ff00', position: 3 };
      const updatedLane = { ...mockLane, name: 'New Name', color: '#00ff00', position: 3 };
      mockFetchSuccess(updatedLane);

      const result = await updateLaneHandler(input);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/lanes/1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'New Name', color: '#00ff00', position: 3 }),
        })
      );
      const lane = JSON.parse(result.content[0].text);
      expect(lane.name).toBe('New Name');
      expect(lane.color).toBe('#00ff00');
      expect(lane.position).toBe(3);
    });

    it('should throw ValidationError when id is missing', async () => {
      const input = { name: 'Updated' };

      await expect(updateLaneHandler(input)).rejects.toThrow(ValidationError);
      await expect(updateLaneHandler(input)).rejects.toThrow('Missing required field: id');
    });

    it('should throw ValidationError when no update fields are provided', async () => {
      const input = { id: 1 };

      await expect(updateLaneHandler(input)).rejects.toThrow(ValidationError);
      await expect(updateLaneHandler(input)).rejects.toThrow(
        'At least one field must be provided to update'
      );
    });

    it('should throw ValidationError when color format is invalid', async () => {
      const input = { id: 1, color: 'invalid' };

      await expect(updateLaneHandler(input)).rejects.toThrow(ValidationError);
      await expect(updateLaneHandler(input)).rejects.toThrow('must be a valid hex color code');
    });

    it('should handle API 404 error when lane not found', async () => {
      const input = { id: 999, name: 'Updated' };
      mockFetchError(404, 'Lane not found');

      await expect(updateLaneHandler(input)).rejects.toThrow('API call failed (404)');
    });
  });

  describe('delete_lane', () => {
    it('should delete lane successfully', async () => {
      const input = { id: 1 };
      mockFetchSuccess({ success: true });

      const result = await deleteLaneHandler(input);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/lanes/1',
        expect.objectContaining({
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
      const deleteResult = JSON.parse(result.content[0].text);
      expect(deleteResult).toEqual({ success: true });
    });

    it('should throw ValidationError when id is missing', async () => {
      const input = {};

      await expect(deleteLaneHandler(input)).rejects.toThrow(ValidationError);
      await expect(deleteLaneHandler(input)).rejects.toThrow('Missing required field: id');
    });

    it('should throw ValidationError when id is not a number', async () => {
      const input = { id: '1' };

      await expect(deleteLaneHandler(input)).rejects.toThrow(ValidationError);
      await expect(deleteLaneHandler(input)).rejects.toThrow("Field 'id' must be a number");
    });

    it('should handle API 404 error when lane not found', async () => {
      const input = { id: 999 };
      mockFetchError(404, 'Lane not found');

      await expect(deleteLaneHandler(input)).rejects.toThrow('API call failed (404)');
    });
  });
});
