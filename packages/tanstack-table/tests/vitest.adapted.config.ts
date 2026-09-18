import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';
const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../..');
export default defineConfig({
	root: packageRoot,
	test: {
		name: 'tanstack-table-adapted',
		include: ['tests/upstream/**/*.test.tsx'],
		exclude: ['tests/upstream/ssr.test.tsx'],
		environment: 'jsdom',
		setupFiles: ['tests/upstream/test-setup.ts'],
	},
	plugins: [
		{
			name: 'table-adapted-jsx',
			enforce: 'pre',
			transform(code, id) {
				if (id.startsWith(resolve(packageRoot, 'tests/upstream') + '/') && id.endsWith('.tsx'))
					return { code: '/** @jsxImportSource octane */\n' + code, map: null };
			},
		},
		octane(),
	],
	resolve: {
		dedupe: ['octane', 'vitest', '@tanstack/table-core'],
		alias: [
			{
				find: /^@octanejs\/testing-library$/,
				replacement: resolve(repoRoot, 'packages/testing-library/src/index.ts'),
			},
		],
	},
});
