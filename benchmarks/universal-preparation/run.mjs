// Deterministic preparation work through public universal-root rendering.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';

process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const requireDependencies = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = requireDependencies('esbuild');
const file = 'packages/octane/src/universal-core.ts';
const baselineRef = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
const measureOnly = process.argv.includes('--measure');
const temporary = mkdtempSync(path.join(tmpdir(), 'octane-universal-preparation-'));
const counter = '__octaneUniversalPreparationWork';
const sha256 = (source) => createHash('sha256').update(source).digest('hex');
const emptyCounts = () => ({ templateNodes: 0, leafNodes: 0, stableNodes: 0, expansionNodes: 0 });

function observe(source) {
	function instrument(method, end, needle, metric) {
		const start = source.indexOf(method);
		const finish = source.indexOf(end, start + method.length);
		assert.ok(start >= 0 && finish > start, `${metric}: preparation method exists`);
		const segment = source.slice(start, finish);
		assert.ok(segment.includes(needle), `${metric}: preparation walk exists`);
		const updated = segment.replace(needle, `${needle}\nglobalThis.${counter}.${metric}++;`);
		source = source.slice(0, start) + updated + source.slice(finish);
	}
	instrument(
		'private tryCreateCompactTemplateUpdateTransaction(',
		'private publishAcceptedCompactOwners(',
		'for (const next of blueprints) {',
		'templateNodes',
	);
	instrument(
		'private tryCreateCompactLeafUpdateTransaction(',
		'private tryCreateStableLeafUpdateTransaction(',
		'for (const next of blueprints) {',
		'leafNodes',
	);
	instrument(
		'private tryCreateStableLeafUpdateTransaction(',
		'private createTransaction(',
		'for (let index = 0; index < records.length; index++) {',
		'stableNodes',
	);
	const expansion = 'private expandCompactLeafLists(node: BlueprintNode): void {';
	assert.ok(source.includes(expansion), 'compact-list expansion exists');
	return source.replace(expansion, `${expansion}\nglobalThis.${counter}.expansionNodes++;`);
}

function workload(runtime, kind, size) {
	globalThis[counter] = emptyCounts();
	const {
		createObjectContainer,
		createObjectDriver,
		createUniversalRoot,
		defineUniversalComponent,
		universalComponent,
		universalFor,
		universalPlan,
		universalValue,
	} = runtime;
	const leaf = universalPlan('object', {
		kind: 'host',
		type: 'leaf',
		bindings: [
			['id', 0],
			['version', 1],
		],
	});
	const shell = universalPlan('object', {
		kind: 'host',
		type: 'shell',
		children: [{ kind: 'slot', slot: 0 }],
	});
	const ids = Array.from({ length: size }, (_, index) => index);
	const Child = defineUniversalComponent('object', ({ id, version }) =>
		universalValue(leaf, [id, version]),
	);
	const Scene = defineUniversalComponent('object', ({ version }) => {
		if (kind === 'ordinary') {
			return ids.map((id) => universalValue(leaf, [id, version], id));
		}
		return universalValue(shell, [
			kind === 'owners'
				? ids.map((id) => universalComponent('object', Child, { id, version }, id))
				: universalFor(
						ids,
						(id) => id,
						(id) => universalValue(leaf, [id, version]),
						null,
						true,
						true,
					),
		]);
	});
	const container = createObjectContainer();
	const base = createObjectDriver();
	const root = createUniversalRoot(container, {
		...base,
		capabilities: { ...base.capabilities, compilerLeafProps: true },
	});
	root.render(Scene, { version: 0 });
	const mount = { ...globalThis[counter] };
	const retained = [...(kind === 'ordinary' ? container.children : container.children[0].children)];
	globalThis[counter] = emptyCounts();
	const updates = 64;
	for (let version = 1; version <= updates; version++) root.render(Scene, { version });
	const update = { ...globalThis[counter] };
	const hosts = kind === 'ordinary' ? container.children : container.children[0].children;
	assert.equal(container.instanceCount, size + (kind === 'ordinary' ? 0 : 1));
	assert.equal(hosts.length, size);
	for (let index = 0; index < size; index++) {
		assert.equal(hosts[index], retained[index], 'host identity survives updates');
		assert.equal(hosts[index].props.id, index);
		assert.equal(hosts[index].props.version, updates);
	}
	const semantic = {
		outputHash: sha256(JSON.stringify(hosts.map((host) => [host.type, host.props]))),
		hostInstances: container.instanceCount,
		acceptedVersions: container.commits.map((batch) => batch.version),
	};
	root.unmount();
	assert.equal(container.instanceCount, 0);
	assert.deepEqual(container.children, []);
	return { phases: { mount, update }, semantic };
}

