// Untimed array-creation work guard over the production universal runtime.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';

import {
	COUNTER_GLOBAL,
	COUNTER_KINDS,
	emptyCounters,
	instrumentJavaScript,
} from '../hook-memo/instrument.mjs';

process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const requireDependencies = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = requireDependencies('esbuild');
const { parseModule, builders } = requireDependencies('@tsrx/core');
const { print: printAst } = requireDependencies('esrap');
const tsx = requireDependencies('esrap/languages/tsx').default;
const file = 'packages/octane/src/universal-core.ts';
const measureOnly = process.argv.includes('--measure');
const baselineRef = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const sha256 = (source) => createHash('sha256').update(source).digest('hex');
const temporary = mkdtempSync(path.join(tmpdir(), 'octane-universal-hook-slot-'));

function resetCounters() {
	globalThis[COUNTER_GLOBAL] = {
		...emptyCounters(),
		...Object.fromEntries(COUNTER_KINDS.map((kind) => [`slot_${kind}`, 0])),
	};
}

function counters() {
	const value = globalThis[COUNTER_GLOBAL];
	const arrayKinds = ['arrayLiterals', 'arrayConstructors', 'restArrays'];
	return {
		slotArrays: arrayKinds.reduce((total, kind) => total + value[`slot_${kind}`], 0),
		runtimeArrays: arrayKinds.reduce(
			(total, kind) => total + value[`slot_${kind}`] + value[`runtime_${kind}`],
			0,
		),
	};
}

