import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../octane/src/compiler/vite.js';

export default defineConfig({
	root: resolve(import.meta.dirname, '../..'),
	plugins: [octane({ ssr: true })],
	test: {
		environment: 'node',
		include: ['packages/zag/tests/ssr/**/*.test.ts'],
		globals: false,
	},
	resolve: {
		alias: [
			{
				find: /^octane$/,
				replacement: resolve(import.meta.dirname, '../octane/src/server/index.ts'),
			},
			{
				find: /^octane\/server$/,
				replacement: resolve(import.meta.dirname, '../octane/src/server/index.ts'),
			},
			{
				find: /^@octanejs\/zag$/,
				replacement: resolve(import.meta.dirname, 'src/index.ts'),
			},
		],
	},
});
