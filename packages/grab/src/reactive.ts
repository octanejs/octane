// Internal fine-grained reactive runtime replacing upstream's "./reactive.js"
// imports. Upstream's orchestrator, stores, and non-component utilities were
// authored against Solid semantics (signals, effects, memos, stores, owner
// cleanup); this module preserves those semantics so ported modules keep their
// upstream structure. Overlay components are authored in .tsrx and subscribe to
// accessor props through `useProp`/`Show`/`For`.

import { useEffect, useRef, useSyncExternalStore } from 'octane';
import type { OctaneNode } from 'octane';
export type { OctaneNode };
import type { CSSProperties as JSXCSSProperties, Octane } from 'octane/jsx-runtime';

export type Accessor<T> = () => T;
export type Setter<T> = (next: T | ((prev: T) => T)) => T;

type Cleanup = () => void;

interface Owner {
	cleanups: Cleanup[];
	parent: Owner | null;
	disposed: boolean;
	// Component-scoped owners (created by `scoped`) carry call-order slots so
	// signal/memo/effect creation in a re-running component body resolves to the
	// same computation every render — Solid's run-once semantics. Plain owners
	// (createRoot, computations) leave slots null and create fresh state.
	slots: unknown[] | null;
	slotIndex: number;
}

interface Computation extends Owner {
	deps: Set<Dep>;
	sources: Set<Dep>;
	isEffect: boolean;
	isMemo: boolean;
	initialized: boolean;
	run: () => void;
}

class Dep {
	subs = new Set<Computation>();
}

let currentOwner: Owner | null = null;
let currentObserver: Computation | null = null;
let batchDepth = 0;
const pendingEffects = new Set<Computation>();
const pendingMemos = new Set<Computation>();

// Solid runs an effect's FIRST pass after its synchronous owner scope finishes
// (inside createRoot: when the root callback returns; detached: on a microtask),
// not at creation — setup bodies may reference bindings declared below the
// createEffect call. deferralDepth > 0 means a root/component setup is running;
// deferredInitialEffects collects their first runs, flushed when the outermost
// scope exits. Detached creations fall through to a microtask flush.
let deferralDepth = 0;
let microtaskFlushScheduled = false;
const deferredInitialEffects: Computation[] = [];

const flushDeferredInitialEffects = () => {
	while (deferredInitialEffects.length > 0) {
		const queue = deferredInitialEffects.splice(0);
		// A dep write between creation and the deferred pass can run the effect
		// early through pendingEffects; `initialized` suppresses the double run.
		for (const computation of queue) {
			if (!computation.initialized) computation.run();
		}
	}
};

const scheduleInitialRun = (computation: Computation) => {
	if (computation.disposed) return;
	if (deferralDepth === 0) {
		if (!microtaskFlushScheduled) {
			microtaskFlushScheduled = true;
			queueMicrotask(() => {
				microtaskFlushScheduled = false;
				flushDeferredInitialEffects();
			});
		}
		deferredInitialEffects.push(computation);
		return;
	}
	deferredInitialEffects.push(computation);
};

const flushPending = () => {
	while (pendingMemos.size > 0) {
		const memos = [...pendingMemos];
		pendingMemos.clear();
		for (const memo of memos) memo.run();
	}
	if (pendingEffects.size === 0) return;
	const effects = [...pendingEffects];
	pendingEffects.clear();
	for (const effect of effects) effect.run();
};

const scheduleComputation = (computation: Computation) => {
	if (computation.isMemo) {
		if (pendingMemos.has(computation)) return;
		pendingMemos.add(computation);
	} else {
		if (pendingEffects.has(computation)) return;
		pendingEffects.add(computation);
	}
	if (batchDepth === 0) flushPending();
};

export const batch = (fn: () => void): void => {
	batchDepth += 1;
	try {
		fn();
	} finally {
		batchDepth -= 1;
		if (batchDepth === 0) flushPending();
	}
};

export const untrack = <T>(fn: () => T): T => {
	const previous = currentObserver;
	currentObserver = null;
	try {
		return fn();
	} finally {
		currentObserver = previous;
	}
};

