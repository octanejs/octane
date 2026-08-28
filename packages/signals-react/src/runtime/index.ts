import {
	computed,
	Effect,
	effect as coreEffect,
	type EffectOptions,
	type Model,
	type ModelConstructor,
	type ReadonlySignal,
	signal,
	Signal,
	type SignalOptions,
} from '@preact/signals-core';
import {
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from 'octane';
import { splitSlot, subSlot } from '../internal';

const Empty: unknown[] = [];

const symDispose = (Symbol as { dispose?: symbol }).dispose || Symbol.for('Symbol.dispose');

interface EffectInstance {
	_sources: object | undefined;
	_debugCallback?: () => void;
	_start(): () => void;
	_callback(): void;
	_dispose(): void;
}

/**
 * Use this flag to represent a bare `useSignals` call that doesn't manually
 * close its effect store and relies on auto-closing when the next useSignals is
 * called or after a microtask
 */
const UNMANAGED = 0;
/**
 * Use this flag to represent a `useSignals` call that is manually closed by a
 * try/finally block in a component's render method.
 */
const MANAGED_COMPONENT = 1;
/**
 * Use this flag to represent a `useSignals` call that is manually closed by a
 * try/finally block in a hook body.
 */
const MANAGED_HOOK = 2;

type EffectStoreUsage = typeof UNMANAGED | typeof MANAGED_COMPONENT | typeof MANAGED_HOOK;

export interface EffectStore {
	readonly _usage: EffectStoreUsage;
	readonly effect: EffectInstance;
	subscribe(onStoreChange: () => void): () => void;
	getSnapshot(): number;
	_start(): void;
	f(): void;
	[symDispose](): void;
}

let currentStore: EffectStore | undefined;

function startComponentEffect(prevStore: EffectStore | undefined, nextStore: EffectStore) {
	const endEffect = startEffect(nextStore.effect);
	currentStore = nextStore;
	return finishComponentEffect.bind(nextStore, prevStore, endEffect);
}

function finishComponentEffect(
	this: EffectStore,
	prevStore: EffectStore | undefined,
	endEffect: () => void,
) {
	endEffect();
	currentStore = prevStore;
}

type RuntimeEffect = EffectInstance & {
	_start?: () => () => void;
	_callback?: () => void;
	_dispose?: () => void;
	S?: () => () => void;
	c?: () => void;
	d?: () => void;
	dispose?: () => void;
};

function startEffect(instance: EffectInstance): () => void {
	const runtime = instance as RuntimeEffect;
	const start = typeof runtime._start === 'function' ? runtime._start : runtime.S;
	if (typeof start !== 'function') {
		throw new Error('@octanejs/signals-react: Effect._start is missing');
	}
	return start.call(instance);
}

function assignEffectCallback(instance: EffectInstance, notify: () => void) {
	const runtime = instance as RuntimeEffect;
	if (
		typeof runtime._callback === 'function' ||
		Object.prototype.hasOwnProperty.call(runtime, '_callback')
	) {
		runtime._callback = notify;
	}
	if (typeof runtime.c === 'function' || Object.prototype.hasOwnProperty.call(runtime, 'c')) {
		runtime.c = notify;
	}
	if (runtime._callback !== notify && runtime.c !== notify) {
		runtime._callback = notify;
		runtime.c = notify;
	}
}

function disposeEffect(instance: EffectInstance) {
	const runtime = instance as RuntimeEffect;
	if (typeof runtime.dispose === 'function') {
		runtime.dispose();
		return;
	}
	if (typeof runtime._dispose === 'function') {
		runtime._dispose();
		return;
	}
	if (typeof runtime.d === 'function') {
		runtime.d();
	}
}

function createEffectInstance(componentName?: string): EffectInstance {
	const EffectCtor = Effect as unknown as {
		new (fn: () => void, options?: { name?: string }): EffectInstance;
	};
	return new EffectCtor(function bindEffect() {}, { name: componentName || 'Component' });
}

function createEffectStore(_usage: EffectStoreUsage, componentName?: string): EffectStore {
	let effectInstance: EffectInstance | undefined;
	let endEffect: (() => void) | undefined;
	let version = 0;
	let onChangeNotifyReact: (() => void) | undefined;
	// Published @preact/signals-core mangles Effect methods (`_start` → `S`,
	// `_callback` → `c`). `effect(fn)` still invokes `fn` with `this` bound to
	// the Effect instance, which is how the upstream React binding captures it.
	const unsubscribe = coreEffect(
		function bindEffect(this: EffectInstance) {
			effectInstance = this;
		},
		{ name: componentName || 'Component' },
	);
	const usedFallback = effectInstance == null;
	if (effectInstance == null) {
		effectInstance = createEffectInstance(componentName);
	}
	const trackingEffect = effectInstance;
	assignEffectCallback(trackingEffect, function notify() {
		version = (version + 1) | 0;
		if (onChangeNotifyReact) onChangeNotifyReact();
	});

	return {
		_usage,
		effect: trackingEffect,
		subscribe: function subscribe(onStoreChange) {
			onChangeNotifyReact = onStoreChange;
			return function unsubscribeStore() {
				version = (version + 1) | 0;
				onChangeNotifyReact = undefined;
				unsubscribe();
				if (usedFallback) disposeEffect(trackingEffect);
			};
		},
		getSnapshot: function getSnapshot() {
			return version;
		},
		_start: function start() {
			if (currentStore == undefined) {
				endEffect = startComponentEffect(undefined, this);
				return;
			}

			const prevUsage = currentStore._usage;
			const thisUsage = this._usage;

			if (
				(prevUsage == UNMANAGED && thisUsage == UNMANAGED) ||
				(prevUsage == UNMANAGED && thisUsage == MANAGED_COMPONENT)
			) {
				currentStore.f();
				endEffect = startComponentEffect(undefined, this);
			} else if (
				(prevUsage == MANAGED_COMPONENT && thisUsage == UNMANAGED) ||
				(prevUsage == MANAGED_HOOK && thisUsage == UNMANAGED)
			) {
				// Already captured by the current effect store.
			} else {
				endEffect = startComponentEffect(currentStore, this);
			}
		},
		f: function finish() {
			const end = endEffect;
			endEffect = undefined;
			end?.();
		},
		[symDispose]: function dispose() {
			this.f();
		},
	};
}

function noop() {}

function createEmptyEffectStore(): EffectStore {
	return {
		_usage: UNMANAGED,
		effect: {
			_sources: undefined,
			_callback: noop,
			_start: function start() {
				return noop;
			},
			_dispose: noop,
		},
		subscribe: function subscribe() {
			return noop;
		},
		getSnapshot: function getSnapshot() {
			return 0;
		},
		_start: noop,
		f: noop,
		[symDispose]: noop,
	};
}

const emptyEffectStore = createEmptyEffectStore();

const queueMicroTask = Promise.prototype.then.bind(Promise.resolve());

let finalCleanup: Promise<void> | undefined;
export function ensureFinalCleanup() {
	if (!finalCleanup) {
		finalCleanup = queueMicroTask(cleanupTrailingStore);
	}
}
function cleanupTrailingStore() {
	finalCleanup = undefined;
	currentStore?.f();
}

function useIsomorphicLayoutEffect(
	fn: () => void | (() => void),
	deps: readonly unknown[] | null | undefined,
	slot: symbol,
) {
	if (typeof window !== 'undefined') {
		useLayoutEffect(fn, deps as unknown[] | null | undefined, slot);
	} else {
		useEffect(fn, deps as unknown[] | null | undefined, slot);
	}
}

/**
 * OCTANE DIVERGENCE: wrapJsx is a gap. Octane has no jsx-runtime to monkeypatch,
 * so this returns the input unchanged.
 */
export function wrapJsx<T>(jsx: T): T {
	return jsx;
}

export function _useSignalsImplementation(
	_usage: EffectStoreUsage = UNMANAGED,
	componentName?: string,
	slot?: symbol,
): EffectStore {
	ensureFinalCleanup();

	const storeRef = useRef<EffectStore | undefined>(undefined, subSlot(slot, 'store'));
	if (storeRef.current == null) {
		if (typeof window === 'undefined') {
			storeRef.current = emptyEffectStore;
		} else {
			storeRef.current = createEffectStore(_usage, componentName);
		}
	}

	const store = storeRef.current;
	useSyncExternalStore(
		store.subscribe,
		store.getSnapshot,
		store.getSnapshot,
		subSlot(slot, 'sync'),
	);
	store._start();
	if (_usage === UNMANAGED) {
		useIsomorphicLayoutEffect(cleanupTrailingStore, undefined, subSlot(slot, 'cleanup'));
	}

	return store;
}

export function useSignals(
	usage?: EffectStoreUsage,
	componentName?: string,
	slot?: symbol,
): EffectStore;
export function useSignals(
	...rest: [usage?: EffectStoreUsage, componentName?: string, slot?: symbol]
): EffectStore {
	const [user, slot] = splitSlot(rest);
	const usage = (user[0] as EffectStoreUsage | undefined) ?? UNMANAGED;
	const componentName = user[1] as string | undefined;
	return _useSignalsImplementation(usage, componentName, slot);
}

export function useSignal<T>(value: T, options?: SignalOptions<T>, slot?: symbol): Signal<T>;
export function useSignal<T = undefined>(): Signal<T | undefined>;
export function useSignal<T>(...rest: [value?: T, options?: SignalOptions<T>, slot?: symbol]) {
	const [user, slot] = splitSlot(rest);
	const value = user[0] as T | undefined;
	const options = user[1] as SignalOptions<T> | undefined;
	return useMemo(
		function createSignal() {
			return signal<T | undefined>(value, options as SignalOptions);
		},
		Empty,
		subSlot(slot, 'signal'),
	);
}

export function useComputed<T>(compute: () => T, options?: SignalOptions<T>): ReadonlySignal<T>;
export function useComputed<T>(
	...rest: [compute: () => T, options?: SignalOptions<T>, slot?: symbol]
): ReadonlySignal<T> {
	const [user, slot] = splitSlot(rest);
	const compute = user[0] as () => T;
	const options = user[1] as SignalOptions<T> | undefined;
	const computeRef = useRef(compute, subSlot(slot, 'compute-ref'));
	computeRef.current = compute;
	return useMemo(
		function createComputed() {
			return computed<T>(function read() {
				return computeRef.current();
			}, options);
		},
		Empty,
		subSlot(slot, 'computed'),
	);
}

export function useSignalEffect(cb: () => void | (() => void), options?: EffectOptions): void;
export function useSignalEffect(
	...rest: [cb: () => void | (() => void), options?: EffectOptions, slot?: symbol]
): void {
	const [user, slot] = splitSlot(rest);
	const cb = user[0] as () => void | (() => void);
	const options = user[1] as EffectOptions | undefined;
	const callback = useRef(cb, subSlot(slot, 'effect-ref'));
	callback.current = cb;

	useEffect(
		function subscribe() {
			return coreEffect(function run() {
				return callback.current();
			}, options);
		},
		Empty,
		subSlot(slot, 'effect'),
	);
}

interface InternalModelConstructor<TModel, TArgs extends any[]> extends ModelConstructor<
	TModel,
	TArgs
> {
	(...args: TArgs): Model<TModel>;
}

export function useModel<TModel>(
	factory: ModelConstructor<TModel, []> | (() => Model<TModel>),
): Model<TModel>;
export function useModel<TModel>(
	...rest: [factory: ModelConstructor<TModel, []> | (() => Model<TModel>), slot?: symbol]
): Model<TModel> {
	const [user, slot] = splitSlot(rest);
	const factory = user[0] as InternalModelConstructor<TModel, []> | (() => Model<TModel>);
	const [inst] = useState(
		function createModel() {
			return factory();
		},
		subSlot(slot, 'model'),
	);
	useEffect(
		function disposeModel() {
			return inst[Symbol.dispose];
		},
		[inst],
		subSlot(slot, 'model-dispose'),
	);
	return inst;
}

// OCTANE DIVERGENCE: do not attach React $$typeof / type / props to
// Signal.prototype. Octane has no react.element, so a Signal is not a JSX text
// node. Read `.value` (or wrap with useSignals) instead.
void Signal;
