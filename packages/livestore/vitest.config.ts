import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../octane/src/compiler/vite.js';

export default defineConfig({
	plugins: [octane()],
	resolve: {
		alias: [
			{
				find: /^@octanejs\/livestore\/experimental$/,
				replacement: resolve(import.meta.dirname, 'src/experimental/mod.ts'),
			},
			{
				find: /^@octanejs\/livestore$/,
				replacement: resolve(import.meta.dirname, 'src/mod.ts'),
			},
		],
	},
	test: {
		name: 'livestore-focused',
		root: resolve(import.meta.dirname, '../..'),
		include: ['packages/livestore/tests/**/*.test.ts'],
		exclude: ['packages/livestore/tests/ssr/**/*.test.ts'],
		environment: 'jsdom',
		globals: false,
		silent: true,
	},
});
