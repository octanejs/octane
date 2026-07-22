import { describe, expect, it, vi } from 'vitest';
import {
	createContext,
	createPortal,
	createUniversalRoot,
	defineUniversalComponent,
	type UniversalCommitTransport,
	type UniversalHostBatch,
	type UniversalHostDriver,
	type UniversalHostParent,
	type UniversalPortalTargetHandle,
	universalComponent,
	universalContext,
	universalKey,
	universalPlan,
	universalTry,
	universalValue,
	use,
	useContext,
} from '../src/universal.js';

interface PortalHostInstance {
	readonly id: number;
	type: string;
	props: Readonly<Record<string, unknown>>;
	visible: boolean;
	readonly children: PortalHostInstance[];
}

interface PortalTarget {
	readonly id: string;
	readonly children: PortalHostInstance[];
	reject?: boolean;
}

interface ActivePortalTarget {
	readonly target: PortalTarget;
	count: number;
}

interface PortalContainer {
	readonly children: PortalHostInstance[];
	instances: Map<number, PortalHostInstance>;
	readonly targets: Map<string | number, ActivePortalTarget>;
	readonly commits: UniversalHostBatch[];
	readonly preparedTargets: {
		id: string;
		transported: boolean;
		handle: UniversalPortalTargetHandle;
	}[];
	readonly releasedTargets: string[];
	rejectNextPrepare: boolean;
	rejectTargetAfterHandle: boolean;
}

interface SimulatedHost {
	type: string;
	props: Readonly<Record<string, unknown>>;
	visible: boolean;
	children: number[];
}

interface SimulatedTree {
	readonly root: number[];
	readonly instances: Map<number, SimulatedHost>;
	readonly targets: Map<string | number, number[]>;
}

function createPortalContainer(): PortalContainer {
	return {
		children: [],
		instances: new Map(),
		targets: new Map(),
		commits: [],
		preparedTargets: [],
		releasedTargets: [],
		rejectNextPrepare: false,
		rejectTargetAfterHandle: false,
	};
}

function targetChildren(
	container: PortalContainer,
	tree: SimulatedTree,
	parent: UniversalHostParent,
): number[] {
	if (parent === null) return tree.root;
	if (typeof parent === 'number') {
		const host = tree.instances.get(parent);
		if (host === undefined) throw new Error(`Portal test driver: unknown parent ${parent}.`);
		return host.children;
	}
	if (parent.$$kind !== 'octane.universal.portal-target') {
		throw new Error('Portal test driver: invalid portal target handle.');
	}
	if (!container.targets.has(parent.id)) {
		throw new Error(`Portal test driver: inactive portal target ${String(parent.id)}.`);
	}
	const children = tree.targets.get(parent.id);
	if (children === undefined) {
		throw new Error(`Portal test driver: missing portal target ${String(parent.id)}.`);
	}
	return children;
}

