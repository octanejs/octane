import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { measureStreamingRecorders } from '../ssr-replay-streaming/streaming.mjs';

process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const sourceRoot = path.resolve(process.env.SSR_SOURCE_ROOT || repo);
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = require('esbuild');
const ts = require('typescript');
const { compile } = await import(
	pathToFileURL(path.join(repo, 'packages/octane/src/compiler/index.js'))
);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-final-replay-'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const stat = (value) => ({ score: value, median: value, min: value, samples: 1 });
const runtimePath = path.join(sourceRoot, 'packages/octane/src/runtime.server.ts');
const source = fs.readFileSync(runtimePath, 'utf8');
const counter = '__octaneFinalReplayWork';
const initialWork = () => ({
	boundary_arrays: 0,
	copied_boundaries: 0,
	pending_visits: 0,
	full_passes: 0,
	discovery_rounds: 0,
	suspended_visits: 0,
	read_probes: 0,
	try_calls: 0,
	try_closures: 0,
	hook_positions: 0,
	hook_maps: 0,
	collection_copies: 0,
	collection_entries: 0,
	list_copies: 0,
	list_entries: 0,
	vt_copies: 0,
	vt_entries: 0,
	frame_copies: 0,
	frame_entries: 0,
});
function once(text, marker, replacement) {
	assert.equal(text.split(marker).length, 2, marker);
	return text.replace(marker, replacement);
}
function instrument(text) {
	// Count actual materializations, including empty selections. A direct scan
	// has no observer here; visited pending candidates are counted separately.
	text = once(
		text,
		'return { hp, list, index };',
		`globalThis.${counter}.hook_positions++; return { hp, list, index };`,
	);
	text = once(
		text,
		'const occ = (hp.occ ??= new Map());',
		`const occ = (hp.occ ??= (globalThis.${counter}.hook_maps++, new Map()));`,
	);
	text = once(
		text,
		'const hooks = (hp.hooks ??= new Map());',
		`const hooks = (hp.hooks ??= (globalThis.${counter}.hook_maps++, new Map()));`,
	);
	const copies = '[...stream.boundaries.values()]';
	text = text.replaceAll(
		copies,
		`(globalThis.${counter}.boundary_arrays++, globalThis.${counter}.copied_boundaries += stream.boundaries.size, ${copies})`,
	);
	if (text.includes(".some((b) => b.state === 'pending')")) {
		text = once(
			text,
			".some((b) => b.state === 'pending')",
			`.some((b) => (globalThis.${counter}.pending_visits++, b.state === 'pending'))`,
		);
	} else {
		text = once(
			text,
			"if (boundary.state === 'pending') return true;",
			`globalThis.${counter}.pending_visits++; if (boundary.state === 'pending') return true;`,
		);
	}
	const entries = [
		['function runFullFramedPass(', '): FullPassResult {', 'full_passes'],
		[
			'function runDiscoveryRound(',
			'): { suspended: SuspendedList; deferred: Job[] } {',
			'discovery_rounds',
		],
		['export function ssrTry(', '): string {', 'try_calls'],
	];
	for (const [name, end, metric] of entries) {
		const start = text.indexOf(name),
			at = text.indexOf(end, start) + end.length;
		assert.ok(start >= 0 && at >= start + end.length, name);
		text = text.slice(0, at) + `\nglobalThis.${counter}.${metric}++;` + text.slice(at);
	}
	text = once(
		text,
		'for (const { promise, key } of suspended) {',
		`for (const { promise, key } of suspended) { globalThis.${counter}.suspended_visits++;`,
	);
	assert.equal(text.split('instrumented.then(NOOP, NOOP);').length, 3);
	text = text.replaceAll(
		'instrumented.then(NOOP, NOOP);',
		`globalThis.${counter}.read_probes++; instrumented.then(NOOP, NOOP);`,
	);
	for (const [marker, code] of [
		[
			'function snapshotMap<K, V>(map: Map<K, V> | null | undefined): Map<K, V> | null {',
			'if (map != null && map.size > 0) { W.collection_copies++; W.collection_entries += map.size; }',
		],
		[
			'function snapshotSet<T>(set: Set<T> | null | undefined): Set<T> | null {',
			'if (set != null && set.size > 0) { W.collection_copies++; W.collection_entries += set.size; }',
		],
		[
			'function snapshotList<T>(list: readonly T[] | null | undefined): T[] {',
			'if (list != null && list.length > 0) { W.list_copies++; W.list_entries += list.length; }',
		],
		[
			'function snapshotVtStack(): Array<{ candidate: VtSsrCandidate; consumed: boolean }> {',
			'if (VT_SSR_STACK.length > 0) { W.vt_copies++; W.vt_entries += VT_SSR_STACK.length; }',
		],
		[
			'function snapshotScopedCounts(counts: ScopedCounts | null | undefined): ScopedCounts | null {',
			'if (Array.isArray(counts) && counts.length > 0) { W.frame_copies++; W.frame_entries += counts.length; }',
		],
	])
		text = once(text, marker, marker + '\n' + code.replaceAll('W.', `globalThis.${counter}.`));
	// Count evaluated closure-expression sites under ssrTry. The parser keeps
	// nested generic arrows and callback lifetimes intact; this is an operation
	// count, not a claim about optimized V8 heap allocations.
	const ast = ts.createSourceFile('runtime.server.ts', text, ts.ScriptTarget.Latest, true);
	const edits = [];
	const visit = (node) => {
		if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
			edits.push([node.getStart(ast), `(globalThis.${counter}.try_closures++, `]);
			edits.push([node.end, ')']);
		}
		ts.forEachChild(node, visit);
	};
	const fn = ast.statements.find(
		(node) => ts.isFunctionDeclaration(node) && node.name?.text === 'ssrTry',
	);
	assert.ok(fn);
	ts.forEachChild(fn.body, visit);
	edits.sort((a, b) => b[0] - a[0]);
	for (const [at, inserted] of edits) text = text.slice(0, at) + inserted + text.slice(at);
	return text;
}

