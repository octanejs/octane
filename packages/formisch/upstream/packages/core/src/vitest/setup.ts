import { beforeEach, vi } from 'vitest';

// Use vi.hoisted() to import mocks before vi.mock() runs
const { frameworkMocks, resetIdCounter } = await vi.hoisted(
  async () => await import('./mock.ts')
);

// Mock framework module at top level (hoisted by Vitest)
vi.mock('../framework/index.ts', () => frameworkMocks);

// Reset ID counter before each test
beforeEach(() => {
  resetIdCounter();
});