function simulateBatch(container: PortalContainer, batch: UniversalHostBatch): SimulatedTree {
	const tree: SimulatedTree = {
		root: container.children.map((child) => child.id),
		instances: new Map(
			[...container.instances].map(([id, instance]) => [
				id,
				{
					type: instance.type,
					props: instance.props,
					visible: instance.visible,
					children: instance.children.map((child) => child.id),
				},
			]),
		),
		targets: new Map(
			[...container.targets].map(([id, entry]) => [
				id,
				entry.target.children.map((child) => child.id),
			]),
		),
	};
	const detach = (id: number) => {
		for (const children of [
			tree.root,
			...[...tree.instances.values()].map((host) => host.children),
			...tree.targets.values(),
		]) {
			const index = children.indexOf(id);
			if (index !== -1) children.splice(index, 1);
		}
	};
	for (const command of batch.commands) {
		if (command.op === 'create') {
			if (tree.instances.has(command.id)) throw new Error('Portal test driver: duplicate host.');
			tree.instances.set(command.id, {
				type: command.type,
				props: command.props,
				visible: true,
				children: [],
			});
		} else if (command.op === 'update' || command.op === 'recreate') {
			const host = tree.instances.get(command.id);
			if (host === undefined) throw new Error('Portal test driver: unknown host update.');
			if (command.op === 'recreate') host.type = command.type;
			host.props = command.props;
		} else if (command.op === 'visibility') {
			const host = tree.instances.get(command.id);
			if (host === undefined) throw new Error('Portal test driver: unknown visibility host.');
			host.visible = command.state === 'visible';
		} else if (command.op === 'insert' || command.op === 'move') {
			if (!tree.instances.has(command.id)) throw new Error('Portal test driver: unknown child.');
			detach(command.id);
			const children = targetChildren(container, tree, command.parent);
			const before = command.before === null ? children.length : children.indexOf(command.before);
			if (before === -1) throw new Error('Portal test driver: unknown before child.');
			children.splice(before, 0, command.id);
		} else if (command.op === 'remove') {
			const children = targetChildren(container, tree, command.parent);
			const index = children.indexOf(command.id);
			if (index === -1) throw new Error('Portal test driver: detached removal child.');
			children.splice(index, 1);
		} else if (command.op === 'destroy') {
			if (!tree.instances.has(command.id)) throw new Error('Portal test driver: unknown destroy.');
			detach(command.id);
			tree.instances.delete(command.id);
		} else if (!tree.instances.has(command.id)) {
			throw new Error('Portal test driver: unknown callback host.');
		}
	}
	return tree;
}

function publishTree(
	container: PortalContainer,
	batch: UniversalHostBatch,
	tree: SimulatedTree,
): void {
	const previous = container.instances;
	const instances = new Map<number, PortalHostInstance>();
	for (const [id, host] of tree.instances) {
		const instance = previous.get(id) ?? {
			id,
			type: host.type,
			props: host.props,
			visible: host.visible,
			children: [],
		};
		instance.type = host.type;
		instance.props = host.props;
		instance.visible = host.visible;
		instances.set(id, instance);
	}
	for (const [id, host] of tree.instances) {
		const children = host.children.map((child) => instances.get(child)!);
		instances.get(id)!.children.splice(0, Infinity, ...children);
	}
	for (const [id, instance] of previous) {
		if (!instances.has(id)) instance.children.splice(0);
	}
	container.children.splice(0, Infinity, ...tree.root.map((id) => instances.get(id)!));
	for (const [id, children] of tree.targets) {
		const target = container.targets.get(id)?.target;
		if (target !== undefined) {
			target.children.splice(0, Infinity, ...children.map((child) => instances.get(child)!));
		}
	}
	container.instances = instances;
	container.commits.push(batch);
}

function createPortalDriver(): UniversalHostDriver<PortalContainer, PortalHostInstance> {
	return {
		id: 'portal-test',
		capabilities: { visibility: true },
		portals: {
			prepareTarget({ container, target, transported, createPortalTargetHandle }) {
				if (
					target === null ||
					typeof target !== 'object' ||
					typeof (target as PortalTarget).id !== 'string' ||
					!Array.isArray((target as PortalTarget).children)
				) {
					throw new TypeError('Portal test driver: invalid target.');
				}
				const portalTarget = target as PortalTarget;
				if (portalTarget.reject === true)
					throw new Error(`Rejected portal target ${portalTarget.id}.`);
				const handle = createPortalTargetHandle(portalTarget.id);
				container.preparedTargets.push({ id: portalTarget.id, transported, handle });
				if (container.rejectTargetAfterHandle) {
					container.rejectTargetAfterHandle = false;
					throw new Error(`Rejected prepared portal handle ${portalTarget.id}.`);
				}
				const previous = container.targets.get(portalTarget.id);
				if (previous !== undefined && previous.target !== portalTarget) {
					throw new Error(`Portal test driver: duplicate target id ${portalTarget.id}.`);
				}
				const entry = previous ?? { target: portalTarget, count: 0 };
				entry.count++;
				container.targets.set(portalTarget.id, entry);
				return {
					handle,
					release() {
						container.releasedTargets.push(portalTarget.id);
						entry.count--;
						if (entry.count === 0) container.targets.delete(portalTarget.id);
					},
				};
			},
		},
		prepareBatch(container, batch) {
			if (container.rejectNextPrepare) {
				container.rejectNextPrepare = false;
				throw new Error('Rejected host batch.');
			}
			const tree = simulateBatch(container, batch);
			let status: 'prepared' | 'applied' | 'aborted' = 'prepared';
			return {
				apply() {
					if (status !== 'prepared') return;
					status = 'applied';
					publishTree(container, batch, tree);
				},
				abort() {
					if (status === 'prepared') status = 'aborted';
				},
			};
		},
		getPublicInstance(container, id) {
			return container.instances.get(id) ?? null;
		},
	};
}

