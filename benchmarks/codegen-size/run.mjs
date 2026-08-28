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
import { createTextTypeProject } from 'octane/compiler/typescript';
import { build, transformSync } from 'esbuild';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync, constants as zc } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureCssModules } from './css-modules.mjs';
import { measureRspackCssModules } from './rspack-css-modules.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');

// The corpus is intentionally FIXED and diverse (apps + feature fixtures).
// Adding/removing entries invalidates the baseline — re-record when you do.
const CORPUS = [
	// Real bench apps (the sizes that show up in js-framework bundles).
	'benchmarks/js-framework/octane-tsrx/src/Main.tsrx',
	'benchmarks/todomvc/octane-tsrx/src/Main.tsrx',
	'benchmarks/chat-stream/octane-tsrx/src/Main.tsrx',
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

const NATIVE_CHANGE_SENTINEL =
	'packages/octane/tests/_fixtures/native-change-diagnostic-ambiguous.tsrx';

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

function compiledSize(source, filename, options = {}, validate = null) {
	const { code } = compile(source, filename, {
		mode: 'client',
		hmr: false,
		dev: false,
		...options,
	});
	const min = transformSync(code, { loader: 'js', minify: true }).code;
	validate?.(code, min);
	return {
		raw: val(code.length),
		minified: val(min.length),
		gzip: val(gz(min)),
	};
}

function componentModuleSource(count) {
	return Array.from({ length: count }, (_, index) => {
		const output = index === 0 ? '<span>leaf</span>' : `<Component${index - 1} />`;
		return `export function Component${index}() @{ ${output} }`;
	}).join('\n');
}

function componentModuleSize(count) {
	return compiledSize(
		componentModuleSource(count),
		path.join(REPO, `benchmarks/codegen-size/component-module-${count}.tsrx`),
		{},
		(code) => {
			const exports = code.match(/export const Component\d+\s*=/g)?.length ?? 0;
			if (exports !== count) {
				throw new Error(`component-module-${count} emitted ${exports}/${count} exports`);
			}
			const expectedRegions = count - 1;
			const caches = code.match(/let __memoCache[\w$]* =/g)?.length ?? 0;
			const commits = code.match(/const __memoCommitted[\w$]* =/g)?.length ?? 0;
			if (caches !== expectedRegions || commits !== expectedRegions) {
				throw new Error(
					`component-module-${count} emitted ${caches}/${commits}/${expectedRegions} cache/commit/expected memo regions`,
				);
			}
		},
	);
}

// Keep the diagnostic sentinel OUT of the long-lived source/compiled aggregate:
// its deliberately tiny, de-opt-heavy shape would change that corpus ratio even
// when the compiler output is byte-identical. Instead compare the production
// compile with normal analysis against the same compile with the internal
// classification result empty. All three ops must remain exactly 1.0x.
const sentinelFile = path.join(REPO, NATIVE_CHANGE_SENTINEL);
const sentinelSource = fs.readFileSync(sentinelFile, 'utf8');
const diagnosticControl = compiledSize(sentinelSource, sentinelFile, {
	__nativeChangeAnalysis: { diagnostics: [], classifications: new Map() },
});
const diagnostic = compiledSize(sentinelSource, sentinelFile);
for (const op of ['raw', 'minified', 'gzip']) {
	if (diagnostic[op].median !== diagnosticControl[op].median) {
		throw new Error(
			`native-change production sentinel retained diagnostic ${op} cost: ${diagnostic[op].median} vs control ${diagnosticControl[op].median}`,
		);
	}
}
const componentModule100 = componentModuleSize(100);
const componentModule200 = componentModuleSize(200);

// Keep the opt-in TypeScript sentinel separate from the fixed corpus. Its
// reference spells out the same text guarantees with explicit `as string`
// assertions, so a missed proof cannot hide in the aggregate expansion ratio.
const textTypesFile = path.join(__dirname, 'text-types.tsrx');
const textTypesSource = fs.readFileSync(textTypesFile, 'utf8');
const textTypesControlSource = fs.readFileSync(
	path.join(__dirname, 'text-types-control.tsrx'),
	'utf8',
);
const textTypeProject = createTextTypeProject({
	tsconfig: path.join(__dirname, 'text-types.tsconfig.json'),
});
let textTypes;
try {
	const textTypeFacts = textTypeProject.snapshot(textTypesFile, textTypesSource);
	const inferred = compiledSize(textTypesSource, textTypesFile, { textTypeFacts });
	const explicit = compiledSize(textTypesControlSource, textTypesFile);
	const syntax = compiledSize(textTypesSource, textTypesFile);
	const semanticInputs = [
		{
			props: {
				title: 'First & <title>',
				rows: [
					{ id: 'a', label: 'Row <A>' },
					{ id: 'b', label: 'Row & B' },
				],
				count: 2,
				labels: ['tail'],
			},
			contains: [
				'<h1>First &amp; &lt;title&gt;</h1>',
				'<p class="text-title">FIRST &amp; &lt;TITLE&gt;</p>',
				'<span class="text-count">2</span>',
				'<li data-id="a">Row &lt;A&gt;</li>',
				'<li data-id="b">Row &amp; B</li>',
				'<footer>tail</footer>',
			],
		},
		{
			props: { title: 'Empty', rows: [], count: 0, labels: [] },
			contains: ['<h1>Empty</h1>', '<span class="text-count">0</span>', '<li>empty</li>'],
		},
	];
	const renderCandidate = async (source, options) => {
		const bundle = await build({
			entryPoints: [path.join(__dirname, 'text-types-entry.ts')],
			bundle: true,
			write: false,
			format: 'esm',
			platform: 'node',
			target: 'node22',
			logLevel: 'silent',
			define: { 'process.env.NODE_ENV': '"production"' },
			plugins: [
				{
					name: 'text-types-semantic-control',
					setup(bundler) {
						bundler.onLoad({ filter: /\.tsrx$/ }, ({ path: filename }) => {
							assert.equal(filename, textTypesFile);
							return {
								contents: compile(source, filename, {
									mode: 'server',
									hmr: false,
									dev: false,
									...options,
								}).code,
								loader: 'js',
								resolveDir: path.dirname(filename),
							};
						});
					},
				},
			],
		});
		const code = bundle.outputFiles[0].text;
		const module = await import(
			`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
		);
		const results = [];
		for (const { props, contains } of semanticInputs) {
			const html = await module.render(props);
			for (const expected of contains) assert.ok(html.includes(expected), expected);
			results.push(html);
		}
		return results;
	};
	const inferredHtml = await renderCandidate(textTypesSource, { textTypeFacts });
	const explicitHtml = await renderCandidate(textTypesControlSource, {});
	assert.deepEqual(
		inferredHtml,
		explicitHtml,
		'inferred and explicit text must render identically',
	);
	const semanticChecksum = createHash('sha256').update(JSON.stringify(inferredHtml)).digest('hex');
	textTypes = {
		inferred,
		explicit,
		syntax,
		meta: { semanticChecksum, stringChildren: textTypeFacts.stringChildRanges.length },
	};
} finally {
	textTypeProject.dispose();
}

// Paired sentinels keep new optimization claims out of the fixed corpus. The
// CSS control and candidate use identical source/provider bytes and verify both
// the emitted stylesheet and public SSR output before reporting their sizes.
const cssModules = await measureCssModules();
// The real adapter must keep producing the proven input. A low-level compiler
// sentinel alone would stay green if graph proof collection became a no-op.
const rspackCssModules = await measureRspackCssModules();

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
		{ name: 'native-change-control', ops: diagnosticControl },
		{ name: 'native-change-diagnostic', ops: diagnostic },
		{
			name: 'component-module-100',
			ops: componentModule100,
			meta: { components: 100 },
		},
		{
			name: 'component-module-200',
			ops: componentModule200,
			meta: { components: 200 },
		},
		{ name: 'text-types-syntax', ops: textTypes.syntax },
		{ name: 'text-types-explicit', ops: textTypes.explicit, meta: textTypes.meta },
		{ name: 'text-types-inferred', ops: textTypes.inferred, meta: textTypes.meta },
		...cssModules.targets,
		...rspackCssModules.targets,
	],
};

console.log(`corpus: ${CORPUS.length} files`);
console.log(`source    raw ${srcRaw}  gz ${srcGz}`);
console.log(
	`compiled  raw ${outRaw}  min ${outMin}  gz(min) ${outGz}  (${(outGz / srcGz).toFixed(2)}x source gz)`,
);
console.log(
	`native-change production sentinel  raw ${diagnostic.raw.median}  min ${diagnostic.minified.median}  gz ${diagnostic.gzip.median}`,
);
console.log(
	`component modules  100 raw ${componentModule100.raw.median}  200 raw ${componentModule200.raw.median}  scaling ${(componentModule200.raw.median / componentModule100.raw.median).toFixed(2)}x`,
);
console.log(
	`TypeScript text sentinel  inferred ${textTypes.inferred.raw.median}/${textTypes.inferred.minified.median}/${textTypes.inferred.gzip.median}  explicit ${textTypes.explicit.raw.median}/${textTypes.explicit.minified.median}/${textTypes.explicit.gzip.median}  syntax ${textTypes.syntax.raw.median}/${textTypes.syntax.minified.median}/${textTypes.syntax.gzip.median}`,
);
for (const mode of ['client', 'server']) {
	const control = cssModules.summary.modes[`${mode}-control`];
	const proven = cssModules.summary.modes[`${mode}-proven`];
	console.log(
		`CSS-module ${mode} sentinel  min ${control.minified} -> ${proven.minified}  gz ${control.gzip} -> ${proven.gzip}  br ${control.brotli} -> ${proven.brotli}`,
	);
}

for (const lane of ['named', 'default']) {
	for (const mode of ['client', 'server']) {
		const { control, proven } = rspackCssModules.summary.lanes[lane].modes[mode];
		console.log(
			`Rspack CSS-module ${lane} ${mode} sentinel  min ${control.minified} -> ${proven.minified}  gz ${control.gzip} -> ${proven.gzip}  br ${control.brotli} -> ${proven.brotli}`,
		);
	}
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}
