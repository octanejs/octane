import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamSource = resolve(packageRoot, 'upstream/src');

// The pinned suite imports the core's internals from upstream/src, so the port's
// `@pierre/diffs` imports resolve there too: one copy of every core module.
export default defineConfig({
	root: packageRoot,
	test: {
		name: 'pierre-diffs-adapted',
		include: ['tests/upstream/*.test.ts'],
		environment: 'jsdom',
		// Upstream runs `bun test --timeout 15000`.
		testTimeout: 15_000,
		setupFiles: ['tests/bun-environment.ts'],
	},
	plugins: [octane()],
	resolve: {
		dedupe: ['vitest', 'octane'],
		alias: [
			{ find: /^bun:test$/, replacement: resolve(packageRoot, 'tests/bun-test.ts') },
			{ find: /^@pierre\/diffs$/, replacement: resolve(upstreamSource, 'index.ts') },
			{ find: /^@pierre\/diffs\/(edit|worker)$/, replacement: `${upstreamSource}/$1/index.ts` },
		],
	},
	// The pinned tsconfig.json extends the upstream monorepo's base config.
	oxc: { tsconfig: false },
});
