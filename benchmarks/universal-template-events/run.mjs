// Universal event update benchmark. This exercises the public universal root
// while keeping fixture construction and validation outside the measured
// handler-only updates.
process.env.NODE_ENV = 'production';

import { spawnSync } from 'node:child_process';
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
		universalPlan,
		universalValue,
	} = await import(runtimeUrl);

	function createFallbackTemplateDriver(metrics) {
		const base = createObjectDriver('object');
		return {
			...base,
			capabilities: {
				...base.capabilities,
				templateMount: true,
				collapsedTemplateMount: true,
				templateProgramMount: false,
			},
			prepareBatch(container, batch, context) {
				const commands = [];
				for (const command of batch.commands) {
					if (command.op === 'mount-template-range' || command.op === 'mount-template-run') {
						throw new Error('Fallback event benchmark entered the prepared template-program path.');
					}
					if (command.op !== 'mount-template') {
						commands.push(command);
						continue;
					}
					metrics.templateMounts++;
					const { nodes, shape } = command;
					for (let index = 0; index < nodes.length; index++) {
						commands.push({
							op: 'create',
							id: nodes[index].id,
							type: shape[index].type,
							props: nodes[index].props,
						});
					}
					for (const node of nodes) {
						for (const event of node.events ?? []) {
							commands.push({
								op: 'event',
								id: node.id,
								type: event.type,
								listener: event.listener,
							});
						}
					}
					const children = nodes.map(() => []);
					for (let index = 1; index < shape.length; index++) {
						children[shape[index].parent].push(index);
					}
					const place = (index, parent, before) => {
						for (const child of children[index]) place(child, nodes[index].id, null);
						commands.push({ op: 'insert', parent, id: nodes[index].id, before });
					};
					if (typeof command.parent === 'object' && command.parent !== null) {
						throw new Error('Fallback event benchmark does not support portal parents.');
					}
					place(0, command.parent, command.before);
				}
				return base.prepareBatch(container, { ...batch, commands }, context);
			},
		};
	}

	const sizes = [128, 1_024];
	const workloads = ['events', 'regular-events'].flatMap((kind) =>
		sizes.map((size) => ({ kind, size, name: `${kind}-${size}` })),
	);
	const warmupUpdates = 16;
	const updatesPerSample = 20;
	const failures = [];
	const fixtures = new Map();

	function createHandlers(size, epoch, dispatches) {
		const handler = (payload) => {
			dispatches.push({ epoch, payload });
			return epoch;
		};
		return Array(size).fill(handler);
	}

	for (const { kind, size, name } of workloads) {
		const metrics = { templateMounts: 0 };
		const dispatches = [];
		const plan = universalPlan('object', {
			kind: 'host',
			type: 'scene',
			children: Array.from({ length: size }, (_, index) => ({
				kind: 'host',
				type: 'action',
				props: { index },
				bindings: [['onSelect', index]],
			})),
		});
		const Scene = defineUniversalComponent('object', ({ handlers }) =>
			universalValue(plan, handlers),
		);
		const container = createObjectContainer('object');
		const root = createUniversalRoot(
			container,
			kind === 'events' ? createFallbackTemplateDriver(metrics) : createObjectDriver('object'),
		);
		let epoch = 0;
		root.render(Scene, { handlers: createHandlers(size, epoch++, dispatches) });
		const scene = container.children[0];
		const retainedHosts = [...scene.children];
		if (metrics.templateMounts !== (kind === 'events' ? 1 : 0)) {
			failures.push(`${name}: unexpected fallback template mount count ${metrics.templateMounts}`);
		}
		const initialCommands = container.commits[0]?.commands ?? [];
		let initialListenerIds = null;
		if (kind === 'regular-events') {
			if (initialCommands.some((command) => command.op.startsWith('mount-template'))) {
				failures.push(`${name}: entered a template mount path`);
			}
			const listenerByHost = new Map(
				initialCommands
					.filter((command) => command.op === 'event' && command.listener !== null)
					.map((command) => [command.id, command.listener.id]),
			);
			initialListenerIds = retainedHosts.map((host) => listenerByHost.get(host.id));
			if (
				initialListenerIds.some((listener) => typeof listener !== 'number') ||
				new Set(initialListenerIds).size !== size
			) {
				failures.push(`${name}: expected one distinct initial listener ID per ordinary host`);
			}
		}
		for (let index = 0; index < warmupUpdates; index++) {
			root.render(Scene, { handlers: createHandlers(size, epoch++, dispatches) });
		}
		container.commits.length = 0;
		fixtures.set(name, {
			container,
			dispatches,
			epoch,
			initialListenerIds,
			kind,
			metrics,
			retainedHosts,
			root,
			Scene,
			samples: [],
		});
	}

	for (let iteration = 0; iteration < iterations; iteration++) {
		const order = iteration % 2 === 0 ? workloads : [...workloads].reverse();
		for (const { name, size } of order) {
			const fixture = fixtures.get(name);
			const handlerSets = Array.from({ length: updatesPerSample }, () =>
				createHandlers(size, fixture.epoch++, fixture.dispatches),
			);
			const start = performance.now();
			for (const handlers of handlerSets) fixture.root.render(fixture.Scene, { handlers });
			fixture.samples.push((performance.now() - start) / updatesPerSample);
		}
	}

	const targets = [];
	for (const { kind, size, name } of workloads) {
		const fixture = fixtures.get(name);
		const scene = fixture.container.children[0];
		const latestEpoch = fixture.epoch - 1;
		if (fixture.container.instanceCount !== size + 1) {
			failures.push(
				`${name}: expected ${size + 1} retained hosts, got ${fixture.container.instanceCount}`,
			);
		}
		for (let index = 0; index < size; index++) {
			if (scene.children[index] !== fixture.retainedHosts[index]) {
				failures.push(`${name}: host ${index} lost identity during handler updates`);
				break;
			}
		}
		const eventCommands = fixture.container.commits.reduce(
			(total, batch) => total + batch.commands.filter((command) => command.op === 'event').length,
			0,
		);
		if (eventCommands !== 0) {
			failures.push(`${name}: handler-only updates emitted ${eventCommands} event commands`);
		}
		const hostCommands = fixture.container.commits.reduce(
			(total, batch) => total + batch.commands.length,
			0,
		);
		if (kind === 'regular-events' && hostCommands !== 0) {
			failures.push(`${name}: handler-only updates emitted ${hostCommands} host commands`);
		}
		for (const index of [0, Math.floor(size / 2), size - 1]) {
			const result = fixture.container.dispatchEvent(scene.children[index], 'select', index);
			if (result !== latestEpoch) {
				failures.push(
					`${name}: host ${index} dispatched epoch ${String(result)}, expected ${latestEpoch}`,
				);
			}
			if (kind === 'regular-events' && fixture.initialListenerIds?.[index] !== undefined) {
				const direct = fixture.root.dispatchEvent(fixture.initialListenerIds[index], index);
				if (direct !== latestEpoch) {
					failures.push(`${name}: original listener ${index} did not reach the latest handler`);
				}
			}
		}
		if (
			fixture.dispatches.length !== (kind === 'regular-events' ? 6 : 3) ||
			fixture.dispatches.some(({ epoch }) => epoch !== latestEpoch)
		) {
			failures.push(`${name}: final handlers did not own all semantic dispatches`);
		}
		const stats = summarizeSamples(fixture.samples);
		targets.push({
			name,
			ops: { event_update_ms: timingStatForJson(stats) },
			meta: {
				nodeVersion: process.version,
				platform: process.platform,
				architecture: process.arch,
				eventSites: size,
				hostInstances: fixture.container.instanceCount,
				retainedHosts: fixture.retainedHosts.length,
				templateMounts: fixture.metrics.templateMounts,
				handlerOnlyEventCommands: eventCommands,
				handlerOnlyHostCommands: hostCommands,
				initialListenerIds: fixture.initialListenerIds?.length ?? 0,
				semanticDispatches: fixture.dispatches.length,
				finalEpoch: latestEpoch,
			},
		});
		fixture.root.unmount();
	}

	payload = {
		suite: 'universal-template-events',
		iterations,
		targets,
		...(failures.length === 0 ? null : { failed: failures.join(' | ') }),
	};

	console.log('| target | event sites | host instances | ms per update |');
	console.log('| --- | ---: | ---: | ---: |');
	for (const target of targets) {
		console.log(
			`| ${target.name} | ${target.meta.eventSites} | ${target.meta.hostInstances} | ${target.ops.event_update_ms.score.toFixed(3)} |`,
		);
	}
	if (failures.length !== 0) {
		console.error(failures.join('\n'));
		process.exitCode = 1;
	}
} catch (error) {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	payload = { suite: 'universal-template-events', iterations, targets: [], failed: message };
	console.error(message);
	process.exitCode = 1;
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
