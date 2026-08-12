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
 * - React hooks for subscribing to signal updates: [useSignal], [useSignalValue], [useSetSignal],
 *   [useSignalEffect] and [useSignalScope].
 * - Additional hooks like [useComputed] for easier use of computed signals.
 *
 * > **Note:** This library is built on top of [Alien Signals](https://github.com/stackblitz/alien-signals)
 * > and uses React's `useSyncExternalStore` for concurrency-safe re-renders.
 *
 * @module react-alien-signals
 */

import {
  computed as alienComputed,
  effect as alienEffect,
  effectScope as alienEffectScope,
  signal as alienSignal,
} from "alien-signals";
import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  useCallback,
  type DependencyList,
} from "react";

/**
 * WritableSignal is a function that returns the current signal value when called without arguments,
 * or updates the signal when passed a new value or updater function.
 *
 * @template T - The type of the signal value.
 */
export type WritableSignal<T> = {
  (): T;
  (value: T | ((prev: T) => T)): void;
};

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
export function createComputed<T>(fn: () => T): () => T {
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
export function createEffect<T>(fn: () => T): () => void {
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
export function createSignalScope<T>(callback: () => T): () => void {
  return alienEffectScope(callback);
}

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
): [T, (val: T | ((oldVal: T) => T)) => void] {
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
export function useSignalValue<T>(signal: WritableSignal<T>): T {
  const subscribe = useCallback(
    (callback: () => void) => {
      let isFirst = true;

      return createEffect(() => {
        signal(); // track dependencies

        if (isFirst) {
          isFirst = false;
        } else {
          callback(); // notify React only on actual changes
        }
      });
    },
    [signal],
  );

  return useSyncExternalStore(
    subscribe,
    () => signal(),
    () => signal(),
  );
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
): (val: T | ((oldVal: T) => T)) => void {
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
export function useSignalEffect(fn: () => void | (() => void)): void {
  useEffect(() => {
    let cleanup: void | (() => void);
    const stop = createEffect(() => {
      if (cleanup) cleanup();
      cleanup = fn();
    });

    return () => {
      if (cleanup) cleanup();
      stop();
    };
  }, [fn]);
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
export function useSignalScope<T>(callback: () => T): () => void {
  const stopScope = useMemo(() => createSignalScope(callback), [callback]);
  useEffect(() => () => stopScope(), [stopScope]);
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
