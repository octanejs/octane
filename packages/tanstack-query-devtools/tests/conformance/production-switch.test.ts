import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/query-devtools', () => ({
	TanstackQueryDevtools: vi.fn(),
	TanstackQueryDevtoolsPanel: vi.fn(),
}));

// Load both entries once at collection time, which has no test timeout. A
// module's first fetch and transform can take seconds on a loaded runner; the
// tests' re-imports after vi.resetModules() still evaluate fresh instances under
// their stubbed NODE_ENV, without fetching again.
await import('../../src/index');
await import('../../src/production');

describe('@octanejs/tanstack-query-devtools root entry', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	// @parity-case conformance:tanstack-query-devtools-renders-nothing-outside-development
	it('renders nothing outside development', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.resetModules();
		const { ReactQueryDevtools, ReactQueryDevtoolsPanel } = await import('../../src/index');

		expect(ReactQueryDevtools({})).toBeNull();
		expect(ReactQueryDevtoolsPanel({})).toBeNull();
	});

	// @parity-case conformance:tanstack-query-devtools-exposes-the-real-components-in-development-and-from-the-production-entry
	it('exposes the real components in development and from the production entry', async () => {
		vi.stubEnv('NODE_ENV', 'development');
		vi.resetModules();
		const dev = await import('../../src/index');
		const production = await import('../../src/production');

		expect(dev.ReactQueryDevtools).toBe(production.ReactQueryDevtools);
		expect(dev.ReactQueryDevtoolsPanel).toBe(production.ReactQueryDevtoolsPanel);
	});

	// @parity-case conformance:tanstack-query-devtools-exposes-the-real-components-from-the-production-entry-regardless-of-node-env
	it('exposes the real components from the production entry regardless of NODE_ENV', async () => {
		vi.stubEnv('NODE_ENV', 'production');
		vi.resetModules();
		const production = await import('../../src/production');
		const root = await import('../../src/index');

		expect(production.ReactQueryDevtools).not.toBe(root.ReactQueryDevtools);
	});
});