const cleanComputation = (computation: Computation) => {
	for (const dep of computation.sources) dep.subs.delete(computation);
	computation.sources.clear();
	const cleanups = computation.cleanups;
	computation.cleanups = [];
	for (const cleanup of cleanups) cleanup();
};

const disposeOwner = (owner: Owner) => {
	if (owner.disposed) return;
	owner.disposed = true;
	const cleanups = owner.cleanups;
	owner.cleanups = [];
	for (const cleanup of cleanups) cleanup();
};

// `init` runs once per call-site when the current owner is a component scope;
// subsequent renders reuse the slotted value. Non-component contexts (roots,
// computations) always run `init`.
const takeSlot = <T>(init: () => T): T => {
	const owner = currentOwner;
	if (owner === null || owner.slots === null) return init();
	const index = owner.slotIndex;
	owner.slotIndex = index + 1;
	// Assign at `index`, not `push`: a `runOnce` entry is written to its slot
	// only after its factory finishes, so inner shim calls can see
	// `index > slots.length` mid-flight and must not take the "append" branch.
	if (index >= owner.slots.length) owner.slots[index] = init();
	return owner.slots[index] as T;
};

// Factory calls in component bodies (createAnchoredDropdown, createToolbarDrag,
// createMenuStore, createConfirmationKeyboard) carry internal `let` state that
// Solid's run-once setup persists. `runOnce` slots the whole call so the
// factory executes on the first render only; later renders reuse its result.
// Unlike a plain `takeSlot` it records the slot range the factory's inner
// shim calls consumed and skips it, keeping call-order slots aligned.
// Outside a component scope the call runs normally.
export const runOnce = <T>(init: () => T): T => {
	const owner = currentOwner;
	if (owner === null || owner.slots === null) return init();
	const index = owner.slotIndex;
	owner.slotIndex = index + 1;
	if (index >= owner.slots.length) {
		const result = init();
		owner.slots[index] = { result, endIndex: owner.slotIndex };
		return result;
	}
	const entry = owner.slots[index] as { result: T; endIndex: number };
	owner.slotIndex = entry.endIndex;
	return entry.result;
};

const createComputation = (
	run: () => void,
	options: { isEffect?: boolean; isMemo?: boolean } = {},
): Computation => {
	const owner = currentOwner;
	const computation: Computation = {
		cleanups: [],
		parent: owner,
		disposed: false,
		slots: null,
		slotIndex: 0,
		deps: new Set(),
		sources: new Set(),
		isEffect: options.isEffect ?? false,
		isMemo: options.isMemo ?? false,
		initialized: false,
		run() {
			if (computation.disposed) return;
			computation.initialized = true;
			cleanComputation(computation);
			const previousObserver = currentObserver;
			const previousOwner = currentOwner;
			currentObserver = computation;
			currentOwner = computation;
			try {
				run();
			} finally {
				currentObserver = previousObserver;
				currentOwner = previousOwner;
			}
		},
	};
	const dispose = () => {
		if (computation.disposed) return;
		cleanComputation(computation);
		computation.disposed = true;
	};
	if (owner !== null) owner.cleanups.push(dispose);
	if (computation.isEffect && !computation.isMemo) scheduleInitialRun(computation);
	else computation.run();
	return computation;
};

const ACCESSOR = Symbol.for('react-grab.accessor');

// Accessor-intent vs callback props are both functions, so bare `typeof` cannot
// distinguish them. Shim-produced read functions are branded; `resolveProp`
// invokes only branded accessors while `useProp` (which only ever receives
// value/`when`/`each` props) invokes any function.
export const isAccessor = (value: unknown): value is Accessor<unknown> =>
	typeof value === 'function' && (value as unknown as Record<symbol, unknown>)[ACCESSOR] === true;

export const accessor = <T>(fn: Accessor<T>): Accessor<T> => {
	(fn as unknown as Record<symbol, unknown>)[ACCESSOR] = true;
	return fn;
};

export const createSignal = <T>(
	value: T,
	options?: { equals?: (prev: T, next: T) => boolean },
): [() => T, (next: T | ((prev: T) => T)) => T] =>
	takeSlot(() => createSignalState(value, options));

