import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.NEXT_THEMES_PRISTINE_ROOT
	? resolve(process.env.NEXT_THEMES_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');

export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(packageRoot, '.upstream-vitest-cache'),
	test: {
		name: 'next-themes-pristine-suite',
		include: [resolve(upstreamRoot, '__tests__/**/*.test.tsx')],
		environment: 'jsdom',
	},
	resolve: {
		dedupe: ['vitest', 'react', 'react-dom'],
	},
	oxc: { target: 'es2020', jsx: { runtime: 'automatic', importSource: 'react' } },
});
