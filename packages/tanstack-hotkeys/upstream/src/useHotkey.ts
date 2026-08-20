import { useEffect, useRef } from 'react'
import {
  detectPlatform,
  getHotkeyManager,
  normalizeRegisterableHotkey,
} from '@tanstack/hotkeys'
import { useDefaultHotkeysOptions } from './HotkeysProvider'
import { isRef } from './utils'
import type {
  HotkeyCallback,
  HotkeyOptions,
  HotkeyRegistrationHandle,
  RegisterableHotkey,
} from '@tanstack/hotkeys'

export interface UseHotkeyOptions extends Omit<HotkeyOptions, 'target'> {
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
 * React hook for registering a keyboard hotkey.
 *
 * Uses the singleton HotkeyManager for efficient event handling.
 * The callback receives both the keyboard event and a context object
 * containing the hotkey string and parsed hotkey.
 *
 * This hook syncs the callback and options on every render to avoid
 * stale closures. This means
 * callbacks that reference React state will always have access to
 * the latest values.
 *
 * @param hotkey - The hotkey string (e.g., 'Mod+S', 'Escape') or RawHotkey object (supports `mod` for cross-platform)
 * @param callback - The function to call when the hotkey is pressed
 * @param options - Options for the hotkey behavior. `enabled: false` keeps the registration (visible in devtools)
 *   and only suppresses firing; the hook updates the existing handle instead of unregistering.
 *
 * @example
 * ```tsx
 * function SaveButton() {
 *   const [count, setCount] = useState(0)
 *
 *   // Callback always has access to latest count value
 *   useHotkey('Mod+S', (event, { hotkey }) => {
 *     console.log(`Save triggered, count is ${count}`)
 *     handleSave()
 *   })
 *
 *   return <button onClick={() => setCount(c => c + 1)}>Count: {count}</button>
 * }
 * ```
 *
 * @example
 * ```tsx
 * function Modal({ isOpen, onClose }) {
 *   // enabled option is synced on every render
 *   useHotkey('Escape', () => {
 *     onClose()
 *   }, { enabled: isOpen })
 *
 *   if (!isOpen) return null
 *   return <div className="modal">...</div>
 * }
 * ```
 *
 * @example
 * ```tsx
 * function Editor() {
 *   const editorRef = useRef<HTMLDivElement>(null)
 *
 *   // Scoped to a specific element
 *   useHotkey('Mod+S', () => {
 *     save()
 *   }, { target: editorRef })
 *
 *   return <div ref={editorRef}>...</div>
 * }
 * ```
 */
export function useHotkey(
  hotkey: RegisterableHotkey,
  callback: HotkeyCallback,
  options: UseHotkeyOptions = {},
): void {
  const mergedOptions = {
    ...useDefaultHotkeysOptions().hotkey,
    ...options,
  } as UseHotkeyOptions

  const manager = getHotkeyManager()

  // Stable ref for registration handle
  const registrationRef = useRef<HotkeyRegistrationHandle | null>(null)

  // Refs to capture current values for use in effect without adding dependencies
  const callbackRef = useRef(callback)
  const optionsRef = useRef(mergedOptions)
  const managerRef = useRef(manager)

  // Update refs on every render
  callbackRef.current = callback
  optionsRef.current = mergedOptions
  managerRef.current = manager

  // Track previous target and hotkey to detect changes requiring re-registration
  const prevTargetRef = useRef<HTMLElement | Document | Window | null>(null)
  const prevHotkeyRef = useRef<string | null>(null)

  // Normalize to hotkey string
  const platform = mergedOptions.platform ?? detectPlatform()
  const hotkeyString = normalizeRegisterableHotkey(hotkey, platform)

  // Extract options without target (target is handled separately)
  const { target: _target, ...optionsWithoutTarget } = mergedOptions

  useEffect(() => {
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
      prevHotkeyRef.current = null
      return
    }

    // Check if we need to re-register (target or hotkey changed)
    const targetChanged =
      prevTargetRef.current !== null && prevTargetRef.current !== resolvedTarget
    const hotkeyChanged =
      prevHotkeyRef.current !== null && prevHotkeyRef.current !== hotkeyString

    // If we have an active registration and target/hotkey changed, unregister first
    if (registrationRef.current?.isActive && (targetChanged || hotkeyChanged)) {
      registrationRef.current.unregister()
      registrationRef.current = null
    }

    // Register if needed (no active registration)
    // Use refs to access current values without adding them to dependencies
    if (!registrationRef.current || !registrationRef.current.isActive) {
      registrationRef.current = managerRef.current.register(
        hotkeyString,
        callbackRef.current,
        {
          ...optionsRef.current,
          target: resolvedTarget,
        },
      )
    }

    // Update tracking refs
    prevTargetRef.current = resolvedTarget
    prevHotkeyRef.current = hotkeyString

    // Cleanup on unmount
    return () => {
      if (registrationRef.current?.isActive) {
        registrationRef.current.unregister()
        registrationRef.current = null
      }
    }
  }, [hotkeyString])

  // Sync callback and options on EVERY render (outside useEffect)
  // This avoids stale closures - the callback always has access to latest state
  if (registrationRef.current?.isActive) {
    registrationRef.current.callback = callback
    registrationRef.current.setOptions(optionsWithoutTarget)
  }
}