const createSignalState = <T>(
	value: T,
	options?: { equals?: (prev: T, next: T) => boolean },
): [() => T, (next: T | ((prev: T) => T)) => T] => {
	const dep = new Dep();
	const equals = options?.equals ?? ((prev: T, next: T) => prev === next);
	const read = accessor(() => {
		if (currentObserver !== null) {
			dep.subs.add(currentObserver);
			currentObserver.sources.add(dep);
		}
		return value;
	});
	const write = (next: T | ((prev: T) => T)) => {
		const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
		if (!equals(value, resolved)) {
			value = resolved;
			for (const sub of [...dep.subs]) scheduleComputation(sub);
		}
		return value;
	};
	return [read, write];
};

export const createEffect = (fn: (previous?: any) => unknown): (() => void) =>
	takeSlot(() => {
		let previous: unknown;
		const computation = createComputation(
			() => {
				previous = fn(previous);
			},
			{ isEffect: true },
		);
		return () => {
			if (computation.disposed) return;
			cleanComputation(computation);
			computation.disposed = true;
		};
	});

// Subscribe/unsubscribe pair for useSyncExternalStore: the computation tracks
// every signal/store dep the read touches and notifies on change.
const subscribeComputation = (read: () => void): (() => void) => createEffect(read);

export interface MemoAccessor<T> extends Accessor<T> {
	dispose(): void;
}

export const createMemo = <T>(fn: (previous: T) => T, initialValue?: T): MemoAccessor<T> =>
	takeSlot(() => createMemoState(fn, initialValue));

const createMemoState = <T>(fn: (previous: T) => T, initialValue?: T): MemoAccessor<T> => {
	let value: T | undefined = initialValue;
	let initialized = initialValue !== undefined;
	const dep = new Dep();
	const computation = createComputation(
		() => {
			const next = fn(value as T);
			if (initialized && next === value) return;
			value = next;
			initialized = true;
			for (const sub of [...dep.subs]) scheduleComputation(sub);
		},
		{ isMemo: true },
	);
	const read = accessor(() => {
		if (currentObserver !== null) {
			dep.subs.add(currentObserver);
			currentObserver.sources.add(dep);
		}
		return value as T;
	}) as MemoAccessor<T>;
	// Component-scoped memos must dispose on unmount or the subscription to
	// shared accessor deps outlives the label that created them.
	read.dispose = () => {
		if (computation.disposed) return;
		cleanComputation(computation);
		computation.disposed = true;
	};
	return read;
};

export function on<S, T>(
	source: Accessor<S>,
	fn: (value: S, previous: S | undefined) => T,
	options?: { defer?: boolean },
): (previousValue: T | undefined) => T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function on<T>(
	source: readonly Accessor<unknown>[],
	fn: (value: any[], previous: any[] | undefined) => T,
	options?: { defer?: boolean },
): (previousValue: T | undefined) => T;
export function on(
	source: Accessor<unknown> | readonly Accessor<unknown>[],
	fn: (value: never, previous: never) => unknown,
	options?: { defer?: boolean },
): (previousValue: unknown) => unknown {
	const read: Accessor<unknown> = Array.isArray(source)
		? () => source.map((s) => s())
		: (source as Accessor<unknown>);
	let initialized = false;
	let previousSource: unknown;
	return (previousValue: unknown) => {
		const value = read();
		if (!initialized && options?.defer === true) {
			initialized = true;
			previousSource = value;
			return previousValue;
		}
		const previous = initialized ? previousSource : undefined;
		initialized = true;
		previousSource = value;
		return (fn as (v: unknown, p: unknown) => unknown)(value, previous);
	};
}

export const onCleanup = (cleanup: Cleanup): void => {
	takeSlot(() => {
		if (currentOwner !== null) currentOwner.cleanups.push(cleanup);
		return true;
	});
};

export const getOwner = (): Owner | null => currentOwner ?? currentObserver;

