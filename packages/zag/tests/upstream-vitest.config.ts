import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const upstreamRoot = process.env.ZAG_PRISTINE_ROOT
	? resolve(process.env.ZAG_PRISTINE_ROOT)
	: resolve(import.meta.dirname, '../upstream');

export default defineConfig({
	cacheDir: resolve(upstreamRoot, '.vite-cache'),
	plugins: [react()],
	test: {
		name: 'zag-pristine',
		root: upstreamRoot,
		include: ['tests/**/*.{test,spec}.{ts,tsx}'],
		environment: 'jsdom',
		setupFiles: [resolve(upstreamRoot, 'vitest.setup.ts')],
		globals: true,
		css: false,
	},
	esbuild: {
		target: 'es2020',
		tsconfigRaw: {
			compilerOptions: {
				esModuleInterop: true,
				jsx: 'react-jsx',
				module: 'ESNext',
				moduleResolution: 'Bundler',
				target: 'ES2020',
			},
		},
	},
});
