// Port of react-alien-signals@0.4.0 src/index.ts over the unchanged
// alien-signals core. React hooks become Octane hooks; each exported hook
// forwards the compiler-assigned slot to its base hooks.
import {
	computed as alienComputed,
	effect as alienEffect,
	effectScope as alienEffectScope,
	endBatch,
	signal as alienSignal,
	startBatch,
	trigger as alienTrigger,
} from 'alien-signals';
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from 'octane';
import { splitSlot, subSlot } from './internal';

export type ReadableSignal<T> = () => T;

export type WritableSignal<T> = {
	(): T;
	(value: T): void;
};

export type SignalSetter<T> = (value: T | ((previous: T) => T)) => void;

export type SignalEffectCallback = () => void | (() => void);
export type SignalEffectDependencies = readonly ReadableSignal<unknown>[];

export type DependencyList = readonly unknown[];

export function createSignal<T>(initialValue: T): WritableSignal<T> {
	return alienSignal<T>(initialValue);
}

export function createComputed<T>(fn: (previousValue?: T) => T): ReadableSignal<T> {
	return alienComputed(fn);
}

export function createEffect(fn: SignalEffectCallback): () => void {
	return alienEffect(fn);
}

export function createSignalScope(callback: () => void): () => void {
	return alienEffectScope(callback);
}

/** Runs signal writes as one propagation batch. Nested batches are supported. */
export function batch<T>(callback: () => T): T {
	startBatch();
	try {
		return callback();
	} finally {
		endBatch();
	}
}

/** Notifies dependents after mutating one or more signal values in place. */
export function trigger(signalOrCollector: ReadableSignal<unknown>): void {
	alienTrigger(signalOrCollector);
}

interface ExternalSignalStore<T> {
	getSnapshot: () => T;
	subscribe: (notify: () => void) => () => void;
}

// One core effect per signal fans out to every subscribed component, so
// mounting more readers of the same signal adds listeners, not effects.
const externalStores = new WeakMap<ReadableSignal<unknown>, ExternalSignalStore<unknown>>();

function getExternalStore<T>(signal: ReadableSignal<T>): ExternalSignalStore<T> {
	const cached = externalStores.get(signal) as ExternalSignalStore<T> | undefined;
	if (cached) return cached;

	let firstListener: (() => void) | undefined;
	let additionalListeners: Set<() => void> | undefined;
	let notifyListeners = doNothing;
	let stop: (() => void) | undefined;
	const notifyAllListeners = () => {
		firstListener!();
		additionalListeners!.forEach(callListener);
	};

	const store: ExternalSignalStore<T> = {
		getSnapshot: signal,
		subscribe(notify) {
			if (firstListener === undefined) {
				firstListener = notify;
				notifyListeners = notify;
			} else {
				(additionalListeners ??= new Set()).add(notify);
				notifyListeners = notifyAllListeners;
			}

			if (stop === undefined) {
				let initialized = false;
				stop = createEffect(() => {
					signal();
					if (initialized) {
						notifyListeners();
					} else {
						initialized = true;
					}
				});
			}

			return () => {
				if (firstListener === notify) {
					const replacement = additionalListeners?.values().next().value;
					firstListener = replacement;
					if (replacement !== undefined) additionalListeners!.delete(replacement);
				} else {
					additionalListeners?.delete(notify);
				}

				if (firstListener === undefined) {
					stop?.();
					stop = undefined;
					additionalListeners = undefined;
					notifyListeners = doNothing;
				} else if (additionalListeners?.size) {
					notifyListeners = notifyAllListeners;
				} else {
					notifyListeners = firstListener;
				}
			};
		},
	};

	externalStores.set(signal, store as ExternalSignalStore<unknown>);
	return store;
}

function callListener(listener: () => void): void {
	listener();
}

function doNothing(): void {}

