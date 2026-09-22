import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Count range searches separately from recovery and host publication work.
export async function suspenseWorkload(runtime, size, mode) {
	const {
		createUniversalRoot,
		createObjectContainer,
		createObjectDriver,
		defineUniversalComponent,
		universalFor,
		universalPlan,
		universalTry,
		universalValue,
		use,
		flushUniversalSync,
	} = runtime;
	const primary = universalPlan('object', {
		kind: 'host',
		type: 'primary',
		bindings: [['value', 0]],
	});
	const fallback = universalPlan('object', {
		kind: 'host',
		type: 'fallback',
		bindings: [['value', 0]],
	});
	const ids = Array.from({ length: size }, (_, id) => id);
	const Scene = defineUniversalComponent('object', ({ resources }) =>
		universalFor(
			ids,
			(id) => id,
			(id) =>
				universalTry(
					() =>
						universalValue(primary, [resources[id] === null ? `ready:${id}` : use(resources[id])]),
					() => universalValue(fallback, [`pending:${id}`]),
				),
		),
	);
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	const pending = (id) => mode === 'all' || (mode === 'last' && id === size - 1);
	const resolve = [];
	const resources = ids.map((id) =>
		pending(id)
			? new Promise((accept) => {
					resolve[id] = accept;
				})
			: null,
	);
	root.render(Scene, { resources: ids.map(() => null) });
	const hosts = [...container.children];
	assert.equal(hosts.length, size);
	globalThis.__universalRangeVisits = 0;
	globalThis.__universalRetainedArms = 0;
	root.render(Scene, { resources });
	const visits = globalThis.__universalRangeVisits;
	const retainedArms = globalThis.__universalRetainedArms;
	const pendingCount = ids.filter(pending).length;
	const retained = container.children.filter((host) => host.type === 'primary');
	assert.equal(retained.length, size);
	assert.equal(container.children.length, size + pendingCount);
	for (const id of ids) {
		assert.equal(retained[id], hosts[id]);
		assert.equal(hosts[id].visible, !pending(id));
		assert.equal(hosts[id].props.value, `ready:${id}`);
	}
	assert.deepEqual(
		container.children
			.filter((host) => host.type === 'fallback')
			.map((host) => [host.visible, host.props.value]),
		ids.filter(pending).map((id) => [true, `pending:${id}`]),
	);
	for (const id of ids) if (pending(id)) resolve[id](`resolved:${id}`);
	await Promise.all(resources);
	for (let turn = 0; turn < 8; turn++) await Promise.resolve();
	flushUniversalSync(() => {});
	assert.equal(container.children.length, size);
	for (const id of ids) {
		assert.equal(container.children[id], hosts[id]);
		assert.equal(hosts[id].visible, true);
		assert.equal(hosts[id].props.value, `${pending(id) ? 'resolved' : 'ready'}:${id}`);
	}
	const outputHash = createHash('sha256')
		.update(JSON.stringify(hosts.map((host) => host.props)))
		.digest('hex');
	root.unmount();
	assert.equal(container.children.length, 0);
	assert.equal(container.instanceCount, 0);
	return { visits, retainedArms, pendingCount, outputHash };
}
