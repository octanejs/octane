import { getKeyStateTracker } from '@tanstack/hotkeys';
import { useSelectorSlot } from './internal';

const heldKeysSlot = Symbol.for('@octanejs/tanstack-hotkeys:useHeldKeys');

/**
 * Octane hook that returns an array of currently held keyboard keys.
 *
 * This hook uses `useSelector` from `@octanejs/tanstack-store` to subscribe
 * to the global KeyStateTracker and updates whenever keys are pressed
 * or released.
 *
 * @returns Array of currently held key names
 *
 * @example
 * ```tsx
 * function KeyDisplay() {
 *   const heldKeys = useHeldKeys()
 *
 *   return (
 *     <div>
 *       Currently pressed: {heldKeys.join(' + ') || 'None'}
 *     </div>
 *   )
 * }
 * ```
 */
export function useHeldKeys(): Array<string> {
	const tracker = getKeyStateTracker();
	return useSelectorSlot(tracker.store, (state) => state.heldKeys, heldKeysSlot);
}
