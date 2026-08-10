import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../upstream/package');

export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(dirname(fileURLToPath(import.meta.url)), '../.vite-pristine'),
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
	},
	test: {
		name: '@tanstack/react-hotkeys',
		include: ['tests/**/*.test.tsx'],
		watch: false,
		environment: 'happy-dom',
		globals: false,
		passWithNoTests: false,
	},
});
