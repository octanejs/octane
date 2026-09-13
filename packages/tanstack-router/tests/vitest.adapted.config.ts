import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';
import { packageRoot, routerAdaptedAliases, adaptedRouterJsx } from './parity-config.ts';
export default defineConfig({
	root: packageRoot,
	test: {
		name: 'tanstack-router-adapted',
		include: ['tests/upstream/**/*.test.{ts,tsx}'],
		environment: 'jsdom',
		setupFiles: ['tests/upstream/setupTests.tsx'],
		testTimeout: 15_000,
	},
	plugins: [adaptedRouterJsx, octane()],
	resolve: {
		conditions: ['development'],
		alias: routerAdaptedAliases,
		dedupe: ['octane', 'vitest', '@tanstack/router-core'],
	},
});
