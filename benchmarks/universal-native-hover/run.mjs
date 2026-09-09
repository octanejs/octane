// Issue #1007: a compiled native universal tree with four view layers per row.
// Mount, validation, and teardown stay outside the update timing samples.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { Session } from 'node:inspector';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const ROOT = import.meta.dirname;
const REPO = path.resolve(ROOT, '../..');
const rawIterations = process.argv[2] ?? '7';
const iterations = Number(rawIterations);
assert.ok(Number.isSafeInteger(iterations) && iterations > 0, 'Expected positive iterations');
const allocationProfilePath = process.env.BENCH_ALLOCATION_JSON;
const profileAllocations = allocationProfilePath !== undefined;

const DIST = path.resolve(process.env.BENCH_OCTANE_DIST ?? path.join(REPO, 'packages/octane/dist'));
if (!process.env.BENCH_OCTANE_DIST) {
	const build = spawnSync('pnpm', ['--filter', 'octane', 'build'], {
		cwd: REPO,
		stdio: 'inherit',
	});
	assert.equal(build.status, 0, 'The octane package build failed');
}
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-universal-native-hover-'));
let payload;

const appSource = `
import { useState } from 'octane';

function Fourth({ id, selected, onHover }) {
  return <view depth={4}><row id={id} selected={selected} onHover={onHover} /></view>;
}
function Third({ id, selected, onHover }) {
  return <view depth={3}><Fourth id={id} selected={selected} onHover={onHover} /></view>;
}
function Second({ id, selected, onHover }) {
  return <view depth={2}><Third id={id} selected={selected} onHover={onHover} /></view>;
}
function First({ id, selected, onHover }) {
  return <view depth={1}><Second id={id} selected={selected} onHover={onHover} /></view>;
}
export default function App({ size }) {
  const [active, setActive] = useState(-1);
  return <scene>{Array.from({ length: size }, (_, id) =>
    <First key={id} id={id} selected={active === id} onHover={() => setActive(id)} />
  )}</scene>;
}
`;

