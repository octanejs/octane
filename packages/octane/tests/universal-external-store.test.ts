import { describe, expect, it } from 'vitest';
import {
	createObjectContainer,
	createObjectDriver,
	createUniversalRoot,
	defineUniversalComponent,
	flushUniversalSync,
	memo,
	startTransition,
	universalActivity,
	universalComponent,
	universalPlan,
	universalTry,
	universalValue,
	use,
	useSyncExternalStore,
	type UniversalAsyncCommitTransport,
	type UniversalRootOptions,
} from '../src/universal-native.js';

interface ExternalStore<T> {
	getSnapshot(): T;
	subscribe(notify: () => void): () => void;
}

function createStore<T>(initial: T, name = 'store', lifecycle: string[] = []) {
	let value = initial;
	let failure: Error | undefined;
	const listeners = new Set<() => void>();
	const retained: Array<() => void> = [];
	const notify = () => {
		for (const listener of [...listeners]) listener();
	};
	return {
		getSnapshot() {
			if (failure !== undefined) throw failure;
			return value;
		},
		subscribe(listener: () => void) {
			lifecycle.push(`subscribe:${name}`);
			listeners.add(listener);
			retained.push(listener);
			return () => {
				lifecycle.push(`unsubscribe:${name}`);
				listeners.delete(listener);
			};
		},
		set(next: T) {
			value = next;
			notify();
		},
		setSilently(next: T) {
			value = next;
		},
		fail(error: Error) {
			failure = error;
			notify();
		},
		notify,
		listeners,
		retained,
	};
}

const valuePlan = universalPlan('object', {
	kind: 'host',
	type: 'store-value',
	bindings: [
		['value', 0],
		['generation', 1],
	],
});

type StoreState = { a: number; b: number };
interface ReaderProps {
	store: ExternalStore<StoreState>;
	field: keyof StoreState;
	generation?: number;
	enabled?: boolean;
	onRead?: (field: keyof StoreState) => void;
	suspend?: Promise<void>;
}

const Reader = defineUniversalComponent('object', (props: ReaderProps) => {
	const value =
		props.enabled === false
			? 'disabled'
			: useSyncExternalStore(
					props.store.subscribe,
					() => {
						props.onRead?.(props.field);
						return props.store.getSnapshot()[props.field];
					},
					undefined,
					'outer-store',
				);
	if (props.suspend !== undefined) use(props.suspend);
	return universalValue(valuePlan, [value, props.generation ?? 0]);
});

const StableReader = defineUniversalComponent(
	'object',
	(props: { store: ExternalStore<number>; wait?: Promise<void>; duringRender?: () => void }) => {
		const value = useSyncExternalStore(
			props.store.subscribe,
			props.store.getSnapshot,
			undefined,
			'store',
		);
		props.duringRender?.();
		if (value === 1 && props.wait !== undefined) use(props.wait);
		return universalValue(valuePlan, [value, 0]);
	},
);
const MemoStableReader = memo(StableReader);

async function flushMicrotasks(count = 8): Promise<void> {
	for (let index = 0; index < count; index++) await Promise.resolve();
}

function objectRoot(options: UniversalRootOptions<ReturnType<typeof createObjectContainer>> = {}) {
	const container = createObjectContainer();
	const root = createUniversalRoot(container, createObjectDriver(), options);
	return { container, root };
}

