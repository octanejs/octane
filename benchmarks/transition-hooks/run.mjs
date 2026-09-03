// Deterministic transition/hook hot-path suite. The clean production bundle
// establishes semantics, shipped bytes, and secondary timing; a separately
// instrumented copy counts source creation events per drive phase. Counts are
// never timed and make no claim about V8 heap bytes.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { constants as zlibConstants, gzipSync } from 'node:zlib';

import { COUNTER_GLOBAL, emptyCounters, instrumentJavaScript } from '../hook-memo/instrument.mjs';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const ROOT = import.meta.dirname;
const REPO = path.resolve(process.env.OCTANE_TRANSITION_ROOT || path.join(ROOT, '../..'));
const DEPENDENCY_REPO = path.resolve(process.env.OCTANE_TRANSITION_EXTERNAL_ROOT || REPO);
const OCTANE_ROOT = path.join(REPO, 'packages/octane');
const SOURCE_ROOT = path.join(OCTANE_ROOT, 'src');
const requireDependencies = createRequire(
	path.join(DEPENDENCY_REPO, 'packages/octane/package.json'),
);
const { build, transformSync, version: esbuildVersion } = requireDependencies('esbuild');
const { parseModule, builders } = requireDependencies('@tsrx/core');
const { print: esrapPrint } = requireDependencies('esrap');
const esrapTsx = requireDependencies('esrap/languages/tsx').default;
const { Window } = await import(pathToFileURL(requireDependencies.resolve('happy-dom')).href);
const { compile } = await import(pathToFileURL(path.join(SOURCE_ROOT, 'compiler/index.js')).href);
const { decodeSourceMappings } = await import(
	pathToFileURL(path.join(SOURCE_ROOT, 'compiler/fat-segments.js')).href
);
const exportsMap = JSON.parse(
	fs.readFileSync(path.join(OCTANE_ROOT, 'package.json'), 'utf8'),
).exports;

const FIXTURE = path.join(ROOT, 'cases.tsrx');
const ENTRY = path.join(ROOT, 'entry.mjs');
/** Observed cycles per phase; every count guard is a multiple of this. */
const CYCLES = 64;
/** Quiet microtask ticks that end a drive step. */
const QUIET_TICKS = 4;
const TIMING =
	process.env.OCTANE_TRANSITION_TIMING === '0' ? null : { warmup: 1000, samples: 40, batch: 500 };
const HELD_TIMING = TIMING && { warmup: 200, samples: 40, batch: 100 };
/**
 * Every scenario runs by default. A comma-separated subset supports A/B runs
 * against an older checkout that lacks a pinned behavior; results from a subset
 * carry `meta.run.scenarios` and are not comparable with committed guards.
 */
const SCENARIOS = new Set(
	(process.env.OCTANE_TRANSITION_SCENARIOS || 'cycle,updater,held,dispatch,click,urgent').split(
		',',
	),
);

const val = (score) => ({ score, median: score, min: score, samples: 1 });
const bytes = (source) => Buffer.byteLength(source);
const gzipBytes = (source) => gzipSync(source, { level: zlibConstants.Z_BEST_COMPRESSION }).length;
const print = (ast) => esrapPrint(ast, esrapTsx()).code;
const sha256 = (source) => createHash('sha256').update(source).digest('hex');

function dependencyVersion(name) {
	let directory = path.dirname(requireDependencies.resolve(name));
	while (directory !== path.dirname(directory)) {
		const manifest = path.join(directory, 'package.json');
		if (fs.existsSync(manifest)) {
			const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
			if (pkg.name === name) return pkg.version;
		}
		directory = path.dirname(directory);
	}
	return null;
}

function octaneRequest(request) {
	const key = request === 'octane' ? '.' : './' + request.slice('octane/'.length);
	const entry = exportsMap[key];
	const target = typeof entry === 'string' ? entry : entry?.import || entry?.default;
	if (typeof target !== 'string') throw new Error(`Unmapped benchmark runtime import ${request}`);
	return path.resolve(OCTANE_ROOT, target);
}

