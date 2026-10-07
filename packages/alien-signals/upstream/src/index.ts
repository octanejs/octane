/**
 * React Alien Signals
 *
 * React Alien Signals is a TypeScript library that integrates Alien Signals with React,
 * providing concurrency-safe reactive state management using hooks. It offers writable signals,
 * computed signals, and reactive effects that seamlessly update React components without tearing.
 *
 * ## Features
 * - Create and update writable signals with [createSignal].
 * - Compute derived state with [createComputed].
 * - Run reactive side-effects with [createEffect].
 * - Manage effect lifecycles using [createSignalScope].
 * - React hooks for reading, selecting, deferring, and updating signal values.
 * - Signal effects aligned with React's insertion, layout, and passive phases.
 * - Effect scopes that start after commit and clean up on unmount.
 * - React automatically batches component renders from signal writes in the same event or task.
 * - Additional hooks like [useComputed] for easier use of computed signals.
 *
 * > **Note:** This library is built on top of [Alien Signals](https://github.com/stackblitz/alien-signals)
 * > and uses React's `useSyncExternalStore` for concurrency-safe re-renders.
 *
 * @module react-alien-signals
 */

import {
  computed as alienComputed,
  endBatch,
  effect as alienEffect,
  effectScope as alienEffectScope,
  signal as alienSignal,
  startBatch,
  trigger as alienTrigger,
} from "alien-signals";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type DependencyList,
} from "react";

/**
 * WritableSignal is a function that returns the current signal value when called without arguments,
 * or updates the signal when passed a new value. React hook setters additionally accept updater functions.
 *
 * @template T - The type of the signal value.
 */
export type ReadableSignal<T> = () => T;

export type WritableSignal<T> = {
  (): T;
  (value: T): void;
};

export type SignalSetter<T> = (value: T | ((previous: T) => T)) => void;

export type SignalEffectCallback = () => void | (() => void);
export type SignalEffectDependencies = readonly ReadableSignal<unknown>[];

/**
 * Creates a writable Alien Signal.
 *
 * @template T - The type of the signal value.
 * @param initialValue - The initial value of the signal.
 * @returns A writable signal.
 *
 * @example
 * ```tsx
 * const count = createSignal(0);
 * count(10); // updates count to 10
 * count(); // returns 10
 * ```
 */
export function createSignal<T>(initialValue: T): WritableSignal<T> {
  return alienSignal<T>(initialValue);
}

/**
 * Creates a computed Alien Signal based on a getter function.
 * Computed signals are read-only and update automatically when their dependencies change.
 *
 * @template T - The type of the computed value.
 * @param fn - A getter function returning the computed value.
 * @returns A computed signal.
 *
 * @example
 * ```tsx
 * const count = createSignal(1);
 * const double = createComputed(() => count() * 2);
 * ```
 */
export function createComputed<T>(fn: (previousValue?: T) => T): ReadableSignal<T> {
  return alienComputed(fn);
}

/**
 * Creates a reactive effect that automatically re-runs when its tracked signals update.
 *
 * @template T - The return type of the effect function (typically void).
 * @param fn - A function that will run whenever its tracked signals change.
 * @returns A stop function to cancel the effect.
 *
 * @example
 * ```tsx
 * const count = createSignal(1);
 * const stopEffect = createEffect(() => {
 *   console.log('Count is', count());
 * });
 *
 * // To stop the effect:
 * stopEffect();
 * ```
 */
export function createEffect(fn: SignalEffectCallback): () => void {
  return alienEffect(fn);
}

/**
 * Creates an effect scope that groups multiple reactive effects for lifecycle management.
 *
 * @template T - The return type of the callback.
 * @param callback - A function where effects can be created. All effects created within will be scoped.
 * @returns A stop function to cancel all effects within the scope.
 *
 * @example
 * ```tsx
 * const stopScope = createSignalScope(() => {
 *   createEffect(() => {
 *     console.log('Scoped effect');
 *   });
 * });
 *
 * // Later, stop all scoped effects:
 * stopScope();
 * ```
 */
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

/**
 * React hook that subscribes to a writable signal—returning its current value plus a setter function.
 * Internally uses React's `useSyncExternalStore` for concurrency-safe re-renders.
 *
 * @template T - The type of the signal value.
 * @param signal - The writable signal.
 * @returns A tuple of [currentValue, setValue].
 *
 * @example
 * ```tsx
 * const count = createSignal(0);
 * function Counter() {
 *   const [value, setValue] = useSignal(count);
 *   return <button onClick={() => setValue(value + 1)}>{value}</button>;
 * }
 * ```
 */
export function useSignal<T>(
  signal: WritableSignal<T>,
): [T, SignalSetter<T>] {
  const value = useSignalValue(signal);
  const setValue = useSetSignal(signal);

  return [value, setValue];
}