describe('universal useSyncExternalStore', () => {
	it('keeps the same store connected when only the getter or snapshot changes', () => {
		const lifecycle: string[] = [];
		const store = createStore({ a: 1, b: 2 }, 'first', lifecycle);
		const next = createStore({ a: 10, b: 20 }, 'second', lifecycle);
		const { container, root } = objectRoot();

		root.render(Reader, { store, field: 'a' });
		const host = container.children[0];
		root.render(Reader, { store, field: 'a', generation: 1 });
		root.render(Reader, { store, field: 'b', generation: 2 });
		flushUniversalSync(() => store.set({ a: 3, b: 4 }));
		expect(container.children[0]).toBe(host);
		expect(host.props).toMatchObject({ value: 4, generation: 2 });
		// Subscription lifetime is part of the external-store API: a stable
		// subscribe function must not disconnect a live store on ordinary renders.
		expect(lifecycle).toEqual(['subscribe:first']);

		root.render(Reader, { store: next, field: 'b' });
		expect(host.props.value).toBe(20);
		expect(lifecycle).toEqual(['subscribe:first', 'unsubscribe:first', 'subscribe:second']);
		flushUniversalSync(() => store.set({ a: 30, b: 40 }));
		expect(host.props.value).toBe(20);
		flushUniversalSync(() => next.set({ a: 50, b: 60 }));
		expect(host.props.value).toBe(60);
		root.unmount();
		expect(lifecycle).toEqual([
			'subscribe:first',
			'unsubscribe:first',
			'subscribe:second',
			'unsubscribe:second',
		]);
	});

	it('updates memoized readers after a burst returns to the committed snapshot', () => {
		const store = createStore(0);
		const { container, root } = objectRoot();
		root.render(MemoStableReader, { store });
		const host = container.children[0];
		flushUniversalSync(() => {
			store.set(1);
			for (let index = 0; index < 100; index++) store.notify();
			store.set(0);
		});
		expect(container.children[0]).toBe(host);
		expect(host.props.value).toBe(0);
		flushUniversalSync(() => {
			store.set(2);
			for (let index = 0; index < 100; index++) store.notify();
		});
		expect(host.props.value).toBe(2);
		root.unmount();
	});

	it('retries a held store transition when a later transition changes its snapshot', async () => {
		const store = createStore(0);
		const wait = new Promise<void>(() => {});
		const Scene = defineUniversalComponent('object', () =>
			universalTry(
				() => universalComponent('object', MemoStableReader, { store, wait }),
				() => universalValue(valuePlan, ['pending', 0]),
			),
		);
		const { container, root } = objectRoot();
		root.render(Scene, undefined);
		const host = container.children[0];
		startTransition(() => store.set(1));
		await flushMicrotasks();
		expect(container.children[0]).toBe(host);
		expect(host.props.value).toBe(0);
		startTransition(() => store.set(2));
		await flushMicrotasks();
		expect(container.children[0]).toBe(host);
		expect(host.props.value).toBe(2);
		root.unmount();
	});

	it('does not let a held transition swallow an urgent notification of the same snapshot', async () => {
		const store = createStore(0);
		let resolveWait!: () => void;
		const wait = new Promise<void>((resolve) => {
			resolveWait = resolve;
		});
		const Scene = defineUniversalComponent('object', () =>
			universalTry(
				() => universalComponent('object', MemoStableReader, { store, wait }),
				() => universalValue(valuePlan, ['pending', 0]),
			),
		);
		const { container, root } = objectRoot();
		root.render(Scene, undefined);
		startTransition(() => store.set(1));
		await flushMicrotasks();
		expect(container.children[0].props.value).toBe(0);
		flushUniversalSync(() => store.notify());
		expect(container.children.some((host) => host.props.value === 'pending')).toBe(true);
		flushUniversalSync(() => store.set(2));
		resolveWait();
		await flushMicrotasks();
		expect(container.children.some((host) => host.visible && host.props.value === 2)).toBe(true);
		root.unmount();
	});

	it('does not promote a queued store transition from an unchanged commit-time read', () => {
		const store = createStore({ a: 0, b: 10 });
		const scheduled: Array<() => void> = [];
		const { container, root } = objectRoot({
			scheduleMicrotask: (callback) => scheduled.push(callback),
		});
		root.render(Reader, { store, field: 'a' });
		const host = container.children[0];

		// Leave the store's transition token queued while a separate urgent prop
		// render commits a fresh inline getter. Its consistency check is not a new
		// store notification and must not keep rebasing the held token urgently.
		startTransition(() => store.set({ a: 1, b: 11 }));
		expect(host.props.value).toBe(0);
		expect(scheduled.length).toBeGreaterThan(0);
		expect(root.render(Reader, { store, field: 'a', generation: 1 }).status).toBe('committed');
		flushUniversalSync(() => {});
		expect(container.children[0]).toBe(host);
		expect(host.props).toMatchObject({ value: 1, generation: 1 });

		for (let count = 0; scheduled.length !== 0; count++) {
			if (count === 50) throw new Error('Universal store transition did not settle.');
			scheduled.shift()!();
		}
		expect(container.children[0]).toBe(host);
		expect(host.props).toMatchObject({ value: 1, generation: 1 });
		expect(store.listeners.size).toBe(1);
		root.unmount();
		expect(store.listeners.size).toBe(0);
	});

	it('can retry the same notification after a render-time update is abandoned', () => {
		const store = createStore(0);
		const { container, root } = objectRoot();
		root.render(StableReader, { store });
		const host = container.children[0];
		expect(() =>
			root.prepare(StableReader, {
				store,
				duringRender() {
					store.set(1);
					throw new Error('abandoned render');
				},
			}),
		).toThrow('abandoned render');
		flushUniversalSync(() => store.notify());
		expect(container.children[0]).toBe(host);
		expect(host.props.value).toBe(1);
		root.unmount();
	});

	it('keeps the committed selector after a prepared render is abandoned', () => {
		const store = createStore({ a: 1, b: 10 });
		const reads: Array<keyof StoreState> = [];
		const onRead = (field: keyof StoreState) => reads.push(field);
		const { container, root } = objectRoot();
		root.render(Reader, { store, field: 'a', onRead });
		const host = container.children[0];

		const abandoned = root.prepare(Reader, { store, field: 'b', onRead });
		expect(abandoned.status).toBe('prepared');
		reads.length = 0;
		store.notify();
		expect(reads).toContain('a');
		expect(reads).not.toContain('b');
		abandoned.abort();
		flushUniversalSync(() => store.set({ a: 2, b: 99 }));
		expect(container.children[0]).toBe(host);
		expect(host.props.value).toBe(2);
		root.unmount();
	});

	it('keeps the committed selector while a transported render awaits acknowledgement and is rejected', async () => {
		const store = createStore({ a: 1, b: 10 });
		const reads: Array<keyof StoreState> = [];
		const onRead = (field: keyof StoreState) => reads.push(field);
		const container = createObjectContainer();
		const baseDriver = createObjectDriver();
		const driver = {
			...baseDriver,
			capabilities: { ...baseDriver.capabilities, localHostCallbacks: false },
			localCallbacks: undefined,
		};
		let hold = false;
		let rejectPending!: (error: Error) => void;
		let entered!: () => void;
		const awaitingAcknowledgement = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const transport: UniversalAsyncCommitTransport<typeof container> = {
			mode: 'async',
			prepareBatch(target, batch, identity) {
				const prepared = driver.prepareBatch(target, batch, {
					invokeLocalCallback: () => undefined,
				});
				return {
					async apply(acknowledge) {
						if (hold) {
							await new Promise<void>((_resolve, reject) => {
								rejectPending = reject;
								entered();
							});
						}
						prepared.apply();
						acknowledge({ ...identity, type: 'ack' });
					},
					abort: () => prepared.abort(),
				};
			},
		};
		const root = createUniversalRoot(container, driver, { transport });
		await root.renderAsync(Reader, { store, field: 'a', onRead });
		const host = container.children[0];

		hold = true;
		const rejected = root.renderAsync(Reader, { store, field: 'b', onRead });
		await awaitingAcknowledgement;
		reads.length = 0;
		store.notify();
		expect(reads).toContain('a');
		expect(reads).not.toContain('b');
		rejectPending(new Error('host rejected draft'));
		await expect(rejected).rejects.toThrow('host rejected draft');
		hold = false;
		store.set({ a: 2, b: 99 });
		await root.flushTransport();
		expect(container.children[0]).toBe(host);
		expect(host.props.value).toBe(2);
		await root.unmountAsync();
		expect(store.listeners.size).toBe(0);
	});

	it('keeps the committed selector after a suspended render is aborted', () => {
		const store = createStore({ a: 1, b: 10 });
		const reads: Array<keyof StoreState> = [];
		const onRead = (field: keyof StoreState) => reads.push(field);
		const { container, root } = objectRoot();
		root.render(Reader, { store, field: 'a', onRead });
		const host = container.children[0];
		const suspended = root.render(Reader, {
			store,
			field: 'b',
			onRead,
			suspend: new Promise<void>(() => {}),
		});
		expect(suspended.status).toBe('suspended');
		reads.length = 0;
		store.notify();
		expect(reads).toContain('a');
		expect(reads).not.toContain('b');
		suspended.abort();
		flushUniversalSync(() => store.set({ a: 2, b: 99 }));
		expect(container.children[0]).toBe(host);
		expect(host.props.value).toBe(2);
		root.unmount();
	});

	it('catches a new store change between preparation and subscription', () => {
		const previous = createStore({ a: 1, b: 2 });
		const next = createStore({ a: 10, b: 20 });
		const { container, root } = objectRoot();
		root.render(Reader, { store: previous, field: 'a' });
		const prepared = root.prepare(Reader, { store: next, field: 'b' });
		expect(prepared.status).toBe('prepared');
		next.setSilently({ a: 30, b: 40 });
		flushUniversalSync(() => {
			if (prepared.status === 'prepared') prepared.commit();
		});
		expect(container.children[0].props.value).toBe(40);
		expect(previous.listeners.size).toBe(0);
		expect(next.listeners.size).toBe(1);
		root.unmount();
	});

	it('converges when subscribe changes the snapshot and notifies synchronously', () => {
		let value = { a: 1, b: 2 };
		let connected = false;
		const store: ExternalStore<StoreState> = {
			getSnapshot: () => value,
			subscribe(notify) {
				connected = true;
				value = { a: 3, b: 4 };
				notify();
				return () => {
					connected = false;
				};
			},
		};
		const { container, root } = objectRoot();
		flushUniversalSync(() => root.render(Reader, { store, field: 'b' }));
		expect(container.children[0].props.value).toBe(4);
		expect(connected).toBe(true);
		root.unmount();
		expect(connected).toBe(false);
	});

	it('ignores a retained callback after its conditional subscription is removed', () => {
		const store = createStore({ a: 1, b: 2 });
		const reads: Array<keyof StoreState> = [];
		const onRead = (field: keyof StoreState) => reads.push(field);
		const { container, root } = objectRoot();
		root.render(Reader, { store, field: 'a', onRead });
		const stale = store.retained[0];
		root.render(Reader, { store, field: 'a', enabled: false, onRead });
		const host = container.children[0];
		expect(store.listeners.size).toBe(0);
		reads.length = 0;
		flushUniversalSync(stale);
		expect(reads).toEqual([]);
		expect(container.children[0]).toBe(host);
		expect(host.props.value).toBe('disabled');

		root.render(Reader, { store, field: 'b', onRead });
		reads.length = 0;
		flushUniversalSync(stale);
		expect(reads).toEqual([]);
		flushUniversalSync(() => store.set({ a: 3, b: 4 }));
		expect(host.props.value).toBe(4);
		root.unmount();
	});

	it('routes a snapshot error through the render boundary instead of the notifier', () => {
		const store = createStore({ a: 1, b: 2 });
		const caught: unknown[] = [];
		const Boundary = defineUniversalComponent('object', () =>
			universalTry(
				() => universalComponent('object', Reader, { store, field: 'a' }),
				null,
				(error) => universalValue(valuePlan, [String(error), 0]),
			),
		);
		const { container, root } = objectRoot({ onCaughtError: (error) => caught.push(error) });
		root.render(Boundary, undefined);
		const error = new Error('store unavailable');
		expect(() => flushUniversalSync(() => store.fail(error))).not.toThrow();
		expect(container.children[0].props.value).toBe('Error: store unavailable');
		expect(caught).toEqual([error]);
		expect(store.listeners.size).toBe(0);
		root.unmount();
	});

	it('deactivates a removed store before a throwing cleanup can notify', () => {
		const error = new Error('subscription cleanup failed');
		const caught: unknown[] = [];
		let reads = 0;
		let cleanups = 0;
		let stale!: () => void;
		const store: ExternalStore<number> = {
			getSnapshot() {
				reads++;
				return 0;
			},
			subscribe(notify) {
				stale = notify;
				return () => {
					cleanups++;
					notify();
					throw error;
				};
			},
		};
		const { container, root } = objectRoot({ onUncaughtError: (failure) => caught.push(failure) });
		root.render(StableReader, { store });
		const readsBeforeCleanup = reads;
		root.unmount();
		expect(reads).toBe(readsBeforeCleanup);
		expect(caught).toEqual([error]);
		expect(container.children).toEqual([]);
		expect(cleanups).toBe(1);

		flushUniversalSync(stale);
		root.unmount();
		expect(reads).toBe(readsBeforeCleanup);
		expect(caught).toEqual([error]);
		expect(cleanups).toBe(1);
	});

	it('disconnects hidden Activity subscriptions and restores the latest snapshot on reveal', () => {
		const lifecycle: string[] = [];
		const store = createStore({ a: 1, b: 2 }, 'store', lifecycle);
		const Scene = defineUniversalComponent(
			'object',
			(props: { mode: 'visible' | 'hidden'; field: keyof StoreState }) =>
				universalActivity(props.mode, () =>
					universalComponent('object', Reader, { store, field: props.field }),
				),
		);
		const { container, root } = objectRoot();
		root.render(Scene, { mode: 'visible', field: 'a' });
		const host = container.children[0];
		root.render(Scene, { mode: 'hidden', field: 'b' });
		expect(store.listeners.size).toBe(0);
		expect(host.visible).toBe(false);
		store.set({ a: 3, b: 4 });
		root.render(Scene, { mode: 'visible', field: 'b' });
		expect(container.children[0]).toBe(host);
		expect(host.visible).toBe(true);
		expect(host.props.value).toBe(4);
		expect(lifecycle).toEqual(['subscribe:store', 'unsubscribe:store', 'subscribe:store']);
		root.unmount();
		expect(lifecycle.at(-1)).toBe('unsubscribe:store');
	});
});
