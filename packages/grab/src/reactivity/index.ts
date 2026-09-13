/**
 * Grab-local reactive primitives for the overlay controller.
 * Replaces solid-js orchestration so the overlay mounts via Octane.
 *
 * Only the APIs grab uses. Store updates mutate in place (Element refs must survive).
 */

type Listener = () => void;

let batchDepth = 0;
const pendingListeners = new Set<Listener>();
let activeEffect: Effect | null = null;
const effectStack: Effect[] = [];

interface SignalNode<T> {
	value: T;
	listeners: Set<Listener>;
}

interface Effect {
	run: () => void;
	deps: Set<Set<Listener>>;
	cleanups: Array<() => void>;
	disposed: boolean;
}

function flushPending(): void {
	if (batchDepth > 0) return;
	const queue = [...pendingListeners];
	pendingListeners.clear();
	for (const listener of queue) listener();
}

function notify(listeners: Set<Listener>): void {
	for (const listener of listeners) {
		pendingListeners.add(listener);
	}
	flushPending();
}

function track(listeners: Set<Listener>): void {
	const effect = activeEffect;
	if (!effect || effect.disposed) return;
	listeners.add(effect.run);
	effect.deps.add(listeners);
}

function clearEffectDeps(effect: Effect): void {
	for (const listeners of effect.deps) {
		listeners.delete(effect.run);
	}
	effect.deps.clear();
}

function runCleanups(effect: Effect): void {
	const cleanups = effect.cleanups;
	effect.cleanups = [];
	for (const cleanup of cleanups) {
		try {
			cleanup();
		} catch {
			/* ignore */
		}
	}
}

export type Accessor<T> = () => T;
export type Setter<T> = (value: T | ((prev: T) => T)) => T;

export function createSignal<T>(initial: T): [Accessor<T>, Setter<T>] {
	const node: SignalNode<T> = { value: initial, listeners: new Set() };
	const read: Accessor<T> = () => {
		track(node.listeners);
		return node.value;
	};
	const write: Setter<T> = (value) => {
		const next = typeof value === 'function' ? (value as (prev: T) => T)(node.value) : value;
		if (Object.is(next, node.value)) return node.value;
		node.value = next;
		notify(node.listeners);
		return node.value;
	};
	return [read, write];
}

export function untrack<T>(fn: () => T): T {
	const previous = activeEffect;
	activeEffect = null;
	try {
		return fn();
	} finally {
		activeEffect = previous;
	}
}

export function batch<T>(fn: () => T): T {
	batchDepth += 1;
	try {
		return fn();
	} finally {
		batchDepth -= 1;
		flushPending();
	}
}

export function onCleanup(fn: () => void): void {
	if (activeEffect) activeEffect.cleanups.push(fn);
}

/** Solid's onMount — run after the current turn, under the creating owner. */
export function onMount(fn: () => void): void {
	const owner = activeEffect;
	queueMicrotask(() => {
		if (owner?.disposed) return;
		const previous = activeEffect;
		activeEffect = owner;
		try {
			fn();
		} finally {
			activeEffect = previous;
		}
	});
}

// Solid defers createEffect until after the creating createRoot callback returns
// (and nested effects created while flushing also defer to the end of that flush).
let deferEffectDepth = 0;
const deferredEffects: Effect[] = [];

function flushDeferredEffects(): void {
	while (deferredEffects.length > 0) {
		const queued = deferredEffects.splice(0);
		for (const effect of queued) {
			if (!effect.disposed) effect.run();
		}
	}
}

export function createEffect(fn: () => void): void {
	const effect: Effect = {
		run: () => {},
		deps: new Set(),
		cleanups: [],
		disposed: false,
	};
	effect.run = () => {
		if (effect.disposed) return;
		runCleanups(effect);
		clearEffectDeps(effect);
		effectStack.push(effect);
		activeEffect = effect;
		try {
			fn();
		} finally {
			effectStack.pop();
			activeEffect = effectStack[effectStack.length - 1] ?? null;
		}
	};
	onCleanup(() => {
		effect.disposed = true;
		runCleanups(effect);
		clearEffectDeps(effect);
	});
	if (deferEffectDepth > 0) {
		deferredEffects.push(effect);
	} else {
		effect.run();
	}
}

export function createMemo<T>(fn: () => T): Accessor<T> {
	const [get, set] = createSignal<T>(untrack(fn));
	createEffect(() => {
		set(fn());
	});
	return get;
}

/** Solid's `on(deps, fn)` helper used as `createEffect(on(dep, fn))`. */
export function on<T>(
	deps: Accessor<T> | Array<Accessor<unknown>>,
	fn: (input: T, prevInput?: T, prevResult?: unknown) => unknown,
): () => void {
	let previous: T | undefined;
	let hasPrevious = false;
	return () => {
		const current = (Array.isArray(deps) ? deps.map((dep) => dep()) : (deps as Accessor<T>)()) as T;
		const prev = hasPrevious ? previous : undefined;
		previous = current;
		hasPrevious = true;
		fn(current, prev);
	};
}

export function createRoot<T>(fn: (dispose: () => void) => T): T {
	const rootEffect: Effect = {
		run: () => {},
		deps: new Set(),
		cleanups: [],
		disposed: false,
	};
	const dispose = () => {
		if (rootEffect.disposed) return;
		rootEffect.disposed = true;
		runCleanups(rootEffect);
		clearEffectDeps(rootEffect);
	};
	effectStack.push(rootEffect);
	activeEffect = rootEffect;
	deferEffectDepth += 1;
	try {
		const result = fn(dispose);
		deferEffectDepth -= 1;
		if (deferEffectDepth === 0) flushDeferredEffects();
		return result;
	} catch (error) {
		deferEffectDepth -= 1;
		if (deferEffectDepth === 0) flushDeferredEffects();
		throw error;
	} finally {
		effectStack.pop();
		activeEffect = effectStack[effectStack.length - 1] ?? null;
	}
}

