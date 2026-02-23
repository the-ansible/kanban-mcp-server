import { vi } from 'vitest';

/**
 * Mock fetch implementation for testing
 * This replaces the global fetch function with a controllable mock
 */
export interface MockFetchOptions {
  status?: number;
  ok?: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Creates a mock fetch response
 */
export function createMockResponse(options: MockFetchOptions): Response {
  const { status = 200, ok = true, data = {}, error } = options;

  const response = {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(error || JSON.stringify(data)),
  } as unknown as Response;

  return response;
}

/**
 * Sets up fetch mock for a successful response
 */
export function mockFetchSuccess(data: unknown): void {
  global.fetch = vi.fn().mockResolvedValue(
    createMockResponse({ data, ok: true, status: 200 })
  );
}

/**
 * Sets up fetch mock for an error response
 */
export function mockFetchError(status: number, errorMessage: string): void {
  global.fetch = vi.fn().mockResolvedValue(
    createMockResponse({ ok: false, status, error: errorMessage })
  );
}

/**
 * Sets up fetch mock for a connection error (network failure)
 */
export function mockFetchConnectionError(): void {
  global.fetch = vi.fn().mockRejectedValue(
    new TypeError('fetch failed: connection refused')
  );
}

/**
 * Resets all fetch mocks
 */
export function resetFetchMock(): void {
  vi.restoreAllMocks();
}

/**
 * Sample data for testing
 */
export const mockLane = {
  id: 1,
  name: 'To Do',
  color: '#3b82f6',
  position: 0,
  created_at: '2024-01-01T00:00:00.000Z',
};

export const mockCard = {
  id: 1,
  lane_id: 1,
  name: 'Test Card',
  color: '#ffffff',
  position: 0,
  created_at: '2024-01-01T00:00:00.000Z',
};

export const mockLanes = [
  mockLane,
  {
    id: 2,
    name: 'In Progress',
    color: '#f59e0b',
    position: 1,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 3,
    name: 'Done',
    color: '#10b981',
    position: 2,
    created_at: '2024-01-01T00:00:00.000Z',
  },
];

export const mockCards = [
  mockCard,
  {
    id: 2,
    lane_id: 1,
    name: 'Second Card',
    color: '#ffffff',
    position: 1,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 3,
    lane_id: 2,
    name: 'Card in Progress',
    color: '#ffffff',
    position: 0,
    created_at: '2024-01-01T00:00:00.000Z',
  },
];
