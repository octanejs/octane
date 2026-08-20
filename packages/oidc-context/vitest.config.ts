import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');

export default defineConfig({
	resolve: {
		alias: {
			octane: resolve(root, 'packages/octane/src/index.ts'),
			'@octanejs/testing-library': resolve(root, 'packages/testing-library/src/index.ts'),
			'oidc-client-ts': resolve(import.meta.dirname, 'tests/_mocks/oidc-client-ts.ts'),
		},
	},
	test: {
		root: import.meta.dirname,
		environment: 'happy-dom',
		environmentOptions: {
			happyDOM: {
				url: 'https://www.example.com/',
			},
		},
		include: ['tests/**/*.test.ts'],
		setupFiles: ['tests/_setup.ts'],
	},
});
