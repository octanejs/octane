import { useEffect, useRef } from 'react'
import { formatHotkeySequence, getSequenceManager } from '@tanstack/hotkeys'
import { useDefaultHotkeysOptions } from './HotkeysProvider'
import { isRef } from './utils'
import type { UseHotkeySequenceOptions } from './useHotkeySequence'
import type {
  HotkeyCallback,
  HotkeySequence,
  SequenceRegistrationHandle,
} from '@tanstack/hotkeys'

/**
 * A single sequence definition for use with `useHotkeySequences`.
 */
export interface UseHotkeySequenceDefinition {
  /** Array of hotkey strings that form the sequence */
  sequence: HotkeySequence
  /** The function to call when the sequence is completed */
  callback: HotkeyCallback
  /** Per-sequence options (merged on top of commonOptions) */
  options?: UseHotkeySequenceOptions
}

/**
 * React hook for registering multiple keyboard shortcut sequences at once (Vim-style).
 *
 * Uses the singleton SequenceManager. Accepts a dynamic array of definitions so you can
 * register variable-length lists without violating the rules of hooks.
 *
 * Options are merged in this order:
 * HotkeysProvider defaults < commonOptions < per-definition options
 *
 * Callbacks and options are synced on every render to avoid stale closures.
 *
 * Definitions with an empty `sequence` are skipped (no registration).
 *
 * @param definitions - Array of sequence definitions to register
 * @param commonOptions - Shared options applied to all sequences (overridden by per-definition options).
 *   Per-row `enabled: false` still registers that sequence: `SequenceManager` suppresses execution only (the row
 *   stays in the store and appears in TanStack Hotkeys devtools). Toggling `enabled` updates the existing handle
 *   via `setOptions` (no unregister/re-register churn).
 *
 * @example
 * ```tsx
 * function VimPalette() {
 *   useHotkeySequences([
 *     { sequence: ['G', 'G'], callback: () => scrollToTop() },
 *     { sequence: ['D', 'D'], callback: () => deleteLine() },
 *     { sequence: ['C', 'I', 'W'], callback: () => changeInnerWord(), options: { timeout: 500 } },
 *   ])
 * }
 * ```
 *
 * @example
 * ```tsx
 * function DynamicSequences({ items }) {
 *   useHotkeySequences(
 *     items.map((item) => ({
 *       sequence: item.chords,
 *       callback: item.action,
 *       options: { enabled: item.enabled },
 *     })),
 *     { preventDefault: true },
 *   )
 * }
 * ```
 */
export function useHotkeySequences(
  definitions: Array<UseHotkeySequenceDefinition>,
  commonOptions: UseHotkeySequenceOptions = {},
): void {
  type RegistrationRecord = {
    handle: SequenceRegistrationHandle
    target: Document | HTMLElement | Window
  }

  const defaultOptions = useDefaultHotkeysOptions().hotkeySequence
  const manager = getSequenceManager()

  const registrationsRef = useRef<Map<string, RegistrationRecord>>(new Map())
  const definitionsRef = useRef(definitions)
  const sequenceStringsRef = useRef<Array<string>>([])
  const commonOptionsRef = useRef(commonOptions)
  const defaultOptionsRef = useRef(defaultOptions)
  const managerRef = useRef(manager)

  const sequenceStrings = definitions.map((def) =>
    formatHotkeySequence(def.sequence),
  )

  definitionsRef.current = definitions
  sequenceStringsRef.current = sequenceStrings
  commonOptionsRef.current = commonOptions
  defaultOptionsRef.current = defaultOptions
  managerRef.current = manager

  useEffect(() => {
    const prevRegistrations = registrationsRef.current
    const nextRegistrations = new Map<string, RegistrationRecord>()

    const rows: Array<{
      registrationKey: string
      def: (typeof definitionsRef.current)[number]
      seq: HotkeySequence
      seqStr: string
      mergedOptions: UseHotkeySequenceOptions
      resolvedTarget: Document | HTMLElement | Window
    }> = []

    for (let i = 0; i < definitionsRef.current.length; i++) {
      const def = definitionsRef.current[i]!
      const seqStr = sequenceStringsRef.current[i]!
      const seq = def.sequence
      if (seq.length === 0) {
        continue
      }

      const mergedOptions = {
        ...defaultOptionsRef.current,
        ...commonOptionsRef.current,
        ...def.options,
      } as UseHotkeySequenceOptions

      const resolvedTarget = isRef(mergedOptions.target)
        ? mergedOptions.target.current
        : (mergedOptions.target ??
          (typeof document !== 'undefined' ? document : null))

      if (!resolvedTarget) {
        continue
      }

      const registrationKey = `${i}:${seqStr}`
      rows.push({
        registrationKey,
        def,
        seq,
        seqStr,
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
      const { registrationKey, def, seq, mergedOptions, resolvedTarget } = row

      const existing = prevRegistrations.get(registrationKey)
      if (existing?.handle.isActive && existing.target === resolvedTarget) {
        nextRegistrations.set(registrationKey, existing)
        continue
      }

      if (existing?.handle.isActive) {
        existing.handle.unregister()
      }

      const handle = managerRef.current.register(seq, def.callback, {
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

  for (let i = 0; i < definitions.length; i++) {
    const def = definitions[i]!
    const seqStr = sequenceStrings[i]!
    const registrationKey = `${i}:${seqStr}`
    const handle = registrationsRef.current.get(registrationKey)?.handle

    if (handle?.isActive && def.sequence.length > 0) {
      handle.callback = def.callback
      const mergedOptions = {
        ...defaultOptions,
        ...commonOptions,
        ...def.options,
      } as UseHotkeySequenceOptions
      const { target: _target, ...optionsWithoutTarget } = mergedOptions
      handle.setOptions(optionsWithoutTarget)
    }
  }
}
