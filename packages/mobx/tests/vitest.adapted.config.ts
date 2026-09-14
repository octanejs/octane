import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../..');

export default defineConfig({
	root: packageRoot,
	test: {
		name: 'mobx-adapted',
		include: ['tests/upstream/**/*.test.{ts,tsx}'],
		environment: 'jsdom',
		globals: true,
		setupFiles: ['tests/adapted-setup.ts'],
	},
	plugins: [
		{
			name: 'mobx-adapted-jsx',
			enforce: 'pre',
			transform(code, id) {
				if (id.startsWith(resolve(packageRoot, 'tests/upstream') + '/') && id.endsWith('.tsx'))
					return { code: '/** @jsxImportSource octane */\n' + code, map: null };
			},
		},
		octane(),
	],
	resolve: {
		dedupe: ['vitest', 'octane', 'mobx'],
		alias: [
			{
				find: /^@octanejs\/testing-library$/,
				replacement: resolve(repoRoot, 'packages/testing-library/src/index.ts'),
			},
		],
	},
});
