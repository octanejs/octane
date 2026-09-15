import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { octanePackageAt, parseOptions, hashOctaneSources } from '../activity/harness.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import path from 'node:path';
// Compare the selected baseline to the current checkout, using the same fixture
// and candidate compiler. Compilation/stream semantics are verified separately
// by the conformance and native browser suites; page controls also measure how
// one small boundary scales with unrelated HTML.
const repo = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const verifyOnly = process.argv.includes('--verify-only');
const options = parseOptions(process.argv.slice(2).filter((arg) => arg !== '--verify-only'));
const sources = {
	baseline: octanePackageAt(options.revision || '277c10c3fa80f56ef162959832dba35c1b43b32e'),
	candidate: octanePackageAt(),
};
const baselineRevision = sources.baseline.revision;
const candidateRevision = sources.candidate.revision;
const output = process.env.BENCH_JSON;
const require = createRequire(path.join(repo, 'package.json'));
const { build } = require('esbuild');
const { compile } = await import(
	pathToFileURL(path.join(sources.candidate.packageRoot, 'src/compiler/index.js'))
);
function hash(data) {
	return createHash('sha256').update(data).digest('hex');
}

const page = (rows) =>
	Array.from(
		{ length: rows },
		(_, index) =>
			`<article class="overflow-x-auto"><h2>{props.text as string}</h2><p>Some descriptive page content</p><a href="/item/${index}">Open</a></article>`,
	).join('');
const pageRows = { PlainPage: 200, ViewPage: 200, PlainLargePage: 1600, ViewLargePage: 1600 };
const pages = Object.entries(pageRows)
	.map(
		([name, rows]) =>
			`export function ${name}(props) @{ <main>${page(rows)}${
				name.startsWith('View')
					? '<ViewTransition name="hero" update="resize"><div>{props.text as string}</div></ViewTransition>'
					: '<div>{props.text as string}</div>'
			}</main> }`,
	)
	.join('\n');