export const createRoot = <T>(fn: (dispose: () => void) => T): T => {
	const owner: Owner = {
		cleanups: [],
		parent: currentOwner,
		disposed: false,
		slots: null,
		slotIndex: 0,
	};
	const dispose = () => disposeOwner(owner);
	const previousOwner = currentOwner;
	currentOwner = owner;
	// A throwing setup leaves half-initialized bindings behind: drop the queued
	// initial runs instead of letting them fire against dead scope in finally.
	const deferredBase = deferredInitialEffects.length;
	deferralDepth += 1;
	let result: T;
	try {
		result = fn(dispose);
	} catch (error) {
		deferralDepth -= 1;
		deferredInitialEffects.length = deferredBase;
		currentOwner = previousOwner;
		throw error;
	}
	deferralDepth -= 1;
	currentOwner = previousOwner;
	if (deferralDepth === 0) flushDeferredInitialEffects();
	return result;
};

export const onMount = (fn: () => void): void => {
	takeSlot(() => {
		let mounted = false;
		createComputation(
			() => {
				if (mounted) return;
				mounted = true;
				untrack(fn);
			},
			{ isEffect: true },
		);
		return true;
	});
};

export const mapArray = <T, U>(
	list: () => readonly T[],
	map: (item: T, index: number) => U,
): (() => U[]) => {
	const cache = new Map<T, U>();
	return createMemo(() => {
		const items = list();
		const next: U[] = new Array(items.length);
		const used = new Set<T>();
		for (let index = 0; index < items.length; index += 1) {
			const item = items[index];
			used.add(item);
			const cached = cache.get(item);
			next[index] = cached !== undefined || cache.has(item) ? (cached as U) : map(item, index);
			if (cached === undefined && !cache.has(item)) cache.set(item, next[index]);
		}
		for (const key of cache.keys()) if (!used.has(key)) cache.delete(key);
		return next;
	});
};

interface ResourceState<T> {
	(): T | undefined;
	loading: () => boolean;
	error: () => unknown;
	latest: () => T | undefined;
}

export const createResource = <S, T>(
	source: () => S,
	fetcher: (source: S) => Promise<T>,
): [ResourceState<T>, { refetch: () => void; mutate: (value: T | undefined) => void }] => {
	const [value, setValue] = createSignal<T | undefined>(undefined);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<unknown>(undefined);
	let requestId = 0;
	const run = (input: S) => {
		const id = ++requestId;
		setLoading(true);
		void Promise.resolve()
			.then(() => fetcher(input))
			.then((result) => {
				if (id !== requestId) return;
				setValue(result);
				setError(undefined);
			})
			.catch((err: unknown) => {
				if (id !== requestId) return;
				setError(err);
			})
			.finally(() => {
				if (id === requestId) setLoading(false);
			});
	};
	// Solid semantics: a falsy source skips the fetcher and leaves value unset.
	createEffect(() => {
		const input = source();
		if (input) run(input);
		else {
			requestId += 1;
			setValue(undefined);
			setLoading(false);
		}
	});
	const resource = accessor(() => value()) as ResourceState<T>;
	resource.loading = loading;
	resource.error = error;
	resource.latest = value;
	return [
		resource,
		{
			refetch: () => run(untrack(source)),
			mutate: (next) => setValue(next),
		},
	];
};

// Solid's isWrappable: only plain objects and arrays become reactive proxies.
// DOM nodes, class instances, and platform objects must pass through raw — a
// Proxy receiver makes Web IDL getters throw "Illegal invocation".
const isStoreWrappable = (value: unknown): value is Record<PropertyKey, unknown> => {
	if (typeof value !== 'object' || value === null) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null || Array.isArray(value);
};

interface StoreNode {
	deps: Map<PropertyKey, Dep>;
	children: Map<PropertyKey, StoreNode>;
	// Identity-stable proxies per underlying object: snapshot consumers
	// (useSyncExternalStore's Object.is check) re-read the same key on every
	// render, and a fresh Proxy per read would compare unequal forever.
	proxies: WeakMap<object, unknown>;
}

const createStoreNode = (): StoreNode => ({
	deps: new Map(),
	children: new Map(),
	proxies: new WeakMap(),
});

const trackKey = (node: StoreNode, key: PropertyKey): void => {
	if (currentObserver === null) return;
	let dep = node.deps.get(key);
	if (dep === undefined) {
		dep = new Dep();
		node.deps.set(key, dep);
	}
	dep.subs.add(currentObserver);
	currentObserver.sources.add(dep);
};

