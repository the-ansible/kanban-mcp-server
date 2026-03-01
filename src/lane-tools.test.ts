import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mockFetchSuccess,
  mockFetchError,
  resetFetchMock,
  mockLane,
  mockLanes,
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
  if (required && typeof value === 'string' && value.trim().length === 0) {
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
  if (required) { validateRequired(value, fieldName); }
  if (value !== undefined && value !== null) {
    if (typeof value !== 'string') {
      throw new ValidationError(`Field '${fieldName}' must be a string, got ${typeof value}`);
    }
    const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;
    if (!hexColorPattern.test(value)) {
      throw new ValidationError(`Field '${fieldName}' must be a valid hex color code (e.g., #3b82f6), got "${value}"`);
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
      throw new Error(`Cannot connect to Kanban API at ${API_BASE_URL}. Please ensure the Kanban server is running on port 3000.`);
    }
    throw error;
  }
}

interface Lane { id: number; board_id: number; name: string; color: string; position: number; created_at?: string; }

// Board-scoped handler implementations
async function listLanesHandler(args: { board_id: number }) {
  validateInteger(args.board_id, 'board_id', true);
  const lanes = await apiCall<Lane[]>(`/boards/${args.board_id}/lanes`);
  return { content: [{ type: 'text', text: JSON.stringify(lanes, null, 2) }] };
}

async function createLaneHandler(args: { board_id: number; name: string; color?: string; position: number }) {
  validateInteger(args.board_id, 'board_id', true);
  validateString(args.name, 'name', true);
  validateInteger(args.position, 'position', true);
  if (args.color !== undefined) { validateHexColor(args.color, 'color', false); }
  const { board_id, ...body } = args;
  const lane = await apiCall<Lane>(`/boards/${board_id}/lanes`, { method: 'POST', body: JSON.stringify(body) });
  return { content: [{ type: 'text', text: JSON.stringify(lane, null, 2) }] };
}

async function updateLaneHandler(args: { board_id: number; lane_id: number; name?: string; color?: string; position?: number }) {
  validateInteger(args.board_id, 'board_id', true);
  validateInteger(args.lane_id, 'lane_id', true);
  const { board_id, lane_id, ...updateData } = args;
  if (updateData.name !== undefined) { validateString(updateData.name, 'name', false); }
  if (updateData.color !== undefined) { validateHexColor(updateData.color, 'color', false); }
  if (updateData.position !== undefined) { validateInteger(updateData.position, 'position', false); }
  if (Object.keys(updateData).length === 0) {
    throw new ValidationError('At least one field must be provided to update (name, color, or position)');
  }
  const lane = await apiCall<Lane>(`/boards/${board_id}/lanes/${lane_id}`, { method: 'PATCH', body: JSON.stringify(updateData) });
  return { content: [{ type: 'text', text: JSON.stringify(lane, null, 2) }] };
}

