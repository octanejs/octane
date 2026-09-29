import { describe, expect, it } from 'vitest';
import { createRoot, flushSync, type ComponentBody, type Root } from '../src/index.js';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	rendererRegion,
	startTransition,
	universalPlan,
	universalTry,
	universalValue,
	use,
	useLayoutEffect,
	useState,
	type ObjectHostInstance,
	type RendererRegion,
} from '../src/universal.js';
import { act, mount } from './_helpers';
import { UniversalPendingBoundaryFixture } from './_fixtures/universal-boundary.tsrx';
import { SettledRegionChild } from './_fixtures/universal-settled-region.tsrx';
import {
	SettledBoundary,
	SettledHiddenActivity,
	SettledRoot,
	SettledTransition,
} from './_fixtures/universal-settled-wakeable.object.tsrx';

// A universal retry that re-suspends on an already-settled wakeable must yield
// to the event loop, as React's Scheduler ping and the DOM runtime do. Retrying
// on the settled wakeable's own microtask would starve every timer and network
// callback, including the one that ends the suspension. That loop also starves
// Vitest's timeout, so each gate opens itself after STARVED_AFTER checks and
// records it.
const STARVED_AFTER = 2_000;

interface Gate {
	readonly wakeable: PromiseLike<unknown>;
	readonly label: string;
	open: boolean;
	checks: number;
	starved: boolean;
	check(): boolean;
}

function settledGate(wakeable: PromiseLike<unknown>, label = 'ready'): Gate {
	const gate: Gate = {
		wakeable,
		label,
		open: false,
		checks: 0,
		starved: false,
		check() {
			gate.checks++;
			if (!gate.open && gate.checks === STARVED_AFTER) {
				gate.starved = true;
				gate.open = true;
			}
			return gate.open;
		},
	};
	return gate;
}

function openGate(label: string): Gate {
	const gate = settledGate(Promise.resolve(), label);
	gate.open = true;
	return gate;
}

/**
 * A settled promise whose owner has not published its settlement yet, like a
 * cache that marks entries fulfilled from a later task. use() does not rewrite
 * a status it did not set, so every attempt suspends on it again.
 */
function laggingResolved(): Promise<void> & { status: 'pending' } {
	return Object.assign(Promise.resolve(), { status: 'pending' as const });
}

function laggingRejected(): Promise<never> & { status: 'pending' } {
	const rejected = Promise.reject(new Error('stale'));
	rejected.catch(() => {});
	return Object.assign(rejected, { status: 'pending' as const });
}

