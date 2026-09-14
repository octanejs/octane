import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const { values: args, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		baseline: { type: 'string' },
		'baseline-revision': { type: 'string' },
		candidate: { type: 'string', default: path.resolve(import.meta.dirname, '../..') },
		output: { type: 'string' },
		iterations: { type: 'string' },
		warmups: { type: 'string' },
		counts: { type: 'string' },
		scenario: { type: 'string' },
		lane: { type: 'string' },
		smoke: { type: 'boolean', default: false },
		help: { type: 'boolean', default: false },
	},
});
if (args.help) {
	console.log(`Usage: node benchmarks/strong-compiler-checks/run.mjs [iterations]
  --baseline <repository-or-snapshot> --output <results.json>
  [--baseline-revision <commit>] [--candidate <repository>]
  [--iterations <count>] [--warmups <count>] [--counts 100,1000]
  [--scenario normal|ambient|alias-heavy|cached]
  [--lane prod-client|dev-hmr|server|plain] [--smoke]

BENCH_JSON supplies the output path when --output is omitted.
Defaults: 3 warmups, 17 pairs at 100 components, 11 pairs at 1000.
Smoke: 1 component, 0 warmups, 1 pair; validates the harness only.`);
	process.exit(0);
}
if (!args.baseline || !(args.output ?? process.env.BENCH_JSON)) {
	throw new Error('Pass --baseline and --output (or BENCH_JSON). See --help.');
}
if (positionals.length > 1 || (positionals.length && args.iterations)) {
	throw new Error('Specify the iteration count once, as --iterations or a positional argument.');
}
function integer(value, label, minimum = 1) {
	const result = Number(value);
	if (!Number.isSafeInteger(result) || result < minimum) {
		throw new Error(`${label} must be an integer >= ${minimum}.`);
	}
	return result;
}
const output = path.resolve(args.output ?? process.env.BENCH_JSON);
const roots = { baseline: path.resolve(args.baseline), candidate: path.resolve(args.candidate) };
const counts = args.counts
	? [...new Set(args.counts.split(',').map((value) => integer(value, 'counts')))]
	: args.smoke
		? [1]
		: [100, 1000];
const iterations = args.iterations ?? positionals[0];
const sampleCount = iterations === undefined ? null : integer(iterations, 'iterations');
const warmups = integer(args.warmups ?? (args.smoke ? 0 : 3), 'warmups', 0);
const scenarios = ['normal', 'ambient', 'alias-heavy', 'cached'];
if (args.scenario && !scenarios.includes(args.scenario)) throw new Error('Unknown --scenario.');
const lanes = {
	'prod-client': { mode: 'client', hmr: false, dev: false },
	'dev-hmr': { mode: 'client', hmr: true, dev: true },
	server: { mode: 'server', hmr: false, dev: false },
	plain: { mode: 'client', hmr: true, dev: true },
};
if (args.lane && !Object.hasOwn(lanes, args.lane)) throw new Error('Unknown --lane.');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const compilerRelative = 'packages/octane/src/compiler/compile.js';

function revision(root) {
	try {
		return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return null;
	}
}

// Include shared source modules and package import maps, not only strong-mode.js:
// changes to inference, parsing, printing, or an import target invalidate a run.
function sourceSnapshot(root) {
	const files = {};
	function visit(relative) {
		for (const entry of fs
			.readdirSync(path.join(root, relative), { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name))) {
			const name = `${relative}/${entry.name}`;
			if (entry.isDirectory()) visit(name);
			else if (entry.isFile()) files[name] = hash(fs.readFileSync(path.join(root, name)));
		}
	}
	visit('packages/octane/src');
	files['packages/octane/package.json'] = hash(
		fs.readFileSync(path.join(root, 'packages/octane/package.json')),
	);
	return { sha256: hash(JSON.stringify(files)), files };
}

