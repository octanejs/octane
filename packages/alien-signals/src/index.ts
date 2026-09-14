import {
	computed as alienComputed,
	effect as alienEffect,
	effectScope as alienEffectScope,
	signal as alienSignal,
	startBatch,
	endBatch,
	trigger as alienTrigger,
} from 'alien-signals';
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useSyncExternalStore,
} from 'octane';
import { splitSlot, subSlot } from './internal';

export interface ReadableSignal<T> {
	(): T;
}

export interface WritableSignal<T> extends ReadableSignal<T> {
	(value: T | ((previous: T) => T)): void;
}

export type DependencyList = readonly unknown[];
export type SignalSetter<T> = (value: T | ((previous: T) => T)) => void;
export type SignalEffectCallback = () => void | (() => void);
export type SignalEffectDependencies = readonly ReadableSignal<unknown>[];

interface CoreWritableSignal<T> extends ReadableSignal<T> {
	(value: T): void;
}

// Keep the binding's direct updater extension while hook setters also accept
// unwrapped core signals and store function-valued results without invoking them.
const coreSignals = new WeakMap<ReadableSignal<unknown>, ReadableSignal<unknown>>();

export function createSignal<T>(initialValue: T): WritableSignal<T> {
	const source = alienSignal(initialValue);
	const signal = ((...args: [] | [T | ((previous: T) => T)]) => {
		if (args.length === 0) return source();
		const value = args[0];
		source(typeof value === 'function' ? (value as (previous: T) => T)(source()) : value);
	}) as WritableSignal<T>;
	coreSignals.set(signal, source);
	return signal;
}

export function createComputed<T>(compute: (previousValue?: T) => T): ReadableSignal<T> {
	return alienComputed(compute);
}

export function createEffect<T>(run: () => T): () => void {
	return alienEffect(() => {
		const cleanup = run();
		// Older consumers may return an incidental value. Only functions own cleanup.
		return typeof cleanup === 'function' ? () => cleanup() : undefined;
	});
}

export function createSignalScope<T>(callback: () => T): () => void {
	return alienEffectScope(callback);
}

/** Run writes as one propagation batch, including nested and throwing callbacks. */
export function batch<T>(callback: () => T): T {
	startBatch();
	try {
		return callback();
	} finally {
		endBatch();
	}
}

export function trigger(signalOrCollector: ReadableSignal<unknown>): void {
	alienTrigger(signalOrCollector);
}

interface ExternalSignalStore<T> {
	getSnapshot: () => T;
	subscribe: (notify: () => void) => () => void;
}

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

export function useSignal<T>(
	signal: CoreWritableSignal<T>,
): [T, (value: T | ((previous: T) => T)) => void];
export function useSignal<T>(
	signal: CoreWritableSignal<T>,
	...rest: [slot?: symbol]
): [T, (value: T | ((previous: T) => T)) => void] {
	const [, slot] = splitSlot(rest);
	return [
		useSignalValueInternal<T>(signal, subSlot(slot, 'signal:value')),
		useSetSignalInternal(signal, subSlot(slot, 'signal:setter')),
	];
}

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

export function useDeferredSignalValue<T>(signal: ReadableSignal<T>): T;
export function useDeferredSignalValue<T>(signal: ReadableSignal<T>, ...rest: [slot?: symbol]): T {
	const [, slot] = splitSlot(rest);
	const value = useSignalValueInternal(signal, subSlot(slot, 'deferred:value'));
	return useDeferredValue(value, subSlot(slot, 'deferred:snapshot'));
}

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

export function useSetSignal<T>(
	signal: CoreWritableSignal<T>,
): (value: T | ((previous: T) => T)) => void;
export function useSetSignal<T>(
	signal: CoreWritableSignal<T>,
	...rest: [slot?: symbol]
): (value: T | ((previous: T) => T)) => void {
	const [, slot] = splitSlot(rest);
	return useSetSignalInternal(signal, slot);
}

function useSetSignalInternal<T>(
	signal: CoreWritableSignal<T>,
	slot: symbol | undefined,
): (value: T | ((previous: T) => T)) => void {
	const write = (coreSignals.get(signal) ?? signal) as CoreWritableSignal<T>;
	return useCallback(
		(value: T | ((previous: T) => T)) =>
			write(typeof value === 'function' ? (value as (previous: T) => T)(signal()) : value),
		[signal],
		subSlot(slot, 'setter'),
	);
}

