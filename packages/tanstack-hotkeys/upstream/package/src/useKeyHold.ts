import { useSelector } from '@tanstack/react-store'
import { getKeyStateTracker } from '@tanstack/hotkeys'
import type { IndividualKey } from '@tanstack/hotkeys'

/**
 * React hook that returns whether a specific key is currently being held.
 *
 * This hook uses `useSelector` from `@tanstack/react-store` to subscribe
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
 *
 * @example
 * ```tsx
 * function ModifierIndicators() {
 *   const ctrl = useKeyHold('Control')
 *   const shift = useKeyHold('Shift')
 *   const alt = useKeyHold('Alt')
 *
 *   return (
 *     <div>
 *       <span style={{ opacity: ctrl ? 1 : 0.3 }}>Ctrl</span>
 *       <span style={{ opacity: shift ? 1 : 0.3 }}>Shift</span>
 *       <span style={{ opacity: alt ? 1 : 0.3 }}>Alt</span>
 *     </div>
 *   )
 * }
 * ```
 */
export function useKeyHold(key: IndividualKey): boolean {
  const tracker = getKeyStateTracker()
  const normalizedKey = key.toLowerCase()

  return useSelector(tracker.store, (state) =>
    state.heldKeys.some((heldKey) => heldKey.toLowerCase() === normalizedKey),
  )
}
