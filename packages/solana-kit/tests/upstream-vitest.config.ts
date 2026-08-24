import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const upstreamRoot = process.env.SOLANA_REACT_PRISTINE_ROOT
	? resolve(process.env.SOLANA_REACT_PRISTINE_ROOT)
	: resolve(import.meta.dirname, '../upstream');

export default defineConfig({
	cacheDir: resolve(upstreamRoot, '.vite-cache'),
	test: {
		name: 'solana-kit-pristine-suite',
		root: upstreamRoot,
		include: [
			'src/__tests__/ClientProvider-test.browser.tsx',
			'src/__tests__/useClientCapability-test.browser.tsx',
			'src/query/__tests__/useRequestQuery-test.browser.tsx',
		],
		environment: 'jsdom',
		globals: true,
		setupFiles: [resolve(import.meta.dirname, '_harness/pristine-setup.ts')],
	},
	esbuild: {
		target: 'es2020',
		jsx: 'automatic',
		tsconfigRaw: {
			compilerOptions: {
				esModuleInterop: true,
				jsx: 'react-jsx',
				jsxImportSource: 'react',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				target: 'ES2020',
			},
		},
	},
});
