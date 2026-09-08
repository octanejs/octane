import { signal } from '@angular/core';
import type { Signal } from '../types/signal/index.ts';
import type { Framework } from './index.ts';

export { untracked as untrack } from '@angular/core';

/**
 * The current framework being used.
 */
export const framework: Framework = 'angular';

/**
 * Creates a unique identifier string.
 *
 * @returns The unique identifier.
 */
// @__NO_SIDE_EFFECTS__
export function createId(): string {
  return Math.random().toString(36).slice(2);
}

/**
 * Creates a reactive signal with an initial value.
 *
 * @param initialValue The initial value.
 *
 * @returns The created signal.
 */
// @__NO_SIDE_EFFECTS__
export function createSignal<T>(initialValue: T): Signal<T> {
  const writableSignal = signal(initialValue);
  return {
    get value() {
      return writableSignal();
    },
    set value(nextValue: T) {
      writableSignal.set(nextValue);
    },
  };
}

/**
 * Batches multiple signal updates into a single update cycle. This is a
 * no-op in Angular as batching is handled automatically.
 *
 * @param fn The function to execute.
 *
 * @returns The return value of the function.
 */
export function batch<T>(fn: () => T): T {
  return fn();
}
