/**
 * Bundle the tab and the data worker with octane/data from source, then run
 * the bench in Node, or with `--chromium` in headless Chromium. See README.md.
 *
 *   node benchmarks/data-worker-validation/run.mjs [rounds] [--quick] [--chromium]
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const source = path.resolve(HERE, '../../packages/octane/src');
const fromOctane = createRequire(path.resolve(source, '../package.json'));
const fromMcp = createRequire(path.resolve(HERE, '../../packages/octane-mcp-server/package.json'));
const fromComparison = createRequire(path.resolve(HERE, '../data-store-comparison/package.json'));
const { build } = fromComparison('esbuild');
const outdir = path.join(HERE, 'dist');

const shared = {
	outdir,
	bundle: true,
	format: 'esm',
	logLevel: 'warning',
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	alias: {
		'octane/data': path.join(source, 'data/index.ts'),
		devalue: fromOctane.resolve('devalue'),
		// Zod 4, from a workspace package that depends on it.
		zod: path.dirname(fromMcp.resolve('zod/package.json')),
	},
};
await Promise.all([
	build({
		...shared,
		entryPoints: {
			bench: path.join(HERE, 'bench.ts'),
			worker: path.join(HERE, 'worker.ts'),
			chromium: path.join(HERE, 'chromium.ts'),
		},
		outExtension: { '.js': '.mjs' },
		platform: 'node',
		target: 'node22',
	}),
	build({
		...shared,
		entryPoints: {
			browser: path.join(HERE, 'browser.ts'),
			'browser-worker': path.join(HERE, 'browser-worker.ts'),
		},
		platform: 'browser',
		target: 'es2024',
	}),
]);
const args = process.argv.slice(2);
const runner = args.includes('--chromium') ? 'chromium.mjs' : 'bench.mjs';
execFileSync(
	process.execPath,
	[path.join(outdir, runner), ...args.filter((arg) => arg !== '--chromium')],
	{ stdio: 'inherit' },
);
