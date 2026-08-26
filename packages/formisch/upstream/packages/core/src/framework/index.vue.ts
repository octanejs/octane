import type { Framework } from './index.ts';

export { shallowRef as createSignal } from 'vue';

/**
 * The current framework being used.
 */
export const framework: Framework = 'vue';

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
 * no-op in Vue as batching is handled automatically.
 *
 * @param fn The function to execute.
 *
 * @returns The return value of the function.
 */
export function batch<T>(fn: () => T): T {
  return fn();
}

/**
 * Executes a function without tracking reactive dependencies. This is a
 * no-op in Vue as untracking is not supported in Vue.
 *
 * @param fn The function to execute.
 *
 * @returns The return value of the function.
 */
export function untrack<T>(fn: () => T): T {
  return fn();
}
