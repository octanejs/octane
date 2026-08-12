import { resolve } from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const upstreamRoot = process.env.INTERSECTION_OBSERVER_PRISTINE_ROOT
	? resolve(process.env.INTERSECTION_OBSERVER_PRISTINE_ROOT)
	: resolve(import.meta.dirname, '../upstream');

export default defineConfig({
	cacheDir: resolve(import.meta.dirname, '../.vite-cache-browser'),
	optimizeDeps: {
		include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
	},
	test: {
		name: 'intersection-observer-pristine-browser',
		root: upstreamRoot,
		include: ['src/__tests__/browser.test.tsx'],
		globals: true,
		browser: {
			enabled: true,
			provider: playwright(),
			headless: true,
			instances: [{ browser: 'chromium' }],
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
