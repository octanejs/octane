// Keep the opt-in fixture routing independent of compiler loading so its
// coverage can be checked before the full workspace toolchain is installed.
export const signalsNodeTests = [
	'packages/octane/tests/signals-engine.test.ts',
	'packages/octane/tests/signals-state.test.ts',
	'packages/octane/tests/signals-async.test.ts',
	'packages/octane/tests/signals-streams.test.ts',
	'packages/octane/tests/signals-model.test.ts',
	'packages/octane/tests/signals-serialization.test.ts',
	'packages/octane/tests/signals-inspection.test.ts',
];
export const signalsProfileTests = [
	'packages/octane/tests/signals-devtools*.test.ts',
	'packages/octane/tests/signals-devtools*.test.tsrx',
];
export const signalsRuntimeTests = [
	'packages/octane/tests/signals-*.test.ts',
	'packages/octane/tests/signals-*.test.tsrx',
	'packages/octane/tests/hydration/signals-*.test.ts',
];
export const signalsBrowserTests = ['packages/octane/tests/browser/signals*/**/*.test.ts'];

export function scopedSignalsProjects(octane, defaultExclude = []) {
	return [
		{
			test: {
				name: 'octane-signals-node',
				include: signalsNodeTests,
				environment: 'node',
				globals: false,
			},
		},
		...['dev', 'prod', 'strong'].map((mode) => ({
			test: {
				name: mode === 'dev' ? 'octane-signals' : `octane-signals-${mode}`,
				include: signalsRuntimeTests,
				exclude: [...defaultExclude, ...signalsNodeTests, ...signalsProfileTests],
				environment: 'jsdom',
				setupFiles: ['packages/octane/tests/_per-test-setup.ts'],
				globals: false,
				...(mode !== 'dev' ? { env: { OCTANE_TEST_COMPILE_MODE: 'prod' } } : {}),
			},
			plugins: [
				octane({
					nativeReads: true,
					...(mode !== 'dev' ? { hmr: false } : {}),
					...(mode === 'strong' ? { strong: true } : {}),
				}),
			],
		})),
		{
			test: {
				name: 'octane-signals-profile',
				include: signalsProfileTests,
				environment: 'jsdom',
				setupFiles: ['packages/octane/tests/_per-test-setup.ts'],
				globals: false,
				env: { OCTANE_TEST_COMPILE_MODE: 'profile' },
			},
			plugins: [octane({ nativeReads: true, hmr: false, profile: true })],
		},
		{
			testExecution: {
				group: 'heavy-browser',
				// The shared browser glob supplies a real discovery root and excludes
				// this project's files from the ordinary unit shards.
				include: ['packages/octane/tests/browser/**/*.test.ts'],
			},
			test: {
				name: 'octane-signals-browser',
				include: signalsBrowserTests,
				environment: 'node',
				globals: false,
				testTimeout: 60_000,
				hookTimeout: 60_000,
			},
			// The harnesses must enable nativeReads in their actual served Vite
			// development and production builds, not just in a test-loader plugin.
		},
	];
}