/**
 * React hook that subscribes to a readable Alien Signal (either writable or computed) and returns its current value.
 *
 * @template T - The type of the signal value.
 * @param signal - The readable signal.
 * @returns The current value of the signal.
 *
 * @example
 * ```tsx
 * const count = createSignal(0);
 * const double = createComputed(() => count() * 2);
 * function Display() {
 *   const countValue = useSignalValue(count);
 *   const doubleValue = useSignalValue(double);
 *   return <div>Count: {countValue}, Double: {doubleValue}</div>;
 * }
 * ```
 */
export function useSignalValue<T>(signal: WritableSignal<T>): T;
export function useSignalValue<T>(signal: ReadableSignal<T>): T;
export function useSignalValue<T>(signal: ReadableSignal<T>): T {
  const store = getExternalStore(signal);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

/** Returns a React-deferred snapshot while keeping the source subscription tear-free. */
export function useDeferredSignalValue<T>(signal: WritableSignal<T>): T;
export function useDeferredSignalValue<T>(signal: ReadableSignal<T>): T;
export function useDeferredSignalValue<T>(signal: ReadableSignal<T>): T {
  return useDeferredValue(useSignalValue(signal));
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
): Selected {
  const selected = useMemo(
    () => createComputed(() => selector(signal())),
    [signal, selector],
  );
  return useSignalValue(selected);
}

/**
 * React hook that returns only a setter function for a writable signal.
 * This is similar to Jotai's `useSetAtom` and can be helpful when you only need to update state.
 *
 * @template T - The type of the signal value.
 * @param signal - The writable signal.
 * @returns A setter function to update the signal.
 *
 * @example
 * ```tsx
 * const count = createSignal(0);
 * function IncrementButton() {
 *   const setCount = useSetSignal(count);
 *   return <button onClick={() => setCount((c) => c + 1)}>+1</button>;
 * }
 * ```
 */
export function useSetSignal<T>(
  signal: WritableSignal<T>,
): SignalSetter<T> {
  return useCallback(
    (val) => {
      if (typeof val === "function") {
        signal((val as (oldVal: T) => T)(signal()));
      } else {
        signal(val);
      }
    },
    [signal],
  );
}

/**
 * React hook for running a side effect that depends on Alien Signals.
 */
export function useSignalEffect(
  fn: SignalEffectCallback,
  deps: DependencyList = [fn],
): void {
  useEffect(() => createEffect(fn), deps);
}

function useSignalRevision(signals: SignalEffectDependencies): number {
  const revision = useMemo(
    () =>
      createComputed<number>((previous = -1) => {
        for (const signal of signals) signal();
        return previous + 1;
      }),
    [signals],
  );
  return useSignalValue(revision);
}

/** Runs signal-dependent work in React's passive-effect phase. Keep `signals` referentially stable. */
export function useSignalPassiveEffect(
  signals: SignalEffectDependencies,
  fn: SignalEffectCallback,
  deps: DependencyList = [],
): void {
  const revision = useSignalRevision(signals);
  useEffect(fn, [revision, ...deps]);
}

/** Runs signal-dependent work in React's layout-effect phase. Keep `signals` referentially stable. */
export function useSignalLayoutEffect(
  signals: SignalEffectDependencies,
  fn: SignalEffectCallback,
  deps: DependencyList = [],
): void {
  const revision = useSignalRevision(signals);
  useLayoutEffect(fn, [revision, ...deps]);
}

/** Runs signal-dependent insertion work before DOM mutations. Keep `signals` referentially stable. */
export function useSignalInsertionEffect(
  signals: SignalEffectDependencies,
  fn: SignalEffectCallback,
  deps: DependencyList = [],
): void {
  const revision = useSignalRevision(signals);
  useInsertionEffect(fn, [revision, ...deps]);
}

/**
 * React hook for managing an Alien Signals effect scope.
 * Effects created within this scope are automatically cleaned up when the component unmounts.
 *
 * @template T - The return type of the callback within the scope.
 * @param callback - A function that creates signal effects.
 * @returns A stop function to cancel the scoped effects.
 *
 * @example
 * ```tsx
 * function ScopedEffects() {
 *   const stopScope = useSignalScope(() => {
 *     createEffect(() => {
 *       console.log('Scoped effect:', someSignal());
 *     });
 *   });
 *
 *   // Optionally, you can stop the scope manually if needed:
 *   // useEffect(() => () => stopScope(), [stopScope]);
 *
 *   return null;
 * }
 * ```
 */
export function useSignalScope(
  callback: () => void,
  deps: DependencyList = [callback],
): () => void {
  const activeScope = useRef<(() => void) | undefined>(undefined);
  const stopScope = useCallback(() => activeScope.current?.(), []);

  useEffect(() => {
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
  }, deps);

  return stopScope;
}

export function useComputed<T>(
  getter: () => T,
  /**
   * Dependency array for values read inside `getter`.
   * Behaves like the dependency array of `useMemo` / `useEffect`.
   */
  deps: DependencyList,
): T {
  const computed = useMemo(() => createComputed(getter), deps);
  return useSignalValue(computed);
}
