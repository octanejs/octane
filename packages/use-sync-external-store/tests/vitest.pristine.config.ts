import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { upstreamTestModules } from './upstream-modules.ts';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.USE_SYNC_EXTERNAL_STORE_PRISTINE_ROOT
	? resolve(process.env.USE_SYNC_EXTERNAL_STORE_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');

export default defineConfig({
	root: packageRoot,
	test: {
		name: 'use-sync-external-store-pristine',
		include: [resolve(upstreamRoot, 'src/__tests__/*-test.js')],
		environment: 'jsdom',
		globals: true,
	},
	plugins: [
		upstreamTestModules({
			include: /\/src\/__tests__\/[^/]+-test\.js$/,
			harness: resolve(import.meta.dirname, 'pristine-registry.ts'),
			octane: false,
		}),
	],
});