async function deleteLaneHandler(args: { board_id: number; lane_id: number }) {
  validateInteger(args.board_id, 'board_id', true);
  validateInteger(args.lane_id, 'lane_id', true);
  const result = await apiCall<{ success: boolean }>(`/boards/${args.board_id}/lanes/${args.lane_id}`, { method: 'DELETE' });
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

describe('Lane Tools', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { resetFetchMock(); });

  describe('list_lanes', () => {
    it('should fetch and return all lanes for a board', async () => {
      mockFetchSuccess(mockLanes);
      const result = await listLanesHandler({ board_id: 1 });
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards/1/lanes', expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }));
      expect(result.content).toHaveLength(1);
      const lanes = JSON.parse(result.content[0].text);
      expect(lanes).toEqual(mockLanes);
      expect(lanes).toHaveLength(3);
    });

    it('should return empty array when board has no lanes', async () => {
      mockFetchSuccess([]);
      const result = await listLanesHandler({ board_id: 1 });
      const lanes = JSON.parse(result.content[0].text);
      expect(lanes).toEqual([]);
    });

    it('should throw ValidationError when board_id is missing', async () => {
      await expect(listLanesHandler({} as any)).rejects.toThrow(ValidationError);
      await expect(listLanesHandler({} as any)).rejects.toThrow('Missing required field: board_id');
    });
  });

  describe('create_lane', () => {
    it('should create a lane successfully with all fields', async () => {
      mockFetchSuccess(mockLane);
      const result = await createLaneHandler({ board_id: 1, name: 'To Do', color: '#3b82f6', position: 0 });
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards/1/lanes', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'To Do', color: '#3b82f6', position: 0 }),
      }));
      const lane = JSON.parse(result.content[0].text);
      expect(lane).toEqual(mockLane);
    });

    it('should create a lane without optional color', async () => {
      mockFetchSuccess(mockLane);
      const result = await createLaneHandler({ board_id: 1, name: 'To Do', position: 0 });
      const lane = JSON.parse(result.content[0].text);
      expect(lane).toHaveProperty('id');
    });

    it('should throw ValidationError when name is missing', async () => {
      await expect(createLaneHandler({ board_id: 1, position: 0 } as any)).rejects.toThrow('Missing required field: name');
    });

    it('should throw ValidationError when position is missing', async () => {
      await expect(createLaneHandler({ board_id: 1, name: 'To Do' } as any)).rejects.toThrow('Missing required field: position');
    });

    it('should throw ValidationError when name is empty string', async () => {
      await expect(createLaneHandler({ board_id: 1, name: '   ', position: 0 })).rejects.toThrow("Field 'name' cannot be empty");
    });

    it('should throw ValidationError when color has invalid format', async () => {
      await expect(createLaneHandler({ board_id: 1, name: 'To Do', color: 'blue', position: 0 })).rejects.toThrow('must be a valid hex color code');
    });

    it('should throw ValidationError when position is not a number', async () => {
      await expect(createLaneHandler({ board_id: 1, name: 'To Do', position: '0' as any })).rejects.toThrow("Field 'position' must be a number");
    });

    it('should throw ValidationError when position is negative', async () => {
      await expect(createLaneHandler({ board_id: 1, name: 'To Do', position: -1 })).rejects.toThrow("Field 'position' must be non-negative");
    });

    it('should throw ValidationError when position is not an integer', async () => {
      await expect(createLaneHandler({ board_id: 1, name: 'To Do', position: 1.5 })).rejects.toThrow("Field 'position' must be an integer");
    });
  });

  describe('update_lane', () => {
    it('should update lane name successfully', async () => {
      mockFetchSuccess({ ...mockLane, name: 'Updated Name' });
      const result = await updateLaneHandler({ board_id: 1, lane_id: 1, name: 'Updated Name' });
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards/1/lanes/1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Name' }),
      }));
      const lane = JSON.parse(result.content[0].text);
      expect(lane.name).toBe('Updated Name');
    });

    it('should update lane color successfully', async () => {
      mockFetchSuccess({ ...mockLane, color: '#ff0000' });
      const result = await updateLaneHandler({ board_id: 1, lane_id: 1, color: '#ff0000' });
      const lane = JSON.parse(result.content[0].text);
      expect(lane.color).toBe('#ff0000');
    });

    it('should update lane position successfully', async () => {
      mockFetchSuccess({ ...mockLane, position: 5 });
      const result = await updateLaneHandler({ board_id: 1, lane_id: 1, position: 5 });
      const lane = JSON.parse(result.content[0].text);
      expect(lane.position).toBe(5);
    });

    it('should update multiple fields at once', async () => {
      mockFetchSuccess({ ...mockLane, name: 'New Name', color: '#00ff00', position: 3 });
      const result = await updateLaneHandler({ board_id: 1, lane_id: 1, name: 'New Name', color: '#00ff00', position: 3 });
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards/1/lanes/1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'New Name', color: '#00ff00', position: 3 }),
      }));
    });

    it('should throw ValidationError when lane_id is missing', async () => {
      await expect(updateLaneHandler({ board_id: 1, name: 'Updated' } as any)).rejects.toThrow('Missing required field: lane_id');
    });

    it('should throw ValidationError when no update fields are provided', async () => {
      await expect(updateLaneHandler({ board_id: 1, lane_id: 1 })).rejects.toThrow('At least one field must be provided to update');
    });

    it('should throw ValidationError when color format is invalid', async () => {
      await expect(updateLaneHandler({ board_id: 1, lane_id: 1, color: 'invalid' })).rejects.toThrow('must be a valid hex color code');
    });

    it('should handle API 404 error when lane not found', async () => {
      mockFetchError(404, 'Lane not found');
      await expect(updateLaneHandler({ board_id: 1, lane_id: 999, name: 'Updated' })).rejects.toThrow('API call failed (404)');
    });
  });

  describe('delete_lane', () => {
    it('should delete lane successfully', async () => {
      mockFetchSuccess({ success: true });
      const result = await deleteLaneHandler({ board_id: 1, lane_id: 1 });
      expect(fetch).toHaveBeenCalledWith('http://localhost:3000/api/boards/1/lanes/1', expect.objectContaining({ method: 'DELETE' }));
      const deleteResult = JSON.parse(result.content[0].text);
      expect(deleteResult).toEqual({ success: true });
    });

    it('should throw ValidationError when lane_id is missing', async () => {
      await expect(deleteLaneHandler({ board_id: 1 } as any)).rejects.toThrow('Missing required field: lane_id');
    });

    it('should throw ValidationError when lane_id is not a number', async () => {
      await expect(deleteLaneHandler({ board_id: 1, lane_id: '1' as any })).rejects.toThrow("Field 'lane_id' must be a number");
    });

    it('should handle API 404 error when lane not found', async () => {
      mockFetchError(404, 'Lane not found');
      await expect(deleteLaneHandler({ board_id: 1, lane_id: 999 })).rejects.toThrow('API call failed (404)');
    });
  });
});