const notifyKey = (node: StoreNode, key: PropertyKey): void => {
	const dep = node.deps.get(key);
	if (dep !== undefined) for (const sub of [...dep.subs]) scheduleComputation(sub);
	const child = node.children.get(key);
	if (child !== undefined) notifyAllKeys(child);
};

const notifyAllKeys = (node: StoreNode): void => {
	for (const dep of node.deps.values()) for (const sub of [...dep.subs]) scheduleComputation(sub);
	for (const child of node.children.values()) notifyAllKeys(child);
};

const wrapStoreValue = (value: unknown, node: StoreNode): unknown => {
	if (!isStoreWrappable(value)) return value;
	const cached = node.proxies.get(value as object);
	if (cached !== undefined) return cached;
	const proxy = new Proxy(value, {
		get(target, key, receiver) {
			trackKey(node, key);
			let child = node.children.get(key);
			if (child === undefined) {
				child = createStoreNode();
				node.children.set(key, child);
			}
			return wrapStoreValue(Reflect.get(target, key, receiver), child);
		},
		set(target, key, next, receiver) {
			const previous = Reflect.get(target, key);
			const result = Reflect.set(target, key, next, receiver);
			if (previous !== next) notifyKey(node, key);
			return result;
		},
		deleteProperty(target, key) {
			const had = Reflect.has(target, key);
			const result = Reflect.deleteProperty(target, key);
			if (had) notifyKey(node, key);
			return result;
		},
	});
	node.proxies.set(value as object, proxy);
	return proxy;
};

type StoreSetter<T> = {
	(update: (state: T) => T): void;
	(...path: [...keys: PropertyKey[], updater: (prev: any) => unknown]): void;
	(...path: [...keys: PropertyKey[], value: unknown]): void;
};

const applyStorePath = (
	root: StoreNode,
	target: unknown,
	path: PropertyKey[],
	value: unknown,
): void => {
	if (path.length === 0) return;
	const last = path[path.length - 1];
	let currentTarget = target as Record<PropertyKey, unknown>;
	let currentNode = root;
	for (const key of path.slice(0, -1)) {
		let child = currentNode.children.get(key);
		if (child === undefined) {
			child = createStoreNode();
			currentNode.children.set(key, child);
		}
		currentNode = child;
		currentTarget = (currentTarget?.[key] ?? {}) as Record<PropertyKey, unknown>;
	}
	const previous = currentTarget[last];
	const resolved =
		typeof value === 'function' ? (value as (prev: unknown) => unknown)(previous) : value;
	if (previous !== resolved) {
		currentTarget[last] = resolved;
		notifyKey(currentNode, last);
	}
};

export const produce = <T>(fn: (draft: T) => void): ((state: T) => T) => {
	// Upstream produce semantics need a mutable draft; the store mutates in place
	// and setStore notifies subscribers afterwards, so fn applies directly.
	return (state: T) => {
		fn(state);
		return state;
	};
};

export const createStore = <T extends object>(initial: T): [T, StoreSetter<T>] => {
	const root = createStoreNode();
	const state = wrapStoreValue(initial, root) as T;
	const setStore = ((...args: unknown[]) => {
		const first = args[0];
		if (typeof first === 'function' && args.length === 1) {
			const before = first as (state: T) => T;
			before(initial);
			notifyAllKeys(root);
			return;
		}
		const path = args.slice(0, -1) as PropertyKey[];
		applyStorePath(root, initial, path, args[args.length - 1]);
	}) as StoreSetter<T>;
	return [state, setStore];
};

// ---------------------------------------------------------------------------
// Octane component bridge. Upstream authored overlay components in Solid, where
// JSX props compile to lazily-evaluated getters. The mount boundary preserves
// that contract by passing accessor functions; components subscribe per prop
// through `useProp`, which runs one tracked `createEffect` per subscription.
// ---------------------------------------------------------------------------

export type MaybeAccessor<T> = T | Accessor<T>;

// Identity-typed: props declare their resolved value type, while branded
// accessors at runtime unwrap through `isAccessor`. Callback props pass
// through untouched, which is why this must not try to call `T` itself.
export const resolveProp = <T>(value: T): T => (isAccessor(value) ? (value() as T) : value);

