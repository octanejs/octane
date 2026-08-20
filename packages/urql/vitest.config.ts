import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

export default defineConfig({
	resolve: {
		alias: {
			octane: resolve(root, 'packages/octane/src/index.ts'),
			'@octanejs/testing-library': resolve(root, 'packages/testing-library/src/index.ts'),
		},
	},
	test: {
		root: import.meta.dirname,
		environment: 'happy-dom',
		include: ['tests/**/*.test.ts'],
		setupFiles: ['tests/_setup.ts'],
	},
});