export function mapArray<T, U>(
	list: Accessor<readonly T[] | null | undefined | false>,
	mapFn: (item: T, index: Accessor<number>) => U,
): Accessor<U[]> {
	return createMemo(() => {
		const items = list() || [];
		return items.map((item, index) => mapFn(item, () => index));
	});
}

type ResourceAccessor<T> = Accessor<T | undefined> & {
	loading: boolean;
	error: unknown;
	latest: T | undefined;
	state: 'unresolved' | 'pending' | 'ready' | 'errored';
};

export function createResource<T>(
	fetcher: () => T | Promise<T>,
): [ResourceAccessor<T>, { refetch: () => void }];
export function createResource<T, S>(
	source: Accessor<S>,
	fetcher: (value: S, info: { value: T | undefined; refetching: boolean }) => T | Promise<T>,
): [ResourceAccessor<T>, { refetch: () => void }];
export function createResource<T, S = void>(
	sourceOrFetcher: Accessor<S> | (() => T | Promise<T>),
	maybeFetcher?: (value: S, info: { value: T | undefined; refetching: boolean }) => T | Promise<T>,
): [ResourceAccessor<T>, { refetch: () => void }] {
	const [value, setValue] = createSignal<T | undefined>(undefined);
	const [loading, setLoading] = createSignal(true);
	const [error, setError] = createSignal<unknown>(undefined);
	const [state, setState] = createSignal<'unresolved' | 'pending' | 'ready' | 'errored'>('pending');

	const load = () => {
		setLoading(true);
		setState('pending');
		setError(undefined);
		try {
			let result: T | Promise<T>;
			if (maybeFetcher) {
				const sourceValue = (sourceOrFetcher as Accessor<S>)();
				result = maybeFetcher(sourceValue, { value: value(), refetching: false });
			} else {
				result = (sourceOrFetcher as () => T | Promise<T>)();
			}
			if (result && typeof (result as Promise<T>).then === 'function') {
				void (result as Promise<T>)
					.then((resolved) => {
						setValue(() => resolved as T);
						setLoading(false);
						setState('ready');
					})
					.catch((err) => {
						setError(() => err);
						setLoading(false);
						setState('errored');
					});
			} else {
				setValue(() => result as T);
				setLoading(false);
				setState('ready');
			}
		} catch (err) {
			setError(() => err);
			setLoading(false);
			setState('errored');
		}
	};

	createEffect(() => {
		load();
	});

	const accessor = (() => value()) as ResourceAccessor<T>;
	Object.defineProperties(accessor, {
		loading: { get: () => loading() },
		error: { get: () => error() },
		latest: { get: () => value() },
		state: { get: () => state() },
	});
	return [accessor, { refetch: load }];
}

const PRODUCE = Symbol('grab-produce');

/** Solid-compatible produce: setStore(produce(draft => { ... })). */
export function produce<T extends object>(
	fn: (draft: T) => void,
): ((draft: T) => void) & {
	[PRODUCE]: true;
} {
	const wrapper = ((draft: T) => {
		fn(draft);
	}) as ((draft: T) => void) & { [PRODUCE]: true };
	wrapper[PRODUCE] = true;
	return wrapper;
}

function isProduce<T>(fn: unknown): fn is (draft: T) => void {
	return typeof fn === 'function' && (fn as any)[PRODUCE] === true;
}

type StoreSetter<T> = {
	(...pathAndValue: any[]): void;
};

/**
 * Solid-like createStore. Mutations are in-place so Element references stay valid.
 */
export function createStore<T extends object>(initial: T): [T, StoreSetter<T>] {
	const state = initial;
	const listeners = new Set<Listener>();
	const emit = () => notify(listeners);
	const proxyCache = new WeakMap<object, object>();

	const wrap = <V extends object>(target: V): V => {
		const cached = proxyCache.get(target);
		if (cached) return cached as V;
		const proxy = new Proxy(target, {
			get(obj, prop, receiver) {
				track(listeners);
				const value = Reflect.get(obj, prop, receiver);
				if (value && typeof value === 'object' && !(value instanceof Node)) {
					return wrap(value as object);
				}
				return value;
			},
		});
		proxyCache.set(target, proxy);
		return proxy as V;
	};

	const setStore: StoreSetter<T> = (...args: any[]) => {
		batch(() => {
			if (args.length === 1 && isProduce<T>(args[0])) {
				(args[0] as (draft: T) => void)(state);
				emit();
				return;
			}

			if (args.length === 1 && typeof args[0] === 'function') {
				(args[0] as (draft: T) => void)(state);
				emit();
				return;
			}

			const path = args.slice(0, -1);
			const valueOrFn = args[args.length - 1];
			let cursor: any = state;
			for (let i = 0; i < path.length - 1; i += 1) {
				cursor = cursor[path[i]];
			}
			const last = path[path.length - 1];
			const prev = cursor[last];
			cursor[last] =
				typeof valueOrFn === 'function' ? (valueOrFn as (p: unknown) => unknown)(prev) : valueOrFn;
			emit();
		});
	};

	return [wrap(state) as T, setStore];
}

export function getOwner(): Effect | null {
	return activeEffect;
}
