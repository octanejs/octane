import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeHeapSnapshot } from 'node:v8';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import {
	alienAdapter,
	continuousDisposal,
	createGraph,
	GRAPH_SHAPES,
	scopedAdapter,
} from './workloads.mjs';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '../..');
const EXPECTED_ALIEN_VERSION = '3.2.0';
const args = process.argv.slice(2);
const knownFlags = new Set(['--quick', '--heap']);
const knownOptions = new Set([
	'sizes',
	'cycles',
	'unrelated',
	'rounds',
	'snapshots',
	'tooling-root',
	'source-root',
	'source-ref',
]);
const options = new Map();
let positional;
for (const argument of args) {
	if (knownFlags.has(argument)) continue;
	if (argument.startsWith('--')) {
		const match = /^--([^=]+)=(.+)$/.exec(argument);
		if (!match || !knownOptions.has(match[1]))
			throw new Error(`Unknown benchmark option: ${argument}`);
		options.set(match[1], match[2]);
	} else {
		if (positional !== undefined) throw new Error(`Unexpected benchmark argument: ${argument}`);
		positional = argument;
	}
}
function integer(value, label, minimum = 1) {
	const number = Number(value);
	if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(number) || number < minimum) {
		throw new Error(`${label} must be an integer >= ${minimum}`);
	}
	return number;
}
function sizes(value, label, minimum = 1) {
	const values = value.split(',').map((part) => integer(part, label, minimum));
	assert.equal(new Set(values).size, values.length, `${label} contains duplicate sizes`);
	return values;
}

const quick = args.includes('--quick');
const sourceRoot = options.has('source-root')
	? fs.realpathSync(path.resolve(options.get('source-root')))
	: REPO;
if (options.has('source-root')) {
	assert.ok(
		options.has('source-ref'),
		'An archived source root requires --source-ref=<git commit>',
	);
}
const sourceRef = options.has('source-ref')
	? execFileSync('git', ['rev-parse', '--verify', options.get('source-ref') + '^{commit}'], {
			cwd: REPO,
			encoding: 'utf8',
		}).trim()
	: null;
const heap = args.includes('--heap');
const iterations = integer(positional ?? (quick ? '3' : '9'), 'iterations');
const scales = sizes(options.get('sizes') ?? (quick ? '100,1000' : '100,1000,10000'), 'sizes');
const rounds = integer(options.get('rounds') ?? '32', 'rounds');
const cycles = integer(options.get('cycles') ?? (quick ? '100' : '1000'), 'cycles');
const unrelatedScales = sizes(
	options.get('unrelated') ?? (quick ? '0,100' : '0,100,1000'),
	'unrelated',
	0,
);
const snapshotDirectory = options.has('snapshots') ? path.resolve(options.get('snapshots')) : null;
if (snapshotDirectory && !heap) throw new Error('--snapshots requires --heap');
if (heap && typeof globalThis.gc !== 'function') {
	throw new Error(
		'Heap diagnostics require: node --expose-gc benchmarks/scoped-signals/run.mjs --heap',
	);
}

