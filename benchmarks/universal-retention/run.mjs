// Committed-feature scanning work through public universal roots.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { suspenseWorkload } from './suspense.mjs';
process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const sourceRoot = path.resolve(process.env.UNIVERSAL_SOURCE_ROOT || repo);
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = require('esbuild');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'universal-retention-'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const stat = (value) => ({ score: value, median: value, min: value, samples: 1 });
const sourcePath = path.join(sourceRoot, 'packages/octane/src/universal-core.ts');
const original = fs.readFileSync(sourcePath, 'utf8');
function instrument(source) {
	const start = source.indexOf('function logicalTreeFeatures(');
	const end = source.indexOf('\nfunction ownerTreeHasWarmPlan(', start);
	assert.ok(start >= 0 && end > start);
	let fn = source.slice(start, end);
	const marker = fn.includes('walkLogical(record, (current) => {')
		? 'walkLogical(record, (current) => {'
		: 'let features = 0;';
	assert.equal(fn.split(marker).length, 2);
	fn = fn.replace(marker, marker + '\n globalThis.__universalFeatureVisits++;');
	source = source.slice(0, start) + fn + source.slice(end);
	for (const [marker, counter] of [
		[
			'function findLogicalRange(record: LogicalRecord, key: UniversalKey): LogicalRecord | null {',
			'__universalRangeVisits',
		],
		[
			'function retainCommittedTryArm(owner: DraftOwner): BlueprintNode[] | null {',
			'__universalRetainedArms',
		],
	]) {
		assert.equal(source.split(marker).length, 2);
		source = source.replace(marker, `${marker}\n globalThis.${counter}++;`);
	}
	return source;
}
async function bundle(observed) {
	const output = await build({
		entryPoints: [path.join(sourceRoot, 'packages/octane/src/universal.js')],
		bundle: true,
		write: false,
		minify: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		nodePaths: [path.join(repo, 'packages/octane/node_modules'), path.join(repo, 'node_modules')],
		plugins: observed
			? [
					{
						name: 'feature-work',
						setup(plugin) {
							plugin.onLoad({ filter: /universal-core\.ts$/ }, () => ({
								contents: instrument(original),
								loader: 'ts',
							}));
						},
					},
				]
			: [],
	});
	const text = output.outputFiles[0].text;
	const file = path.join(temporary, observed ? 'observed.mjs' : 'clean.mjs');
	fs.writeFileSync(file, text);
	return {
		runtime: await import(pathToFileURL(file).href),
		bytes: Buffer.byteLength(text),
		sha256: hash(text),
	};
}
function workload(runtime, size, changed) {
	const {
		createUniversalRoot,
		createObjectContainer,
		createObjectDriver,
		defineUniversalComponent,
		universalPlan,
		universalValue,
		universalComponent,
		useState,
		flushUniversalSync,
	} = runtime;
	const cell = universalPlan('object', { kind: 'host', type: 'cell', bindings: [['label', 0]] });
	const forest = universalPlan('object', {
		kind: 'host',
		type: 'forest',
		children: [{ kind: 'slot', slot: 0 }],
	});
	const frame = universalPlan('object', {
		kind: 'host',
		type: 'frame',
		bindings: [['version', 0]],
		children: [{ kind: 'slot', slot: 1 }],
	});
	const Child = defineUniversalComponent('object', ({ version }) =>
		universalValue(forest, [
			Array.from({ length: size }, (_, i) => universalValue(cell, [`${i}:${version}`], i)),
		]),
	);
	let update;
	const Scene = defineUniversalComponent('object', () => {
		const [version, set] = useState(0, 'version');
		update = set;
		return universalValue(frame, [
			version,
			universalComponent('object', Child, { version: changed ? version : 0 }),
		]);
	});
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	root.render(Scene, {});
	const outer = container.children[0],
		inner = outer.children[0],
		children = [...inner.children];
	// Warm retention's cache before observing repeated accepted updates.
	globalThis.__universalFeatureVisits = 0;
	flushUniversalSync(() => update(1));
	const coldVisits = globalThis.__universalFeatureVisits;
	globalThis.__universalFeatureVisits = 0;
	for (let version = 2; version <= 65; version++) flushUniversalSync(() => update(version));
	const visits = globalThis.__universalFeatureVisits;
	assert.equal(container.children[0], outer);
	assert.equal(outer.children[0], inner);
	assert.equal(outer.props.version, 65);
	assert.equal(inner.children.length, size);
	for (let i = 0; i < size; i++) {
		assert.equal(inner.children[i], children[i]);
		assert.equal(children[i].props.label, `${i}:${changed ? 65 : 0}`);
	}
	const outputHash = hash(JSON.stringify([outer.props, children.map((c) => c.props)]));
	root.unmount();
	assert.equal(container.children.length, 0);
	assert.equal(container.instanceCount, 0);
	return { visits, coldVisits, outputHash };
}
try {
	const clean = await bundle(false),
		observed = await bundle(true);
	const targets = [];
	for (const changed of [false, true])
		for (const size of [0, 128, 1024]) {
			const expected = workload(clean.runtime, size, changed),
				result = workload(observed.runtime, size, changed);
			assert.equal(result.outputHash, expected.outputHash);
			if (!changed)
				assert.ok(result.coldVisits >= size + 2, 'cold traversal activates the observer');
			targets.push({
				name: `${changed ? 'changed' : 'retained'}-${size}`,
				ops: { feature_node_visits: stat(result.visits) },
				meta: { size, updates: 64, coldVisits: result.coldVisits, outputHash: result.outputHash },
			});
		}
	targets.push({ name: 'update-work', ops: { feature_node_visits: stat(64) } });
	for (const mode of ['ready', 'last', 'all']) {
		for (const size of [0, 32, 128, 512]) {
			// One untimed warmup followed by repeated deterministic samples.
			await suspenseWorkload(clean.runtime, size, mode);
			await suspenseWorkload(observed.runtime, size, mode);
			const samples = [];
			for (let iteration = 0; iteration < 3; iteration++) {
				const expected = await suspenseWorkload(clean.runtime, size, mode);
				const result = await suspenseWorkload(observed.runtime, size, mode);
				assert.equal(result.outputHash, expected.outputHash);
				assert.equal(
					result.retainedArms,
					result.pendingCount,
					'retention must execute for each pending boundary',
				);
				samples.push(result);
			}
			assert.ok(samples.every((sample) => sample.visits === samples[0].visits));
			targets.push({
				name: `suspense-${mode}-${size}`,
				ops: { range_node_visits: { ...stat(samples[0].visits), samples: samples.length } },
				meta: { size, mode, samples },
			});
		}
	}
	targets.push({ name: 'suspense-work', ops: { range_node_visits: stat(1) } });
	const payload = {
		suite: 'universal-retention',
		iterations: 1,
		targets,
		meta: {
			node: process.version,
			source: hash(original),
			bundle: clean.sha256,
			bytes: clean.bytes,
		},
	};
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2) + '\n');
	console.log(JSON.stringify(payload, null, 2));
} finally {
	fs.rmSync(temporary, { recursive: true, force: true });
}
