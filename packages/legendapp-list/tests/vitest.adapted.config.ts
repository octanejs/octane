import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { octane } from '../../octane/src/compiler/vite.js';

import { nativeEntryPoints } from './bun/native-overrides.ts';
import { ADAPTED_LANE_FILES } from './upstream-lane-files.ts';

// The adapted lane runs the pinned core suites, regenerated into tests/upstream with
// their imports pointed at this package's src, under the same harness as the pristine
// lane: setup.ts preloaded, bun:test over Vitest, and the native platform entry points
// the suite was written against.
const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = resolve(packageRoot, 'upstream');
const source = resolve(packageRoot, 'src');

export default defineConfig({
	root: packageRoot,
	test: {
		name: 'legendapp-list-adapted',
		include: ADAPTED_LANE_FILES.map((file) => file.replace(/^__tests__\//, 'tests/upstream/')),
		setupFiles: ['tests/upstream/setup.ts'],
		environment: 'node',
	},
	plugins: [nativeEntryPoints(upstreamRoot, source, { platformOnly: true }), octane()],
	resolve: {
		dedupe: ['vitest', 'octane'],
		extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.tsrx', '.json'],
		alias: [
			{ find: /^bun:test$/, replacement: resolve(packageRoot, 'tests/bun/bun-test.ts') },
			// setup.ts unmounts its React Native renderers after each test; the core suites
			// mount none.
			{
				find: /^\.\/helpers\/testingLibrary$/,
				replacement: resolve(packageRoot, 'tests/bun/testing-library-cleanup.ts'),
			},
			{
				find: /^react-native(\/index\.js)?$/,
				replacement: resolve(upstreamRoot, '__tests__/__mocks__/react-native.ts'),
			},
			{ find: /^@\/(.*)$/, replacement: `${source}/$1` },
		],
	},
});
