import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { packageRoot, routerOracleAliases, routerNeutralAliases } from './parity-config.ts';
const upstreamRoot = process.env.TANSTACK_ROUTER_PRISTINE_ROOT
	? resolve(process.env.TANSTACK_ROUTER_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');
export default defineConfig({
	root: packageRoot,
	test: {
		name: 'tanstack-router-pristine-suite',
		include: [resolve(upstreamRoot, 'tests/**/*.test.{ts,tsx}')],
		environment: 'jsdom',
		setupFiles: [resolve(upstreamRoot, 'tests/setupTests.tsx')],
		testTimeout: 15_000,
	},
	resolve: {
		conditions: ['development'],
		alias: [...routerOracleAliases, ...routerNeutralAliases],
		dedupe: ['react', 'react-dom', 'vitest', '@tanstack/router-core'],
	},
	oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
});