export function useSignalEffect(run: SignalEffectCallback, deps?: DependencyList): void;
export function useSignalEffect(
	run: SignalEffectCallback,
	...rest: [deps?: DependencyList, slot?: symbol]
): void {
	const [user, slot] = splitSlot(rest);
	const deps = user[0] as DependencyList | undefined;
	useEffect(() => createEffect(run), (deps ?? [run]) as unknown[], subSlot(slot, 'effect'));
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

export function useSignalPassiveEffect(
	signals: SignalEffectDependencies,
	run: SignalEffectCallback,
	deps?: DependencyList,
): void;
export function useSignalPassiveEffect(
	signals: SignalEffectDependencies,
	run: SignalEffectCallback,
	...rest: [deps?: DependencyList, slot?: symbol]
): void {
	const [user, slot] = splitSlot(rest);
	const deps = user[0] as DependencyList | undefined;
	const revision = useSignalRevision(signals, subSlot(slot, 'passive:revision'));
	useEffect(run, [revision, ...(deps ?? [])], subSlot(slot, 'passive:effect'));
}

export function useSignalLayoutEffect(
	signals: SignalEffectDependencies,
	run: SignalEffectCallback,
	deps?: DependencyList,
): void;
export function useSignalLayoutEffect(
	signals: SignalEffectDependencies,
	run: SignalEffectCallback,
	...rest: [deps?: DependencyList, slot?: symbol]
): void {
	const [user, slot] = splitSlot(rest);
	const deps = user[0] as DependencyList | undefined;
	const revision = useSignalRevision(signals, subSlot(slot, 'layout:revision'));
	useLayoutEffect(run, [revision, ...(deps ?? [])], subSlot(slot, 'layout:effect'));
}

export function useSignalInsertionEffect(
	signals: SignalEffectDependencies,
	run: SignalEffectCallback,
	deps?: DependencyList,
): void;
export function useSignalInsertionEffect(
	signals: SignalEffectDependencies,
	run: SignalEffectCallback,
	...rest: [deps?: DependencyList, slot?: symbol]
): void {
	const [user, slot] = splitSlot(rest);
	const deps = user[0] as DependencyList | undefined;
	const revision = useSignalRevision(signals, subSlot(slot, 'insertion:revision'));
	useInsertionEffect(run, [revision, ...(deps ?? [])], subSlot(slot, 'insertion:effect'));
}

interface ScopeController {
	cancelled: boolean;
	current: (() => void) | undefined;
	disconnect: () => void;
	stop: () => void;
}

export function useSignalScope<T>(callback: () => T, deps?: DependencyList): () => void;
// OCTANE DIVERGENCE[alien-signals-use-signal-scope][runtime:5189801c40af28d9]
export function useSignalScope<T>(
	callback: () => T,
	...rest: [deps?: DependencyList, slot?: symbol]
): () => void {
	const [user, slot] = splitSlot(rest);
	const deps = user[0] as DependencyList | undefined;
	const controller = useMemo<ScopeController>(
		() => {
			const scope: ScopeController = {
				cancelled: false,
				current: undefined,
				disconnect: () => {
					const current = scope.current;
					scope.current = undefined;
					current?.();
				},
				stop: () => {
					scope.cancelled = true;
					scope.disconnect();
				},
			};
			return scope;
		},
		[],
		subSlot(slot, 'scope:controller'),
	);

	useEffect(
		() => {
			if (controller.cancelled) {
				return controller.disconnect;
			}
			const stopScope = createSignalScope(callback);
			if (controller.cancelled) {
				stopScope();
				return controller.disconnect;
			}
			controller.current = stopScope;
			return controller.disconnect;
		},
		(deps ?? [callback]) as unknown[],
		subSlot(slot, 'scope:effect'),
	);

	return controller.stop;
}

export function useComputed<T>(getter: () => T, deps: DependencyList): T;
export function useComputed<T>(getter: () => T, ...rest: [deps: DependencyList, slot?: symbol]): T {
	const [user, slot] = splitSlot(rest);
	const deps = user[0] as DependencyList;
	const computed = useMemo(
		() => createComputed(getter),
		deps as unknown[],
		subSlot(slot, 'computed:memo'),
	);
	return useSignalValueInternal(computed, subSlot(slot, 'computed:value'));
}
