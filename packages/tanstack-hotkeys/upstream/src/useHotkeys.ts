import { useEffect, useRef } from 'react'
import {
  detectPlatform,
  getHotkeyManager,
  normalizeRegisterableHotkey,
} from '@tanstack/hotkeys'
import { useDefaultHotkeysOptions } from './HotkeysProvider'
import { isRef } from './utils'
import type { UseHotkeyOptions } from './useHotkey'
import type {
  Hotkey,
  HotkeyCallback,
  HotkeyRegistrationHandle,
  RegisterableHotkey,
} from '@tanstack/hotkeys'

/**
 * A single hotkey definition for use with `useHotkeys`.
 */
export interface UseHotkeyDefinition {
  /** The hotkey string (e.g., 'Mod+S', 'Escape') or RawHotkey object */
  hotkey: RegisterableHotkey
  /** The function to call when the hotkey is pressed */
  callback: HotkeyCallback
  /** Per-hotkey options (merged on top of commonOptions) */
  options?: UseHotkeyOptions
}

/**
 * React hook for registering multiple keyboard hotkeys at once.
 *
 * Uses the singleton HotkeyManager for efficient event handling.
 * Accepts a dynamic array of hotkey definitions, making it safe to use
 * with variable-length lists without violating the rules of hooks.
 *
 * Options are merged in this order:
 * HotkeysProvider defaults < commonOptions < per-definition options
 *
 * Callbacks and options are synced on every render to avoid stale closures.
 *
 * @param hotkeys - Array of hotkey definitions to register
 * @param commonOptions - Shared options applied to all hotkeys (overridden by per-definition options).
 *   Per-row `enabled: false` still registers that hotkey: `HotkeyManager` suppresses execution only (the row
 *   stays in the store and appears in TanStack Hotkeys devtools). Toggling `enabled` updates the existing handle
 *   via `setOptions` (no unregister/re-register churn).
 *
 * @example
 * ```tsx
 * function Editor() {
 *   useHotkeys([
 *     { hotkey: 'Mod+S', callback: () => save() },
 *     { hotkey: 'Mod+Z', callback: () => undo() },
 *     { hotkey: 'Escape', callback: () => close() },
 *   ])
 * }
 * ```
 *
 * @example
 * ```tsx
 * function MenuShortcuts({ items }) {
 *   // Dynamic hotkeys from data -- safe because it's a single hook call
 *   useHotkeys(
 *     items.map((item) => ({
 *       hotkey: item.shortcut,
 *       callback: item.action,
 *       options: { enabled: item.enabled },
 *     })),
 *     { preventDefault: true },
 *   )
 * }
 * ```
 */
export function useHotkeys(
  hotkeys: Array<UseHotkeyDefinition>,
  commonOptions: UseHotkeyOptions = {},
): void {
  type RegistrationRecord = {
    handle: HotkeyRegistrationHandle
    target: Document | HTMLElement | Window
  }

  const defaultOptions = useDefaultHotkeysOptions().hotkey
  const manager = getHotkeyManager()
  const platform =
    commonOptions.platform ?? defaultOptions?.platform ?? detectPlatform()

  const registrationsRef = useRef<Map<string, RegistrationRecord>>(new Map())
  const hotkeysRef = useRef(hotkeys)
  const hotkeyStringsRef = useRef<Array<Hotkey>>([])
  const commonOptionsRef = useRef(commonOptions)
  const defaultOptionsRef = useRef(defaultOptions)
  const managerRef = useRef(manager)

  const hotkeyStrings = hotkeys.map((def) =>
    normalizeRegisterableHotkey(def.hotkey, platform),
  )

  hotkeysRef.current = hotkeys
  hotkeyStringsRef.current = hotkeyStrings
  commonOptionsRef.current = commonOptions
  defaultOptionsRef.current = defaultOptions
  managerRef.current = manager

  useEffect(() => {
    const prevRegistrations = registrationsRef.current
    const nextRegistrations = new Map<string, RegistrationRecord>()

    const rows: Array<{
      registrationKey: string
      def: (typeof hotkeysRef.current)[number]
      hotkeyStr: Hotkey
      mergedOptions: UseHotkeyOptions
      resolvedTarget: Document | HTMLElement | Window
    }> = []

    for (let i = 0; i < hotkeysRef.current.length; i++) {
      const def = hotkeysRef.current[i]!
      const hotkeyStr = hotkeyStringsRef.current[i]!
      const mergedOptions = {
        ...defaultOptionsRef.current,
        ...commonOptionsRef.current,
        ...def.options,
      } as UseHotkeyOptions

      const resolvedTarget = isRef(mergedOptions.target)
        ? mergedOptions.target.current
        : (mergedOptions.target ??
          (typeof document !== 'undefined' ? document : null))

      if (!resolvedTarget) {
        continue
      }

      const registrationKey = `${i}:${hotkeyStr}`
      rows.push({
        registrationKey,
        def,
        hotkeyStr,
        mergedOptions,
        resolvedTarget,
      })
    }

    const nextKeys = new Set(rows.map((r) => r.registrationKey))

    for (const [key, record] of prevRegistrations) {
      if (!nextKeys.has(key) && record.handle.isActive) {
        record.handle.unregister()
      }
    }

    for (const row of rows) {
      const { registrationKey, def, hotkeyStr, mergedOptions, resolvedTarget } =
        row

      const existing = prevRegistrations.get(registrationKey)
      if (existing?.handle.isActive && existing.target === resolvedTarget) {
        nextRegistrations.set(registrationKey, existing)
        continue
      }

      if (existing?.handle.isActive) {
        existing.handle.unregister()
      }

      const handle = managerRef.current.register(hotkeyStr, def.callback, {
        ...mergedOptions,
        target: resolvedTarget,
      })
      nextRegistrations.set(registrationKey, {
        handle,
        target: resolvedTarget,
      })
    }

    registrationsRef.current = nextRegistrations
  })

  useEffect(() => {
    return () => {
      for (const { handle } of registrationsRef.current.values()) {
        if (handle.isActive) {
          handle.unregister()
        }
      }
      registrationsRef.current = new Map()
    }
  }, [])

  // Sync callbacks and options on EVERY render (outside useEffect)
  for (let i = 0; i < hotkeys.length; i++) {
    const def = hotkeys[i]!
    const hotkeyStr = hotkeyStrings[i]!
    const registrationKey = `${i}:${hotkeyStr}`
    const handle = registrationsRef.current.get(registrationKey)?.handle

    if (handle?.isActive) {
      handle.callback = def.callback
      const mergedOptions = {
        ...defaultOptions,
        ...commonOptions,
        ...def.options,
      } as UseHotkeyOptions
      const { target: _target, ...optionsWithoutTarget } = mergedOptions
      handle.setOptions(optionsWithoutTarget)
    }
  }
}
