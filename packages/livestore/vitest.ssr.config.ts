import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../octane/src/compiler/vite.js';

export default defineConfig({
	plugins: [octane({ ssr: true })],
	resolve: {
		alias: [
			{
				find: /^octane$/,
				replacement: resolve(import.meta.dirname, '../octane/src/server/index.ts'),
			},
			{
				find: /^@octanejs\/livestore$/,
				replacement: resolve(import.meta.dirname, 'src/mod.ts'),
			},
		],
	},
	test: {
		name: 'livestore-ssr-focused',
		root: resolve(import.meta.dirname, '../..'),
		include: ['packages/livestore/tests/ssr/**/*.test.ts'],
		environment: 'node',
		globals: false,
		silent: true,
	},
});
