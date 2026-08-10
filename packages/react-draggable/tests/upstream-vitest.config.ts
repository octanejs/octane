import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const upstreamRoot = process.env.REACT_DRAGGABLE_PRISTINE_ROOT
	? resolve(process.env.REACT_DRAGGABLE_PRISTINE_ROOT)
	: resolve(import.meta.dirname, '../upstream/tag');

export default defineConfig({
	plugins: [react()],
	cacheDir: resolve(upstreamRoot, '.vite-cache'),
	test: {
		name: 'react-draggable-pristine',
		root: upstreamRoot,
		environment: 'jsdom',
		globals: true,
		setupFiles: [resolve(upstreamRoot, 'test/setup.js')],
		include: ['test/**/*.test.{js,jsx,ts,tsx}'],
		exclude: ['test/browser/**'],
		onConsoleLog() {
			return false;
		},
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
