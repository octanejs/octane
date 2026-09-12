import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';
import { packageRoot, dbAliases, dbHelperImports } from './parity-config.ts';
export default defineConfig({
	root: packageRoot,
	test: {
		name: 'tanstack-db-adapted',
		include: ['tests/upstream/**/*.test.tsx'],
		environment: 'jsdom',
		setupFiles: ['tests/upstream/test-setup.ts'],
	},
	plugins: [
		dbHelperImports(),
		{
			name: 'db-adapted-jsx',
			enforce: 'pre',
			transform(code, id) {
				if (id.startsWith(resolve(packageRoot, 'tests/upstream') + '/') && id.endsWith('.tsx'))
					return { code: '/** @jsxImportSource octane */\n' + code, map: null };
			},
		},
		octane(),
	],
	resolve: { dedupe: ['octane', 'vitest', '@tanstack/db'], alias: dbAliases },
});