export function useSignal<T>(signal: WritableSignal<T>): [T, SignalSetter<T>];
export function useSignal<T>(
	signal: WritableSignal<T>,
	...rest: [slot?: symbol]
): [T, SignalSetter<T>] {
	const [, slot] = splitSlot(rest);
	const value = useSignalValueInternal<T>(signal, subSlot(slot, 'signal:value'));
	const setValue = useSetSignalInternal(signal, subSlot(slot, 'signal:setter'));

	return [value, setValue];
}

export function useSignalValue<T>(signal: WritableSignal<T>): T;
export function useSignalValue<T>(signal: ReadableSignal<T>): T;
export function useSignalValue<T>(signal: ReadableSignal<T>, ...rest: [slot?: symbol]): T {
	const [, slot] = splitSlot(rest);
	return useSignalValueInternal(signal, slot);
}

function useSignalValueInternal<T>(signal: ReadableSignal<T>, slot: symbol | undefined): T {
	const store = getExternalStore(signal);
	return useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
		subSlot(slot, 'value:store'),
	);
}

/** Returns a deferred snapshot while keeping the source subscription tear-free. */
export function useDeferredSignalValue<T>(signal: WritableSignal<T>): T;
export function useDeferredSignalValue<T>(signal: ReadableSignal<T>): T;
export function useDeferredSignalValue<T>(signal: ReadableSignal<T>, ...rest: [slot?: symbol]): T {
	const [, slot] = splitSlot(rest);
	return useDeferredValue(
		useSignalValueInternal(signal, subSlot(slot, 'deferred:value')),
		subSlot(slot, 'deferred'),
	);
}

/** Subscribes to a memoized slice and skips renders while the selected value is `Object.is` equal. */
export function useSignalSelector<T, Selected>(
	signal: WritableSignal<T>,
	selector: (value: T) => Selected,
): Selected;
export function useSignalSelector<T, Selected>(
	signal: ReadableSignal<T>,
	selector: (value: T) => Selected,
): Selected;
export function useSignalSelector<T, Selected>(
	signal: ReadableSignal<T>,
	selector: (value: T) => Selected,
	...rest: [slot?: symbol]
): Selected {
	const [, slot] = splitSlot(rest);
	const selected = useMemo(
		() => createComputed(() => selector(signal())),
		[signal, selector],
		subSlot(slot, 'selector:memo'),
	);
	return useSignalValueInternal(selected, subSlot(slot, 'selector:value'));
}

export function useSetSignal<T>(signal: WritableSignal<T>): SignalSetter<T>;
export function useSetSignal<T>(
	signal: WritableSignal<T>,
	...rest: [slot?: symbol]
): SignalSetter<T> {
	const [, slot] = splitSlot(rest);
	return useSetSignalInternal(signal, slot);
}

function useSetSignalInternal<T>(
	signal: WritableSignal<T>,
	slot: symbol | undefined,
): SignalSetter<T> {
	return useCallback(
		(val: T | ((previous: T) => T)) => {
			if (typeof val === 'function') {
				signal((val as (oldVal: T) => T)(signal()));
			} else {
				signal(val);
			}
		},
		[signal],
		subSlot(slot, 'setter'),
	);
}

function optionalDeps(user: unknown[], fallback: DependencyList): unknown[] {
	const deps = user[0] as DependencyList | undefined;
	return (deps === undefined ? fallback : deps) as unknown[];
}

/** Runs a side effect that depends on Alien Signals, after the client commit. */
export function useSignalEffect(fn: SignalEffectCallback, deps?: DependencyList): void;
export function useSignalEffect(
	fn: SignalEffectCallback,
	...rest: [deps?: DependencyList | symbol, slot?: symbol]
): void {
	const [user, slot] = splitSlot(rest);
	useEffect(() => createEffect(fn), optionalDeps(user, [fn]), subSlot(slot, 'effect'));
}

