import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const upstreamRoot = resolve(packageRoot, 'upstream/src');

export default defineConfig({
	root: upstreamRoot,
	cacheDir: resolve(packageRoot, '.vite-pristine'),
	configFile: false,
	plugins: [
		react({
			jsxImportSource: 'react',
		}),
	],
	esbuild: {
		jsx: 'automatic',
		jsxImportSource: 'react',
	},
	resolve: {
		dedupe: ['react', 'react-dom'],
		alias: {
			'@monaco-editor/loader': resolve(packageRoot, 'tests/_mocks/pristine-loader.ts'),
		},
	},
	test: {
		name: '@monaco-editor/react-pristine',
		include: ['**/*.spec.tsx'],
		watch: false,
		environment: 'jsdom',
		globals: true,
		setupFiles: [resolve(packageRoot, 'tests/_harness/pristine-setup.ts')],
		passWithNoTests: false,
		// Vendored upstream snapshots were authored with Jest's `Object {` form.
		snapshotFormat: {
			printBasicPrototype: true,
		},
	},
});
