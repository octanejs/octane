import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.TANSTACK_VIRTUAL_PRISTINE_ROOT
	? resolve(process.env.TANSTACK_VIRTUAL_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');
export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(packageRoot, '.upstream-vitest-cache'),
	test: {
		name: 'tanstack-virtual-pristine-suite',
		include: [resolve(upstreamRoot, 'tests/index.test.tsx')],
		environment: 'jsdom',
		setupFiles: [resolve(upstreamRoot, 'tests/test-setup.ts')],
	},
	resolve: { dedupe: ['react', 'react-dom', 'vitest', '@tanstack/virtual-core'] },
	oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
});
