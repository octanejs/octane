// End-to-end timing companion; all assertions and fixture setup are untimed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

export async function runTiming(runtime, bundle) {
	const {
		createObjectContainer,
		createObjectDriver,
		createUniversalRoot,
		defineUniversalComponent,
		universalPlan,
		universalValue,
	} = runtime;
	const iterations = Number(process.env.BENCH_ITERATIONS ?? 9);
	assert.ok(Number.isSafeInteger(iterations) && iterations > 0);
	const cases = [];
	const targets = [];
	const warmups = 5;
	const updatesPerSample = 16;
	for (const size of [128, 1024]) {
		for (const mode of ['plain', 'events', 'callbacks']) {
			let updates = 0;
			let attached = 0;
			let detached = 0;
			let dispatched = 0;
			const onSelect = () => dispatched++;
			const onUpdate = () => updates++;
			const attach = () => {
				attached++;
				return () => detached++;
			};
			const bindings = [['count', 0]];
			if (mode === 'events') bindings.push(['onSelect', 1]);
			if (mode === 'callbacks') bindings.push(['onSelect', 1], ['attach', 2], ['onUpdate', 3]);
			bindings.push(['tail', 4]);
			const plan = universalPlan('object', {
				kind: 'host',
				type: 'scene',
				children: Array.from({ length: size }, (_, id) => ({
					kind: 'host',
					type: 'item',
					props: { id, label: `row:${id}` },
					bindings,
				})),
			});
			const Scene = defineUniversalComponent('object', ({ version }) =>
				universalValue(plan, [version, onSelect, attach, onUpdate, `tail:${version}`]),
			);
			const container = createObjectContainer();
			const root = createUniversalRoot(container, createObjectDriver());
			root.render(Scene, { version: 0 });
			const retained = [...container.children[0].children];
			cases.push({
				mode,
				size,
				Scene,
				container,
				root,
				retained,
				samples: [],
				mountSamples: [],
				version: 0,
				counts: () => ({ updates, attached, detached, dispatched }),
			});
		}
	}
	for (let round = 0; round < warmups + iterations; round++) {
		const order = round % 2 === 0 ? cases : cases.toReversed();
		for (const fixture of order) {
			const { mode, size, Scene, root, container } = fixture;
			const mountContainer = createObjectContainer();
			const mountRoot = createUniversalRoot(mountContainer, createObjectDriver());
			const mountedAt = performance.now();
			mountRoot.render(Scene, { version: 0 });
			const mountElapsed = performance.now() - mountedAt;
			assert.equal(mountContainer.children[0].children.length, size);
			assert.equal(mountContainer.children[0].children.at(-1).props.tail, 'tail:0');
			mountRoot.unmount();
			assert.equal(mountContainer.instanceCount, 0);
			container.commits.length = 0;
			const versions = Array.from({ length: updatesPerSample }, () => ({
				version: ++fixture.version,
			}));
			const startedAt = performance.now();
			for (const props of versions) root.render(Scene, props);
			const elapsed = (performance.now() - startedAt) / updatesPerSample;
			assert.deepEqual(container.children[0].children, fixture.retained);
			for (const [id, host] of fixture.retained.entries())
				assert.deepEqual(host.props, {
					id,
					label: `row:${id}`,
					count: fixture.version,
					tail: `tail:${fixture.version}`,
				});
			assert.ok(
				container.commits.every((batch) =>
					batch.commands.every((command) => command.op === 'update'),
				),
			);
			if (mode !== 'plain') container.dispatchEvent(fixture.retained.at(-1), 'select', null);
			if (round >= warmups) {
				fixture.samples.push(elapsed);
				fixture.mountSamples.push(mountElapsed);
			}
		}
	}
	for (const fixture of cases) {
		fixture.root.unmount();
		assert.equal(fixture.container.instanceCount, 0);
		const counts = fixture.counts();
		assert.equal(counts.dispatched, fixture.mode === 'plain' ? 0 : warmups + iterations);
		if (fixture.mode === 'callbacks') {
			assert.equal(counts.attached, fixture.size * (1 + warmups + iterations));
			assert.equal(counts.detached, counts.attached);
			assert.equal(
				counts.updates,
				fixture.size * (1 + (warmups + iterations) * (1 + updatesPerSample)),
			);
		}
		const outputHash = createHash('sha256')
			.update(
				JSON.stringify({
					version: fixture.version,
					mode: fixture.mode,
					size: fixture.size,
					counts,
				}),
			)
			.digest('hex');
		for (const [operation, samples] of [
			['mount', fixture.mountSamples],
			['update', fixture.samples],
		])
			targets.push({
				name: `${fixture.mode}-${fixture.size}-${operation}`,
				ops: { ms: timingStatForJson(summarizeSamples(samples, { scoreMode: 'median' })) },
				meta: { outputHash, size: fixture.size, nodeVersion: process.version },
			});
	}
	const payload = {
		suite: 'universal-prop-throughput',
		iterations,
		targets,
		bundle,
		nodeVersion: process.version,
		v8: process.versions.v8,
		platform: process.platform,
		architecture: process.arch,
	};
	console.log(JSON.stringify(payload, null, 2));
	if (process.env.BENCH_JSON)
		fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