function workload(runtime, nested, size) {
	resetCounters();
	const {
		createObjectContainer,
		createObjectDriver,
		createUniversalRoot,
		defineUniversalComponent,
		flushUniversalSync,
		universalComponent,
		universalPlan,
		universalValue,
		useLayoutEffect,
		useMemo,
		useRef,
		useState,
		withSlot,
	} = runtime;
	const scenePlan = universalPlan('object', {
		kind: 'host',
		type: 'scene',
		bindings: [['version', 0]],
		children: [{ kind: 'slot', slot: 1 }],
	});
	const cellPlan = universalPlan('object', {
		kind: 'host',
		type: 'cell',
		bindings: [
			['id', 0],
			['left', 1],
			['right', 2],
		],
	});
	const retainedHooks = new Map();
	let hookCalls = 0;
	let setups = 0;
	let cleanups = 0;
	function readHooks(id, site, version) {
		const prefix = nested ? '' : `${site}:`;
		const initial = id * 10 + site;
		const [value, set, get] = useState(initial, `${prefix}state`);
		const ref = useRef(initial, `${prefix}ref`);
		const memo = useMemo(() => `${value}:${version}`, [value, version], `${prefix}memo`);
		useLayoutEffect(
			() => {
				setups++;
				return () => cleanups++;
			},
			[],
			`${prefix}effect`,
		);
		hookCalls += 4;
		const key = `${id}:${site}`;
		const previous = retainedHooks.get(key);
		if (previous) {
			assert.equal(ref, previous.ref, 'refs survive changed props and state');
			assert.equal(set, previous.set, 'state setters retain identity');
			assert.equal(get, previous.get, 'state getters retain identity');
		} else retainedHooks.set(key, { ref, set, get });
		assert.equal(ref.current, initial);
		assert.equal(get(), value);
		return memo;
	}
	const Child = defineUniversalComponent('object', ({ id, version }) => {
		const read = (site) =>
			nested
				? withSlot(site, () => withSlot(Symbol.for('inner'), () => readHooks(id, site, version)))
				: readHooks(id, site, version);
		return universalValue(cellPlan, [id, read(0), read(1)]);
	});
	const Scene = defineUniversalComponent('object', ({ version, children }) =>
		universalValue(scenePlan, [version, children]),
	);
	const ids = Array.from({ length: size }, (_, id) => id);
	const props = (version, order = ids) => ({
		version,
		children: order.map((id) => universalComponent('object', Child, { id, version }, id)),
	});
	const container = createObjectContainer('object');
	const root = createUniversalRoot(container, createObjectDriver('object'));
	const phases = { setup: { ...counters(), hookCalls: 0 } };
	const snapshots = {};
	let retainedScene;
	let retainedCells;
	function observe(name, run, version, stateDelta, order = ids) {
		resetCounters();
		const previousHookCalls = hookCalls;
		run();
		phases[name] = { ...counters(), hookCalls: hookCalls - previousHookCalls };
		const scene = container.children[0];
		assert.equal(container.instanceCount, size + 1);
		assert.equal(scene.props.version, version);
		assert.equal(scene.children.length, size);
		if (retainedScene) assert.equal(scene, retainedScene);
		else {
			retainedScene = scene;
			retainedCells = [...scene.children];
		}
		for (let index = 0; index < size; index++) {
			const id = order[index];
			const cell = scene.children[index];
			assert.equal(cell, retainedCells[id], 'keyed host identity survives updates and reorder');
			assert.deepEqual(cell.props, {
				id,
				left: `${id * 10 + stateDelta}:${version}`,
				right: `${id * 10 + 1}:${version}`,
			});
		}
		assert.equal(setups, size * 2);
		assert.equal(cleanups, 0);
		snapshots[name] = scene.children.map((cell) => ({ ...cell.props }));
	}
	observe('mount', () => root.render(Scene, props(0)), 0, 0);
	container.commits.length = 0;
	observe('propsUpdate', () => root.render(Scene, props(1)), 1, 0);
	observe(
		'stateUpdate',
		() =>
			flushUniversalSync(() => {
				for (const id of ids) retainedHooks.get(`${id}:0`).set((value) => value + 5);
			}),
		1,
		5,
	);
	const structuralUpdates = container.commits
		.flatMap((batch) => batch.commands)
		.filter((command) => ['create', 'destroy', 'insert', 'remove'].includes(command.op)).length;
	assert.equal(structuralUpdates, 0, 'ordinary updates retain host structure');
	const reversed = [...ids].reverse();
	observe('reorder', () => root.render(Scene, props(2, reversed)), 2, 5, reversed);
	resetCounters();
	root.unmount();
	phases.unmount = { ...counters(), hookCalls: 0 };
	assert.equal(container.children.length, 0);
	assert.equal(container.instanceCount, 0);
	assert.equal(cleanups, size * 2);
	return {
		phases,
		semantic: {
			outputHash: sha256(JSON.stringify(snapshots)),
			setups,
			cleanups,
			structuralUpdates,
		},
	};
}

async function measure(source, label) {
	const result = await build({
		entryPoints: [path.join(repo, 'packages/octane/src/universal.ts')],
		bundle: true,
		format: 'esm',
		platform: 'node',
		write: false,
		define: { 'process.env.NODE_ENV': '"production"' },
		plugins: [
			{
				name: 'paired-universal-source',
				setup(builder) {
					builder.onLoad({ filter: /[/\\]universal-core\.ts$/ }, () => ({
						contents: source,
						loader: 'ts',
						resolveDir: path.join(repo, 'packages/octane/src'),
					}));
				},
			},
		],
	});
	const clean = result.outputFiles[0].text;
	const helper = parseModule(clean, 'universal.mjs').body.find(
		(node) => node.type === 'FunctionDeclaration' && node.id?.name === 'resolveHookSlot',
	);
	assert.ok(helper, 'the emitted hook resolver is present');
	const observed = instrumentJavaScript(
		clean,
		'universal.mjs',
		(node) => (node.start >= helper.start && node.end <= helper.end ? 'slot' : 'runtime'),
		{ parseModule, builders, print: (ast) => printAst(ast, tsx()).code },
	);
	const cleanFile = path.join(temporary, `${label}-clean.mjs`);
	const observedFile = path.join(temporary, `${label}-observed.mjs`);
	writeFileSync(cleanFile, clean);
	writeFileSync(observedFile, observed);
	const cleanRuntime = await import(pathToFileURL(cleanFile).href);
	resetCounters();
	const observedRuntime = await import(pathToFileURL(observedFile).href);
	const moduleArrays = counters().runtimeArrays;
	const cases = {};
	for (const size of [1, 128]) {
		for (const nested of [false, true]) {
			const name = `${nested ? 'nested' : 'direct'}-${size}`;
			const expected = workload(cleanRuntime, nested, size);
			const actual = workload(observedRuntime, nested, size);
			assert.deepEqual(actual.semantic, expected.semantic, 'observer preserves public behavior');
			cases[name] = actual;
		}
		assert.deepEqual(cases[`nested-${size}`].semantic, cases[`direct-${size}`].semantic);
	}
	return {
		sourceHash: sha256(source),
		bundleHash: sha256(clean),
		helperHash: sha256(clean.slice(helper.start, helper.end)),
		moduleArrays,
		cases,
	};
}

