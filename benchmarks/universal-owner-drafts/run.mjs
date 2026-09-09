// Public universal-root renders with changed child props and stable host output.
// Constructing next-version renderables and checking the result stay outside the
// measured owner-update interval.
process.env.NODE_ENV = 'production';

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const ROOT = import.meta.dirname;
const REPO = path.resolve(ROOT, '../..');
const rawIterations = process.argv[2] ?? '7';
const iterations = Number(rawIterations);
if (!Number.isSafeInteger(iterations) || iterations <= 0) {
	throw new TypeError(`iterations must be a positive safe integer, received ${rawIterations}.`);
}

const runtimeOverride = process.env.BENCH_RUNTIME_URL;
if (runtimeOverride === undefined) {
	const build = spawnSync('pnpm', ['--filter', 'octane', 'build'], {
		cwd: REPO,
		stdio: 'inherit',
	});
	if ((build.status ?? 1) !== 0) throw new Error('The octane package build failed.');
}

const runtimeUrl =
	runtimeOverride ?? pathToFileURL(path.join(REPO, 'packages/octane/dist/universal.js')).href;
let payload;

try {
	const {
		createObjectContainer,
		createObjectDriver,
		createUniversalRoot,
		defineUniversalComponent,
		universalComponent,
		universalPlan,
		universalValue,
	} = await import(runtimeUrl);

	const scenePlan = universalPlan('object', {
		kind: 'host',
		type: 'scene',
		bindings: [['version', 0]],
		children: [{ kind: 'slot', slot: 1 }],
	});
	const cellPlan = universalPlan('object', {
		kind: 'host',
		type: 'cell',
		bindings: [['id', 0]],
	});
	const sizes = [0, 1, 128, 1_024];
	const warmupUpdates = 8;
	const updatesPerSample = 20;
	const failures = [];
	const fixtures = new Map();

	for (const size of sizes) {
		const observedVersions = Array(size).fill(-1);
		const childRenders = Array(size).fill(0);
		const Child = defineUniversalComponent('object', ({ id, version }) => {
			observedVersions[id] = version;
			childRenders[id]++;
			return universalValue(cellPlan, [id]);
		});
		const Scene = defineUniversalComponent('object', ({ version, children }) =>
			universalValue(scenePlan, [version, children]),
		);
		const nextProps = (version) => ({
			version,
			children: Array.from({ length: size }, (_, id) =>
				universalComponent('object', Child, { id, version }, id),
			),
		});
		const container = createObjectContainer('object');
		const root = createUniversalRoot(container, createObjectDriver('object'));
		root.render(Scene, nextProps(0));
		const retainedScene = container.children[0];
		const retainedCells = [...retainedScene.children];
		for (let version = 1; version <= warmupUpdates; version++) {
			root.render(Scene, nextProps(version));
		}
		container.commits.length = 0;
		fixtures.set(size, {
			container,
			root,
			Scene,
			nextProps,
			version: warmupUpdates + 1,
			observedVersions,
			childRenders,
			retainedScene,
			retainedCells,
			samples: [],
		});
	}

	for (let iteration = 0; iteration < iterations; iteration++) {
		const order = iteration % 2 === 0 ? sizes : [...sizes].reverse();
		for (const size of order) {
			const fixture = fixtures.get(size);
			const versions = Array.from({ length: updatesPerSample }, () =>
				fixture.nextProps(fixture.version++),
			);
			const start = performance.now();
			for (const props of versions) fixture.root.render(fixture.Scene, props);
			fixture.samples.push((performance.now() - start) / updatesPerSample);
		}
	}

	const targets = [];
	for (const size of sizes) {
		const fixture = fixtures.get(size);
		const latestVersion = fixture.version - 1;
		const scene = fixture.container.children[0];
		if (scene !== fixture.retainedScene || scene?.props.version !== latestVersion) {
			failures.push(`owners-${size}: scene identity or latest version changed`);
		}
		if (fixture.container.instanceCount !== size + 1 || scene.children.length !== size) {
			failures.push(`owners-${size}: expected ${size} retained child hosts`);
		}
		for (let id = 0; id < size; id++) {
			if (
				scene.children[id] !== fixture.retainedCells[id] ||
				scene.children[id].props.id !== id ||
				fixture.observedVersions[id] !== latestVersion ||
				fixture.childRenders[id] !== 1 + warmupUpdates + iterations * updatesPerSample
			) {
				failures.push(`owners-${size}: child ${id} lost identity or a changed-prop render`);
				break;
			}
		}
		const structuralCommands = fixture.container.commits.reduce(
			(total, batch) =>
				total +
				batch.commands.filter((command) =>
					['create', 'destroy', 'insert', 'remove'].includes(command.op),
				).length,
			0,
		);
		if (structuralCommands !== 0) {
			failures.push(`owners-${size}: ${structuralCommands} unexpected structural commands`);
		}
		const outputHash = createHash('sha256')
			.update(
				JSON.stringify({
					version: scene.props.version,
					cells: scene.children.map((child) => child.props.id),
				}),
			)
			.digest('hex');
		const stats = summarizeSamples(fixture.samples);
		targets.push({
			name: `owners-${size}`,
			ops: { update_ms: timingStatForJson(stats) },
			meta: {
				nodeVersion: process.version,
				platform: process.platform,
				architecture: process.arch,
				childOwners: size,
				hostInstances: fixture.container.instanceCount,
				latestVersion,
				structuralCommands,
				outputHash,
			},
		});
		fixture.root.unmount();
	}

	payload = {
		suite: 'universal-owner-drafts',
		iterations,
		targets,
		...(failures.length === 0 ? null : { failed: failures.join(' | ') }),
	};
	console.log('| target | child owners | host instances | ms per update |');
	console.log('| --- | ---: | ---: | ---: |');
	for (const target of targets) {
		console.log(
			`| ${target.name} | ${target.meta.childOwners} | ${target.meta.hostInstances} | ${target.ops.update_ms.score.toFixed(3)} |`,
		);
	}
	if (failures.length !== 0) {
		console.error(failures.join('\n'));
		process.exitCode = 1;
	}
} catch (error) {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	payload = { suite: 'universal-owner-drafts', iterations, targets: [], failed: message };
	console.error(message);
	process.exitCode = 1;
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
