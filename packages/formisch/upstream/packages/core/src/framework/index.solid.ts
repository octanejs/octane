import { createSignal as signal } from 'solid-js';
import type { Signal } from '../types/signal/index.ts';
import type { Framework } from './index.ts';

export { createUniqueId as createId, untrack, batch } from 'solid-js';

/**
 * The current framework being used.
 */
export const framework: Framework = 'solid';

/**
 * Creates a reactive signal with an initial value.
 *
 * @param initialValue The initial value.
 *
 * @returns The created signal.
 */
// @__NO_SIDE_EFFECTS__
export function createSignal<T>(initialValue: T): Signal<T> {
  const [getSignal, setSignal] = signal<T>(initialValue);
  return {
    get value() {
      return getSignal();
    },
    set value(nextValue: T) {
      setSignal(() => nextValue);
    },
  };
}