const styleWriters = Array.from(
	{ length: 16 },
	(_, i) =>
		`function Writer${i}(p) @{ preload('/resource-${i}.js', {as:'script',integrity:'i${i}'}); <span class="writer-${i}" data-writer={p.index}><style>.writer-${i} { --writer-${i}: ${i}; }</style>{p.index as string}</span> }`,
).join('\n');
const fixtureSource = `
import { useState, useId, use, preload, preinit, ViewTransition, Suspense } from 'octane';
export function Writer(p) @{
  preload('/resource-' + p.index + '.js', {as:'script', integrity:'i' + p.index});
  <span data-writer={p.index}>{p.index as string}</span>
}
export function Leaf(p) @{ <b>{p.label as string}</b> }
export function Retry(p) @{
  const [phase, setPhase] = useState(p.initial);
  const id = useId();
  if (phase < 2) {
    preinit('/resource-0.js', {as:'script'});
    preload('/discarded-' + phase + '.css', {as:'style'});
    setPhase(phase + 1);
  }
  <section id={id}><Suspense fallback={<i>retry waiting</i>}><Leaf label={phase} /></Suspense></section>
}
${styleWriters}
const writers = [${Array.from({ length: 16 }, (_, i) => 'Writer' + i).join(',')}];
export function Resources(p) @{
  <main>
    @for (const i of p.items; key i) { <{writers[i]} index={i} /> }
    <ViewTransition name="audit"><Suspense fallback={<i>pending</i>}><Retry initial={p.initial} /></Suspense></ViewTransition>
  </main>
}
export function CompiledChild(props) {
  const value = use(props.promise);
  return <span data-value={props.id}>{value}</span>;
}
`;
const compiled = compile(fixtureSource, 'ssr-final-replay.tsrx', {
	mode: 'server',
	hmr: false,
}).code;
async function bundle(observed, mutation) {
	const output = await build({
		stdin: {
			contents: `export * from 'octane/server'; export {prerender} from 'octane/static';\n${compiled}`,
			resolveDir: repo,
			loader: 'js',
		},
		bundle: true,
		write: false,
		minify: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		define: { 'process.env.NODE_ENV': '"production"' },
		nodePaths: [path.join(repo, 'packages/octane/node_modules'), path.join(repo, 'node_modules')],
		plugins: [
			{
				name: 'audit-source',
				setup(plugin) {
					plugin.onResolve(
						{ filter: /^octane(?:\/server|\/static|\/internal\/server)?$/ },
						({ path: name }) => ({
							path: path.join(
								sourceRoot,
								name === 'octane/static'
									? 'packages/octane/src/static/index.ts'
									: name === 'octane/internal/server'
										? 'packages/octane/src/internal/server.ts'
										: 'packages/octane/src/server/index.ts',
							),
						}),
					);
					if (observed || mutation)
						plugin.onLoad({ filter: /runtime\.server\.ts$/ }, () => ({
							contents: mutation ? mutation(source) : instrument(source),
							loader: 'ts',
							resolveDir: path.dirname(runtimePath),
						}));
				},
			},
		],
	});
	const text = output.outputFiles[0].text;
	const file = path.join(
		temp,
		`${observed ? 'observed' : mutation ? 'mutant' : 'clean'}-${Math.random()}.mjs`,
	);
	fs.writeFileSync(file, text);
	return {
		runtime: await import(pathToFileURL(file)),
		bytes: Buffer.byteLength(text),
		gzip: gzipSync(text).length,
		sha256: hash(text),
	};
}
async function resourceWork(rt, initial, stream) {
	const props = { initial, items: Array.from({ length: 16 }, (_, i) => i) };
	const result = stream
		? {
				html: await new Response(await rt.renderToReadableStream(rt.Resources, props)).text(),
				css: '',
			}
		: rt.renderToString(rt.Resources, props);
	for (let i = 0; i < 16; i++)
		assert.ok(
			(result.html + result.css).includes('--writer-' + i + ':'),
			'every written CSS generation survives',
		);
	assert.ok(!result.html.includes('/discarded-'), 'discarded resource generations are rewound');
	return result;
}
async function discoveryControl(rt) {
	let label = 'before';
	const first = Promise.resolve().then(() => {
		label = 'after';
		return 'first';
	});
	const second = Promise.resolve('second');
	const Child = ({ label }) => {
		const a = rt.use(first, 'first');
		const b = rt.use(second, 'second');
		return rt.createElement('b', null, label + ':' + a + ':' + b);
	};
	const App = () =>
		rt.createElement(
			'main',
			null,
			rt.createElement('p', null, 'static-prefix'),
			rt.createElement(Child, { label }),
			rt.createElement('p', null, 'static-suffix'),
		);
	const result = await rt.prerender(App);
	assert.ok(
		result.html.includes('after:first:second'),
		'canonical final parent props replace captured discovery props',
	);
	assert.ok(!result.html.includes('before:'));
	return result;
}
async function terminationControl(rt, abort) {
	const work = Array.from({ length: 3 }, () => {
		let resolve, reject;
		const promise = new Promise((yes, no) => {
			resolve = yes;
			reject = no;
		});
		return { promise, resolve, reject };
	});
	const errors = [],
		chunks = [];
	const Child = ({ index }) => rt.createElement('b', null, rt.use(work[index].promise, 'value'));
	const App = () =>
		rt.createElement(
			'main',
			null,
			...work.map((_, index) =>
				rt.createElement(
					rt.Suspense,
					{ key: index, fallback: rt.createElement('i', null, 'waiting-' + index) },
					rt.createElement(Child, { index }),
				),
			),
		);
	let stream;
	await new Promise((resolve, reject) => {
		stream = rt.renderToPipeableStream(App, undefined, {
			onError: (error) => errors.push(error.message),
			onShellError: reject,
		});
		stream.pipe({
			write(chunk) {
				chunks.push(chunk);
				if (chunks.length === 1) {
					work[0].resolve('first-ready');
					if (!abort) {
						work[1].reject(new Error('failed-middle'));
						work[2].resolve('last-ready');
					}
				} else if (abort && chunk.includes('first-ready'))
					stream.abort(new Error('stopped-stream'));
				return true;
			},
			end: resolve,
		});
	});
	const wire = chunks.join('');
	assert.ok(wire.includes('first-ready'));
	assert.ok(errors.includes(abort ? 'stopped-stream' : 'failed-middle'));
	assert.equal(wire.includes('last-ready'), !abort);
	return { errors, first: true, last: !abort, chunks: chunks.length };
}
function populatedStream(rt) {
	const wrapped = {
		...rt,
		createElement(type, props, ...children) {
			if (type === 'main')
				children.unshift(
					rt.createElement(rt.Resources, {
						initial: 2,
						items: Array.from({ length: 16 }, (_, i) => i),
					}),
				);
			return rt.createElement(type, props, ...children);
		},
	};
	return measureStreamingRecorders(wrapped, 8, 1, 'compiled');
}
function hookPositionControl(rt) {
	let value = 0;
	const Nested = () => {
		rt.useState(42, 'nested');
		return rt.createElement('i', null, 'nested');
	};
	const App = () => {
		const [phase, setPhase] = rt.useState(0, 'phase');
		if (phase === 0) setPhase(1);
		const memo = rt.useMemo(
			() => {
				rt.renderToString(Nested);
				return String(++value);
			},
			[0],
			'memo',
		);
		return rt.createElement('b', null, phase + ':' + memo);
	};
	const result = rt.renderToString(App);
	assert.ok(
		result.html.includes('1:1'),
		'nested render cannot overwrite an outer memo position before its result is stored',
	);
	return result;
}
function probeControl(rt) {
	const lazy = {
		status: 'pending',
		then() {
			this.status = 'fulfilled';
			this.value = 'lazy-ready';
		},
	};
	const immediate = {
		then(yes) {
			yes('inline-ready');
		},
	};
	const failed = {
		status: 'pending',
		then() {
			this.status = 'rejected';
			this.reason = new Error('lazy-rejected');
		},
	};
	const View = ({ value }) => rt.createElement('b', null, rt.use(value, 'probe'));
	const lazyOut = rt.renderToString(View, { value: lazy }).html;
	const inlineOut = rt.renderToString(View, { value: immediate }).html;
	assert.ok(lazyOut.includes('lazy-ready'));
	assert.ok(inlineOut.includes('inline-ready'));
	assert.throws(() => rt.renderToString(View, { value: failed }), /lazy-rejected/);
	return { lazyOut, inlineOut, rejected: failed.reason.message };
}
try {
	const clean = await bundle(false),
		observed = await bundle(true),
		targets = [];
	for (const [name, run] of [
		['resources-retry', (rt) => resourceWork(rt, 0, false)],
		['resources-settled', (rt) => resourceWork(rt, 2, false)],
		['resources-nested-stream', (rt) => resourceWork(rt, 0, true)],
		['thenable-protocol', (rt) => probeControl(rt)],
		['hook-reentrancy', (rt) => hookPositionControl(rt)],
		['buffered-discovery', (rt) => discoveryControl(rt)],
		['stream-errors', (rt) => terminationControl(rt, false)],
		['stream-abort', (rt) => terminationControl(rt, true)],
		['stream-populated', (rt) => populatedStream(rt)],
		...[0, 1, 8, 32].flatMap((size) =>
			[...new Set([1, Math.max(1, size)])].map((group) => [
				`stream-${size}-${group}`,
				(rt) => measureStreamingRecorders(rt, size, group, 'compiled'),
			]),
		),
	]) {
		const expected = await run(clean.runtime);
		globalThis[counter] = initialWork();
		const actual = await run(observed.runtime);
		assert.deepEqual(actual, expected, name + ': clean/observed output');
		targets.push({
			name,
			ops: Object.fromEntries(Object.entries(globalThis[counter]).map(([k, v]) => [k, stat(v)])),
			meta: { semanticHash: hash(JSON.stringify(expected)), ...(expected.semantic || {}) },
		});
	}
	assert.deepEqual(
		await resourceWork(clean.runtime, 0, false),
		await resourceWork(clean.runtime, 2, false),
		'discarded resources/IDs do not survive retries',
	);
	const mutant = await bundle(false, (text) =>
		once(
			text,
			"if (!wasUninstrumented && typeof status === 'string') {\n\t\tinstrumented.then(NOOP, NOOP);",
			"if (!wasUninstrumented && typeof status === 'string') { /* deliberately missing lazy-initialization subscription */",
		),
	);
	assert.throws(
		() => probeControl(mutant.runtime),
		undefined,
		'removing the ordinary pending probe must fail the public contract',
	);
	const aliasMutant = await bundle(false, (text) =>
		once(
			text,
			'map == null ? null : map.size === 0 ? EMPTY_SNAPSHOT_MAP : new Map(map)',
			'map == null ? null : map',
		),
	);
	await assert.rejects(
		() => resourceWork(aliasMutant.runtime, 0, false),
		/every written CSS generation survives/,
		'aliasing mutable collections loses established CSS on rewind',
	);
	const positionMutant = await bundle(false, (text) =>
		once(
			text,
			'return { hp, list, index };',
			'return Object.assign((globalThis.__sharedPosition ??= {}), {hp,list,index});',
		),
	);
	assert.throws(
		() => hookPositionControl(positionMutant.runtime),
		/nested render cannot overwrite/,
		'a global position scratch record breaks nested memo writes',
	);
	delete globalThis.__sharedPosition;
	targets.push({
		name: 'scan-budget',
		ops: { boundary_arrays: stat(1), copied_boundaries: stat(1) },
	});
	targets.push({
		name: 'populated-budget',
		ops: { collection_copies: stat(688), collection_entries: stat(6688) },
	});
	targets.push({
		name: 'wave-budget',
		ops: {
			full_passes: stat(33),
			suspended_visits: stat(528),
			read_probes: stat(496),
			try_closures: stat(13728),
		},
	});
	const payload = {
		suite: 'ssr-final-replay',
		iterations: 1,
		targets,
		meta: {
			node: process.version,
			v8: process.versions.v8,
			platform: process.platform,
			arch: process.arch,
			sourceHash: hash(source),
			fixtureHash: hash(compiled),
			bundleBytes: clean.bytes,
			bundleGzip: clean.gzip,
			bundleHash: clean.sha256,
			negativeControls: [
				'missing pending probe rejected',
				'aliased mutable snapshot rejected',
				'shared hook position scratch rejected',
			],
		},
	};
	console.log(JSON.stringify(payload, null, 2));
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
} finally {
	delete globalThis[counter];
	fs.rmSync(temp, { recursive: true, force: true });
}
