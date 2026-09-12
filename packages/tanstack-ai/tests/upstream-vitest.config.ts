import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { packageRoot, aiAliases, aiHelperImports } from './parity-config.ts';
const upstreamRoot = process.env.TANSTACK_AI_PRISTINE_ROOT
	? resolve(process.env.TANSTACK_AI_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');
export default defineConfig({
	root: packageRoot,
	test: {
		name: 'tanstack-ai-pristine-suite',
		include: [resolve(upstreamRoot, 'tests/**/*.test.{ts,tsx}')],
		environment: 'jsdom',
		globals: true,
		setupFiles: [resolve(upstreamRoot, 'tests/setup.ts')],
	},
	plugins: [aiHelperImports],
	resolve: {
		dedupe: ['react', 'react-dom', 'vitest', '@tanstack/ai', '@tanstack/ai-client'],
		alias: aiAliases,
	},
	oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
});