async function bundleApplication(compiledFixture, outfile) {
	const result = await build({
		entryPoints: [ENTRY],
		absWorkingDir: REPO,
		outfile,
		bundle: true,
		write: false,
		sourcemap: 'external',
		format: 'esm',
		platform: 'browser',
		target: 'es2022',
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [
			path.join(DEPENDENCY_REPO, 'packages/octane/node_modules'),
			path.join(DEPENDENCY_REPO, 'node_modules'),
		],
		plugins: [
			{
				name: 'transition-hooks-benchmark',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => ({
						path: octaneRequest(request),
					}));
					plugin.onLoad({ filter: /\.tsrx$/ }, ({ path: filename }) => {
						assert.equal(filename, FIXTURE, 'unexpected fixture module');
						return { contents: compiledFixture, loader: 'js', resolveDir: ROOT };
					});
				},
			},
		],
	});
	assert.equal(result.outputFiles.length, 2, 'expected one self-contained bundle and source map');
	return {
		code: result.outputFiles.find((file) => file.path === outfile).text,
		map: JSON.parse(result.outputFiles.find((file) => file.path === outfile + '.map').text),
	};
}

function sourceOwner(map, generatedFile) {
	const owners = map.sources.map((source) => {
		const filename = path.resolve(path.dirname(generatedFile), map.sourceRoot || '', source);
		if (filename === FIXTURE || filename === ENTRY) return 'application';
		if (filename.startsWith(SOURCE_ROOT + path.sep)) return 'runtime';
		return null;
	});
	const lines = decodeSourceMappings(map.mappings);
	return (node) => {
		const position = node.loc?.start;
		if (!position) return null;
		const segments = lines[position.line - 1] || [];
		let lower = 0;
		let upper = segments.length;
		while (lower < upper) {
			const middle = (lower + upper) >>> 1;
			if (segments[middle][0] <= position.column) lower = middle + 1;
			else upper = middle;
		}
		const segment = segments[lower - 1];
		return segment?.length >= 4 ? owners[segment[1]] : null;
	};
}

function setupDom() {
	const window = new Window({ url: 'http://localhost/' });
	for (const key of [
		'window',
		'document',
		'navigator',
		'Node',
		'Element',
		'HTMLElement',
		'SVGElement',
		'Text',
		'Comment',
		'DocumentFragment',
		'Event',
		'EventTarget',
		'MutationObserver',
		'HTMLInputElement',
		'HTMLSelectElement',
		'HTMLTextAreaElement',
		'getComputedStyle',
		'requestAnimationFrame',
		'cancelAnimationFrame',
	]) {
		const value = key === 'window' ? window : window[key];
		if (value !== undefined)
			Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
	}
	return window;
}

/** Let the runtime's own microtask scheduling run until no render is observed. */
async function quiesce(observations) {
	let seen = observations.length;
	for (let tick = 0, quiet = 0; tick < 256; tick++) {
		await Promise.resolve();
		if (observations.length === seen) {
			if (++quiet === QUIET_TICKS) return;
		} else {
			seen = observations.length;
			quiet = 0;
		}
	}
	throw new Error('the scheduler did not quiesce within 256 microtask ticks');
}

function fail(label, observations, expected) {
	throw new Error(
		`${label}: observed ${JSON.stringify(observations)}, expected ${JSON.stringify(expected)}`,
	);
}

function expectRenders(label, observations, expected) {
	if (observations.length !== expected.length) fail(label, observations, expected);
	for (let index = 0; index < expected.length; index++) {
		const [component, value, pending] = expected[index];
		const actual = observations[index];
		if (actual[0] !== component || actual[1] !== value || actual[2] !== pending)
			fail(label, observations, expected);
	}
}

function expectText(label, node, expected) {
	if (node.textContent !== expected)
		throw new Error(
			`${label}: rendered ${JSON.stringify(node.textContent)}, expected ${JSON.stringify(expected)}`,
		);
}

/**
 * Each scenario mounts once and exposes async drive steps. A step performs the
 * public API calls of one complete cycle, lets the runtime's scheduler settle,
 * and checks the observed render sequence and DOM against the React-shaped
 * contract the runtime tests pin.
 */
