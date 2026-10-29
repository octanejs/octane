import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';
import adapted, { adaptedTestModules } from './vitest.adapted.config.ts';

export default defineConfig({
	...adapted,
	test: {
		...adapted.test,
		name: 'use-sync-external-store-adapted-ssr',
		include: ['tests/upstream/useSyncExternalStoreShimServer-test.js'],
		environment: 'node',
	},
	plugins: [adaptedTestModules, octane({ ssr: true })],
	resolve: {
		alias: [
			{
				find: /^octane(?:\/server)?$/,
				replacement: resolve(import.meta.dirname, '../../octane/src/server/index.ts'),
			},
		],
	},
});
