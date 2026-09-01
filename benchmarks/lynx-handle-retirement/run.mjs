import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '../..');
const rawIterations = process.argv[2] ?? '8';
const iterations = Number(rawIterations);

if (!Number.isSafeInteger(iterations) || iterations <= 0) {
	throw new TypeError(`iterations must be a positive safe integer, received ${rawIterations}.`);
}

const COMPACT_HOSTS = 65_568;
const RETIRED_HOSTS = 8;
const SMALL_MATERIALIZED = 1_024;
const LARGE_MATERIALIZED = 65_536;
const SMALL_RANGE = 1_024;
const LARGE_RANGE = 65_536;
const WARMUP_PREPARATIONS = 64;
const PREPARATIONS_PER_SAMPLE = 1_024;
const ROOT = 211;

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-handle-retirement-'));
const bundlePath = path.join(tempDir, 'workload.mjs');

function checksumIds(ids) {
	let checksum = 2166136261;
	for (const id of ids) {
		checksum ^= id;
		checksum = Math.imul(checksum, 16777619) >>> 0;
	}
	return checksum;
}

function compactBatch(renderer, hostCount) {
	const program = Object.freeze({
		nodes: Object.freeze([Object.freeze({ type: 'view', parent: -1, props: Object.freeze({}) })]),
		events: Object.freeze([]),
	});
	return Object.freeze({
		renderer,
		version: 1,
		commands: Object.freeze([
			Object.freeze({
				op: 'mount-template-run',
				parent: null,
				before: null,
				program,
				firstId: 1,
				firstListenerId: 1,
				count: hostCount,
				values: Object.freeze([]),
			}),
		]),
	});
}

function removalBatch(renderer, hostCount) {
	return Object.freeze({
		renderer,
		version: 2,
		commands: Object.freeze([
			Object.freeze({
				op: 'destroy-run',
				parent: null,
				firstId: 1,
				count: hostCount,
				width: 1,
			}),
		]),
	});
}

function identity(protocol, renderer, version) {
	return Object.freeze({ protocol, renderer, root: ROOT, version });
}

function materializedHandleIds(count) {
	return [
		1,
		2,
		3,
		4,
		...Array.from({ length: count - 4 }, (_value, index) => index + RETIRED_HOSTS + 1),
	];
}

function boundaryIds(compactHostCount) {
	return [
		...Array.from({ length: 32 }, (_value, index) => index + 1),
		...Array.from({ length: 32 }, (_value, index) => compactHostCount - 31 + index),
	];
}

function createScenario(runtime, definition) {
	const container = runtime.createLynxClientContainer();
	const initialBatch = compactBatch(runtime.LYNX_TRANSPORT_RENDERER, COMPACT_HOSTS);
	runtime
		.prepareLynxCompactHandleDeltas(
			container,
			initialBatch,
			COMPACT_HOSTS,
			identity(runtime.LYNX_TRANSPORT_PROTOCOL_VERSION, runtime.LYNX_TRANSPORT_RENDERER, 1),
			COMPACT_HOSTS,
		)
		.apply();

	const materializedIds = definition.materializedIds(COMPACT_HOSTS);
	const handles = new Map();
	for (const id of materializedIds) {
		const handle = container.getPublicHandle(id);
		if (handle === null || !handle.active || handle.generation !== 1) {
			throw new Error(`${definition.name} could not materialize live handle ${id}.`);
		}
		handles.set(id, handle);
	}

	const batch = removalBatch(runtime.LYNX_TRANSPORT_RENDERER, definition.retirementHostCount);
	const deltas = Object.freeze([
		Object.freeze({
			op: 'remove-run',
			firstId: 1,
			hostCount: definition.retirementHostCount,
			generation: 1,
		}),
	]);
	const acceptedIdentity = identity(
		runtime.LYNX_TRANSPORT_PROTOCOL_VERSION,
		runtime.LYNX_TRANSPORT_RENDERER,
		2,
	);
	return {
		...definition,
		container,
		handles,
		materializedIds,
		prepare() {
			return runtime.prepareLynxHandleDeltas(container, batch, deltas, acceptedIdentity);
		},
	};
}

function verifyScenario(scenario) {
	const removedIds = scenario.materializedIds.filter((id) => id <= scenario.retirementHostCount);
	const survivorIds = scenario.materializedIds.filter((id) => id > scenario.retirementHostCount);
	if (removedIds.length === 0 || survivorIds.length === 0) {
		throw new Error(`${scenario.name} must materialize both retired and surviving handles.`);
	}

	const prepared = scenario.prepare();
	prepared.apply();
	for (const id of removedIds) {
		const previous = scenario.handles.get(id);
		if (previous.active || scenario.container.getPublicHandle(id) !== null) {
			throw new Error(`${scenario.name} kept retired handle ${id} active.`);
		}
	}
	for (const id of survivorIds) {
		const previous = scenario.handles.get(id);
		if (!previous.active || scenario.container.getPublicHandle(id) !== previous) {
			throw new Error(`${scenario.name} changed surviving handle ${id}.`);
		}
	}
	const unmaterializedRetiredId = Math.min(scenario.retirementHostCount, removedIds.length + 1);
	if (
		!scenario.handles.has(unmaterializedRetiredId) &&
		scenario.container.getPublicHandle(unmaterializedRetiredId) !== null
	) {
		throw new Error(
			`${scenario.name} exposed unmaterialized retired handle ${unmaterializedRetiredId}.`,
		);
	}

	prepared.rollback();
	for (const id of scenario.materializedIds) {
		const previous = scenario.handles.get(id);
		if (!previous.active || scenario.container.getPublicHandle(id) !== previous) {
			throw new Error(`${scenario.name} did not restore handle ${id} on rollback.`);
		}
	}

	return Object.freeze({
		materializedChecksum: checksumIds(scenario.materializedIds),
		retiredChecksum: checksumIds(removedIds),
		survivorChecksum: checksumIds(survivorIds),
		materialized: scenario.materializedIds.length,
		retiredMaterialized: removedIds.length,
		survivingMaterialized: survivorIds.length,
		rollback: 'restored',
	});
}

