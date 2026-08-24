import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.XSTATE_PRISTINE_ROOT
	? resolve(process.env.XSTATE_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');

// Runs the vendored @xstate/react@6.1.0 suite byte-for-byte against real React.
// `globals` and the happy-dom environment are upstream's own
// packages/xstate-react/vitest.config.mts settings, kept identical so the lane
// measures the pinned release rather than a re-tuned harness.
export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(packageRoot, '.upstream-vitest-cache'),
	test: {
		name: 'xstate-pristine-suite',
		include: [resolve(upstreamRoot, 'test/*.test.tsx')],
		environment: 'happy-dom',
		globals: true,
		server: {
			deps: {
				fallbackCWD: packageRoot,
				inline: ['xstate', 'use-sync-external-store', 'use-isomorphic-layout-effect'],
			},
		},
	},
	// Vitest 4 transforms through oxc, so an `esbuild` block here would be parsed
	// and then ignored. The vendored suite is `.tsx` compiled for real React, so
	// the JSX runtime is the only thing that has to be stated.
	oxc: {
		jsx: {
			runtime: 'automatic',
			importSource: 'react',
		},
	},
});
