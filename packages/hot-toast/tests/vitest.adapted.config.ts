import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../..');

export default defineConfig({
	root: packageRoot,
	test: {
		name: 'hot-toast-adapted',
		include: ['tests/upstream/**/*.test.{ts,tsx}'],
		environment: 'jsdom',
		// The pinned suite is a Jest suite: it reads Jest's globals and its own
		// setup file (matchMedia and getBoundingClientRect mocks) runs last.
		globals: true,
		setupFiles: ['tests/adapted-setup.ts', 'tests/upstream/setup.ts'],
	},
	plugins: [
		{
			name: 'hot-toast-adapted-jsx',
			enforce: 'pre',
			transform(code, id) {
				if (id.startsWith(resolve(packageRoot, 'tests/upstream') + '/') && id.endsWith('.tsx'))
					return { code: '/** @jsxImportSource octane */\n' + code, map: null };
			},
		},
		octane(),
	],
	resolve: {
		dedupe: ['vitest', 'octane'],
		alias: [
			{
				find: /^@octanejs\/testing-library$/,
				replacement: resolve(repoRoot, 'packages/testing-library/src/index.ts'),
			},
		],
	},
});