async function measure(source, label) {
	async function bundle(contents, suffix) {
		const outfile = path.join(temporary, `${label}-${suffix}.mjs`);
		await build({
			entryPoints: [path.join(repo, 'packages/octane/src/universal.ts')],
			bundle: true,
			format: 'esm',
			platform: 'node',
			outfile,
			define: { 'process.env.NODE_ENV': '"production"' },
			plugins: [
				{
					name: 'universal-preparation-source',
					setup(builder) {
						builder.onLoad({ filter: /[/\\]universal-core\.ts$/ }, () => ({
							contents,
							loader: 'ts',
							resolveDir: path.join(repo, 'packages/octane/src'),
						}));
					},
				},
			],
		});
		return import(pathToFileURL(outfile).href);
	}
	const clean = await bundle(source, 'clean');
	const observed = await bundle(observe(source), 'observed');
	const cases = {};
	for (const size of [0, 128, 1_024]) {
		for (const kind of ['ordinary', 'owners', 'compact']) {
			const expected = workload(clean, kind, size);
			const actual = workload(observed, kind, size);
			assert.deepEqual(actual.semantic, expected.semantic, 'observer preserves host behavior');
			cases[`${kind}-${size}`] = actual;
		}
	}
	return { sourceHash: sha256(source), cases };
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
		suite: 'universal-preparation',
		iterations: 1,
		metric: 'blueprint nodes visited by optional preparation walks',
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
		for (const [name, candidate] of Object.entries(result.candidate.cases)) {
			const baseline = result.baseline.cases[name];
			assert.deepEqual(candidate.semantic, baseline.semantic, `${name}: baseline behavior matches`);
			if (name.startsWith('compact-')) {
				assert.ok(
					candidate.phases.update.expansionNodes > 0,
					'compact control still observes required expansion',
				);
				assert.deepEqual(
					candidate.phases,
					baseline.phases,
					'compact preparation work is preserved',
				);
			}
		}
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
	result.targets.push({
		name: 'preparation-work',
		ops: Object.fromEntries(
			['templateNodes', 'leafNodes', 'expansionNodes'].map((metric) => [
				`update_${metric}`,
				deterministicStatForJson(deterministicCount(64)),
			]),
		),
		meta: { updates: 64 },
	});
	console.log('| case | compact template visits | compact leaf visits | expansion visits |');
	console.log('| --- | ---: | ---: | ---: |');
	for (const [name, scenario] of Object.entries(result.candidate.cases)) {
		const counts = scenario.phases.update;
		console.log(
			`| ${name} | ${counts.templateNodes} | ${counts.leafNodes} | ${counts.expansionNodes} |`,
		);
		if (!measureOnly && !name.startsWith('compact-')) {
			for (const phase of Object.values(scenario.phases)) {
				assert.equal(phase.templateNodes + phase.leafNodes + phase.expansionNodes, 0);
			}
		}
	}
	if (process.env.BENCH_JSON)
		writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, 2) + '\n');
} finally {
	delete globalThis[counter];
	rmSync(temporary, { recursive: true, force: true });
}