function dependencies(root) {
	const require = createRequire(path.join(root, compilerRelative));
	return Object.fromEntries(
		[
			'@tsrx/core',
			'oxc-tsrx/tsrx-core-compat',
			'entities',
			'esrap',
			'esrap/languages/tsx',
			'esbuild',
			'happy-dom',
		].map((name) => {
			const file = fs.realpathSync(require.resolve(name));
			return [name, { file, sha256: hash(fs.readFileSync(file)) }];
		}),
	);
}

function sourceFor(count, scenario, lane = 'prod-client') {
	let head = "import { useState, useEffect } from 'octane';\nconst moduleConstant = 3;";
	if (scenario === 'alias-heavy') {
		head +=
			'\nconst browser = globalThis.window;\nconst storage = browser.localStorage;\nconst doc = browser.document;\nconst { navigator: nav } = browser;\n';
		head += Array.from(
			{ length: count },
			(_, index) =>
				`const browser${index} = browser;\nconst store${index} = storage;\nconst doc${index} = doc;\nconst nav${index} = nav;`,
		).join('\n');
	}
	const rows = Array.from({ length: count }, (_, index) => {
		if (scenario === 'cached') {
			const declarations = `const read = () => props.value + ${index};
  const values = [props.value, ${index}];
  const record = { value: props.value + ${index} };
  useEffect(() => { props.onRead(read, values, record); });`;
			return lane === 'plain'
				? `export function useRow${index}(props) {
  ${declarations}
  return props.value + ${index};
}`
				: `export function Row${index}(props) @{
  ${declarations}
  <button>{(props.value + ${index}) as string}</button>
}`;
		}
		if (scenario === 'normal')
			return `export function Row${index}(props) @{
  const [selected, setSelected] = useState(false);
  const value = props.value + moduleConstant + ${index};
  useEffect(() => { props.onRead(value); });
  <button onClick={() => setSelected(!selected)} data-selected={selected}>{value as string}</button>
}`;
		if (scenario === 'ambient')
			return `export function Row${index}(props) @{
  const [value, setValue] = useState(() => window.localStorage.getItem('row-${index}'));
  useEffect(() => { props.onRead(globalThis.window.innerWidth, navigator.language, document.title); });
  <button onClick={() => setValue(localStorage.getItem('row-${index}'))}>{value as string}</button>
}`;
		return `export function Row${index}(props) @{
  const [value, setValue] = useState(() => store${index}.getItem('row-${index}'));
  useEffect(() => { props.onRead(browser${index}.innerWidth, nav${index}.language, doc${index}.title); });
  <button onClick={() => setValue(store${index}.getItem('row-${index}'))}>{value as string}</button>
}`;
	});
	return `${head}\n${rows.join('\n')}`;
}

