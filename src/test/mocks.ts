import { vi } from 'vitest';

export interface MockFetchOptions {
  status?: number;
  ok?: boolean;
  data?: unknown;
  error?: string;
}

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

export function mockFetchSuccess(data: unknown): void {
  global.fetch = vi.fn().mockResolvedValue(
    createMockResponse({ data, ok: true, status: 200 })
  );
}

export function mockFetchError(status: number, errorMessage: string): void {
  global.fetch = vi.fn().mockResolvedValue(
    createMockResponse({ ok: false, status, error: errorMessage })
  );
}

export function mockFetchConnectionError(): void {
  global.fetch = vi.fn().mockRejectedValue(
    new TypeError('fetch failed: connection refused')
  );
}

export function resetFetchMock(): void {
  vi.restoreAllMocks();
}

// Sample data for testing
export const mockBoard = {
  id: 1,
  name: 'Test Board',
  description: 'A test board',
  created_at: '2024-01-01T00:00:00.000Z',
};

export const mockBoards = [
  mockBoard,
  {
    id: 2,
    name: 'Second Board',
    description: null,
    created_at: '2024-01-01T00:00:00.000Z',
  },
];

export const mockLane = {
  id: 1,
  board_id: 1,
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
    board_id: 1,
    name: 'In Progress',
    color: '#f59e0b',
    position: 1,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 3,
    board_id: 1,
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

export const mockBoardWithLanes = {
  ...mockBoard,
  lanes: mockLanes.map(lane => ({
    ...lane,
    cards: mockCards
      .filter(card => card.lane_id === lane.id)
      .sort((a, b) => a.position - b.position),
  })),
};
