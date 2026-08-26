import { vi } from 'vitest';

vi.mock(
	'../upstream/packages/core/src/framework/index.ts',
	async () => import('../upstream/packages/core/src/framework/index.react.ts'),
);