function scenarios(bundle) {
	const observations = [];
	const renders = { count: 0 };
	const observe = (component, value, pending) => {
		renders.count++;
		observations.push([component, value, pending]);
	};
	const begin = () => {
		observations.length = 0;
	};

	function mountRoot(component, props) {
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = bundle.createRoot(container);
		begin();
		bundle.flushSync(() => root.render(component, props));
		return {
			container,
			unmount() {
				root.unmount();
				assert.equal(container.innerHTML, '', 'teardown');
				container.remove();
			},
		};
	}

	return {
		observations,
		renders,
		cycle(updater = false) {
			let setValue;
			let start;
			const label = updater ? 'updater' : 'cycle';
			const { container, unmount } = mountRoot(bundle.TransitionCycle, {
				observe,
				bind: (setter, starter) => {
					setValue = setter;
					start = starter;
				},
			});
			expectRenders(`${label} mount`, observations, [['cycle', 0, false]]);
			let current = 0;
			const increment = (value) => value + 1;
			return {
				unmount,
				async step() {
					const next = ++current;
					begin();
					// A replacement value and React's common functional-updater idiom
					// take different runtime paths; both must render identically.
					if (updater) start(() => setValue(increment));
					else start(() => setValue(next));
					await quiesce(observations);
					// The transition render publishes the pending cue with the new
					// value; the Action's settle publishes the falling edge.
					expectRenders(label, observations, [
						['cycle', next, true],
						['cycle', next, false],
					]);
					expectText(label, container, `${next}:idle`);
				},
			};
		},
		held() {
			let setValue;
			let start;
			const requests = new Map();
			const promiseFor = (value) => {
				let request = requests.get(value);
				if (request === undefined) {
					let resolve;
					request = new Promise((done) => {
						resolve = done;
					});
					request.resolve = () => {
						request.status = 'fulfilled';
						request.value = value;
						resolve(value);
					};
					requests.set(value, request);
				}
				return request;
			};
			promiseFor(0).resolve();
			const { container, unmount } = mountRoot(bundle.HeldTransition, {
				observe,
				promiseFor,
				bind: (setter, starter) => {
					setValue = setter;
					start = starter;
				},
			});
			expectRenders('held mount', observations, [['held', 0, false]]);
			expectText('held mount', container, 'idlevalue-0');
			let current = 0;
			return {
				unmount,
				async step() {
					const previous = current;
					const next = ++current;
					const request = promiseFor(next);
					begin();
					start(() => setValue(next));
					await quiesce(observations);
					// The suspended transition holds the committed content whole:
					// the cue re-render shows the previous value with the pending
					// indicator and no fallback.
					expectRenders('held hold', observations, [
						['held', next, true],
						['held', previous, true],
					]);
					expectText('held hold', container, `pendingvalue-${previous}`);
					if (container.querySelector('p') !== null) throw new Error('held hold: fallback shown');
					begin();
					request.resolve();
					await quiesce(observations);
					requests.delete(previous);
					// Promotion renders the held value forward and the Action's
					// completion publishes the falling edge.
					expectRenders('held release', observations, [
						['held', next, true],
						['held', next, false],
					]);
					expectText('held release', container, `idlevalue-${next}`);
					if (container.querySelector('p') !== null)
						throw new Error('held release: fallback shown');
				},
			};
		},
		dispatch() {
			let setValue;
			const { container, unmount } = mountRoot(bundle.FunctionalDispatch, {
				observe,
				bind: (setter) => {
					setValue = setter;
				},
			});
			expectRenders('dispatch mount', observations, [['dispatch', 0, false]]);
			let current = 0;
			return {
				unmount,
				async step() {
					const next = ++current;
					begin();
					setValue((value) => value + 1);
					await quiesce(observations);
					expectRenders('dispatch', observations, [['dispatch', next, false]]);
					expectText('dispatch', container, String(next));
				},
				async bail() {
					begin();
					setValue(current);
					await quiesce(observations);
					// An idle same-value set bails eagerly without a render.
					expectRenders('bail', observations, []);
					expectText('bail', container, String(current));
				},
			};
		},
		click() {
			let setValue;
			const increment = (value) => value + 1;
			const onClick = () => setValue(increment);
			const { container, unmount } = mountRoot(bundle.ClickDispatch, {
				observe,
				onClick,
				bind: (setter) => {
					setValue = setter;
				},
			});
			expectRenders('click mount', observations, [['click', 0, false]]);
			const button = container.querySelector('button');
			let current = 0;
			return {
				unmount,
				async step() {
					const next = ++current;
					begin();
					// A native click reaches the delegated handler, whose functional
					// update commits through the discrete-event flush.
					button.click();
					await quiesce(observations);
					expectRenders('click', observations, [['click', next, false]]);
					expectText('click', container, String(next));
				},
			};
		},
		urgent() {
			let setValue;
			let start;
			let setCount;
			const { container, unmount } = mountRoot(bundle.UrgentWhileQueued, {
				observe,
				bind: (setter, starter) => {
					setValue = setter;
					start = starter;
				},
				bindUrgent: (setter) => {
					setCount = setter;
				},
			});
			expectRenders('urgent mount', observations, [
				['parent', 0, false],
				['child', 0, false],
			]);
			let current = 0;
			return {
				unmount,
				async step() {
					const previous = current;
					const next = ++current;
					begin();
					start(() => setValue(next));
					setCount(next);
					await quiesce(observations);
					// The urgent parent render exposes the child's committed value
					// while its transition update stays queued; the transition then
					// renders the new value and the settle publishes the falling edge.
					expectRenders('urgent', observations, [
						['parent', next, false],
						['child', previous, true],
						['child', next, true],
						['child', next, false],
					]);
					expectText('urgent', container, `${next}${next}/${next}:idle`);
				},
			};
		},
	};
}

