import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.PIERRE_TREES_PRISTINE_ROOT
	? resolve(process.env.PIERRE_TREES_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');

export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(packageRoot, '.upstream-vitest-cache'),
	test: {
		name: 'pierre-trees-pristine-suite',
		include: [resolve(upstreamRoot, 'test/**/*.test.tsx')],
		// The suite installs its own JSDOM globals, as it does under bun.
		environment: 'node',
	},
	resolve: {
		dedupe: ['vitest', 'react', 'react-dom', '@pierre/trees'],
		alias: [{ find: /^bun:test$/, replacement: resolve(packageRoot, 'tests/bun-test.ts') }],
	},
	oxc: { target: 'es2020', jsx: { runtime: 'automatic', importSource: 'react' }, tsconfig: false },
});
