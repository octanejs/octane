import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../octane/src/compiler/vite.js';

export default defineConfig({
	root: resolve(import.meta.dirname, '../..'),
	plugins: [octane()],
	test: {
		environment: 'jsdom',
		include: ['packages/zag/tests/conformance/**/*.test.ts'],
		exclude: ['packages/zag/tests/differential/**/*.test.ts'],
		globals: false,
	},
	resolve: {
		alias: [
			{
				find: /^@octanejs\/zag$/,
				replacement: resolve(import.meta.dirname, 'src/index.ts'),
			},
		],
	},
});
