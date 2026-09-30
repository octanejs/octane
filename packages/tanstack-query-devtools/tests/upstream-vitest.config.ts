import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.TANSTACK_QUERY_DEVTOOLS_PRISTINE_ROOT
	? resolve(process.env.TANSTACK_QUERY_DEVTOOLS_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');

export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(packageRoot, '.upstream-vitest-cache'),
	test: {
		name: 'tanstack-query-devtools-pristine-suite',
		include: [resolve(upstreamRoot, 'src/__tests__/**/*.test.{ts,tsx}')],
		environment: 'jsdom',
		setupFiles: [resolve(upstreamRoot, 'test-setup.ts')],
		restoreMocks: true,
		server: { deps: { inline: ['@tanstack/query-core'] } },
	},
	resolve: {
		dedupe: ['vitest', 'react', 'react-dom', '@tanstack/query-core'],
	},
	oxc: { target: 'es2020', jsx: { runtime: 'automatic', importSource: 'react' } },
});
