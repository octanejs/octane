// Reuse the fixed codegen-size corpus for a compiler comparison in both modes.
// Optional --timing measures uninstrumented production client compilation; run
// it without concurrent tests/builds, and treat overlapping samples as noise.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
const root = path.resolve(import.meta.dirname, '../..');
const baselineRoot = path.resolve(process.argv[2] || root);
const require = createRequire(path.join(root, 'package.json'));
const { transformSync } = require('esbuild');
const runner = fs.readFileSync(path.join(root, 'benchmarks/codegen-size/run.mjs'), 'utf8');
const corpus = runner
	.slice(runner.indexOf('const CORPUS = ['), runner.indexOf('const NATIVE_CHANGE_SENTINEL'))
	.match(/'([^']+\.(?:tsx|tsrx))'/g)
	.map((x) => x.slice(1, -1));
const sources = corpus.map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]);
const modules = {
	baseline: await import(
		pathToFileURL(path.join(baselineRoot, 'packages/octane/src/compiler/compile.js'))
	),
	candidate: await import(
		pathToFileURL(path.join(root, 'packages/octane/src/compiler/compile.js'))
	),
};
const sizes = {};
for (const [variant, { compile }] of Object.entries(modules)) {
	sizes[variant] = {};
	for (const mode of ['client', 'server']) {
		const rows = [];
		for (const [file, source] of sources) {
			const { code } = compile(source, file, { mode, hmr: false, dev: false });
			const min = transformSync(code, { loader: 'js', minify: true }).code;
			rows.push({
				file,
				raw: code.length,
				minified: min.length,
				gzip: gzipSync(min, { level: 9 }).length,
			});
		}
		sizes[variant][mode] = {
			rows,
			total: rows.reduce(
				(a, r) => ({
					raw: a.raw + r.raw,
					minified: a.minified + r.minified,
					gzip: a.gzip + r.gzip,
				}),
				{ raw: 0, minified: 0, gzip: 0 },
			),
		};
	}
}
const timings = [];
for (const variant of process.argv.includes('--timing')
	? ['baseline', 'candidate', 'candidate', 'baseline']
	: []) {
	const { compile } = modules[variant];
	for (let i = 0; i < 2; i++)
		for (const [file, source] of sources)
			compile(source, file, { mode: 'client', hmr: false, dev: false });
	const samples = [];
	for (let i = 0; i < 6; i++) {
		const start = performance.now();
		for (const [file, source] of sources)
			compile(source, file, { mode: 'client', hmr: false, dev: false });
		samples.push(performance.now() - start);
	}
	samples.sort((a, b) => a - b);
	timings.push({ variant, samples, median: samples[3] });
}
console.log(JSON.stringify({ node: process.version, sizes, timings }, null, 2));
