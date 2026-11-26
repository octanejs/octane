/**
 * Bundle the tab and the data worker with octane/data from source, then run
 * the bench. See README.md.
 *
 *   node benchmarks/data-worker-validation/run.mjs [rounds] [--quick]
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

await build({
	entryPoints: { bench: path.join(HERE, 'bench.ts'), worker: path.join(HERE, 'worker.ts') },
	outdir,
	outExtension: { '.js': '.mjs' },
	bundle: true,
	format: 'esm',
	platform: 'node',
	target: 'node22',
	logLevel: 'warning',
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	alias: {
		'octane/data': path.join(source, 'data/index.ts'),
		devalue: fromOctane.resolve('devalue'),
		// Zod 4, from a workspace package that depends on it.
		zod: path.dirname(fromMcp.resolve('zod/package.json')),
	},
});
execFileSync(process.execPath, [path.join(outdir, 'bench.mjs'), ...process.argv.slice(2)], {
	stdio: 'inherit',
});
