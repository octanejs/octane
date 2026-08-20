import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const upstreamRoot = process.env.REACT_DRAGGABLE_PRISTINE_ROOT
	? resolve(process.env.REACT_DRAGGABLE_PRISTINE_ROOT)
	: resolve(import.meta.dirname, '../upstream');

export default defineConfig({
	plugins: [react()],
	// Never cache inside the lock-verified pristine tree: extra files there
	// read as drift to materialize run --check and the inventory walker.
	cacheDir: resolve(import.meta.dirname, '../.vite-pristine'),
	test: {
		name: 'draggable-pristine',
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