function useSignalRevision(signals: SignalEffectDependencies, slot: symbol | undefined): number {
	const revision = useMemo(
		() =>
			createComputed<number>((previous = -1) => {
				for (const signal of signals) signal();
				return previous + 1;
			}),
		[signals],
		subSlot(slot, 'revision:memo'),
	);
	return useSignalValueInternal(revision, subSlot(slot, 'revision:value'));
}

/** Runs signal-dependent work in the passive-effect phase. Keep `signals` referentially stable. */
export function useSignalPassiveEffect(
	signals: SignalEffectDependencies,
	fn: SignalEffectCallback,
	deps?: DependencyList,
): void;
export function useSignalPassiveEffect(
	signals: SignalEffectDependencies,
	fn: SignalEffectCallback,
	...rest: [deps?: DependencyList | symbol, slot?: symbol]
): void {
	const [user, slot] = splitSlot(rest);
	const revision = useSignalRevision(signals, subSlot(slot, 'passive'));
	useEffect(fn, [revision, ...optionalDeps(user, [])], subSlot(slot, 'passive:effect'));
}

/** Runs signal-dependent work in the layout-effect phase. Keep `signals` referentially stable. */
export function useSignalLayoutEffect(
	signals: SignalEffectDependencies,
	fn: SignalEffectCallback,
	deps?: DependencyList,
): void;
export function useSignalLayoutEffect(
	signals: SignalEffectDependencies,
	fn: SignalEffectCallback,
	...rest: [deps?: DependencyList | symbol, slot?: symbol]
): void {
	const [user, slot] = splitSlot(rest);
	const revision = useSignalRevision(signals, subSlot(slot, 'layout'));
	useLayoutEffect(fn, [revision, ...optionalDeps(user, [])], subSlot(slot, 'layout:effect'));
}

/** Runs signal-dependent insertion work before DOM mutations. Keep `signals` referentially stable. */
export function useSignalInsertionEffect(
	signals: SignalEffectDependencies,
	fn: SignalEffectCallback,
	deps?: DependencyList,
): void;
export function useSignalInsertionEffect(
	signals: SignalEffectDependencies,
	fn: SignalEffectCallback,
	...rest: [deps?: DependencyList | symbol, slot?: symbol]
): void {
	const [user, slot] = splitSlot(rest);
	const revision = useSignalRevision(signals, subSlot(slot, 'insertion'));
	useInsertionEffect(fn, [revision, ...optionalDeps(user, [])], subSlot(slot, 'insertion:effect'));
}

/**
 * Starts an Alien Signals effect scope after the client commit and stops it on
 * replacement or unmount. The returned stop function is stable and stops only
 * the scope that is currently active.
 */
export function useSignalScope(callback: () => void, deps?: DependencyList): () => void;
export function useSignalScope(
	callback: () => void,
	...rest: [deps?: DependencyList | symbol, slot?: symbol]
): () => void {
	const [user, slot] = splitSlot(rest);
	const activeScope = useRef<(() => void) | undefined>(undefined, subSlot(slot, 'scope:active'));
	const stopScope = useCallback(() => activeScope.current?.(), [], subSlot(slot, 'scope:stop'));

	useEffect(
		() => {
			const dispose = createSignalScope(callback);
			let active = true;
			const stopOnce = () => {
				if (!active) return;
				active = false;
				dispose();
				if (activeScope.current === stopOnce) activeScope.current = undefined;
			};

			activeScope.current = stopOnce;
			return stopOnce;
		},
		optionalDeps(user, [callback]),
		subSlot(slot, 'scope:effect'),
	);

	return stopScope;
}

export function useComputed<T>(getter: () => T, deps: DependencyList): T;
export function useComputed<T>(getter: () => T, ...rest: [deps: DependencyList, slot?: symbol]): T {
	const [user, slot] = splitSlot(rest);
	const computed = useMemo(
		() => createComputed(getter),
		user[0] as unknown[],
		subSlot(slot, 'computed:memo'),
	);
	return useSignalValueInternal(computed, subSlot(slot, 'computed:value'));
}