function portalTarget(id: string): PortalTarget {
	return { id, children: [] };
}

function activeRegistrations(container: PortalContainer, target: PortalTarget): number {
	return container.targets.get(target.id)?.count ?? 0;
}

const leafPlan = universalPlan('portal-test', {
	kind: 'host',
	type: 'leaf',
	bindings: [['value', 0]],
});

describe('universal portals', () => {
	it('isolates portal placement, preserves context and identity, and transports only handles', () => {
		const container = createPortalContainer();
		const driver = createPortalDriver();
		const transportedBatches: UniversalHostBatch[] = [];
		const transport: UniversalCommitTransport<PortalContainer> = {
			prepareBatch(_container, batch, prepare) {
				const cloned = structuredClone(batch);
				transportedBatches.push(cloned);
				return prepare(cloned);
			},
		};
		const root = createUniversalRoot(container, driver, { transport });
		const Theme = createContext('default');
		const Leaf = defineUniversalComponent('portal-test', () =>
			universalValue(leafPlan, [useContext(Theme)]),
		);
		const markerPlan = universalPlan('portal-test', { kind: 'host', type: 'marker' });
		const Scene = defineUniversalComponent(
			'portal-test',
			(props: { theme: string; target: PortalTarget }) =>
				universalContext(Theme, props.theme, [
					universalValue(markerPlan),
					createPortal(universalComponent('portal-test', Leaf), props.target),
				]),
		);
		const targetA = portalTarget('A');
		const targetB = portalTarget('B');

		root.render(Scene, { theme: 'warm', target: targetA });
		expect(container.children.map((child) => child.type)).toEqual(['marker']);
		expect(targetA.children.map((child) => [child.type, child.props.value])).toEqual([
			['leaf', 'warm'],
		]);
		const leaf = targetA.children[0];

		root.render(Scene, { theme: 'cool', target: targetA });
		expect(targetA.children[0]).toBe(leaf);
		expect(leaf.props.value).toBe('cool');
		expect(activeRegistrations(container, targetA)).toBe(1);

		root.render(Scene, { theme: 'cool', target: targetB });
		expect(targetA.children).toEqual([]);
		expect(targetB.children[0]).toBe(leaf);
		expect(activeRegistrations(container, targetA)).toBe(0);
		expect(activeRegistrations(container, targetB)).toBe(1);
		expect(container.preparedTargets.every((entry) => entry.transported)).toBe(true);
		for (const batch of transportedBatches) {
			for (const command of batch.commands) {
				if (command.op !== 'insert' && command.op !== 'move' && command.op !== 'remove') continue;
				if (command.parent === null || typeof command.parent === 'number') continue;
				expect(command.parent).toMatchObject({
					$$kind: 'octane.universal.portal-target',
					renderer: 'portal-test',
				});
				expect(command.parent).not.toHaveProperty('children');
			}
		}

		root.unmount();
		expect(targetB.children).toEqual([]);
		expect(activeRegistrations(container, targetB)).toBe(0);
		expect(container.instances.size).toBe(0);
	});

	it('reorders keyed portal siblings that share a target without remounting their hosts', () => {
		const container = createPortalContainer();
		const root = createUniversalRoot(container, createPortalDriver());
		const target = portalTarget('shared');
		const Scene = defineUniversalComponent('portal-test', (props: { order: readonly string[] }) =>
			props.order.map((label) =>
				universalKey(label, createPortal(universalValue(leafPlan, [label]), target)),
			),
		);

		root.render(Scene, { order: ['first', 'second'] });
		const first = target.children[0];
		const second = target.children[1];
		expect(target.children.map((child) => child.props.value)).toEqual(['first', 'second']);

		root.render(Scene, { order: ['second', 'first'] });
		expect(target.children.map((child) => child.props.value)).toEqual(['second', 'first']);
		expect(target.children).toEqual([second, first]);

		root.render(Scene, { order: ['third', 'second', 'first'] });
		const third = target.children[0];
		expect(target.children.map((child) => child.props.value)).toEqual(['third', 'second', 'first']);
		expect(target.children.slice(1)).toEqual([second, first]);

		root.render(Scene, { order: ['first', 'third'] });
		expect(target.children.map((child) => child.props.value)).toEqual(['first', 'third']);
		expect(target.children).toEqual([first, third]);

		root.unmount();
		expect(target.children).toEqual([]);
	});

	it('releases staged targets on abort, supersession, target failure, and host rejection', () => {
		const container = createPortalContainer();
		const root = createUniversalRoot(container, createPortalDriver());
		const Scene = defineUniversalComponent('portal-test', (props: { target: PortalTarget }) =>
			createPortal(universalValue(leafPlan, [props.target.id]), props.target),
		);
		const targetA = portalTarget('A');
		const targetB = portalTarget('B');
		const rejected = { ...portalTarget('rejected'), reject: true };

		const aborted = root.prepare(Scene, { target: targetA });
		expect(activeRegistrations(container, targetA)).toBe(1);
		const abortedHandle = container.preparedTargets.at(-1)!.handle;
		aborted.abort();
		expect(activeRegistrations(container, targetA)).toBe(0);
		expect(container.instances.size).toBe(0);

		const superseded = root.prepare(Scene, { target: targetA });
		expect(container.preparedTargets.at(-1)!.handle).not.toBe(abortedHandle);
		const winner = root.prepare(Scene, { target: targetB });
		expect(superseded.status).toBe('aborted');
		expect(activeRegistrations(container, targetA)).toBe(0);
		expect(activeRegistrations(container, targetB)).toBe(1);
		if (winner.status === 'prepared') winner.commit();
		expect(targetB.children).toHaveLength(1);

		const FailsAfterFirstTarget = defineUniversalComponent('portal-test', () => [
			createPortal(universalValue(leafPlan, ['A']), targetA),
			createPortal(universalValue(leafPlan, ['rejected']), rejected),
		]);
		expect(() => root.render(FailsAfterFirstTarget, undefined)).toThrow(
			'Rejected portal target rejected.',
		);
		expect(activeRegistrations(container, targetA)).toBe(0);
		expect(activeRegistrations(container, targetB)).toBe(1);
		expect(targetB.children).toHaveLength(1);

		container.rejectNextPrepare = true;
		expect(() => root.render(Scene, { target: targetA })).toThrow('Rejected host batch.');
		expect(activeRegistrations(container, targetA)).toBe(0);
		expect(activeRegistrations(container, targetB)).toBe(1);
		expect(targetB.children).toHaveLength(1);

		root.unmount();
		expect(activeRegistrations(container, targetB)).toBe(0);
	});

	it('retains target handles only while a committed or staged registration can reuse them', () => {
		const container = createPortalContainer();
		const root = createUniversalRoot(container, createPortalDriver());
		const Scene = defineUniversalComponent(
			'portal-test',
			(props: { target: PortalTarget | null }) =>
				props.target === null
					? null
					: createPortal(universalValue(leafPlan, [props.target.id]), props.target),
		);
		const target = portalTarget('reused');

		root.render(Scene, { target });
		const firstHandle = container.preparedTargets.at(-1)!.handle;

		root.render(Scene, { target });
		expect(container.preparedTargets.at(-1)!.handle).toBe(firstHandle);
		expect(activeRegistrations(container, target)).toBe(1);

		root.render(Scene, { target: null });
		expect(activeRegistrations(container, target)).toBe(0);

		root.render(Scene, { target });
		expect(container.preparedTargets.at(-1)!.handle).not.toBe(firstHandle);
		expect(activeRegistrations(container, target)).toBe(1);

		root.unmount();
		expect(activeRegistrations(container, target)).toBe(0);
	});

	it('drops an unregistered handle when target preparation fails after minting it', () => {
		const container = createPortalContainer();
		const root = createUniversalRoot(container, createPortalDriver());
		const Scene = defineUniversalComponent('portal-test', (props: { target: PortalTarget }) =>
			createPortal(universalValue(leafPlan, [props.target.id]), props.target),
		);
		const target = portalTarget('failed-handle');

		container.rejectTargetAfterHandle = true;
		expect(() => root.render(Scene, { target })).toThrow(
			'Rejected prepared portal handle failed-handle.',
		);
		const failedHandle = container.preparedTargets.at(-1)!.handle;
		expect(activeRegistrations(container, target)).toBe(0);

		root.render(Scene, { target });
		expect(container.preparedTargets.at(-1)!.handle).not.toBe(failedHandle);

		root.unmount();
		expect(activeRegistrations(container, target)).toBe(0);
	});

	it('rejects a portal handle that was not minted by the current renderer root', () => {
		const container = createPortalContainer();
		const release = vi.fn();
		const base = createPortalDriver();
		const driver: UniversalHostDriver<PortalContainer, PortalHostInstance> = {
			...base,
			portals: {
				prepareTarget() {
					return {
						handle: {
							$$kind: 'octane.universal.portal-target',
							renderer: 'portal-test',
							root: 999,
							id: 'foreign',
						} satisfies UniversalPortalTargetHandle,
						release,
					};
				},
			},
		};
		const root = createUniversalRoot(container, driver);
		const Scene = defineUniversalComponent('portal-test', () =>
			createPortal(universalValue(leafPlan, ['value']), portalTarget('A')),
		);

		expect(() => root.render(Scene, undefined)).toThrow(/does not belong to renderer/);
		expect(release).toHaveBeenCalledOnce();
		expect(container.commits).toEqual([]);
	});

	it('retains a committed portal target and host identity while Suspense is pending', async () => {
		const container = createPortalContainer();
		const root = createUniversalRoot(container, createPortalDriver());
		const target = portalTarget('suspense');
		let resolve!: (value: string) => void;
		const pending = new Promise<string>((done) => {
			resolve = done;
		});
		const Leaf = defineUniversalComponent('portal-test', (props: { suspend: boolean }) =>
			universalValue(leafPlan, [props.suspend ? use(pending) : 'ready']),
		);
		const fallbackPlan = universalPlan('portal-test', { kind: 'host', type: 'fallback' });
		const Scene = defineUniversalComponent('portal-test', (props: { suspend: boolean }) =>
			universalTry(
				() =>
					createPortal(universalComponent('portal-test', Leaf, { suspend: props.suspend }), target),
				() => universalValue(fallbackPlan),
			),
		);

		root.render(Scene, { suspend: false });
		const leaf = target.children[0];
		expect(leaf.visible).toBe(true);
		expect(activeRegistrations(container, target)).toBe(1);

		root.render(Scene, { suspend: true });
		expect(target.children[0]).toBe(leaf);
		expect(leaf.visible).toBe(false);
		expect(container.children.map((child) => child.type)).toEqual(['fallback']);
		expect(activeRegistrations(container, target)).toBe(1);

		resolve('resolved');
		await pending;
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
		expect(target.children[0]).toBe(leaf);
		expect(leaf.visible).toBe(true);
		expect(leaf.props.value).toBe('resolved');
		expect(container.children).toEqual([]);
		expect(activeRegistrations(container, target)).toBe(1);

		root.unmount();
		expect(target.children).toEqual([]);
		expect(activeRegistrations(container, target)).toBe(0);
	});
});
