import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../..');

export default defineConfig({
	root: packageRoot,
	test: {
		name: 'tanstack-query-adapted',
		include: ['tests/upstream/**/*.test.{ts,tsx}'],
		exclude: ['tests/upstream/ssr.test.tsx'],
		environment: 'jsdom',
		setupFiles: ['tests/adapted-setup.ts'],
		restoreMocks: true,
		server: { deps: { inline: ['@tanstack/query-core'] } },
	},
	plugins: [
		{
			name: 'query-adapted-jsx',
			enforce: 'pre',
			transform(code, id) {
				if (id.startsWith(resolve(packageRoot, 'tests/upstream') + '/') && id.endsWith('.tsx'))
					return { code: '/** @jsxImportSource octane */\n' + code, map: null };
			},
		},
		octane(),
	],
	resolve: {
		dedupe: ['vitest', 'octane', '@tanstack/query-core'],
		alias: [
			{
				find: /^@tanstack\/query-test-utils$/,
				replacement: resolve(packageRoot, 'upstream-artifact/query-test-utils/src/index.ts'),
			},
			{
				find: /^@octanejs\/testing-library$/,
				replacement: resolve(repoRoot, 'packages/testing-library/src/index.ts'),
			},
			{
				find: /^@octanejs\/react-error-boundary$/,
				replacement: resolve(repoRoot, 'packages/react-error-boundary/src/index.ts'),
			},
		],
	},
});
