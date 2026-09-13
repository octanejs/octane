import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.JOTAI_PRISTINE_ROOT
	? resolve(process.env.JOTAI_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');

export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(packageRoot, '.upstream-vitest-cache'),
	test: {
		name: 'jotai-pristine-suite',
		include: [resolve(upstreamRoot, 'tests/**/*.test.{ts,tsx}')],
		environment: 'jsdom',
		globals: true,
		setupFiles: [resolve(upstreamRoot, 'tests/setup.ts')],
	},
	resolve: {
		dedupe: ['vitest'],
		alias: [
			{ find: /^jotai$/, replacement: resolve(upstreamRoot, 'src/index.ts') },
			{ find: /^jotai\/(.*)$/, replacement: resolve(upstreamRoot, 'src') + '/$1.ts' },
		],
	},
	esbuild: {
		target: 'es2020',
		jsx: 'automatic',
		jsxImportSource: 'react',
	},
});
