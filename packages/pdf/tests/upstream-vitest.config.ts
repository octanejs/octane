import { resolve } from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { configDefaults, defineConfig } from 'vitest/config';

const upstreamRoot = process.env.REACT_PDF_PRISTINE_ROOT
	? resolve(process.env.REACT_PDF_PRISTINE_ROOT)
	: resolve(import.meta.dirname, '../upstream/packages/react-pdf');

export default defineConfig({
	cacheDir: resolve(upstreamRoot, '.vite-cache'),
	test: {
		name: 'pdf-pristine',
		root: resolve(upstreamRoot, 'packages/pdf'),
		include: ['src/**/*.{spec,test}.{ts,tsx}'],
		exclude: [...configDefaults.exclude, 'src/index.test.ts'],
		browser: {
			enabled: true,
			headless: true,
			instances: [{ browser: 'chromium' }],
			provider: playwright(),
		},
		pool: 'forks',
		setupFiles: [resolve(upstreamRoot, 'packages/pdf/vitest.setup.ts')],
		watch: false,
		testTimeout: 60_000,
		hookTimeout: 60_000,
	},
});