async function exercise(bundle, observed) {
	const counters = {};
	const semantics = {};
	const suite = scenarios(bundle);
	async function phase(name, count, step) {
		globalThis[COUNTER_GLOBAL] = emptyCounters();
		const rendersBefore = suite.renders.count;
		const first = [];
		for (let index = 0; index < count; index++) {
			await step();
			if (index === 0) first.push(...suite.observations);
		}
		if (observed) counters[name] = { cycles: count, counters: { ...globalThis[COUNTER_GLOBAL] } };
		semantics[name] = {
			renders: suite.renders.count - rendersBefore,
			first,
			last: [...suite.observations],
		};
	}
	if (SCENARIOS.has('cycle')) {
		const cycle = suite.cycle();
		await phase('cycle', CYCLES, cycle.step);
		cycle.unmount();
	}
	if (SCENARIOS.has('updater')) {
		const updater = suite.cycle(true);
		await phase('updater', CYCLES, updater.step);
		updater.unmount();
	}
	if (SCENARIOS.has('held')) {
		const held = suite.held();
		await phase('held', CYCLES, held.step);
		held.unmount();
	}
	if (SCENARIOS.has('dispatch')) {
		const dispatch = suite.dispatch();
		await phase('dispatch', CYCLES, dispatch.step);
		await phase('bail', CYCLES, dispatch.bail);
		dispatch.unmount();
	}
	if (SCENARIOS.has('click')) {
		const click = suite.click();
		await phase('click', CYCLES, click.step);
		click.unmount();
	}
	if (SCENARIOS.has('urgent')) {
		const urgent = suite.urgent();
		await phase('urgent', CYCLES, urgent.step);
		urgent.unmount();
	}
	return { counters, semantics };
}

