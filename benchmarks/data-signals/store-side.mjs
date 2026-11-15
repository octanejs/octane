/**
 * Time what one change costs the store itself, the shipped store against a
 * signal-graph model of the same data. See store-side.ts and README.md.
 *
 *   node benchmarks/data-signals/store-side.mjs [--quick]
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const source = path.resolve(HERE, '../../packages/octane/src');
const fromOctane = createRequire(path.resolve(source, '../package.json'));
const fromComparison = createRequire(path.resolve(HERE, '../data-store-comparison/package.json'));
const { build } = fromComparison('esbuild');
const outfile = path.join(HERE, 'dist/store-side.mjs');

await build({
	entryPoints: [path.join(HERE, 'store-side.ts')],
	outfile,
	bundle: true,
	format: 'esm',
	platform: 'node',
	target: 'node22',
	logLevel: 'warning',
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	alias: {
		'octane/data': path.join(source, 'data/index.ts'),
		'octane/signals': path.join(source, 'signals/index.ts'),
		devalue: fromOctane.resolve('devalue'),
	},
});
execFileSync(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: 'inherit' });
