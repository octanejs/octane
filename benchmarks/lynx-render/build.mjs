// Production build of the Octane Lynx workload, shared by the timing runner and
// its fixture contract so both exercise the same compiled bundle.
import path from 'node:path';
import { build } from 'vite';

import { octane } from '../../packages/octane/src/compiler/vite.js';
import { lynxRenderers } from '../../packages/lynx/src/config.runtime.js';

const ROOT = import.meta.dirname;
const REPO = path.resolve(ROOT, '../..');
const LYNX_SOURCE = path.join(REPO, 'packages/lynx/src');
const OCTANE_SOURCE = path.join(REPO, 'packages/octane/src');

/** Bundle `workload.ts` into `outDir/workload.js`. */
export async function buildLynxRenderWorkload(outDir) {
	await build({
		configFile: false,
		root: REPO,
		logLevel: 'silent',
		resolve: {
			alias: [
				{ find: /^@octanejs\/lynx$/, replacement: path.join(LYNX_SOURCE, 'index.ts') },
				{
					find: /^@octanejs\/lynx\/intrinsics\/jsx-runtime$/,
					replacement: path.join(LYNX_SOURCE, 'intrinsics.ts'),
				},
				{ find: /^@octanejs\/lynx\/(.*)$/, replacement: `${LYNX_SOURCE}/$1.ts` },
				{
					find: /^octane\/universal\/native$/,
					replacement: path.join(OCTANE_SOURCE, 'universal-native.ts'),
				},
				{ find: /^octane\/universal$/, replacement: path.join(OCTANE_SOURCE, 'universal.ts') },
				{ find: /^octane$/, replacement: path.join(OCTANE_SOURCE, 'index.ts') },
			],
		},
		plugins: [octane({ renderers: lynxRenderers, ssr: false })],
		define: { 'process.env.NODE_ENV': '"production"' },
		build: {
			write: true,
			minify: 'esbuild',
			target: 'node22',
			lib: {
				entry: path.join(ROOT, 'workload.ts'),
				formats: ['es'],
				fileName: 'workload',
			},
			outDir,
			emptyOutDir: false,
			rollupOptions: { external: [] },
		},
	});
	return path.join(outDir, 'workload.js');
}
