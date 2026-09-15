// Untimed source allocation counts with clean/observed public-root controls.
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
const baselineRef = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const measureOnly = process.argv.includes('--measure');
const temporary = mkdtempSync(path.join(tmpdir(), 'octane-universal-materialization-'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const materializers = new Set([
	'materializeValue',
	'materializeNode',
	'materializeScoped',
	'materializePlanValue',
]);

function resetCounters() {
	globalThis[COUNTER_GLOBAL] = {
		...emptyCounters(),
		...Object.fromEntries(
			['materialize', 'keys'].flatMap((owner) =>
				COUNTER_KINDS.map((kind) => [`${owner}_${kind}`, 0]),
			),
		),
	};
}
function counters() {
	const value = globalThis[COUNTER_GLOBAL];
	const arrays = (owner) =>
		['arrayLiterals', 'arrayConstructors', 'restArrays'].reduce(
			(sum, kind) => sum + value[`${owner}_${kind}`],
			0,
		);
	return {
		materializeArrays: arrays('materialize'),
		runtimeArrays: arrays('materialize') + arrays('runtime') + arrays('keys'),
		runtimeSets: value.keys_constructors,
	};
}

function workload(runtime, mode, size) {
	resetCounters();
	const {
		createObjectContainer,
		createObjectDriver,
		createUniversalRoot,
		defineUniversalComponent,
		universalFor,
		universalPlan,
		universalValue,
		useState,
	} = runtime;
	const leaf = universalPlan('object', { kind: 'host', type: 'cell', bindings: [['value', 0]] });
	const staticPlan = universalPlan('object', {
		kind: 'host',
		type: 'scene',
		bindings: [['version', 0]],
		children: Array.from({ length: size }, () => ({
			kind: 'host',
			type: 'cell',
			bindings: [['value', 0]],
			children: [{ kind: 'host', type: 'nested' }],
		})),
	});
	const dynamicPlan = universalPlan('object', {
		kind: 'host',
		type: 'scene',
		bindings: [['version', 0]],
		children: [{ kind: 'slot', slot: 1 }],
	});
	const ids = Array.from({ length: size }, (_, index) => index);
	const Scene = defineUniversalComponent('object', ({ version, order }) => {
		if (mode === 'static') return universalValue(staticPlan, [version]);
		const children =
			mode === 'scoped'
				? universalFor(
						order,
						(id) => id,
						(id) => {
							const [state] = useState(id, 'id');
							return universalValue(leaf, [`${state}:${version}`]);
						},
					)
				: order.map((id) => [universalValue(leaf, [`${id}:${version}`])]);
		return universalValue(dynamicPlan, [version, children]);
	});
	const container = createObjectContainer('object');
	const root = createUniversalRoot(container, createObjectDriver('object'));
	const phases = {};
	const snapshots = {};
	let scene;
	let retained;
	function observe(name, version, order = ids) {
		resetCounters();
		root.render(Scene, { version, order });
		phases[name] = counters();
		if (scene) assert.equal(container.children[0], scene, 'scene identity survives updates');
		else scene = container.children[0];
		assert.equal(scene.props.version, version);
		assert.equal(scene.children.length, size);
		assert.equal(container.instanceCount, 1 + size * (mode === 'static' ? 2 : 1));
		if (!retained) retained = [...scene.children];
		for (let index = 0; index < size; index++) {
			assert.equal(scene.children[index], retained[mode === 'scoped' ? order[index] : index]);
			assert.equal(
				scene.children[index].props.value,
				mode === 'static' ? version : `${order[index]}:${version}`,
			);
		}
		snapshots[name] = scene.children.map((child) => [
			child.type,
			child.props.value,
			child.children.map((nested) => nested.type),
		]);
	}
	observe('mount', 0);
	container.commits.length = 0;
	observe('update', 1);
	assert.equal(
		container.commits
			.flatMap((batch) => batch.commands)
			.filter((command) => ['create', 'destroy', 'insert', 'remove'].includes(command.op)).length,
		0,
	);
	const acceptedValues = scene.children.map((child) => child.props.value);
	resetCounters();
	root.prepare(Scene, { version: 2, order: [...ids].reverse() }).abort();
	phases.abort = counters();
	assert.equal(scene.props.version, 1, 'aborted props are not published');
	assert.deepEqual(scene.children, retained, 'aborted order is not published');
	assert.deepEqual(
		scene.children.map((child) => child.props.value),
		acceptedValues,
		'aborted child props are not published',
	);
	observe('reorder', 3, [...ids].reverse());
	resetCounters();
	root.unmount();
	phases.unmount = counters();
	assert.equal(container.children.length, 0);
	assert.equal(container.instanceCount, 0);
	return { phases, semantic: { outputHash: sha256(JSON.stringify(snapshots)), size, mode } };
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
	const ranges = parseModule(clean, 'universal.mjs').body.filter(
		(node) => node.type === 'FunctionDeclaration' && materializers.has(node.id?.name),
	);
	assert.equal(ranges.length, materializers.size);
	const observed = instrumentJavaScript(
		clean,
		'universal.mjs',
		(node) => {
			if (node.type === 'NewExpression' && node.callee?.name === 'Set') return 'keys';
			return ranges.some((range) => node.start >= range.start && node.end <= range.end)
				? 'materialize'
				: 'runtime';
		},
		{ parseModule, builders, print: (ast) => printAst(ast, tsx()).code },
		{ objects: true },
	);
	const cleanFile = path.join(temporary, `${label}-clean.mjs`);
	const observedFile = path.join(temporary, `${label}-observed.mjs`);
	writeFileSync(cleanFile, clean);
	writeFileSync(observedFile, observed);
	const cleanRuntime = await import(pathToFileURL(cleanFile).href);
	resetCounters();
	const observedRuntime = await import(pathToFileURL(observedFile).href);
	const moduleCounts = counters();
	const cases = {};
	for (const size of [0, 1, 128])
		for (const mode of ['static', 'unkeyed', 'scoped']) {
			const expected = workload(cleanRuntime, mode, size);
			const actual = workload(observedRuntime, mode, size);
			assert.deepEqual(actual.semantic, expected.semantic, 'observer preserves public behavior');
			cases[`${mode}-${size}`] = actual;
		}
	return { sourceHash: sha256(source), bundleHash: sha256(clean), moduleCounts, cases };
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
		suite: 'universal-materialization',
		metric: 'source array-creation and Set-construction events in the production runtime',
		iterations: 1,
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
		assert.deepEqual(
			result.candidate.moduleCounts,
			result.baseline.moduleCounts,
			'no work moved to module setup',
		);
		for (const [name, after] of Object.entries(result.candidate.cases))
			assert.deepEqual(
				after.semantic,
				result.baseline.cases[name].semantic,
				`${name}: baseline behavior matches`,
			);
	}
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
	for (const [name, arrays, sets] of [
		['static-128', 515, 27],
		['scoped-128', 392, 412],
		['unkeyed-128', 774, 27],
	]) {
		result.targets.push({
			name: `${name}-budget`,
			ops: {
				update_materializeArrays: deterministicStatForJson(deterministicCount(arrays)),
				update_runtimeSets: deterministicStatForJson(deterministicCount(sets)),
			},
			meta: { budget: 'maximum deterministic work for the corresponding 128-row update' },
		});
	}
	console.log('| case / phase | materializer arrays | runtime arrays | runtime Sets |');
	console.log('| --- | ---: | ---: | ---: |');
	for (const [name, scenario] of Object.entries(result.candidate.cases))
		for (const [phase, counts] of Object.entries(scenario.phases))
			console.log(
				`| ${name} / ${phase} | ${counts.materializeArrays} | ${counts.runtimeArrays} | ${counts.runtimeSets} |`,
			);
	if (process.env.BENCH_JSON)
		writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
	if (!measureOnly) {
		for (const phase of ['mount', 'update', 'abort', 'reorder']) {
			const counts = (name) => result.candidate.cases[name].phases[phase];
			assert.ok(
				counts('static-128').materializeArrays - counts('static-1').materializeArrays <= 4 * 127,
				`${phase}: static plan children do not allocate singleton result arrays`,
			);
			assert.ok(
				counts('scoped-128').materializeArrays - counts('scoped-1').materializeArrays <= 3 * 127,
				`${phase}: ordinary list owners share structural paths`,
			);
			assert.equal(
				counts('unkeyed-128').runtimeSets,
				counts('unkeyed-1').runtimeSets,
				`${phase}: unkeyed child arrays do not add duplicate-key Sets`,
			);
		}
	}
} finally {
	delete globalThis[COUNTER_GLOBAL];
	rmSync(temporary, { recursive: true, force: true });
}
