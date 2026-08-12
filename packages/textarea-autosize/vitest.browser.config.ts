import { defineConfig } from 'vitest/config';

export default defineConfig({
	root: new URL('.', import.meta.url).pathname,
	test: {
		environment: 'node',
		include: ['tests/browser/**/*.test.ts'],
		testTimeout: 30_000,
		hookTimeout: 30_000,
	},
});