const rawPage = page(200).replaceAll('{props.text as string}', 'Content');
const source = `import {ViewTransition,use} from 'octane';
export function Plain(props) @{ <main><div>{props.text as string}</div></main> }
export function View(props) @{ <main><ViewTransition name="hero" update="resize"><div>{props.text as string}</div></ViewTransition></main> }
function Content(props) @{ const text=use(props.promise) as string; <div>{text}</div> }
export function PlainStream(props) @{ <main>@try { <Content promise={props.promise} /> } @pending { <p>{'Loading'}</p> }</main> }
export function ViewStream(props) @{ <main><ViewTransition name="hero" update="resize"><>@try { <Content promise={props.promise} /> } @pending { <p>{'Loading'}</p> }</></ViewTransition></main> }
export function ScopedView(props) @{ <main><ViewTransition scope="element" name="hero" update="resize"><section><div>{props.text as string}</div></section></ViewTransition></main> }
export function ScopedViewStream(props) @{ <main><ViewTransition scope="element" name="hero" update="resize"><section>@try { <Content promise={props.promise} /> } @pending { <p>{'Loading'}</p> }</section></ViewTransition></main> }
${pages}
export function ViewRawPage(props) @{ <main><div dangerouslySetInnerHTML={{__html: props.markup}}/><ViewTransition name="hero" update="resize"><div>{props.text as string}</div></ViewTransition></main> }
`;
const compiled = compile(source, path.join(repo, 'benchmarks/view-transitions/ssr-control.tsrx'), {
	mode: 'server',
	hmr: false,
}).code;
const mods = {};
const meta = {};
const temporary = mkdtempSync(path.join(os.tmpdir(), 'octane-vt-ssr-'));
try {
	for (const [label, input] of Object.entries(sources)) {
		const sourceSha256 = hashOctaneSources(input.packageRoot);
		const outfile = path.join(temporary, label + '.mjs');
		await build({
			stdin: {
				contents:
					compiled + '\nexport {renderToString,renderToPipeableStream} from "octane/server";',
				resolveDir: repo,
				loader: 'js',
			},
			outfile,
			bundle: true,
			minify: true,
			platform: 'node',
			format: 'esm',
			target: 'node24',
			define: { 'process.env.NODE_ENV': '"production"' },
			nodePaths: [path.join(repo, 'node_modules'), path.join(repo, 'packages/octane/node_modules')],
			plugins: [
				{
					name: 'selected-server',
					setup(b) {
						b.onResolve({ filter: /^octane(?:\/server)?$/ }, () => ({
							path: path.join(input.packageRoot, 'src/server/index.ts'),
						}));
					},
				},
			],
		});
		mods[label] = await import(pathToFileURL(outfile));
		const bytes = readFileSync(outfile);
		meta[label] = {
			sourceSha256,
			serverSourceHash: hash(readFileSync(path.join(input.packageRoot, 'src/runtime.server.ts'))),
			bundleHash: hash(bytes),
			bundleBytes: bytes.length,
			bundleGzip: gzipSync(bytes, { level: 9 }).length,
		};
	}
	function stream(rt, name) {
		return new Promise((done, reject) => {
			let resolve;
			const promise = new Promise((r) => (resolve = r));
			let html = '';
			rt.renderToPipeableStream(rt[name], { promise }, { onError: reject }).pipe({
				write(chunk) {
					html += chunk;
				},
				end() {
					done(html);
				},
			});
			resolve('Content');
		});
	}
	const samples = {};
	for (const name of [
		'Plain',
		'View',
		'PlainStream',
		'ViewStream',
		'ScopedView',
		'ScopedViewStream',
		...Object.keys(pageRows),
		'ViewRawPage',
	]) {
		const isStream = name.endsWith('Stream');
		const rows = name === 'ViewRawPage' ? 200 : (pageRows[name] ?? 0);
		const props = { text: 'Content', markup: rawPage };
		const reps = rows === 1600 ? 250 : rows > 0 || isStream ? 1000 : 10000;
		samples[name] = {
			repetitions: reps,
			warmupRepetitions: reps * 5,
			baseline: [],
			candidate: [],
			wire: {},
			unrelatedPageRows: rows,
			trustedRawHtml: name === 'ViewRawPage',
		};
		let baselineHtml;
		for (const label of ['baseline', 'candidate']) {
			const rt = mods[label];
			const rendered = isStream ? null : rt.renderToString(rt[name], props);
			const html = isStream ? await stream(rt, name) : rendered.css + rendered.html;
			const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
			if (!html.includes('Content') || (isStream && !html.includes('Loading')))
				throw new Error('Missing authored output in ' + label + '/' + name);
			if (rows > 0) {
				assert.equal([...html.matchAll(/<article\b/g)].length, rows);
				assert.equal([...html.matchAll(/<h2>Content<\/h2>/g)].length, rows);
				assert.ok(html.includes('href="/item/' + (rows - 1) + '"'));
				assert.ok(!/vt-(?:parent-)?(?:enter|exit)-x=/.test(html));
				if (label === 'baseline') baselineHtml = html;
				else assert.equal(html, baselineHtml, 'Page output must stay byte-identical');
			}
			const scopeRoots = [...html.matchAll(/<section\b[^>]*>/g)];
			if (label === 'candidate' && name.startsWith('Scoped')) {
				assert.equal(
					scopeRoots.length,
					1,
					'One persistent scope host must wrap ready/streamed content',
				);
				assert.match(scopeRoots[0][0], /vt-scope="element"/);
				assert.match(html, /\[vt-scope="element"\]\{view-transition-scope:all!important\}/);
			}
			samples[name].wire[label] = {
				bytes: Buffer.byteLength(html),
				separateCssBytes: rendered === null ? 0 : Buffer.byteLength(rendered.css),
				gzip: gzipSync(html, { level: 9 }).length,
				hasAnimationDriver: html.includes('$OCTVT'),
				hasElementScope: /vt-scope="element"/.test(html),
				scopeHosts: scopeRoots.length,
				scriptBytes: scripts.reduce((n, s) => n + Buffer.byteLength(s), 0),
			};
			for (let i = 0; !verifyOnly && i < reps * 5; i++)
				if (isStream) await stream(rt, name);
				else rt.renderToString(rt[name], props);
		}
		if (verifyOnly) continue;
		for (let round = 0; round < 11; round++)
			for (const label of round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']) {
				const rt = mods[label];
				const start = performance.now();
				for (let i = 0; i < reps; i++)
					if (isStream) await stream(rt, name);
					else rt.renderToString(rt[name], props);
				samples[name][label].push((performance.now() - start) / reps);
			}
		for (const label of ['baseline', 'candidate']) {
			const sorted = samples[name][label].toSorted((a, b) => a - b);
			samples[name][label + 'MedianMs'] = sorted[5];
			samples[name][label + 'DistributionMs'] = {
				min: sorted[0],
				p25: sorted[2],
				median: sorted[5],
				p75: sorted[8],
				max: sorted[10],
			};
			samples[name][label + 'MedianOpsPerSecond'] = 1000 / sorted[5];
		}
		samples[name].pairedCandidateBaselineRatios = samples[name].candidate.map(
			(ms, index) => ms / samples[name].baseline[index],
		);
	}
	for (const [label, input] of Object.entries(sources))
		if (meta[label].sourceSha256 !== hashOctaneSources(input.packageRoot))
			throw new Error(label + ' source changed during measurements');
	const result = {
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		verifyOnly,
		baselineRevision,
		candidateRevision,
		compiledHash: hash(compiled),
		lockfileHash: hash(readFileSync(path.join(repo, 'pnpm-lock.yaml'))),
		method: verifyOnly
			? 'Build and verify authored output once per scenario; no timing samples. Stream IDs differ from a full run, so wire compression may differ.'
			: 'Identical compiled fixture; production minified bundles; five warmup batches per side; 11 paired alternating batches; same process/dependencies; per-operation batch times in milliseconds. Ready small:50000 warmup/10000 per sample; streamed and 200-row pages:5000 warmup/1000 per sample; 1600-row pages:1250 warmup/250 per sample.',
		limitations: [
			'Synthetic server-only scenarios include tiny boundaries surrounded by 200/1600 unrelated four-host rows. Browser capture/animation/resource waits, backpressure, concurrency, and allocation/GC behavior are not measured.',
			'Ready response bytes include RenderResult.css followed by RenderResult.html; timing still measures renderToString itself. Streamed CSS is already included in the response.',
			...(samples.ViewStream.wire.baseline.hasAnimationDriver
				? []
				: [
						'The baseline lacks the streamed animation driver; streamed VT cases therefore compare additional functionality.',
					]),
			...(samples.ScopedView.wire.baseline.hasElementScope
				? []
				: [
						'The baseline ignores scope=element. Scoped cases compare the cost of new functionality using identical authored input; they do not claim behavioral equivalence.',
					]),
			'Batch timings and observed spread limit conclusions about individual latency; distributions are descriptive, not a performance guarantee.',
		],
		meta,
		samples,
	};
	if (output) writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
	console.log(JSON.stringify(result, null, 2));
} finally {
	// Revision snapshots belong to the shared Activity harness cache; only this
	// run's bundled output is disposable here.
	rmSync(temporary, { recursive: true, force: true });
}
