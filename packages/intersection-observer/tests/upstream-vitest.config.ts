import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const upstreamRoot = process.env.INTERSECTION_OBSERVER_PRISTINE_ROOT
	? resolve(process.env.INTERSECTION_OBSERVER_PRISTINE_ROOT)
	: resolve(import.meta.dirname, '../upstream');

export default defineConfig({
	cacheDir: resolve(upstreamRoot, '.vite-cache'),
	test: {
		root: upstreamRoot,
		globals: true,
		projects: [
			{
				extends: true,
				test: {
					name: 'intersection-observer-pristine',
					include: ['src/__tests__/**/*.{test,spec}.{ts,tsx}'],
					exclude: ['src/__tests__/browser.test.tsx', 'src/__tests__/useInView.ssr.test.ts'],
					environment: 'jsdom',
					setupFiles: [resolve(import.meta.dirname, '_harness/pristine-setup.ts')],
				},
			},
			{
				extends: true,
				test: {
					name: 'intersection-observer-pristine-ssr',
					include: ['src/__tests__/useInView.ssr.test.ts'],
					environment: 'node',
				},
			},
		],
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
	resolve: {
		alias: {
			'vitest/browser': resolve(import.meta.dirname, '_harness/vitest-browser-stub.ts'),
		},
	},
});
