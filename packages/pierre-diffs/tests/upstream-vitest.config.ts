import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.PIERRE_DIFFS_PRISTINE_ROOT
	? resolve(process.env.PIERRE_DIFFS_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');

export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(packageRoot, '.upstream-vitest-cache'),
	test: {
		name: 'pierre-diffs-pristine-suite',
		include: [resolve(upstreamRoot, 'test/react*.test.ts')],
		setupFiles: [resolve(packageRoot, 'tests/bun-environment.ts')],
		environment: 'jsdom',
		// Upstream runs `bun test --timeout 15000`.
		testTimeout: 15_000,
	},
	resolve: {
		dedupe: ['vitest', 'react', 'react-dom'],
		alias: [{ find: /^bun:test$/, replacement: resolve(packageRoot, 'tests/bun-test.ts') }],
	},
	// The pinned tsconfig.json extends the upstream monorepo's base config.
	oxc: { target: 'es2022', jsx: { runtime: 'automatic', importSource: 'react' }, tsconfig: false },
});
