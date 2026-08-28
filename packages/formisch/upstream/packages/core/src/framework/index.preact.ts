import type { Framework } from './index.ts';

export {
  signal as createSignal,
  untracked as untrack,
  batch,
} from '@preact/signals';

/**
 * The current framework being used.
 */
export const framework: Framework = 'preact';

/**
 * Creates a unique identifier string.
 *
 * @returns The unique identifier.
 */
// @__NO_SIDE_EFFECTS__
export function createId(): string {
  return Math.random().toString(36).slice(2);
}
