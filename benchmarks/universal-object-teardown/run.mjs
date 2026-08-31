// Universal object-driver teardown benchmark. A public object root mounts a
// flat keyed host list, then unmounts it through the transactional driver.
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

const build = spawnSync('pnpm', ['--filter', 'octane', 'build'], {
	cwd: REPO,
	stdio: 'inherit',
});
if ((build.status ?? 1) !== 0) throw new Error('The octane package build failed.');

const runtimeUrl = pathToFileURL(path.join(REPO, 'packages/octane/dist/universal-native.js')).href;
const {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	universalFor,
	universalPlan,
	universalValue,
} = await import(runtimeUrl);

const plan = universalPlan('object', { kind: 'host', type: 'row' });
const rowsBySize = new Map();
const rows = (size) => {
	let value = rowsBySize.get(size);
	if (value === undefined) {
		value = Array.from({ length: size }, (_, index) => index);
		rowsBySize.set(size, value);
	}
	return value;
};
const Scene = defineUniversalComponent('object', ({ size }) =>
	universalFor(
		rows(size),
		(index) => index,
		() => universalValue(plan, []),
	),
);

const WARMUPS = 3;
const SIZES = [2, 4_096, 16_384];
const targets = [];
const failures = [];

for (const size of SIZES) {
	const samples = [];
	let removeCommands = 0;
	let destroyCommands = 0;
	for (let sample = 0; sample < WARMUPS + iterations; sample++) {
		const container = createObjectContainer();
		const root = createUniversalRoot(container, createObjectDriver());
		root.render(Scene, { size });
		const mounted = [...container.children];
		if (
			mounted.length !== size ||
			container.instanceCount !== size ||
			mounted.some((instance) => instance.type !== 'row')
		) {
			failures.push(`size ${size}: mounted object-host shape did not match the input list`);
		}

		const start = performance.now();
		root.unmount();
		const duration = performance.now() - start;
		if (sample >= WARMUPS) samples.push(duration);

		const teardown = container.commits.at(-1);
		removeCommands = teardown?.commands.filter((command) => command.op === 'remove').length ?? -1;
		destroyCommands = teardown?.commands.filter((command) => command.op === 'destroy').length ?? -1;
		if (
			container.children.length !== 0 ||
			container.instanceCount !== 0 ||
			removeCommands !== size ||
			destroyCommands !== size
		) {
			failures.push(`size ${size}: teardown did not remove and destroy every mounted host`);
		}
	}

	const stats = summarizeSamples(samples);
	targets.push({
		name: `siblings-${size}`,
		ops: { unmount_ms: timingStatForJson(stats) },
		meta: {
			siblings: size,
			removeCommands,
			destroyCommands,
			remainingInstances: 0,
		},
	});
}

const payload = {
	suite: 'universal-object-teardown',
	iterations,
	targets,
	...(failures.length > 0 ? { failed: failures.join('; ') } : null),
};

console.table(
	targets.map((target) => ({
		target: target.name,
		unmount_ms: target.ops.unmount_ms.score.toFixed(3),
		rme: target.ops.unmount_ms.rme.toFixed(2) + '%',
	})),
);
if (process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, 2));
if (failures.length > 0) throw new Error(failures.join('\n'));