try {
	const { compile } = await import(pathToFileURL(path.join(DIST, 'compiler/index.js')).href);
	const runtimeUrl = pathToFileURL(path.join(DIST, 'universal-native.js')).href;
	fs.writeFileSync(
		path.join(temporary, 'runtime.mjs'),
		`export * from ${JSON.stringify(runtimeUrl)};\n`,
	);
	const compiled = compile(appSource, 'native-hover.jsx', {
		mode: 'client',
		dev: false,
		hmr: false,
		renderer: {
			id: 'object',
			module: './runtime.mjs',
			target: 'universal',
			server: 'unsupported',
			text: 'host',
			capabilities: [],
		},
	});
	assert.deepEqual(compiled.diagnostics ?? [], [], 'The production fixture must compile');
	fs.writeFileSync(path.join(temporary, 'app.mjs'), compiled.code);
	const { createObjectContainer, createObjectDriver, createUniversalRoot, flushUniversalSync } =
		await import(runtimeUrl);
	const { default: App } = await import(pathToFileURL(path.join(temporary, 'app.mjs')).href);
	const eventPayload = Object.freeze({});
	const sizes = [20, 80];
	const warmupEvents = 100;
	const eventsPerSample = 2_000;
	const fixtures = new Map();
	const failures = [];
	let allocationProfile = null;
	const inspector = profileAllocations ? new Session() : null;
	const post = (method, params = {}) =>
		new Promise((resolve, reject) =>
			inspector.post(method, params, (error, result) => (error ? reject(error) : resolve(result))),
		);

	function check(condition, message) {
		if (!condition) failures.push(message);
	}

	function hostRows(scene) {
		return scene.children.map((first) => first.children[0].children[0].children[0].children[0]);
	}

	function verify(fixture, stage) {
		const { container, scene, rows, size, selected } = fixture;
		check(container.children[0] === scene, `${stage}: scene lost identity`);
		check(container.instanceCount === 1 + size * 5, `${stage}: host count changed`);
		check(scene.children.length === size, `${stage}: row count changed`);
		for (let index = 0; index < size; index++) {
			let view = scene.children[index];
			for (let depth = 1; depth <= 4; depth++) {
				check(
					view.type === 'view' && view.props.depth === depth,
					`${stage}: view ${index}/${depth} changed`,
				);
				check(
					view === fixture.views[index][depth - 1],
					`${stage}: view ${index}/${depth} lost identity`,
				);
				view = view.children[0];
			}
			check(view === rows[index], `${stage}: row ${index} lost identity`);
			check(view.type === 'row' && view.props.id === index, `${stage}: row ${index} changed`);
			check(
				view.props.selected === (index === selected),
				`${stage}: row ${index} selection is wrong`,
			);
		}
	}

	function press(fixture, index, retainCommit = false) {
		flushUniversalSync(() =>
			fixture.container.dispatchEvent(fixture.rows[index], 'hover', eventPayload),
		);
		fixture.selected = index;
		// The object driver's public diagnostic ledger holds complete historical batches.
		// A native host does not retain them, so release each one during the workload.
		if (!retainCommit) fixture.container.commits.length = 0;
	}

	for (const size of sizes) {
		const container = createObjectContainer('object');
		const root = createUniversalRoot(container, createObjectDriver('object'));
		flushUniversalSync(() => root.render(App, { size }));
		const scene = container.children[0];
		assert.equal(scene?.type, 'scene', 'Expected the compiled scene host');
		const views = scene.children.map((first) => {
			const chain = [];
			let view = first;
			for (let depth = 0; depth < 4; depth++) {
				chain.push(view);
				view = view.children[0];
			}
			return chain;
		});
		const fixture = {
			container,
			root,
			scene,
			views,
			rows: hostRows(scene),
			size,
			selected: -1,
			samples: [],
		};
		verify(fixture, `mount-${size}`);
		for (let index = 0; index < warmupEvents; index++) press(fixture, index % size);
		verify(fixture, `warmup-${size}`);
		fixtures.set(size, fixture);
	}

	for (let iteration = 0; iteration < iterations; iteration++) {
		for (const size of iteration % 2 === 0 ? sizes : [...sizes].reverse()) {
			const fixture = fixtures.get(size);
			if (profileAllocations && iteration === 0 && size === 20) {
				inspector.connect();
				await post('HeapProfiler.enable');
				await post('HeapProfiler.startSampling', {
					samplingInterval: 2_048,
					includeObjectsCollectedByMajorGC: true,
					includeObjectsCollectedByMinorGC: true,
				});
			}
			const start = performance.now();
			for (let event = 0; event < eventsPerSample; event++) {
				press(fixture, (event + iteration) % size);
			}
			fixture.samples.push((performance.now() - start) / eventsPerSample);
			if (profileAllocations && iteration === 0 && size === 20) {
				allocationProfile = (await post('HeapProfiler.stopSampling')).profile;
				inspector.disconnect();
			}
			verify(fixture, `sample-${size}-${iteration}`);
		}
	}

	const targets = [];
	for (const size of sizes) {
		const fixture = fixtures.get(size);
		const previouslySelected = fixture.selected;
		const nextSelected = (previouslySelected + 1) % size;
		press(fixture, nextSelected, true);
		const lastBatch = fixture.container.commits.at(-1);
		const commands = lastBatch?.commands ?? [];
		const updates = commands.filter((command) => command.op === 'update');
		const selectedWrites = updates.filter((command) => 'selected' in command.props);
		const structuralCommands = commands.filter((command) =>
			['create', 'recreate', 'insert', 'move', 'remove', 'destroy'].includes(command.op),
		);
		check(fixture.container.commits.length === 1, `probe-${size}: expected one accepted commit`);
		check(structuralCommands.length === 0, `probe-${size}: hover changed the host structure`);
		check(
			updates.length === 2 && selectedWrites.length === 2,
			`probe-${size}: hover should update only the old and new selected rows`,
		);
		check(
			fixture.rows[previouslySelected].props.selected === false &&
				fixture.rows[nextSelected].props.selected === true,
			`probe-${size}: old/new row props were not updated`,
		);
		verify(fixture, `probe-${size}`);
		fixture.container.commits.length = 0;
		const stats = summarizeSamples(fixture.samples);
		targets.push({
			name: `rows-${size}`,
			ops: { hover_update_ms: timingStatForJson(stats) },
			meta: {
				rows: size,
				viewsPerRow: 4,
				hostInstances: fixture.container.instanceCount,
				retainedRows: fixture.rows.length,
				selected: fixture.selected,
				events: warmupEvents + iterations * eventsPerSample + 1,
				hoverUpdateCommands: updates.length,
				selectedPropWrites: selectedWrites.length,
				structuralCommands: structuralCommands.length,
				commitsRetained: fixture.container.commits.length,
			},
		});
		fixture.root.unmount();
		check(fixture.container.children.length === 0, `unmount-${size}: visible hosts remain`);
		check(fixture.container.instanceCount === 0, `unmount-${size}: host instances remain`);
		check(
			fixture.container.commits.at(-1)?.commands.filter((command) => command.op === 'destroy')
				.length ===
				1 + size * 5,
			`unmount-${size}: missing host destroy commands`,
		);
	}

	payload = {
		suite: 'universal-native-hover',
		iterations,
		targets,
		...(failures.length ? { failed: failures.join(' | ') } : null),
	};
	if (allocationProfile !== null) {
		fs.writeFileSync(allocationProfilePath, `${JSON.stringify(allocationProfile)}\n`);
		const hot = [];
		function visit(node, stack) {
			const name = node.callFrame.functionName || '(anonymous)';
			const next = [...stack, name];
			if (node.selfSize) hot.push({ bytes: node.selfSize, stack: next.join(' > ') });
			for (const child of node.children) visit(child, next);
		}
		visit(allocationProfile.head, []);
		hot.sort((a, b) => b.bytes - a.bytes);
		console.log('Top sampled allocation stacks (estimated bytes):');
		for (const item of hot.slice(0, 12)) console.log(`${item.bytes}\t${item.stack}`);
	}
	console.log('| target | hosts | ms per hover |');
	console.log('| --- | ---: | ---: |');
	for (const target of targets) {
		console.log(
			`| ${target.name} | ${target.meta.hostInstances} | ${target.ops.hover_update_ms.score.toFixed(3)} |`,
		);
	}
	if (failures.length) {
		console.error(failures.join('\n'));
		process.exitCode = 1;
	}
} catch (error) {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	payload = { suite: 'universal-native-hover', iterations, targets: [], failed: message };
	console.error(message);
	process.exitCode = 1;
} finally {
	fs.rmSync(temporary, { recursive: true, force: true });
}

if (process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, 2)}\n`);