// `useProp` invokes any function — it serves `when`/`each`-style accessors
// written as plain arrows — so callback props must never be routed through it.
const readMaybeAccessor = <T>(value: MaybeAccessor<T>): T =>
	typeof value === 'function' ? (value as Accessor<T>)() : value;

export function useProp<T>(value: Accessor<T>): T;
export function useProp<T>(value: T): T;
export function useProp<T>(value: MaybeAccessor<T>): T {
	// A fresh inline subscribe each render would make useSyncExternalStore
	// tear down and recreate the tracked computation per render; the ref keeps
	// one identity for the component's lifetime while reads follow the latest
	// accessor prop.
	const latest = useRef(value);
	latest.current = value;
	// Accessor props may legitimately return a fresh object per read (Solid
	// getter semantics — e.g. `() => getTagDisplay({...})`). getSnapshot must be
	// referentially stable across reads though, so the tracked computation owns
	// the snapshot: it is the invalidation point, advancing the cached value
	// and notifying only when a re-run actually produced a different value.
	const cell = useRef<{ snapshot: T; ready: boolean }>({ snapshot: undefined as T, ready: false });
	const subscribeRef = useRef<((notify: () => void) => () => void) | null>(null);
	const subscribe = (subscribeRef.current ??= (notify) =>
		subscribeComputation(() => {
			const next = readMaybeAccessor(latest.current);
			if (!cell.current.ready) {
				cell.current = { snapshot: next, ready: true };
				return;
			}
			if (!Object.is(cell.current.snapshot, next)) {
				cell.current.snapshot = next;
				notify();
			}
		}));
	return useSyncExternalStore(subscribe, () => {
		const current = latest.current;
		if (typeof current !== 'function') return current;
		if (!cell.current.ready) {
			cell.current = { snapshot: readMaybeAccessor(current), ready: true };
		}
		return cell.current.snapshot;
	});
}

export interface ShowProps<T> {
	when: MaybeAccessor<T>;
	children: OctaneNode | ((value: Accessor<NonNullable<T>>) => OctaneNode);
	fallback?: OctaneNode;
	keyed?: boolean;
}

export const Show = <T>(props: ShowProps<T>): OctaneNode => {
	useProp(props.when);
	const when = readMaybeAccessor(props.when);
	if (!when) return props.fallback ?? null;
	if (typeof props.children === 'function') {
		const accessor = (typeof props.when === 'function' ? props.when : () => props.when) as Accessor<
			NonNullable<T>
		>;
		return props.children(accessor);
	}
	return props.children ?? null;
};

export interface ForProps<T> {
	each: MaybeAccessor<readonly T[] | undefined | null>;
	// Solid parity: the index arrives as an accessor, not a bare number.
	children: (item: T, index: Accessor<number>) => OctaneNode;
	fallback?: OctaneNode;
}

export const For = <T>(props: ForProps<T>): OctaneNode => {
	useProp(props.each);
	const items = readMaybeAccessor(props.each) ?? [];
	if (items.length === 0) return props.fallback ?? null;
	return items.map((item, index) =>
		props.children(
			item,
			accessor(() => index),
		),
	);
};

export const splitProps = <T extends object, K extends keyof T>(
	props: T,
	keys: readonly K[],
): [Pick<T, K>, Omit<T, K>] => {
	const local: Record<string, unknown> = {};
	const rest: Record<string, unknown> = {};
	for (const key of Object.keys(props)) {
		if ((keys as readonly string[]).includes(key))
			local[key] = (props as Record<string, unknown>)[key];
		else rest[key] = (props as Record<string, unknown>)[key];
	}
	return [local as Pick<T, K>, rest as Omit<T, K>];
};

export const mergeProps = <T extends object[]>(...sources: T): UnionToIntersection<T[number]> => {
	const merged: Record<string, unknown> = {};
	for (const source of sources) {
		for (const key of Object.keys(source)) {
			const value = (source as Record<string, unknown>)[key];
			if (value !== undefined) merged[key] = value;
		}
	}
	return merged as UnionToIntersection<T[number]>;
};

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (
	arg: infer I,
) => void
	? I
	: never;

