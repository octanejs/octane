import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../octane/src/compiler/vite.js';
import { opentuiRenderers } from './src/config.ts';

const source = resolve(import.meta.dirname, 'src');

export default defineConfig({
	plugins: [octane({ renderers: opentuiRenderers, ssr: false })],
	resolve: {
		alias: [
			{ find: /^@octanejs\/opentui$/, replacement: resolve(source, 'index.ts') },
			{ find: /^@octanejs\/opentui\/config$/, replacement: resolve(source, 'config.ts') },
			{ find: /^@octanejs\/opentui\/renderer$/, replacement: resolve(source, 'renderer.ts') },
			{
				find: /^@octanejs\/opentui\/intrinsics(?:\/jsx-runtime)?$/,
				replacement: resolve(source, 'intrinsics.ts'),
			},
			{
				find: /^@octanejs\/opentui\/test-utils$/,
				replacement: resolve(source, 'test-utils.ts'),
			},
		],
		dedupe: ['@opentui/core'],
	},
	test: {
		include: ['tests/integration.test.ts'],
		environment: 'node',
		globals: false,
	},
});
