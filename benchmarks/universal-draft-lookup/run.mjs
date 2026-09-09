// Public object-root updates with changed child props. The ancestor-ref target
// reads and writes the root owner's ref from each child, so lookup distance
// grows across the sibling list. Own-ref and plain-property targets control for
// unrelated owner/driver work. Child renderables are built outside timed work.
process.env.NODE_ENV = 'production';

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const rawIterations = process.argv[2] ?? '7';
const iterations = Number(rawIterations);
if (!Number.isSafeInteger(iterations) || iterations <= 0) {
	throw new TypeError(`iterations must be a positive safe integer, received ${rawIterations}.`);
}

if (process.env.BENCH_RUNTIME_URL === undefined) {
	const build = spawnSync('pnpm', ['--filter', 'octane', 'build'], {
		cwd: REPO,
		stdio: 'inherit',
	});
	if ((build.status ?? 1) !== 0) throw new Error('The octane package build failed.');
}

const runtimeUrl =
	process.env.BENCH_RUNTIME_URL ??
	pathToFileURL(path.join(REPO, 'packages/octane/dist/universal.js')).href;
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
		useRef,
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
	const modes = ['ancestor-ref', 'single-ancestor-read', 'own-ref', 'plain-property'];
	const warmupUpdates = 8;
	const updatesPerSample = 8;
	const fixtures = new Map();
	const failures = [];

	for (const mode of modes) {
		for (const size of sizes) {
			const name = `${mode}-${size}`;
			const observedVersions = Array(size).fill(-1);
			const childRenders = Array(size).fill(0);
			const ownRefs = Array(size).fill(null);
			const sharedProperty = { current: -1 };
			let ancestorRef = null;
			const Child = defineUniversalComponent('object', ({ id, version }) => {
				if (mode === 'single-ancestor-read') {
					if (id === size - 1 && ancestorRef?.current !== -1) {
						throw new Error(`${name}: far child could not read the ancestor ref`);
					}
				} else {
					const ref =
						mode === 'ancestor-ref'
							? ancestorRef
							: mode === 'own-ref'
								? useRef(-1, 'own-accumulator')
								: sharedProperty;
					if (ref === null) throw new Error(`${name}: child rendered without its ancestor ref`);
					if (mode === 'own-ref') {
						if (ownRefs[id] !== null && ownRefs[id] !== ref) {
							throw new Error(`${name}: child ${id} changed its ref identity`);
						}
						ownRefs[id] = ref;
					}
					const previous = mode === 'own-ref' ? version - 1 : version * size + id - 1;
					if (ref.current !== previous) {
						throw new Error(`${name}: child ${id} saw ${ref.current} instead of ${previous}`);
					}
					const next = mode === 'own-ref' ? version : version * size + id;
					ref.current = next;
					if (ref.current !== next) throw new Error(`${name}: child ${id} lost its ref write`);
				}
				observedVersions[id] = version;
				childRenders[id]++;
				return universalValue(cellPlan, [id]);
			});
			const Scene = defineUniversalComponent('object', ({ version, children }) => {
				if (mode === 'ancestor-ref' || mode === 'single-ancestor-read') {
					const ref = useRef(-1, 'root-accumulator');
					if (ancestorRef !== null && ancestorRef !== ref) {
						throw new Error(`${name}: ancestor ref identity changed`);
					}
					ancestorRef = ref;
				}
				return universalValue(scenePlan, [version, children]);
			});
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
			fixtures.set(name, {
				name,
				mode,
				size,
				container,
				root,
				Scene,
				nextProps,
				version: warmupUpdates + 1,
				observedVersions,
				childRenders,
				ownRefs,
				sharedRef: () =>
					mode === 'ancestor-ref' || mode === 'single-ancestor-read' ? ancestorRef : sharedProperty,
				retainedScene,
				retainedCells,
				structuralCommands: 0,
				acceptedCommits: 0,
				samples: [],
			});
		}
	}

	for (let iteration = 0; iteration < iterations; iteration++) {
		const order = iteration % 2 === 0 ? [...fixtures.values()] : [...fixtures.values()].reverse();
		for (const fixture of order) {
			const versions = Array.from({ length: updatesPerSample }, () =>
				fixture.nextProps(fixture.version++),
			);
			const start = performance.now();
			for (const props of versions) fixture.root.render(fixture.Scene, props);
			fixture.samples.push((performance.now() - start) / updatesPerSample);
			fixture.acceptedCommits += fixture.container.commits.length;
			fixture.structuralCommands += fixture.container.commits.reduce(
				(total, batch) =>
					total +
					batch.commands.filter((command) =>
						['create', 'destroy', 'insert', 'remove'].includes(command.op),
					).length,
				0,
			);
			fixture.container.commits.length = 0;
		}
	}

	const targets = [];
	for (const fixture of fixtures.values()) {
		const { name, mode, size } = fixture;
		const latestVersion = fixture.version - 1;
		const scene = fixture.container.children[0];
		if (scene !== fixture.retainedScene || scene?.props.version !== latestVersion) {
			failures.push(`${name}: scene identity or latest version changed`);
		}
		if (fixture.container.instanceCount !== size + 1 || scene?.children.length !== size) {
			failures.push(`${name}: expected ${size} retained child hosts`);
		}
		for (let id = 0; id < size; id++) {
			if (
				scene?.children[id] !== fixture.retainedCells[id] ||
				scene.children[id].props.id !== id ||
				fixture.observedVersions[id] !== latestVersion ||
				fixture.childRenders[id] !== 1 + warmupUpdates + iterations * updatesPerSample ||
				(mode === 'own-ref' && fixture.ownRefs[id]?.current !== latestVersion)
			) {
				failures.push(`${name}: child ${id} lost identity, state, or changed-prop render`);
				break;
			}
		}
		const sharedValue = fixture.sharedRef()?.current ?? -1;
		const expectedShared =
			size === 0 || mode === 'single-ancestor-read' ? -1 : (latestVersion + 1) * size - 1;
		if (mode !== 'own-ref' && sharedValue !== expectedShared) {
			failures.push(`${name}: shared value ${sharedValue} != ${expectedShared}`);
		}
		if (
			fixture.structuralCommands !== 0 ||
			fixture.acceptedCommits !== iterations * updatesPerSample
		) {
			failures.push(`${name}: unexpected commands or unaccepted updates`);
		}
		const outputHash = createHash('sha256')
			.update(
				JSON.stringify({
					mode,
					version: scene?.props.version,
					cells: scene?.children.map((child) => child.props.id),
					sharedValue: mode === 'own-ref' ? null : sharedValue,
					ownRefValues: mode === 'own-ref' ? fixture.ownRefs.map((ref) => ref.current) : null,
				}),
			)
			.digest('hex');
		const stats = summarizeSamples(fixture.samples);
		targets.push({
			name,
			ops: { update_ms: timingStatForJson(stats) },
			meta: {
				nodeVersion: process.version,
				platform: process.platform,
				architecture: process.arch,
				mode,
				childOwners: size,
				hostInstances: fixture.container.instanceCount,
				latestVersion,
				acceptedCommits: fixture.acceptedCommits,
				structuralCommands: fixture.structuralCommands,
				outputHash,
			},
		});
		fixture.root.unmount();
		if (fixture.container.instanceCount !== 0 || fixture.container.children.length !== 0) {
			failures.push(`${name}: unmount did not release every host`);
		}
	}

	payload = {
		suite: 'universal-draft-lookup',
		iterations,
		targets,
		...(failures.length === 0 ? null : { failed: failures.join(' | ') }),
	};
	console.log('| target | child owners | ms per accepted update |');
	console.log('| --- | ---: | ---: |');
	for (const target of targets) {
		console.log(
			`| ${target.name} | ${target.meta.childOwners} | ${target.ops.update_ms.score.toFixed(3)} |`,
		);
	}
	if (failures.length !== 0) {
		console.error(failures.join('\n'));
		process.exitCode = 1;
	}
} catch (error) {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	payload = { suite: 'universal-draft-lookup', iterations, targets: [], failed: message };
	console.error(message);
	process.exitCode = 1;
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
