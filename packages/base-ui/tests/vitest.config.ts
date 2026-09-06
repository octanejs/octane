import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';
import { octaneServerFixtures } from '../../../scripts/react-parity/server-fixtures.mjs';

// The pinned upstream Gregorian adapter suite uses UTC.
process.env.TZ = 'UTC';

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../..');
const adaptedRoot = resolve(packageRoot, 'tests/upstream/src');
export default defineConfig({
	root: packageRoot,
	test: {
		name: 'base-ui-adapted',
		include: ['tests/upstream/src/**/*.test.{ts,tsx}', 'tests/upstream/test/**/*.test.{ts,tsx}'],
		environment: resolve(repoRoot, 'scripts/react-parity/base-ui-jsdom-environment.mjs'),
		globals: true,
		setupFiles: [
			resolve(repoRoot, 'scripts/react-parity/base-ui-hook-order.ts'),
			'tests/support/setup.ts',
		],
		server: { deps: { inline: ['@mui/internal-test-utils'] } },
	},
	plugins: [
		{
			name: 'base-ui-test-source',
			enforce: 'pre',
			resolveId(id, importer) {
				if (!id.startsWith('.') || !importer?.startsWith(resolve(packageRoot, 'tests/upstream')))
					return;
				const authored = resolve(dirname(importer), id);
				if (!authored.startsWith(adaptedRoot + '/')) return;
				const target = authored.replace(adaptedRoot, resolve(packageRoot, 'src'));
				for (const extension of ['', '.ts', '.tsrx', '/index.ts'])
					if (existsSync(target + extension) && statSync(target + extension).isFile())
						return target + extension;
			},
		},
		octaneServerFixtures(repoRoot),
		octane({ profile: true }),
	],
	resolve: {
		alias: [
			{ find: /^#test-utils$/, replacement: resolve(packageRoot, 'tests/upstream/test/index.ts') },
			{ find: /^@base-ui\/react\/(.*)$/, replacement: resolve(packageRoot, 'src') + '/$1' },
			{
				find: /^@octanejs\/testing-library(?:\/pure)?$/,
				replacement: resolve(repoRoot, 'packages/testing-library/src/index.ts'),
			},
			{
				find: /^@testing-library\/react(?:\/pure(?:\.js)?)?$/,
				replacement: resolve(repoRoot, 'packages/testing-library/src/index.ts'),
			},
			{
				find: /^vitest-browser-react$/,
				replacement: resolve(repoRoot, 'packages/testing-library/src/index.ts'),
			},
			{
				find: /^react-router$/,
				replacement: resolve(repoRoot, 'packages/remix-router/src/index.ts'),
			},
			{
				find: /^@mui\/internal-test-utils$/,
				replacement: resolve(packageRoot, 'tests/support/renderer.ts'),
			},
		],
	},
});
