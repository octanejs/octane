import { useEffect, useRef } from 'react'
import { formatHotkeySequence, getSequenceManager } from '@tanstack/hotkeys'
import { useDefaultHotkeysOptions } from './HotkeysProvider'
import { isRef } from './utils'
import type {
  HotkeyCallback,
  HotkeyCallbackContext,
  HotkeySequence,
  SequenceOptions,
  SequenceRegistrationHandle,
} from '@tanstack/hotkeys'

export interface UseHotkeySequenceOptions extends Omit<
  SequenceOptions,
  'target'
> {
  /**
   * The DOM element to attach the event listener to.
   * Can be a React ref, direct DOM element, or null.
   * Defaults to document.
   */
  target?:
    | React.RefObject<HTMLElement | null>
    | HTMLElement
    | Document
    | Window
    | null
}

/**
 * React hook for registering a keyboard shortcut sequence (Vim-style).
 *
 * This hook allows you to register multi-key sequences like 'g g' or 'd d'
 * that trigger when the full sequence is pressed within a timeout.
 *
 * Each step may include modifiers. You can chain the same modifier across
 * steps (e.g. `Shift+R` then `Shift+T`). Modifier-only keydown events (Shift,
 * Control, Alt, or Meta pressed alone) are ignored while matching—they do not
 * advance the sequence or reset progress.
 *
 * @param sequence - Array of hotkey strings that form the sequence
 * @param callback - Function to call when the sequence is completed
 * @param options - Options for the sequence behavior. `enabled: false` keeps the registration (visible in devtools)
 *   and only suppresses firing; the hook updates the existing handle instead of unregistering.
 *
 * @example
 * ```tsx
 * function VimEditor() {
 *   // 'g g' to go to top
 *   useHotkeySequence(['G', 'G'], () => {
 *     scrollToTop()
 *   })
 *
 *   // 'd d' to delete line
 *   useHotkeySequence(['D', 'D'], () => {
 *     deleteLine()
 *   })
 *
 *   // 'd i w' to delete inner word
 *   useHotkeySequence(['D', 'I', 'W'], () => {
 *     deleteInnerWord()
 *   }, { timeout: 500 })
 *
 *   // Same modifier on consecutive steps (bare Shift between chords is ignored)
 *   useHotkeySequence(['Shift+R', 'Shift+T'], () => {
 *     nextAction()
 *   })
 *
 *   return <div>...</div>
 * }
 * ```
 */
export function useHotkeySequence(
  sequence: HotkeySequence,
  callback: HotkeyCallback,
  options: UseHotkeySequenceOptions = {},
): void {
  const mergedOptions = {
    ...useDefaultHotkeysOptions().hotkeySequence,
    ...options,
  } as UseHotkeySequenceOptions

  const manager = getSequenceManager()

  // Stable ref for registration handle
  const registrationRef = useRef<SequenceRegistrationHandle | null>(null)

  // Refs to capture current values for use in effect without adding dependencies
  const callbackRef = useRef(callback)
  const optionsRef = useRef(mergedOptions)
  const managerRef = useRef(manager)
  const sequenceRef = useRef(sequence)

  // Update refs on every render
  callbackRef.current = callback
  optionsRef.current = mergedOptions
  managerRef.current = manager
  sequenceRef.current = sequence

  // Track previous target and sequence to detect changes requiring re-registration
  const prevTargetRef = useRef<HTMLElement | Document | Window | null>(null)
  const prevSequenceRef = useRef<string | null>(null)

  // Normalize to hotkey sequence string (join with spaces)
  const hotkeySequenceString = formatHotkeySequence(sequence)

  // Extract options without target (target is handled separately)
  const { target: _target, ...optionsWithoutTarget } = mergedOptions

  useEffect(() => {
    if (sequenceRef.current.length === 0) {
      if (registrationRef.current?.isActive) {
        registrationRef.current.unregister()
        registrationRef.current = null
      }
      prevTargetRef.current = null
      prevSequenceRef.current = null
      return
    }

    // Resolve target inside the effect so refs are already attached after mount
    const resolvedTarget = isRef(optionsRef.current.target)
      ? optionsRef.current.target.current
      : (optionsRef.current.target ??
        (typeof document !== 'undefined' ? document : null))

    // Skip if no valid target (SSR or ref still null)
    if (!resolvedTarget) {
      if (registrationRef.current?.isActive) {
        registrationRef.current.unregister()
        registrationRef.current = null
      }
      prevTargetRef.current = null
      prevSequenceRef.current = null
      return
    }

    // Check if we need to re-register (target or sequence changed)
    const targetChanged =
      prevTargetRef.current !== null && prevTargetRef.current !== resolvedTarget
    const sequenceChanged =
      prevSequenceRef.current !== null &&
      prevSequenceRef.current !== hotkeySequenceString

    // If we have an active registration and target/sequence changed, unregister first
    if (
      registrationRef.current?.isActive &&
      (targetChanged || sequenceChanged)
    ) {
      registrationRef.current.unregister()
      registrationRef.current = null
    }

    // Register if needed (no active registration)
    if (!registrationRef.current || !registrationRef.current.isActive) {
      registrationRef.current = managerRef.current.register(
        sequenceRef.current,
        (event, context) => callbackRef.current(event, context),
        {
          ...optionsRef.current,
          target: resolvedTarget,
        },
      )
    }

    // Update tracking refs
    prevTargetRef.current = resolvedTarget
    prevSequenceRef.current = hotkeySequenceString

    // Cleanup on unmount
    return () => {
      if (registrationRef.current?.isActive) {
        registrationRef.current.unregister()
        registrationRef.current = null
      }
    }
  }, [hotkeySequenceString])

  // Sync callback and options on EVERY render (outside useEffect)
  if (registrationRef.current?.isActive) {
    registrationRef.current.callback = (
      event: KeyboardEvent,
      context: HotkeyCallbackContext,
    ) => callbackRef.current(event, context)
    registrationRef.current.setOptions(optionsWithoutTarget)
  }
}