function nextTask(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

async function drainMicrotasks(): Promise<void> {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** Opens the gate from a timer, the state change a microtask loop never lets run. */
async function openFromTimer(gate: Gate): Promise<void> {
	await new Promise<void>((resolve) =>
		setTimeout(() => {
			gate.open = true;
			resolve();
		}, 0),
	);
	await nextTask();
	await drainMicrotasks();
}

/**
 * A reverse-region host that renders the committed region into a DOM root, as
 * a renderer's DOM overlay does. The owner bridge may unmount that root when
 * the region's owner changes, so each commit renders into a live root.
 */
function regionHost() {
	const element = document.createElement('div');
	document.body.appendChild(element);
	let root: Root | null = null;
	return {
		element,
		commit(region: RendererRegion<any>) {
			if (root === null) {
				const next = createRoot(element);
				const unmount = next.unmount.bind(next);
				next.unmount = () => {
					if (root === next) root = null;
					unmount();
				};
				root = next;
			}
			const live = root;
			flushSync(() => live.render(region.component as ComponentBody<any>, region.props));
		},
		dispose() {
			root?.unmount();
			element.remove();
		},
	};
}

function objectRoot() {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver());
	return { container, root };
}

function hosts(parent: { children: readonly ObjectHostInstance[] }): ObjectHostInstance[] {
	const output: ObjectHostInstance[] = [];
	for (const child of parent.children) output.push(child, ...hosts(child));
	return output;
}

/** Visible host labels, in tree order. */
function shown(parent: { children: readonly ObjectHostInstance[] }): string[] {
	return hosts(parent)
		.filter((host) => host.visible && host.type !== 'scene')
		.map((host) =>
			host.props.label === undefined ? host.type : `${host.type}:${host.props.label as string}`,
		);
}

describe('universal Suspense retries on an already-settled wakeable', () => {
	it.each([
		['resolved', laggingResolved],
		['rejected', laggingRejected],
	] as const)('lets a timer end a boundary suspension on a %s promise', async (_name, create) => {
		const { container, root } = objectRoot();
		const gate = settledGate(create());
		root.render(SettledBoundary, { gate });
		expect(shown(container)).toEqual(['fallback']);
		await openFromTimer(gate);
		expect(gate.starved).toBe(false);
		expect(shown(container)).toEqual(['resolved:ready']);
		root.unmount();
	});

	it('paces use() of a thenable whose status React does not recognize', async () => {
		// router-core's controlled promises report `status: 'resolved'`. use()
		// treats an unrecognized status as pending and leaves it uninstrumented,
		// as React's trackUsedThenable and the DOM runtime do, so this read stays
		// suspended until the gate opens.
		const thenable = Object.assign(Promise.resolve('value'), { status: 'resolved' });
		const { container, root } = objectRoot();
		const gate = settledGate(thenable);
		root.render(SettledBoundary, { gate });
		expect(shown(container)).toEqual(['fallback']);
		await drainMicrotasks();
		expect(shown(container)).toEqual(['fallback']);
		await openFromTimer(gate);
		expect(gate.starved).toBe(false);
		expect(shown(container)).toEqual(['resolved:ready']);
		expect(thenable.status).toBe('resolved');
		root.unmount();
	});

	it('lets a timer end an initial root suspension without a boundary', async () => {
		const { container, root } = objectRoot();
		const gate = settledGate(laggingResolved());
		root.render(SettledRoot, { gate });
		expect(shown(container)).toEqual([]);
		await openFromTimer(gate);
		expect(gate.starved).toBe(false);
		expect(shown(container)).toEqual(['resolved:ready']);
		root.unmount();
	});

	it('keeps a transition held until a timer ends it', async () => {
		const { container, root } = objectRoot();
		let setGate!: (gate: Gate) => void;
		root.render(SettledTransition, {
			gate: openGate('initial'),
			expose(update: (gate: Gate) => void) {
				setGate = update;
			},
		});
		expect(shown(container)).toEqual(['resolved:initial']);
		const gate = settledGate(laggingResolved(), 'next');
		startTransition(() => setGate(gate));
		await drainMicrotasks();
		expect(shown(container)).toEqual(['resolved:initial']);
		await openFromTimer(gate);
		expect(gate.starved).toBe(false);
		expect(shown(container)).toEqual(['resolved:next']);
		root.unmount();
	});

	it('lets a timer end a suspension inside hidden Activity', async () => {
		const { container, root } = objectRoot();
		const gate = settledGate(laggingResolved());
		root.render(SettledHiddenActivity, { gate, mode: 'hidden' });
		await openFromTimer(gate);
		expect(gate.starved).toBe(false);
		root.render(SettledHiddenActivity, { gate, mode: 'visible' });
		await drainMicrotasks();
		expect(shown(container)).toEqual(['resolved:ready']);
		root.unmount();
	});

	it('lets a timer end a DOM child suspension routed to its universal owner', async () => {
		// The region host renders the DOM child on every owner commit, so each
		// reveal re-runs the child, which routes its suspension back to the owner.
		const regionPlan = universalPlan('object', {
			kind: 'host',
			type: 'region',
			bindings: [['region', 0]],
		});
		const pendingPlan = universalPlan('object', { kind: 'host', type: 'fallback' });
		const host = regionHost();
		const Scene = defineUniversalComponent('object', (props: { gate: Gate }) =>
			universalTry(
				() => {
					const region = rendererRegion('object', 'dom', SettledRegionChild, { gate: props.gate });
					useLayoutEffect(() => host.commit(region), null, 'region-host-commit');
					return universalValue(regionPlan, [region]);
				},
				() => universalValue(pendingPlan, []),
			),
		);
		const { container, root } = objectRoot();
		const gate = settledGate(laggingResolved());
		root.render(Scene, { gate });
		await openFromTimer(gate);
		expect(gate.starved).toBe(false);
		expect(shown(container)).toEqual(['region']);
		expect(host.element.querySelector('.resolved')?.textContent).toBe('ready');
		root.unmount();
		host.dispose();
	});

	describe('through a DOM boundary hosting the universal root', () => {
		// The DOM boundary projects a root suspension through its @pending arm, so
		// the DOM runtime's retry and the universal root's retry both subscribe.
		const hostedPlan = universalPlan('object', {
			kind: 'host',
			type: 'resolved',
			bindings: [
				['label', 0],
				['count', 1],
			],
		});
		let beginTransition!: () => void;
		const HostedScene = defineUniversalComponent('object', (props: { gate: Gate }) => {
			const [count, setCount] = useState(0, 'hosted-count');
			beginTransition = () => startTransition(() => setCount(1));
			if (!props.gate.check()) use(props.gate.wakeable);
			return universalValue(hostedPlan, [props.gate.label, count]);
		});

		function mountHosted(gate: Gate) {
			const universal = objectRoot();
			const dom = mount(UniversalPendingBoundaryFixture, {
				root: universal.root,
				component: HostedScene,
				childProps: { gate },
			});
			return { ...universal, dom };
		}

		function hostedState(container: ReturnType<typeof createObjectContainer>) {
			const host = container.children[0];
			return host === undefined ? null : { label: host.props.label, count: host.props.count };
		}

		it('lets a timer end a projected root suspension', async () => {
			const gate = settledGate(laggingResolved());
			const { container, dom } = mountHosted(gate);
			expect(dom.find('.projected-pending').textContent).toBe('pending');
			await act(() => openFromTimer(gate));
			expect(gate.starved).toBe(false);
			expect(dom.findAll('.projected-pending')).toHaveLength(0);
			expect(hostedState(container)).toEqual({ label: 'ready', count: 0 });
			dom.unmount();
		});

		it('lets a timer end a projected suspension that holds a transition', async () => {
			const { container, root, dom } = mountHosted(openGate('initial'));
			expect(hostedState(container)).toEqual({ label: 'initial', count: 0 });
			const gate = settledGate(laggingResolved(), 'next');
			dom.update(UniversalPendingBoundaryFixture, {
				root,
				component: HostedScene,
				childProps: { gate },
			});
			beginTransition();
			await act(() => openFromTimer(gate));
			expect(gate.starved).toBe(false);
			expect(dom.findAll('.projected-pending')).toHaveLength(0);
			expect(hostedState(container)).toEqual({ label: 'next', count: 1 });
			dom.unmount();
		});
	});

	it('waits for a reusable custom wakeable to notify again instead of polling', async () => {
		const listeners: Array<() => void> = [];
		const wakeable = {
			status: 'pending' as const,
			then(notify: () => void) {
				listeners.push(notify);
			},
		} as unknown as PromiseLike<unknown>;
		const { container, root } = objectRoot();
		const gate = settledGate(wakeable);
		root.render(SettledBoundary, { gate });
		expect(listeners).toHaveLength(1);
		listeners.shift()!();
		await drainMicrotasks();
		// The retry re-subscribed and suspended again. Nothing polls it meanwhile.
		const checks = gate.checks;
		expect(checks).toBeGreaterThan(1);
		expect(listeners).toHaveLength(1);
		for (let i = 0; i < 5; i++) await nextTask();
		expect(gate.checks).toBe(checks);
		expect(shown(container)).toEqual(['fallback']);
		gate.open = true;
		listeners.shift()!();
		await nextTask();
		await drainMicrotasks();
		expect(shown(container)).toEqual(['resolved:ready']);
		root.unmount();
	});
});

describe('universal Suspense retries on a wakeable that settles for the first time', () => {
	it('still retries on microtasks when an already-resolved promise is first read', async () => {
		const cached = Promise.resolve();
		const gate = settledGate(cached);
		void cached.then(() => {
			gate.open = true;
		});
		const { container, root } = objectRoot();
		root.render(SettledBoundary, { gate });
		expect(shown(container)).toEqual(['fallback']);
		await drainMicrotasks();
		expect(shown(container)).toEqual(['resolved:ready']);
		root.unmount();
	});

	it('retries every root suspended on one pending promise on microtasks', async () => {
		let resolve!: () => void;
		const shared = new Promise<void>((done) => {
			resolve = done;
		});
		const gate = settledGate(shared);
		void shared.then(() => {
			gate.open = true;
		});
		const first = objectRoot();
		const second = objectRoot();
		first.root.render(SettledRoot, { gate });
		second.root.render(SettledBoundary, { gate });
		expect(shown(first.container)).toEqual([]);
		expect(shown(second.container)).toEqual(['fallback']);
		resolve();
		await drainMicrotasks();
		expect(shown(first.container)).toEqual(['resolved:ready']);
		expect(shown(second.container)).toEqual(['resolved:ready']);
		first.root.unmount();
		second.root.unmount();
	});
});
