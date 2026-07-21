import { getKeyStateTracker } from '@tanstack/hotkeys';
import type { IndividualKey } from '@tanstack/hotkeys';
import { useSelectorSlot } from './internal';

const keyHoldSlot = Symbol.for('@octanejs/tanstack-hotkeys:useKeyHold');

/**
 * Octane hook that returns whether a specific key is currently being held.
 *
 * This hook uses `useSelector` from `@octanejs/tanstack-store` to subscribe
 * to the global KeyStateTracker and uses a selector to determine if
 * the specified key is held.
 *
 * @param key - The key to check (e.g., 'Shift', 'Control', 'A')
 * @returns True if the key is currently held down
 *
 * @example
 * ```tsx
 * function ShiftIndicator() {
 *   const isShiftHeld = useKeyHold('Shift')
 *
 *   return (
 *     <div style={{ opacity: isShiftHeld ? 1 : 0.5 }}>
 *       {isShiftHeld ? 'Shift is pressed!' : 'Press Shift'}
 *     </div>
 *   )
 * }
 * ```
 */
export function useKeyHold(key: IndividualKey): boolean {
	const tracker = getKeyStateTracker();
	const normalizedKey = key.toLowerCase();

	return useSelectorSlot(
		tracker.store,
		(state) => state.heldKeys.some((heldKey) => heldKey.toLowerCase() === normalizedKey),
		keyHoldSlot,
	);
}
