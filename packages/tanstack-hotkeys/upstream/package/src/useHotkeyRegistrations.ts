import { useSelector } from '@tanstack/react-store'
import {
  getHotkeyManager,
  getSequenceManager,
  toHotkeyRegistrationView,
} from '@tanstack/hotkeys'
import type {
  HotkeyRegistrationView,
  SequenceRegistrationView,
} from '@tanstack/hotkeys'

/**
 * Return type for useHotkeyRegistrations.
 */
export interface HotkeyRegistrationsResult {
  /** All registered hotkeys (public view, no callbacks) */
  hotkeys: Array<HotkeyRegistrationView>
  /** All registered sequences */
  sequences: Array<SequenceRegistrationView>
}

/**
 * React hook that reactively reads all hotkey and sequence registrations
 * from the singleton managers.
 *
 * This is a standalone hook that does NOT require the HotkeysProvider.
 * It subscribes to both HotkeyManager and SequenceManager stores and
 * re-renders when registrations change.
 *
 * @returns Object with `hotkeys` and `sequences` arrays
 *
 * @example
 * ```tsx
 * function ShortcutPalette() {
 *   const { hotkeys, sequences } = useHotkeyRegistrations()
 *
 *   return (
 *     <ul>
 *       {hotkeys.map((reg) => (
 *         <li key={reg.id}>
 *           {reg.options.meta?.name ?? reg.hotkey}
 *         </li>
 *       ))}
 *       {sequences.map((reg) => (
 *         <li key={reg.id}>
 *           {reg.options.meta?.name ?? reg.sequence.join(' ')}
 *         </li>
 *       ))}
 *     </ul>
 *   )
 * }
 * ```
 */
export function useHotkeyRegistrations(): HotkeyRegistrationsResult {
  const hotkeyManager = getHotkeyManager()
  const sequenceManager = getSequenceManager()

  const hotkeys = useSelector(hotkeyManager.registrations, (state) =>
    Array.from(state.values()).map(toHotkeyRegistrationView),
  )

  const sequences = useSelector(sequenceManager.registrations, (state) =>
    Array.from(state.values()),
  )

  return { hotkeys, sequences }
}
