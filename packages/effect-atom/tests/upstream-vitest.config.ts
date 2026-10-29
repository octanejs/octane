import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.EFFECT_ATOM_PRISTINE_ROOT
	? resolve(process.env.EFFECT_ATOM_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');

export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(packageRoot, '.upstream-vitest-cache'),
	test: {
		name: 'effect-atom-pristine-suite',
		include: [resolve(upstreamRoot, 'test/**/*.test.tsx')],
		setupFiles: [resolve(upstreamRoot, 'vitest.setup.ts')],
		environment: 'jsdom',
	},
	resolve: {
		dedupe: ['vitest', 'react', 'react-dom'],
		// The suite takes only `assert` from @effect/vitest, which re-exports
		// Vitest's own. @effect/vitest 4.1.0 requires Vitest 5.
		alias: [{ find: /^@effect\/vitest$/, replacement: 'vitest' }],
	},
	// The pinned tsconfig.json extends the upstream monorepo's base config, which
	// is outside the pinned package directory.
	oxc: { target: 'es2020', jsx: { runtime: 'automatic', importSource: 'react' }, tsconfig: false },
});
