import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { packageRoot, dbAliases, dbHelperImports } from './parity-config.ts';
const upstreamRoot = process.env.TANSTACK_DB_PRISTINE_ROOT
	? resolve(process.env.TANSTACK_DB_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');
export default defineConfig({
	root: packageRoot,
	test: {
		name: 'tanstack-db-pristine-suite',
		include: [resolve(upstreamRoot, 'tests/**/*.test.tsx')],
		environment: 'jsdom',
		setupFiles: [resolve(upstreamRoot, 'tests/test-setup.ts')],
	},
	plugins: [dbHelperImports()],
	resolve: { dedupe: ['react', 'react-dom', 'vitest', '@tanstack/db'], alias: dbAliases },
	oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
});