// Execute the same declaration shapes with two independent owners before any
// timing. Bundling uses the selected revision's real runtime without rewriting
// emitted modules. Browser layout and runtime duration are outside this audit.
async function cachedSemantics(compilers, root, lane, strong, window) {
	const options = { ...lanes[lane], strong };
	const source = sourceFor(2, 'cached', lane);
	const filename = `/src/Benchmark-cached-2.${lane === 'plain' ? 'ts' : 'tsrx'}`;
	const output = (lane === 'plain' ? compilers.slots : compilers.compile)(
		source,
		filename,
		options,
	);
	assert.ok(output?.code && !output.diagnostics?.length, 'Clean cached semantic output');
	const isServer = lane === 'server';
	const wrapper =
		lane === 'plain'
			? compilers.compile(
					`import { useRow0, useRow1 } from 'benchmark:fixture';
export function Row0(props) @{ const value = useRow0(props); <button>{value as string}</button> }
export function Row1(props) @{ const value = useRow1(props); <button>{value as string}</button> }`,
					'/src/Benchmark-wrapper.tsrx',
					options,
				).code
			: output.code;
	const entry = `export * from 'benchmark:wrapper';
export { ${isServer ? 'renderToString' : 'createRoot, flushSync, drainPassiveEffects'} } from '${isServer ? 'octane/server' : 'octane'}';`;
	const require = createRequire(path.join(root, compilerRelative));
	const bundle = await build({
		stdin: { contents: entry, sourcefile: 'benchmark-entry.js', resolveDir: root },
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': JSON.stringify(options.dev ? 'development' : 'production') },
		plugins: [
			{
				name: 'strong-cache-semantic-control',
				setup(builder) {
					builder.onResolve({ filter: /^benchmark:/ }, ({ path }) => ({
						path,
						namespace: 'benchmark',
					}));
					builder.onLoad({ filter: /.*/, namespace: 'benchmark' }, ({ path }) => ({
						contents: path === 'benchmark:fixture' ? output.code : wrapper,
						loader: lane === 'plain' && path === 'benchmark:fixture' ? 'ts' : 'js',
						resolveDir: root,
					}));
					builder.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path }) => ({
						path: require.resolve(path),
					}));
				},
			},
		],
	});
	const api = await import(
		`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
	);
	const observations = [];
	const cacheIdentity = [];
	for (const index of [0, 1]) {
		const Component = api[`Row${index}`];
		if (isServer) {
			let notifications = 0;
			for (const value of [2, 5, 5, 0]) {
				const html = api.renderToString(Component, {
					value,
					onRead() {
						notifications++;
					},
				}).html;
				assert.ok(html.includes(`<button>${value + index}</button>`), html);
				assert.equal(notifications, 0, 'Effects do not run during server rendering');
				observations.push({ index, value, html });
			}
			continue;
		}
		const container = window.document.createElement('div');
		window.document.body.append(container);
		const rendered = api.createRoot(container);
		let last;
		let inputs;
		try {
			let previousInputs;
			for (const [step, value] of [2, 5, 5, 0].entries()) {
				// A fresh observer forces the effect to expose each allocation even
				// when its value input is unchanged. This cannot pass merely because
				// an effect skipped a render and retained an earlier observation.
				let notified = false;
				const onRead = (read, values, record) => {
					notified = true;
					inputs = [read, values, record];
					last = [read(), [...values], record.value];
				};
				api.flushSync(() => rendered.render(Component, { value, onRead }));
				api.drainPassiveEffects();
				assert.ok(notified, "Fresh observer receives this render's values");
				assert.equal(container.textContent, String(value + index));
				assert.deepEqual(last, [value + index, [value, index], value + index]);
				observations.push({ index, value, text: container.textContent, observed: last });
				if (previousInputs)
					cacheIdentity.push({
						index,
						value,
						inputChanged: step !== 2,
						same: inputs.map((input, inputIndex) => input === previousInputs[inputIndex]),
					});
				previousInputs = inputs;
			}
		} finally {
			rendered.unmount();
			container.remove();
		}
	}
	return {
		observations,
		cacheIdentity,
		emitted: { bytes: Buffer.byteLength(output.code), sha256: hash(output.code) },
	};
}

async function validateCachedSemantics(compilers) {
	const window = new Window({ url: 'https://benchmark.invalid/' });
	// Passive effects are drained explicitly below. Use the DOM shim's timer
	// fallback so independent runtime bundles do not retain Node message ports.
	const globals = [
		'window',
		'document',
		'navigator',
		'Node',
		'Element',
		'HTMLElement',
		'SVGElement',
		'DocumentFragment',
		'MutationObserver',
		'Event',
		'CustomEvent',
		'MessageChannel',
	];
	const previous = new Map(
		globals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
	);
	for (const name of globals)
		Object.defineProperty(globalThis, name, {
			configurable: true,
			writable: true,
			value: name === 'window' ? window : window[name],
		});
	const results = [];
	try {
		for (const lane of args.lane ? [args.lane] : Object.keys(lanes)) {
			for (const strong of [true, false]) {
				const baseline = await cachedSemantics(
					compilers.baseline,
					roots.baseline,
					lane,
					strong,
					window,
				);
				const candidate = await cachedSemantics(
					compilers.candidate,
					roots.candidate,
					lane,
					strong,
					window,
				);
				assert.deepEqual(
					candidate.observations,
					baseline.observations,
					`${lane}/${strong}: runtime values differ`,
				);
				if (strong && lane !== 'server') {
					for (const identity of candidate.cacheIdentity)
						assert.deepEqual(
							identity.same,
							Array(3).fill(!identity.inputChanged),
							`${lane}: callback, array, and object identities must stabilize only while their value input is unchanged`,
						);
				}
				if (!strong)
					assert.deepEqual(
						candidate.cacheIdentity,
						baseline.cacheIdentity,
						`${lane}: compatibility allocation identity differs`,
					);
				results.push({
					lane,
					policy: strong ? 'Strong' : 'Compat',
					sha256: hash(JSON.stringify(candidate.observations)),
					baseline,
					candidate,
				});
			}
		}
	} finally {
		for (const [name, descriptor] of previous) {
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		}
		await window.happyDOM.close();
	}
	return results;
}

const report = {
	suite: 'strong-compiler-checks',
	status: 'running',
	startedAt: new Date().toISOString(),
	harnessSha256: hash(fs.readFileSync(new URL(import.meta.url))),
	command: [process.execPath, ...process.execArgv, ...process.argv.slice(1)],
	environment: {
		node: process.version,
		v8: process.versions.v8,
		platform: process.platform,
		arch: process.arch,
		osRelease: os.release(),
		cpu: os.cpus()[0]?.model,
		cpuCount: os.cpus().length,
		nodeEnv: process.env.NODE_ENV ?? null,
	},
	config: {
		counts,
		scenarios: args.scenario ? [args.scenario] : scenarios,
		warmups,
		iterations: sampleCount,
		defaultIterations: { small: 17, large: 11 },
		smoke: args.smoke,
		lanes,
		selectedLane: args.lane ?? null,
	},
	sources: {},
	results: [],
	targets: [],
};
function writeReport() {
	fs.mkdirSync(path.dirname(output), { recursive: true });
	fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
function stats(values) {
	return {
		...timingStatForJson(summarizeSamples(values, { scoreMode: 'mean' })),
		max: Math.max(...values),
	};
}

try {
	for (const [name, root] of Object.entries(roots)) {
		report.sources[name] = {
			root,
			revision:
				name === 'baseline' ? (args['baseline-revision'] ?? revision(root)) : revision(root),
			snapshot: sourceSnapshot(root),
			dependencies: dependencies(root),
		};
	}
	if (
		JSON.stringify(report.sources.baseline.dependencies) !==
		JSON.stringify(report.sources.candidate.dependencies)
	) {
		throw new Error(
			'Baseline and candidate must resolve the same installed compiler dependencies. Share their node_modules.',
		);
	}
	const compilers = {};
	for (const [name, root] of Object.entries(roots)) {
		compilers[name] = {
			compile: (await import(pathToFileURL(path.join(root, compilerRelative)).href)).compile,
			slots: (
				await import(
					pathToFileURL(path.join(root, 'packages/octane/src/compiler/slot-hooks.js')).href
				)
			).slotHooks,
		};
	}
	writeReport();
	if (report.config.scenarios.includes('cached')) {
		report.cachedSemantics = await validateCachedSemantics(compilers);
		writeReport();
	}
	for (const scenario of report.config.scenarios) {
		const scenarioLanes = scenario === 'cached' ? Object.keys(lanes) : ['prod-client'];
		for (const lane of scenarioLanes) {
			if (args.lane && args.lane !== lane) continue;
			for (const count of counts) {
				const source = sourceFor(count, scenario, lane);
				const filename = `/src/Benchmark-${scenario}-${count}.${lane === 'plain' ? 'ts' : 'tsrx'}`;
				for (const strong of [true, false]) {
					const options = { ...lanes[lane], strong };
					const samples = { baseline: [], candidate: [] };
					const outputs = {};
					const method = lane === 'plain' ? 'slots' : 'compile';
					function measure(name) {
						const started = performance.now();
						const result = compilers[name][method](source, filename, options);
						const elapsed = performance.now() - started;
						const code = result?.code;
						if (!code || result.diagnostics?.length)
							throw new Error(
								`${scenario}/${lane}/${count}/${strong}: ${name} did not produce clean output.`,
							);
						outputs[name] ??= code;
						if (code !== outputs[name])
							throw new Error(
								`${scenario}/${lane}/${count}/${strong}: unstable emitted output for ${name}.`,
							);
						if (scenario !== 'cached' && outputs.baseline && outputs.candidate)
							assert.equal(
								outputs.candidate,
								outputs.baseline,
								`${scenario}/${count}/${strong}: unchanged-output control differs`,
							);
						return elapsed;
					}
					for (let index = 0; index < warmups; index++) {
						for (const name of index % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'])
							measure(name);
					}
					const iterations = sampleCount ?? (args.smoke ? 1 : count >= 1000 ? 11 : 17);
					for (let index = 0; index < iterations; index++) {
						for (const name of index % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'])
							samples[name].push(measure(name));
					}
					let serverControl;
					if (scenario !== 'cached') {
						const serverOptions = { ...options, mode: 'server' };
						const baseline = compilers.baseline.compile(source, filename, serverOptions);
						const candidate = compilers.candidate.compile(source, filename, serverOptions);
						assert.ok(
							baseline.code && !baseline.diagnostics?.length && !candidate.diagnostics?.length,
							'Clean server control',
						);
						assert.equal(
							candidate.code,
							baseline.code,
							`${scenario}/${count}/${strong}: server control differs`,
						);
						serverControl = {
							bytes: Buffer.byteLength(baseline.code),
							sha256: hash(baseline.code),
						};
					}
					const row = {
						count,
						scenario,
						lane,
						policy: strong ? 'Strong' : 'Compat',
						control: scenario === 'cached' ? 'executed-cache-workload' : 'unchanged-output',
						sourceBytes: Buffer.byteLength(source),
						sourceSha256: hash(source),
						emitted: Object.fromEntries(
							Object.entries(outputs).map(([name, code]) => [
								name,
								{ bytes: Buffer.byteLength(code), sha256: hash(code) },
							]),
						),
						outputEqual: outputs.baseline === outputs.candidate,
						serverControl,
						baselineMs: stats(samples.baseline),
						candidateMs: stats(samples.candidate),
						pairedRatio: stats(
							samples.candidate.map((elapsed, index) => elapsed / samples.baseline[index]),
						),
						raw: { baselineMs: samples.baseline, candidateMs: samples.candidate },
					};
					report.results.push(row);
					for (const name of ['baseline', 'candidate'])
						report.targets.push({
							name: `${name}-${row.policy.toLowerCase()}-${scenario}-${lane}-${count}`,
							ops: { compile: row[`${name}Ms`] },
							meta: {
								sourceSha256: row.sourceSha256,
								emitted: row.emitted[name],
								serverControl,
								pairedRatio: row.pairedRatio,
							},
						});
					console.log(
						`${row.policy} ${scenario} ${lane} ${count}: ${row.baselineMs.median.toFixed(2)} → ${row.candidateMs.median.toFixed(2)} ms; paired ratio ${row.pairedRatio.median.toFixed(3)} (min ${row.pairedRatio.min.toFixed(3)}, p95 ${row.pairedRatio.p95.toFixed(3)})`,
					);
					writeReport();
				}
			}
		}
	}
	for (const [name, root] of Object.entries(roots)) {
		if (
			report.sources[name].snapshot.sha256 !== sourceSnapshot(root).sha256 ||
			JSON.stringify(report.sources[name].dependencies) !== JSON.stringify(dependencies(root))
		) {
			throw new Error(
				`${name} sources or dependencies changed during measurement; discard these timings.`,
			);
		}
	}
	report.status = 'complete';
	report.sourcesStable = true;
} catch (error) {
	report.status = 'failed';
	report.failed = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(report.failed);
	process.exitCode = 1;
} finally {
	report.finishedAt = new Date().toISOString();
	writeReport();
}