async function time(bundle) {
	const timings = {};
	const suite = scenarios(bundle);
	async function measure(name, step, config) {
		for (let index = 0; index < config.warmup; index++) await step();
		const samples = [];
		for (let sample = 0; sample < config.samples; sample++) {
			const started = performance.now();
			for (let index = 0; index < config.batch; index++) await step();
			samples.push(((performance.now() - started) * 1000) / config.batch);
		}
		timings[`${name}_us`] = timingStatForJson(summarizeSamples(samples));
	}
	if (SCENARIOS.has('cycle')) {
		const cycle = suite.cycle();
		await measure('cycle', cycle.step, TIMING);
		cycle.unmount();
	}
	if (SCENARIOS.has('updater')) {
		const updater = suite.cycle(true);
		await measure('updater', updater.step, TIMING);
		updater.unmount();
	}
	if (SCENARIOS.has('held')) {
		const held = suite.held();
		await measure('held', held.step, HELD_TIMING);
		held.unmount();
	}
	if (SCENARIOS.has('dispatch')) {
		const dispatch = suite.dispatch();
		await measure('dispatch', dispatch.step, TIMING);
		await measure('bail', dispatch.bail, TIMING);
		dispatch.unmount();
	}
	if (SCENARIOS.has('click')) {
		const click = suite.click();
		await measure('click', click.step, TIMING);
		click.unmount();
	}
	if (SCENARIOS.has('urgent')) {
		const urgent = suite.urgent();
		await measure('urgent', urgent.step, HELD_TIMING);
		urgent.unmount();
	}
	return timings;
}

function summarizedCounters(counters) {
	return {
		runtime_functions: counters.runtime_functions,
		runtime_arrays:
			counters.runtime_arrayLiterals +
			counters.runtime_arrayConstructors +
			counters.runtime_restArrays,
		runtime_objects: counters.runtime_objectLiterals,
		runtime_constructors: counters.runtime_constructors,
		application_functions: counters.application_functions,
		application_arrays:
			counters.application_arrayLiterals +
			counters.application_arrayConstructors +
			counters.application_restArrays,
		application_objects: counters.application_objectLiterals,
	};
}

const fixtureSource = fs.readFileSync(FIXTURE, 'utf8');
const runMetadata = {
	node: process.version,
	esbuild: esbuildVersion,
	tsrxCore: dependencyVersion('@tsrx/core'),
	cycles: CYCLES,
	scenarios: [...SCENARIOS],
	quietTicks: QUIET_TICKS,
	timing: TIMING && { ...TIMING, held: HELD_TIMING },
	fixtureSha256: sha256(fixtureSource),
	entrySha256: sha256(fs.readFileSync(ENTRY)),
	observerSha256: sha256(fs.readFileSync(path.join(ROOT, '../hook-memo/instrument.mjs'))),
	runnerSha256: sha256(fs.readFileSync(path.join(ROOT, 'run.mjs'))),
	measurement:
		'source creation events per observed drive phase, render counts, bytes, and secondary microsecond timings',
};

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-transition-hooks-'));
const window = setupDom();
let failure;
let target;
try {
	const compiled = compile(fixtureSource, FIXTURE, { mode: 'client', hmr: false, dev: false });
	assert.deepEqual(compiled.diagnostics, [], 'benchmark fixture emitted compiler diagnostics');
	const cleanFile = path.join(tempDir, 'clean.mjs');
	const { code: cleanCode, map } = await bundleApplication(compiled.code, cleanFile);
	fs.writeFileSync(cleanFile, cleanCode);
	const cleanBundle = await import(pathToFileURL(cleanFile).href);
	const clean = await exercise(cleanBundle, false);

	const observedCode = instrumentJavaScript(
		cleanCode,
		cleanFile,
		sourceOwner(map, cleanFile),
		{ parseModule, builders, print },
		{ objects: true },
	);
	const observedFile = path.join(tempDir, 'observed.mjs');
	fs.writeFileSync(observedFile, observedCode);
	globalThis[COUNTER_GLOBAL] = emptyCounters();
	const observed = await exercise(await import(pathToFileURL(observedFile).href), true);
	assert.deepEqual(observed.semantics, clean.semantics, 'the creation observer changed semantics');

	const ops = {};
	for (const [phase, measurement] of Object.entries(observed.counters)) {
		ops[`${phase}_renders`] = val(clean.semantics[phase].renders);
		for (const [metric, count] of Object.entries(summarizedCounters(measurement.counters))) {
			ops[`${phase}_${metric}`] = val(count);
		}
	}
	const minifiedBundle = transformSync(cleanCode, { loader: 'js', minify: true }).code;
	ops.code_minified = val(bytes(transformSync(compiled.code, { loader: 'js', minify: true }).code));
	ops.bundle_gzip = val(gzipBytes(minifiedBundle));
	const timings = TIMING === null ? {} : await time(cleanBundle);
	Object.assign(ops, timings);
	target = {
		name: 'octane',
		ops,
		meta: { run: runMetadata, counters: observed.counters, semantics: clean.semantics },
	};
	for (const phase of Object.keys(observed.counters)) {
		const summary = summarizedCounters(observed.counters[phase].counters);
		console.log(
			`${phase}: ${ops[`${phase}_renders`].score} renders / ${CYCLES} cycles; runtime creations ${summary.runtime_functions} functions, ${summary.runtime_arrays} arrays, ${summary.runtime_objects} objects, ${summary.runtime_constructors} constructors; application ${summary.application_functions} functions, ${summary.application_arrays} arrays, ${summary.application_objects} objects`,
		);
	}
	for (const [name, stat] of Object.entries(timings)) {
		console.log(
			`${name}: median ${stat.median.toFixed(3)} µs, score ${stat.score.toFixed(3)} µs, min ${stat.min.toFixed(3)} µs`,
		);
	}
	console.log(
		`bundle ${ops.bundle_gzip.score} gzip bytes; compiled fixture ${ops.code_minified.score} minified bytes`,
	);
	console.log('Transition render-sequence, DOM, hold/release, and eager-bailout controls passed.');
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(failure);
} finally {
	delete globalThis[COUNTER_GLOBAL];
	await window.happyDOM.close();
	fs.rmSync(tempDir, { recursive: true, force: true });
}

