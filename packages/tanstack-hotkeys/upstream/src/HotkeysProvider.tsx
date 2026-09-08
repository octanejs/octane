import React, { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type {
  HotkeyRecorderOptions,
  HotkeySequenceRecorderOptions,
} from '@tanstack/hotkeys'
import type { UseHotkeyOptions } from './useHotkey'
import type { UseHotkeySequenceOptions } from './useHotkeySequence'

export interface HotkeysProviderOptions {
  hotkey?: Partial<UseHotkeyOptions>
  hotkeyRecorder?: Partial<HotkeyRecorderOptions>
  hotkeySequence?: Partial<UseHotkeySequenceOptions>
  hotkeySequenceRecorder?: Partial<HotkeySequenceRecorderOptions>
}

interface HotkeysContextValue {
  defaultOptions: HotkeysProviderOptions
}

const HotkeysContext = createContext<HotkeysContextValue | null>(null)

export interface HotkeysProviderProps {
  children: ReactNode
  defaultOptions?: HotkeysProviderOptions
}

const DEFAULT_OPTIONS: HotkeysProviderOptions = {}

export function HotkeysProvider({
  children,
  defaultOptions = DEFAULT_OPTIONS,
}: HotkeysProviderProps) {
  const contextValue: HotkeysContextValue = useMemo(
    () => ({
      defaultOptions,
    }),
    [defaultOptions],
  )

  return (
    // eslint-disable-next-line @eslint-react/no-context-provider -- React 19+ only; we support React >=16.8
    <HotkeysContext.Provider value={contextValue}>
      {children}
    </HotkeysContext.Provider>
  )
}

export function useHotkeysContext() {
  // eslint-disable-next-line @eslint-react/no-use-context -- React 19+ only; we support React >=16.8
  return useContext(HotkeysContext)
}

export function useDefaultHotkeysOptions() {
  // eslint-disable-next-line @eslint-react/no-use-context -- React 19+ only; we support React >=16.8
  const context = useContext(HotkeysContext)
  return context?.defaultOptions ?? {}
}
