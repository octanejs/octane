import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';
import { upstreamTestModules } from './upstream-modules.ts';

const packageRoot = resolve(import.meta.dirname, '..');

export const adaptedTestModules = upstreamTestModules({
	include: /\/tests\/upstream\/[^/]+-test\.js$/,
	harness: resolve(import.meta.dirname, 'adapted-registry.ts'),
	octane: true,
});

export default defineConfig({
	root: packageRoot,
	test: {
		name: 'use-sync-external-store-adapted',
		include: [
			'tests/upstream/useSyncExternalStoreShared-test.js',
			'tests/upstream/useSyncExternalStoreNative-test.js',
		],
		environment: 'jsdom',
		globals: true,
	},
	plugins: [adaptedTestModules, octane()],
});
