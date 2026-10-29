import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../..');

export default defineConfig({
	root: packageRoot,
	test: {
		name: 'effect-atom-adapted',
		include: ['tests/upstream/**/*.test.tsx'],
		setupFiles: ['tests/adapted-setup.ts'],
		environment: 'jsdom',
	},
	plugins: [
		{
			name: 'effect-atom-adapted-jsx',
			enforce: 'pre',
			transform(code, id) {
				if (id.startsWith(resolve(packageRoot, 'tests/upstream') + '/') && id.endsWith('.tsx'))
					return { code: '/** @jsxImportSource octane */\n' + code, map: null };
			},
		},
		octane(),
	],
	resolve: {
		dedupe: ['vitest', 'octane', 'effect'],
		alias: [
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
