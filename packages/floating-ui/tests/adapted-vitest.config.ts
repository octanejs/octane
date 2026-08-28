import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

import { octane } from '../../octane/src/compiler/vite.js';

const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../..');

// Run the adapted tree on the same Vitest generation as the pristine oracle.
// The workspace's root Vitest project remains a collection guard, while this
// config removes Vitest 4's React-18 act/focus drift from parity classification.
export default defineConfig({
	root: packageRoot,
	test: {
		name: 'floating-ui-adapted-suite',
		include: [
			'tests/upstream/react/unit/**/*.test.{ts,tsx}',
			'tests/upstream/react-dom/index.test.tsx',
		],
		environment: 'jsdom',
		globals: true,
		setupFiles: [
			'tests/upstream/react/unit/setupTests.ts',
			'tests/upstream/react-dom/setupTests.ts',
		],
	},
	plugins: [octane()],
	resolve: {
		alias: [
			{
				find: /^@octanejs\/floating-ui$/,
				replacement: resolve(packageRoot, 'src/index.ts'),
			},
			{
				find: /^@octanejs\/floating-ui\/(.*)$/,
				replacement: resolve(packageRoot, 'src') + '/$1.ts',
			},
			{
				find: /^@octanejs\/testing-library$/,
				replacement: resolve(repoRoot, 'packages/testing-library/src/index.ts'),
			},
		],
	},
});
