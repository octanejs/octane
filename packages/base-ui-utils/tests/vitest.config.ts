import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';
import { octaneServerFixtures } from '../../../scripts/react-parity/server-fixtures.mjs';

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../..');
const adaptedRoot = resolve(packageRoot, 'tests/upstream/src');
export default defineConfig({
	root: packageRoot,
	test: {
		name: 'base-ui-utils-adapted',
		// Preserve the pinned upstream vitest.shared.mts CI retry policy.
		retry: process.env.CI ? 1 : 0,
		include: ['tests/upstream/src/**/*.test.{ts,tsx}'],
		environment: resolve(repoRoot, 'scripts/react-parity/base-ui-jsdom-environment.mjs'),
		globals: true,
		setupFiles: [
			resolve(repoRoot, 'scripts/react-parity/base-ui-hook-order.ts'),
			'tests/support/setup.ts',
		],
		server: { deps: { inline: ['@mui/internal-test-utils'] } },
	},
	plugins: [
		octaneServerFixtures(repoRoot),
		{
			name: 'base-ui-utils-test-source',
			enforce: 'pre',
			resolveId(id, importer) {
				if (!id.startsWith('.') || !importer?.startsWith(adaptedRoot)) return;
				const target = resolve(dirname(importer), id).replace(
					adaptedRoot,
					resolve(packageRoot, 'src'),
				);
				for (const extension of ['', '.ts', '.tsrx', '/index.ts'])
					if (existsSync(target + extension)) return target + extension;
			},
		},
		octane(),
	],
	resolve: {
		alias: [
			{ find: /^@base-ui\/utils\/(.*)$/, replacement: resolve(packageRoot, 'src') + '/$1' },
			{
				find: /^@octanejs\/testing-library(?:\/pure)?$/,
				replacement: resolve(repoRoot, 'packages/testing-library/src/index.ts'),
			},
			{
				find: /^@testing-library\/react(?:\/pure(?:\.js)?)?$/,
				replacement: resolve(repoRoot, 'packages/testing-library/src/index.ts'),
			},
			{
				find: /^@mui\/internal-test-utils$/,
				replacement: resolve(packageRoot, 'tests/support/renderer.ts'),
			},
		],
	},
});
