import { useSelector } from '@tanstack/react-store'
import { getKeyStateTracker } from '@tanstack/hotkeys'

/**
 * React hook that returns a map of currently held key names to their physical `event.code` values.
 *
 * This is useful for debugging which physical key was pressed (e.g. distinguishing
 * left vs right Shift via "ShiftLeft" / "ShiftRight").
 *
 * @returns Record mapping normalized key names to their `event.code` values
 *
 * @example
 * ```tsx
 * function KeyDebugDisplay() {
 *   const heldKeys = useHeldKeys()
 *   const heldCodes = useHeldKeyCodes()
 *
 *   return (
 *     <div>
 *       {heldKeys.map((key) => (
 *         <kbd key={key}>
 *           {key} <small>{heldCodes[key]}</small>
 *         </kbd>
 *       ))}
 *     </div>
 *   )
 * }
 * ```
 */
export function useHeldKeyCodes(): Record<string, string> {
  const tracker = getKeyStateTracker()
  return useSelector(tracker.store, (state) => state.heldCodes)
}