function runPreparations(scenario, count) {
	let checksum = 0;
	const started = performance.now();
	for (let index = 0; index < count; index++) {
		const prepared = scenario.prepare();
		if (typeof prepared.apply === 'function' && typeof prepared.rollback === 'function') checksum++;
	}
	const elapsed = performance.now() - started;
	if (checksum !== count) {
		throw new Error(`${scenario.name} prepared only ${checksum}/${count} acknowledgements.`);
	}
	return (elapsed * 1_000) / count;
}

let payload;
try {
	await build({
		absWorkingDir: REPO,
		stdin: {
			contents: `
				export {
					createLynxClientContainer,
					prepareLynxCompactHandleDeltas,
					prepareLynxHandleDeltas,
				} from './packages/lynx/src/core/client-driver.ts';
				export {
					LYNX_TRANSPORT_PROTOCOL_VERSION,
					LYNX_TRANSPORT_RENDERER,
				} from './packages/lynx/src/core/protocol.ts';
			`,
			resolveDir: REPO,
			sourcefile: 'lynx-handle-retirement-workload.ts',
			loader: 'ts',
		},
		outfile: bundlePath,
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': '"production"' },
	});
	const runtime = await import(pathToFileURL(bundlePath).href);
	const definitions = [
		{
			name: 'handles-1024',
			curve: 'materialized-handles',
			retirementHostCount: RETIRED_HOSTS,
			materializedIds: () => materializedHandleIds(SMALL_MATERIALIZED),
		},
		{
			name: 'handles-65536',
			curve: 'materialized-handles',
			retirementHostCount: RETIRED_HOSTS,
			materializedIds: () => materializedHandleIds(LARGE_MATERIALIZED),
		},
		{
			name: 'range-1024',
			curve: 'compact-range',
			retirementHostCount: SMALL_RANGE,
			materializedIds: boundaryIds,
		},
		{
			name: 'range-65536',
			curve: 'compact-range',
			retirementHostCount: LARGE_RANGE,
			materializedIds: boundaryIds,
		},
	];
	const scenarios = definitions.map((definition) => createScenario(runtime, definition));
	const semantics = new Map(
		definitions.map((definition) => {
			const verification = createScenario(runtime, definition);
			return [definition.name, verifyScenario(verification)];
		}),
	);
	const samples = new Map(scenarios.map((scenario) => [scenario.name, []]));

	for (const scenario of scenarios) runPreparations(scenario, WARMUP_PREPARATIONS);
	for (let iteration = 0; iteration < iterations; iteration++) {
		const order = iteration % 2 === 0 ? scenarios : [...scenarios].reverse();
		for (const scenario of order) {
			samples.get(scenario.name).push(runPreparations(scenario, PREPARATIONS_PER_SAMPLE));
		}
	}

	const targets = scenarios.map((scenario) => {
		const summary = summarizeSamples(samples.get(scenario.name));
		const semantic = semantics.get(scenario.name);
		console.log(
			`PASS lynx-handle-retirement/${scenario.name}: ${summary.score.toFixed(3)}ms/1000 preparations`,
		);
		return {
			name: scenario.name,
			ops: { prepare_per_1000_acknowledgements: timingStatForJson(summary) },
			meta: {
				curve: scenario.curve,
				compactHosts: COMPACT_HOSTS,
				retirementHostCount: scenario.retirementHostCount,
				preparationsPerSample: PREPARATIONS_PER_SAMPLE,
				correctness: 'pass',
				...semantic,
			},
		};
	});
	const score = (name) =>
		targets.find((target) => target.name === name).ops.prepare_per_1000_acknowledgements.score;
	const materializedRatio = score('handles-65536') / score('handles-1024');
	const rangeRatio = score('range-65536') / score('range-1024');
	console.log(`materialized-handle scaling: ${materializedRatio.toFixed(2)}x`);
	console.log(`compact-range scaling: ${rangeRatio.toFixed(2)}x`);

	payload = {
		suite: 'lynx-handle-retirement',
		iterations,
		targets,
		meta: { materializedRatio, rangeRatio },
	};
} catch (error) {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	payload = { suite: 'lynx-handle-retirement', iterations, targets: [], failed: message };
	console.error(message);
	process.exitCode = 1;
} finally {
	fs.rmSync(tempDir, { recursive: true, force: true });
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
