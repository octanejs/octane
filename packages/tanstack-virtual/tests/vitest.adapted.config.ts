import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';
const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../..');
export default defineConfig({
	root: packageRoot,
	test: {
		name: 'tanstack-virtual-adapted',
		include: ['tests/upstream/unit/index.test.tsx'],
		environment: 'jsdom',
		setupFiles: ['tests/upstream/unit/test-setup.ts'],
	},
	plugins: [
		{
			name: 'virtual-adapted-jsx',
			enforce: 'pre',
			transform(code, id) {
				if (id.startsWith(resolve(packageRoot, 'tests/upstream') + '/') && id.endsWith('.tsx'))
					return { code: '/** @jsxImportSource octane */\n' + code, map: null };
			},
		},
		octane(),
	],
	resolve: {
		dedupe: ['octane', 'vitest', '@tanstack/virtual-core'],
		alias: [
			{
				find: /^@octanejs\/testing-library$/,
				replacement: resolve(repoRoot, 'packages/testing-library/src/index.ts'),
			},
		],
	},
});
