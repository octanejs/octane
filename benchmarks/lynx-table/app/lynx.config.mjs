import { defineConfig } from '@lynx-js/rspeedy';
import { pluginOctane } from '@octanejs/rspeedy-plugin';

// BENCH_AUTOROWS=N builds a variant whose table is already populated at mount,
// so create cost is measurable without taps (mount-create ladder).
const autoRows = Number(process.env.BENCH_AUTOROWS ?? '0') || 0;
const autoSuffix = autoRows > 0 ? `-rows${autoRows}` : '';

// OCTANE_LYNX_PROFILE=1 turns on the wire-cost counters in @octanejs/lynx
// (globalThis.__OCTANE_LYNX_PROF on both threads). Off by default so the
// default bundle measures the shipping configuration.
const profile = process.env.OCTANE_LYNX_PROFILE === '1';

export default defineConfig(({ command }) => {
	// BENCH_DEV=1 keeps development diagnostics (transport self-checks, error
	// reporting) in a `rspeedy build` bundle, for debugging the web harness.
	const development = command === 'dev' || process.env.BENCH_DEV === '1';

	return {
		mode: development ? 'development' : 'production',
		environments: {
			lynx: {},
			web: {},
		},
		output: {
			cleanDistPath: true,
			filename: {
				bundle: '[name].[platform].bundle',
			},
			filenameHash: false,
			distPath: { root: 'dist' + autoSuffix + (profile ? '-profile' : '') },
		},
		source: {
			entry: {
				main: './src/index.ts',
			},
			define: {
				__BENCH_AUTOROWS__: JSON.stringify(autoRows),
				__OCTANE_LYNX_PROFILE__: JSON.stringify(profile),
			},
		},
		splitChunks: false,
		plugins: [pluginOctane({ dev: development, hmr: command === 'dev' })],
	};
});
