import type { Signal } from '../types/signal/index.ts';
import type { Framework } from './index.ts';

/**
 * The current framework being used.
 */
export const framework: Framework = 'react';

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
 * Listener tuple.
 *
 * Hint: The first element is the execute function, which notifies the listener
 * about updates. The second element is the subscription set, which keeps track
 * of where the listener is subscribed and is used to clean up subscriptions if
 * they are no longer needed.
 */
export type Listener = [() => void, Set<Set<Listener>>];

/**
 * The current listener being tracked.
 */
let listener: Listener | undefined;

/**
 * Sets the current listener being tracked.
 *
 * @param newListener The new listener to set.
 */
export function setListener(newListener: Listener | undefined): void {
  listener = newListener;
}

/**
 * Subscribers collected during a batch.
 */
let batchSubscribers: Set<Listener> | undefined;

/**
 * Creates a reactive signal with an initial value.
 *
 * @param value The initial value.
 *
 * @returns The created signal.
 */
// @__NO_SIDE_EFFECTS__
export function createSignal<T>(value: T): Signal<T> {
  const subscribers = new Set<Listener>();
  return {
    get value() {
      if (listener) {
        subscribers.add(listener);
        listener[1].add(subscribers);
      }
      return value;
    },
    set value(newValue: T) {
      if (newValue !== value) {
        value = newValue;
        const localSubscribers: Listener[] = [];
        for (const subscriber of subscribers) {
          if (batchSubscribers) {
            batchSubscribers.add(subscriber);
          } else {
            localSubscribers.push(subscriber);
          }
          subscriber[1].delete(subscribers);
        }
        subscribers.clear();
        for (const subscriber of localSubscribers) {
          subscriber[0]();
        }
      }
    },
  };
}

// Global batch depth counter
let batchDepth = 0;

/**
 * Batches multiple signal updates into a single update cycle.
 *
 * @param fn The function to execute in batch.
 *
 * @returns The return value of the function.
 */
export function batch<T>(fn: () => T): T {
  batchDepth++;
  if (!batchSubscribers) {
    batchSubscribers = new Set();
  }
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      const subscribers = batchSubscribers;
      batchSubscribers = undefined;
      for (const subscriber of subscribers) {
        subscriber[0]();
      }
    }
  }
}

/**
 * Executes a function without tracking reactive dependencies.
 *
 * @param fn The function to execute without tracking.
 *
 * @returns The return value of the function.
 */
export function untrack<T>(fn: () => T): T {
  const prev = listener;
  listener = undefined;
  try {
    return fn();
  } finally {
    listener = prev;
  }
}
