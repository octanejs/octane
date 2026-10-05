// Production builds of the Octane Lynx workload, shared by the timing runner and
// its fixture contract so both exercise the same compiled bundles.
//
// Each Lynx thread compiles the same authored fixture with its own renderer, as
// Rspeedy's two layers do: the background layer with the background renderer
// and the `octane` runtime, the main layer with the main-thread renderer, whose
// `octane` and `@octanejs/lynx` resolve to the one-shot first-screen runtime.
import path from 'node:path';
import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'node:zlib';
import { build } from 'vite';

import { octane } from '../../packages/octane/src/compiler/vite.js';
import {
	lynxBackgroundRendererRegistry,
	lynxMainThreadRendererRegistry,
	lynxRendererRules,
} from '../../packages/lynx/src/config.runtime.js';

const ROOT = import.meta.dirname;
const REPO = path.resolve(ROOT, '../..');
const LYNX_SOURCE = path.join(REPO, 'packages/lynx/src');
const OCTANE_SOURCE = path.join(REPO, 'packages/octane/src');

const THREADS = {
	background: {
		renderers: { registry: lynxBackgroundRendererRegistry, rules: lynxRendererRules },
		universalRuntime: { runtime: 'lynx', thread: 'background' },
		packageRoot: path.join(LYNX_SOURCE, 'index.ts'),
		octane: path.join(OCTANE_SOURCE, 'index.ts'),
	},
	'main-thread': {
		renderers: { registry: lynxMainThreadRendererRegistry, rules: lynxRendererRules },
		universalRuntime: { runtime: 'lynx', thread: 'main-thread' },
		packageRoot: path.join(LYNX_SOURCE, 'first-screen.ts'),
		octane: path.join(LYNX_SOURCE, 'main-renderer.ts'),
	},
};

function threadConfig(thread, entry, outDir, write) {
	const layer = THREADS[thread];
	return {
		configFile: false,
		root: REPO,
		logLevel: 'silent',
		resolve: {
			alias: [
				{ find: /^@octanejs\/lynx$/, replacement: layer.packageRoot },
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
				{ find: /^octane$/, replacement: layer.octane },
			],
		},
		plugins: [
			octane({
				renderers: layer.renderers,
				universalRuntime: layer.universalRuntime,
				ssr: false,
			}),
		],
		define: { 'process.env.NODE_ENV': '"production"' },
		build: {
			write,
			minify: 'esbuild',
			target: 'node22',
			lib: {
				entry: path.join(ROOT, entry),
				formats: ['es'],
				fileName: path.basename(entry, '.ts'),
			},
			outDir,
			emptyOutDir: false,
			rollupOptions: { external: [] },
		},
	};
}

/**
 * Bundle the background workload (`workload.js`) and the main-thread layer
 * (`main-workload.js`) into `outDir`.
 */
export async function buildLynxRenderWorkload(outDir) {
	await build(threadConfig('background', 'workload.ts', outDir, true));
	await build(threadConfig('main-thread', 'main-workload.ts', outDir, true));
	return {
		background: path.join(outDir, 'workload.js'),
		main: path.join(outDir, 'main-workload.js'),
	};
}

function byteSizes(code) {
	const buffer = Buffer.from(code);
	return {
		raw: buffer.length,
		gzip: gzipSync(buffer, { level: zlibConstants.Z_BEST_COMPRESSION }).length,
		brotli: brotliCompressSync(buffer, {
			params: { [zlibConstants.BROTLI_PARAM_QUALITY]: zlibConstants.BROTLI_MAX_QUALITY },
		}).length,
	};
}

/**
 * Minified bytes of the fixture's own per-thread graph: the authored app, the
 * thread's runtime, and nothing from the harness. Deterministic for a commit.
 */
export async function measureLynxRenderFixtureBytes(outDir) {
	const sizes = {};
	for (const [thread, entry] of [
		['background', 'fixture-background.ts'],
		['main-thread', 'fixture-main.ts'],
	]) {
		const output = await build(threadConfig(thread, entry, outDir, false));
		const chunks = (Array.isArray(output) ? output : [output])
			.flatMap((result) => result.output)
			.filter((chunk) => chunk.type === 'chunk');
		sizes[thread] = byteSizes(chunks.map((chunk) => chunk.code).join('\n'));
	}
	return sizes;
}