function sourceAt(ref) {
	return ref === undefined
		? readFileSync(path.join(repo, file), 'utf8')
		: execFileSync('git', ['show', `${ref}:${file}`], {
				cwd: repo,
				encoding: 'utf8',
				maxBuffer: 8 * 1024 * 1024,
			});
}

try {
	const result = {
		suite: 'universal-hook-slot',
		metric: 'source array-creation events in the production runtime',
		node: process.version,
		v8: process.versions.v8,
		platform: process.platform,
		architecture: process.arch,
		lockfileHash: sha256(readFileSync(path.join(repo, 'pnpm-lock.yaml'))),
		candidateRef: process.env.BENCH_SOURCE_REF ?? 'working tree',
		candidate: await measure(sourceAt(process.env.BENCH_SOURCE_REF), 'candidate'),
	};
	if (baselineRef) {
		result.baselineRef = baselineRef;
		result.baseline = await measure(sourceAt(baselineRef), 'baseline');
		assert.equal(
			result.candidate.moduleArrays,
			result.baseline.moduleArrays,
			'array work is not moved to module initialization',
		);
		for (const [name, after] of Object.entries(result.candidate.cases)) {
			const before = result.baseline.cases[name];
			assert.deepEqual(after.semantic, before.semantic, `${name}: baseline behavior matches`);
			for (const [phase, counts] of Object.entries(after.phases)) {
				assert.equal(counts.hookCalls, before.phases[phase].hookCalls);
				assert.equal(
					before.phases[phase].runtimeArrays - counts.runtimeArrays,
					before.phases[phase].slotArrays - counts.slotArrays,
					`${name}/${phase}: array work is removed, not moved outside the resolver`,
				);
			}
		}
	}
	result.iterations = 1;
	result.targets = Object.entries(result.candidate.cases).map(([name, scenario]) => ({
		name,
		ops: Object.fromEntries(
			Object.entries(scenario.phases).flatMap(([phase, counts]) =>
				Object.entries(counts).map(([metric, value]) => [
					`${phase}_${metric}`,
					deterministicStatForJson(deterministicCount(value)),
				]),
			),
		),
		meta: scenario.semantic,
	}));
	console.log('| case / phase | resolver arrays | all runtime arrays | hook calls |');
	console.log('| --- | ---: | ---: | ---: |');
	for (const [name, scenario] of Object.entries(result.candidate.cases)) {
		for (const [phase, counts] of Object.entries(scenario.phases)) {
			console.log(
				`| ${name} / ${phase} | ${counts.slotArrays} | ${counts.runtimeArrays} | ${counts.hookCalls} |`,
			);
		}
	}
	if (process.env.BENCH_JSON)
		writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
	if (!measureOnly) {
		for (const [name, scenario] of Object.entries(result.candidate.cases)) {
			for (const [phase, counts] of Object.entries(scenario.phases)) {
				assert.equal(counts.slotArrays, 0, `${name}/${phase}: hook resolution creates no arrays`);
			}
		}
	}
} finally {
	delete globalThis[COUNTER_GLOBAL];
	rmSync(temporary, { recursive: true, force: true });
}
