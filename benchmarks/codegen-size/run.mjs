// Codegen-size benchmark — compiles a FIXED corpus of .tsrx/.tsx sources through
// the real `octane/compiler` with production settings (client mode, no hmr, no
// dev), minifies the output with esbuild, and reports byte totals. No browser,
// no servers — it runs in a couple of seconds and is the per-commit regression
// signal for compiled-output size (docs/compiled-output-optimization-plan.md,
// Phase 0b).
//
// Payload shape: two targets so the expansion ratio is ratio-guardable
// (baselines/ratios.json compares target/reference medians per op):
//   - `source`   ops: raw, gzip            — the corpus itself
//   - `compiled` ops: raw, minified, gzip  — compiler output; gzip is
//                                            gzip(minified) = shipped-bytes proxy
// Bytes are deterministic, so median === min === the measured value.
//
// Run:  node benchmarks/codegen-size/run.mjs
import { compile } from 'octane/compiler';
import { transformSync } from 'esbuild';
import { gzipSync, constants as zc } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');

// The corpus is intentionally FIXED and diverse (apps + feature fixtures).
// Adding/removing entries invalidates the baseline — re-record when you do.
const CORPUS = [
	// Real bench apps (the sizes that show up in js-framework bundles).
	'benchmarks/js-framework/octane-tsrx/src/Main.tsrx',
	'benchmarks/js-framework/octane-jsx/src/Main.tsx',
	'benchmarks/js-framework/octane-tsrx-naive/src/Main.tsrx',
	'benchmarks/js-framework/octane-tsrx-naive/src/Row.tsrx',
	// Feature fixtures — control flow, events (bubble + capture), components,
	// context, clsx class composition, boundaries, conditional hooks, forms.
	'packages/octane/tests/_fixtures/basic.tsrx',
	'packages/octane/tests/_fixtures/control.tsrx',
	'packages/octane/tests/_fixtures/attrs-events.tsrx',
	'packages/octane/tests/_fixtures/capture-events.tsrx',
	'packages/octane/tests/_fixtures/components.tsrx',
	'packages/octane/tests/_fixtures/context.tsrx',
	'packages/octane/tests/_fixtures/clsx-class.tsrx',
	'packages/octane/tests/_fixtures/boundary.tsrx',
	'packages/octane/tests/_fixtures/conditional-hooks.tsrx',
	'packages/octane/tests/_fixtures/controlled-forms-diff.tsrx',
];

const gz = (text) => gzipSync(Buffer.from(text), { level: zc.Z_BEST_COMPRESSION }).length;

let srcRaw = 0;
let srcGz = 0;
let outRaw = 0;
let outMin = 0;
let outGz = 0;
const perFile = [];

for (const rel of CORPUS) {
	const file = path.join(REPO, rel);
	const source = fs.readFileSync(file, 'utf8');
	// Production settings: client codegen, no HMR wrapper, no dev LOC metadata.
	const { code } = compile(source, file, { mode: 'client', hmr: false, dev: false });
	const min = transformSync(code, { loader: 'js', minify: true }).code;
	const minGz = gz(min);
	srcRaw += source.length;
	srcGz += gz(source);
	outRaw += code.length;
	outMin += min.length;
	outGz += minGz;
	perFile.push({ file: rel, source: source.length, compiled: code.length, minGz });
}

const val = (bytes) => ({ median: bytes, min: bytes, samples: 1 });
const payload = {
	suite: 'codegen-size',
	iterations: 1,
	targets: [
		{ name: 'source', ops: { raw: val(srcRaw), gzip: val(srcGz) } },
		{
			name: 'compiled',
			ops: { raw: val(outRaw), minified: val(outMin), gzip: val(outGz) },
			meta: { files: perFile },
		},
	],
};

console.log(`corpus: ${CORPUS.length} files`);
console.log(`source    raw ${srcRaw}  gz ${srcGz}`);
console.log(
	`compiled  raw ${outRaw}  min ${outMin}  gz(min) ${outGz}  (${(outGz / srcGz).toFixed(2)}x source gz)`,
);

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}
