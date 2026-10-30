import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';

const packageRoot = resolve(import.meta.dirname, '..');

export default defineConfig({
	root: packageRoot,
	test: {
		name: 'pierre-trees-adapted',
		include: ['tests/upstream/**/*.test.tsx'],
		// The suite installs its own JSDOM globals, as it does under bun; a DOM
		// environment keeps Vitest on the client transform, so \`octane\` stays the
		// client runtime.
		environment: 'jsdom',
	},
	plugins: [octane()],
	resolve: {
		dedupe: ['vitest', 'octane', '@pierre/trees'],
		alias: [{ find: /^bun:test$/, replacement: resolve(packageRoot, 'tests/bun-test.ts') }],
	},
});