export type Component<P = Record<string, never>> = (props: P) => OctaneNode;

interface ScopedInstance {
	owner: Owner;
	latest: { props: Record<PropertyKey, unknown> };
	propDeps: Map<PropertyKey, Dep>;
	proxy: unknown;
}

// Octane re-runs component bodies every render; Solid runs them once. `scoped`
// wraps a component so its setup executes inside a per-instance owner: shim
// computations are slotted by call order (stable across renders), `onCleanup`
// registers once, and the whole scope disposes on unmount. Setup sees `props`
// through a proxy that forwards to the latest render's props and tracks key
// reads against per-prop deps — Solid's props-as-getters model — so persisted
// computations react to prop changes whether the parent passed a branded
// accessor or a freshly resolved value.
export const scoped = <P extends object>(setup: (props: P) => OctaneNode): Component<P> => {
	const ScopedComponent = (props: P): OctaneNode => {
		const ref = useRef<ScopedInstance | null>(null);
		if (ref.current === null) {
			const latest = { props: props as Record<PropertyKey, unknown> };
			const propDeps = new Map<PropertyKey, Dep>();
			ref.current = {
				owner: { cleanups: [], parent: null, disposed: false, slots: [], slotIndex: 0 },
				latest,
				propDeps,
				proxy: new Proxy({} as Record<PropertyKey, unknown>, {
					get: (_target, key) => {
						if (currentObserver !== null) {
							let dep = propDeps.get(key);
							if (dep === undefined) {
								dep = new Dep();
								propDeps.set(key, dep);
							}
							dep.subs.add(currentObserver);
							currentObserver.sources.add(dep);
						}
						return latest.props[key];
					},
					has: (_target, key) => key in latest.props,
					ownKeys: () => Reflect.ownKeys(latest.props),
					getOwnPropertyDescriptor: (_target, key) => {
						const descriptor = Object.getOwnPropertyDescriptor(latest.props, key);
						return descriptor === undefined ? undefined : { ...descriptor, configurable: true };
					},
				}),
			};
		}
		const { owner, latest, propDeps, proxy } = ref.current;
		const previousProps = latest.props;
		latest.props = props as Record<PropertyKey, unknown>;
		for (const [key, dep] of propDeps) {
			if (previousProps[key] !== latest.props[key]) {
				for (const sub of [...dep.subs]) scheduleComputation(sub);
			}
		}
		useEffect(() => () => disposeOwner(owner), []);
		owner.slotIndex = 0;
		const previousOwner = currentOwner;
		currentOwner = owner;
		const deferredBase = deferredInitialEffects.length;
		deferralDepth += 1;
		let output: OctaneNode;
		try {
			output = setup(proxy as P);
		} catch (error) {
			deferralDepth -= 1;
			deferredInitialEffects.length = deferredBase;
			currentOwner = previousOwner;
			throw error;
		}
		deferralDepth -= 1;
		currentOwner = previousOwner;
		if (deferralDepth === 0) flushDeferredInitialEffects();
		return output;
	};
	return ScopedComponent;
};

// Upstream components annotate DOM props with Solid's `JSX.*` attribute types.
// Map them onto Octane's equivalent attribute surfaces so the ported markup
// keeps its authored types.
export namespace JSX {
	export type Element = Octane.JSX.Element;
	export type CSSProperties = JSXCSSProperties;
	export type HTMLAttributes<T> = Octane.HTMLAttributes<T> & Octane.RefAttributes<T>;
	export type AllHTMLAttributes<T> = Octane.AllHTMLAttributes<T>;
	export type ButtonHTMLAttributes<T> = Octane.ButtonHTMLAttributes<T>;
	export type InputHTMLAttributes<T> = Octane.InputHTMLAttributes<T>;
	export type TextareaHTMLAttributes<T> = Octane.TextareaHTMLAttributes<T>;
	export type AnchorHTMLAttributes<T> = Octane.AnchorHTMLAttributes<T>;
	export type SVGAttributes<T> = Octane.SVGAttributes<T>;
	export type SVGProps<T> = Octane.SVGProps<T>;
}