/**
 * Fixed work budgets as `[perCycle, once]`: the guarded counter must not exceed
 * perCycle × CYCLES + once, where `once` admits a lazily installed runtime
 * capability on the first cycle. Positive references let the ratio runner
 * enforce exact ceilings, including zero for paths that must stay allocation-free.
 */
const WORK_MODEL = {
	cycle_renders: [2, 0],
	cycle_runtime_functions: [2, 0],
	cycle_runtime_arrays: [27, 0],
	cycle_runtime_objects: [11, 1],
	cycle_runtime_constructors: [3, 0],
	updater_renders: [2, 0],
	updater_runtime_functions: [1, 0],
	updater_runtime_arrays: [27, 0],
	updater_runtime_objects: [11, 0],
	updater_runtime_constructors: [3, 0],
	held_renders: [4, 0],
	held_runtime_functions: [11, 0],
	held_runtime_arrays: [70, 0],
	held_runtime_objects: [21, 0],
	held_runtime_constructors: [15, 1],
	dispatch_renders: [1, 0],
	dispatch_runtime_functions: [1, 0],
	dispatch_runtime_arrays: [11, 0],
	dispatch_runtime_objects: [4, 0],
	dispatch_runtime_constructors: [1, 0],
	bail_renders: [1, 0],
	bail_runtime_functions: [1, 0],
	bail_runtime_arrays: [1, 0],
	bail_runtime_objects: [1, 0],
	bail_runtime_constructors: [1, 0],
	click_renders: [1, 0],
	click_runtime_functions: [1, 0],
	click_runtime_arrays: [11, 0],
	click_runtime_objects: [4, 0],
	click_runtime_constructors: [1, 0],
	urgent_renders: [4, 0],
	urgent_runtime_functions: [4, 0],
	urgent_runtime_arrays: [32, 0],
	urgent_runtime_objects: [17, 0],
	urgent_runtime_constructors: [6, 0],
};

const payload = {
	suite: 'transition-hooks',
	iterations: 1,
	targets: [
		...(target ? [target] : []),
		{
			name: 'work-model',
			ops: Object.fromEntries(
				Object.entries(WORK_MODEL).map(([key, [perCycle, once]]) => [
					key,
					val(perCycle * CYCLES + once),
				]),
			),
			meta: {
				description:
					'Fixed ceilings: per-cycle budget × observed cycles, plus a one-time allowance for lazily installed runtime capabilities.',
			},
		},
	],
	meta: runMetadata,
	...(failure ? { failed: failure } : {}),
};
if (process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
if (failure) process.exitCode = 1;
