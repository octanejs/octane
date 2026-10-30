import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

import { nativeEntryPoints } from './bun/native-overrides.ts';
import { UPSTREAM_LANE_FILES } from './upstream-lane-files.ts';

const packageRoot = resolve(import.meta.dirname, '..');
const upstreamRoot = process.env.LEGENDAPP_LIST_PRISTINE_ROOT
	? resolve(process.env.LEGENDAPP_LIST_PRISTINE_ROOT)
	: resolve(packageRoot, 'upstream');
const source = resolve(upstreamRoot, 'src');

export default defineConfig({
	root: packageRoot,
	cacheDir: resolve(packageRoot, '.upstream-vitest-cache'),
	test: {
		name: 'legendapp-list-pristine-suite',
		include: UPSTREAM_LANE_FILES.map((file) => resolve(upstreamRoot, file)),
		// bunfig.toml preloads the suite's setup; bun runs it without a DOM.
		setupFiles: [resolve(upstreamRoot, '__tests__/setup.ts')],
		environment: 'node',
	},
	plugins: [nativeEntryPoints(upstreamRoot, source)],
	resolve: {
		dedupe: ['vitest', 'react', 'react-dom'],
		alias: [
			{ find: /^bun:test$/, replacement: resolve(packageRoot, 'tests/bun/bun-test.ts') },
			{
				find: /^@testing-library\/react-native\/build\/(act|render-act)$/,
				replacement: resolve(packageRoot, 'tests/bun/testing-library-react-native.ts'),
			},
			{
				find: /^react-native(\/index\.js)?$/,
				replacement: resolve(upstreamRoot, '__tests__/__mocks__/react-native.ts'),
			},
			{ find: /^@\/(.*)$/, replacement: `${source}/$1` },
		],
	},
	// The pinned tsconfig.json is bun's; Vitest needs only TSX for React.
	oxc: { jsx: { runtime: 'automatic', importSource: 'react' }, tsconfig: false },
});
