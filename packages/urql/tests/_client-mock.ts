import { vi } from 'vitest';

export const mockClient = {
	executeQuery: vi.fn(),
	executeMutation: vi.fn(),
	executeSubscription: vi.fn(),
	suspense: false,
	_react: undefined as unknown,
};