function hashFile(file) {
	return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function packageFromEntry(entry, name = 'alien-signals') {
	let directory = path.dirname(entry);
	while (true) {
		const manifest = path.join(directory, 'package.json');
		if (fs.existsSync(manifest)) {
			const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
			if (data.name === name) return { ...data, manifest };
		}
		const parent = path.dirname(directory);
		if (parent === directory) throw new Error(`Cannot identify ${name} package for ${entry}`);
		directory = parent;
	}
}

function packageEvidence(entry, manifest) {
	return {
		name: manifest.name,
		version: manifest.version,
		manifest: fs.realpathSync(manifest.manifest),
		manifestSha256: hashFile(manifest.manifest),
		entry: fs.realpathSync(entry),
		entrySha256: hashFile(entry),
	};
}

let build;
let dependencyRequire;
let alienManifest;
let toolingRoot;
async function loadApi(request, label) {
	// Both candidates are built with identical production options. Resolution
	// starts at octane's dependency scope, where the exact experimental version
	// lives; the old binding's 1.0.4 catalog entry is deliberately not used.
	const entrySource = `export * from ${JSON.stringify(request)};`;
	const entryName = `${label}-benchmark-entry.mjs`;
	const result = await build({
		absWorkingDir: REPO,
		stdin: {
			contents: entrySource,
			resolveDir: path.join(sourceRoot, 'packages/octane'),
			sourcefile: entryName,
		},
		bundle: true,
		write: false,
		metafile: true,
		minify: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		define: { 'process.env.NODE_ENV': '"production"' },
		logLevel: 'silent',
		plugins: dependencyRequire
			? [
					{
						name: 'explicit-scoped-signals-dependency',
						setup(builder) {
							builder.onResolve({ filter: /^alien-signals(?:\/|$)/ }, (resolution) => {
								if (resolution.pluginData?.scopedSignalsTooling) return undefined;
								return builder.resolve(resolution.path, {
									kind: resolution.kind,
									resolveDir: toolingRoot,
									pluginData: { scopedSignalsTooling: true },
								});
							});
						},
					},
				]
			: [],
	});
	const inputs = Object.keys(result.metafile.inputs);
	const forbidden = inputs.filter((input) =>
		/packages\/octane\/src\/(?:runtime(?:\.server)?\.ts|devtools-hook\.ts|server\/|compiler\/)|(?:^|\/)node_modules\/(?:react|react-dom)\//.test(
			input.replaceAll('\\', '/'),
		),
	);
	assert.deepEqual(
		forbidden,
		[],
		`${label} pulled a renderer, compiler, or DevTools into the engine benchmark`,
	);
	const alienInputs = inputs.filter((input) =>
		/(?:^|\/)node_modules\/alien-signals\//.test(input.replaceAll('\\', '/')),
	);
	assert.ok(
		alienInputs.length > 0,
		`${label} did not include the selected Alien Signals dependency`,
	);
	for (const input of alienInputs) {
		const bundledPackage = packageFromEntry(path.resolve(REPO, input));
		assert.equal(
			bundledPackage.version,
			EXPECTED_ALIEN_VERSION,
			`${label} bundled a different Alien Signals version`,
		);
		assert.equal(
			fs.realpathSync(bundledPackage.manifest),
			alienManifest,
			`${label} bundled a different Alien Signals installation`,
		);
	}
	const code = result.outputFiles[0].text;
	if (sourceRef !== null) {
		for (const input of inputs) {
			if (path.basename(input) === entryName) continue;
			const file = path.resolve(REPO, input);
			if (!file.startsWith(path.join(sourceRoot, 'packages/octane') + path.sep)) continue;
			const relative = path.relative(sourceRoot, file).replaceAll('\\', '/');
			const expected = execFileSync('git', ['show', sourceRef + ':' + relative], {
				cwd: REPO,
				maxBuffer: 32 * 1024 * 1024,
			});
			assert.equal(
				hashFile(file),
				createHash('sha256').update(expected).digest('hex'),
				'Archived source differs from Git: ' + relative,
			);
		}
	}
	return {
		api: await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`),
		bundle: {
			bytes: Buffer.byteLength(code),
			sha256: createHash('sha256').update(code).digest('hex'),
			inputs,
			inputSha256: Object.fromEntries(
				inputs.map((input) => [
					input,
					path.basename(input) === entryName
						? createHash('sha256').update(entrySource).digest('hex')
						: hashFile(path.resolve(REPO, input)),
				]),
			),
		},
	};
}

const rows = [];
let failure;
let environment;
try {
	assert.equal(typeof globalThis.document, 'undefined', 'engine benchmark must run without a DOM');
	const requireOctane = createRequire(path.join(sourceRoot, 'packages/octane/package.json'));
	toolingRoot = options.has('tooling-root')
		? fs.realpathSync(path.resolve(options.get('tooling-root')))
		: null;
	dependencyRequire = toolingRoot ? createRequire(path.join(toolingRoot, 'package.json')) : null;
	const buildEntry = (dependencyRequire ?? createRequire(import.meta.url)).resolve('esbuild');
	const buildPackage = packageFromEntry(buildEntry, 'esbuild');
	const buildModule = await import(pathToFileURL(buildEntry).href);
	assert.equal(
		buildModule.version,
		buildPackage.version,
		'esbuild module and manifest versions differ',
	);
	build = buildModule.build;
	const alienPackage = packageFromEntry(
		(dependencyRequire ?? requireOctane).resolve('alien-signals'),
	);
	alienManifest = fs.realpathSync(alienPackage.manifest);
	assert.equal(
		alienPackage.version,
		EXPECTED_ALIEN_VERSION,
		'raw comparator resolved the wrong Alien Signals version',
	);
	const alienImport = alienPackage.exports?.['.']?.import;
	assert.equal(typeof alienImport, 'string', 'selected Alien package has no direct import export');
	const alienEntry = fs.realpathSync(path.resolve(path.dirname(alienManifest), alienImport));
	const [raw, scoped] = await Promise.all([
		loadApi('alien-signals', 'alien'),
		loadApi('octane/signals', 'scoped'),
	]);
	assert.ok(
		raw.bundle.inputs.some(
			(input) =>
				path.basename(input) !== 'alien-benchmark-entry.mjs' &&
				fs.realpathSync(path.resolve(REPO, input)) === alienEntry,
		),
		'raw comparator did not bundle the selected Alien import entry',
	);
	const adapters = [alienAdapter(raw.api), scopedAdapter(scoped.api)];
	const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
	environment = {
		commit: sourceRef ?? commit,
		runnerCommit: commit,
		sourceRoot,
		sourceRef,
		sourceArchive: fs.existsSync(path.join(sourceRoot, 'source.tar'))
			? {
					path: path.join(sourceRoot, 'source.tar'),
					sha256: hashFile(path.join(sourceRoot, 'source.tar')),
				}
			: null,
		dirty:
			execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).trim() !== '',
		node: process.version,
		execArgv: process.execArgv,
		command: [process.execPath, ...process.execArgv, ...process.argv.slice(1)],
		platform: process.platform,
		architecture: process.arch,
		cpu: os.cpus()[0]?.model,
		lockfileSha256: hashFile(path.join(sourceRoot, 'pnpm-lock.yaml')),
		fixtureSha256: hashFile(path.join(HERE, 'workloads.mjs')),
		runnerSha256: hashFile(import.meta.filename),
		alienVersion: alienPackage.version,
		dependencies: {
			mode: toolingRoot ? 'explicit-tooling-root' : 'workspace-installation',
			toolingRoot,
			esbuild: packageEvidence(buildEntry, buildPackage),
			alien: packageEvidence(alienEntry, alienPackage),
		},
		builds: { raw: raw.bundle, scoped: scoped.bundle },
		mode: heap ? 'heap-diagnostics' : 'timing',
		options: { iterations, scales, rounds, cycles, unrelatedScales },
	};

	if (!heap) {
		for (const shape of GRAPH_SHAPES) {
			for (const size of scales) {
				const records = new Map(
					adapters.map((adapter) => [
						adapter.name,
						{ samples: {}, notifications: 0, nodes: 0, outputs: 0 },
					]),
				);
				for (let iteration = -2; iteration < iterations; iteration++) {
					for (const adapter of iteration % 2 === 0 ? adapters : adapters.toReversed()) {
						const record = records.get(adapter.name);
						const sample = {};
						const started = performance.now();
						const graph = createGraph(adapter, shape, size, `${shape}/${size}/${iteration}`);
						sample.create = performance.now() - started;
						try {
							graph.verify();
							let version = 1;
							for (const operation of graph.operations) {
								let elapsed = 0;
								for (let round = 0; round < rounds; round++) {
									const before = performance.now();
									graph.step(operation, version++);
									elapsed += performance.now() - before;
									// Public values and delivered observations are checked outside the
									// timed interval, after every write/batch rather than only at the end.
									graph.verify();
								}
								sample[operation] = elapsed / rounds;
							}
							if (iteration >= 0) record.notifications += graph.notifications;
							record.nodes = graph.nodes;
							record.outputs = graph.outputs;
						} finally {
							const before = performance.now();
							graph.dispose();
							sample.dispose = performance.now() - before;
						}
						if (iteration >= 0) {
							for (const [operation, value] of Object.entries(sample)) {
								(record.samples[operation] ??= []).push(value);
							}
						}
					}
				}
				for (const adapter of adapters) {
					const record = records.get(adapter.name);
					rows.push({
						name: `${adapter.name}-${shape}-${size}`,
						ops: Object.fromEntries(
							Object.entries(record.samples).map(([operation, samples]) => [
								operation,
								timingStatForJson(summarizeSamples(samples), { p99: true }),
							]),
						),
						meta: {
							shape,
							size,
							nodes: record.nodes,
							outputs: record.outputs,
							rounds,
							notifications: record.notifications,
							correctness: 'pass',
						},
					});
				}
				console.log(
					`PASS scoped-signals/${shape}/${size}: ${iterations} matched production samples`,
				);
			}
		}
	}

	if (snapshotDirectory) fs.mkdirSync(snapshotDirectory, { recursive: true });
	for (const unrelated of unrelatedScales) {
		const samples = new Map(adapters.map((adapter) => [adapter.name, []]));
		const count = heap ? 1 : iterations;
		for (let iteration = -1; iteration < count; iteration++) {
			for (const adapter of iteration % 2 === 0 ? adapters : adapters.toReversed()) {
				const checkpoints = [];
				async function recordCheckpoint(state) {
					if (!heap || iteration < 0) return;
					globalThis.gc();
					await new Promise((resolve) => setImmediate(resolve));
					globalThis.gc();
					const memory = process.memoryUsage();
					const snapshot = snapshotDirectory
						? writeHeapSnapshot(
								path.join(
									snapshotDirectory,
									`${adapter.name}-${unrelated}-${state.cycle}-${state.phase ?? 'active'}.heapsnapshot`,
								),
							)
						: undefined;
					checkpoints.push({ ...state, ...memory, ...(snapshot ? { snapshot } : {}) });
				}
				const summary = await continuousDisposal(adapter, {
					cycles: iteration < 0 ? Math.min(20, cycles) : cycles,
					unrelated,
					key: `soak/${adapter.name}/${unrelated}/${iteration}`,
					checkpoint: recordCheckpoint,
					measure: !heap,
				});
				if (iteration >= 0) {
					if (heap) {
						// The async workload has returned and retired its shared/unrelated
						// owners, so no local handle is pinned by its suspended stack frame.
						await recordCheckpoint({
							cycle: cycles,
							phase: 'retired',
							lateNotifications: summary.lateNotifications,
						});
						rows.push({
							name: `${adapter.name}-continuous-${unrelated}`,
							ops: {},
							meta: { ...summary, checkpoints, correctness: 'pass' },
						});
					} else samples.get(adapter.name).push(summary.operationMilliseconds / cycles);
				}
			}
		}
		if (!heap) {
			for (const adapter of adapters)
				rows.push({
					name: `${adapter.name}-continuous-${unrelated}`,
					ops: {
						cycle: timingStatForJson(summarizeSamples(samples.get(adapter.name)), { p99: true }),
					},
					meta: { cycles, width: 32, unrelated, lateNotifications: 0, correctness: 'pass' },
				});
		}
		console.log(
			`PASS scoped-signals/continuous/${unrelated}: ${cycles} consecutive cycles per owner lifetime`,
		);
	}
	for (const artifact of [raw.bundle, scoped.bundle]) {
		for (const [input, expected] of Object.entries(artifact.inputSha256)) {
			if (
				['alien-benchmark-entry.mjs', 'scoped-benchmark-entry.mjs'].includes(path.basename(input))
			)
				continue;
			assert.equal(
				hashFile(path.resolve(REPO, input)),
				expected,
				'Source changed during benchmark: ' + input,
			);
		}
	}
	environment.sourceUnchanged = true;
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL scoped-signals: ${failure}`);
}

const payload = {
	suite: 'scoped-signals',
	iterations,
	targets: rows,
	environment,
	...(failure ? { failed: failure } : {}),
};
if (process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, 2)}\n`);
if (failure) process.exitCode = 1;
