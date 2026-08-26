import type { Framework } from './index.ts';

export { createSignal, untrack } from '@qwik.dev/core';

/**
 * The current framework being used.
 */
export const framework: Framework = 'qwik';

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
 * Batches multiple signal updates into a single update cycle. This is a
 * no-op in Qwik as batching is not needed.
 *
 * @param fn The function to execute.
 *
 * @returns The return value of the function.
 */
export function batch<T>(fn: () => T): T {
  return fn();
}
