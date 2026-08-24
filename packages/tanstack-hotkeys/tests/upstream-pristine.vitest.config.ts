import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../upstream');

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
	// The pinned upstream tsconfig extends a repository-relative path that does
	// not resolve from the flattened tree; this repo-owned project reproduces
	// the previous effective chain (binding base config plus upstream's
	// jsx: react override) for the transform.
	oxc: {
		tsconfig: false,
		jsx: {
			runtime: 'automatic',
			importSource: 'react',
		},
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
