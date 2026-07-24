import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'jsdom',
		env: { NODE_ENV: 'development' },
		setupFiles: ['./tests/setup.ts'],
	},
});
