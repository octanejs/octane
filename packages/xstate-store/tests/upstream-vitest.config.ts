import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.XSTATE_STORE_PRISTINE_ROOT
	? resolve(process.env.XSTATE_STORE_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');

// Runs the vendored @xstate/store-react@2.0.0 suite byte-for-byte against real
// React. `globals`, the happy-dom environment, and the development/browser
// resolve conditions are upstream's own
// packages/xstate-store-react/vitest.config.mts settings, kept identical so the
// lane measures the pinned release rather than a re-tuned harness. Upstream
// colocates its tests with the source, so the include pattern covers `src`.
export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(packageRoot, '.upstream-vitest-cache'),
	test: {
		name: 'xstate-store-pristine-suite',
		include: [resolve(upstreamRoot, 'src/**/*.test.{ts,tsx}')],
		environment: 'happy-dom',
		globals: true,
		server: {
			deps: {
				fallbackCWD: packageRoot,
				inline: ['@xstate/store'],
			},
		},
	},
	resolve: {
		conditions: ['development', 'browser'],
	},
	oxc: {
		jsx: {
			runtime: 'automatic',
			importSource: 'react',
		},
	},
});
