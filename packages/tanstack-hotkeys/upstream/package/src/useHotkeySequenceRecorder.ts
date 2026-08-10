import { useEffect, useRef } from 'react'
import { useSelector } from '@tanstack/react-store'
import { HotkeySequenceRecorder } from '@tanstack/hotkeys'
import { useDefaultHotkeysOptions } from './HotkeysProvider'
import type {
  HotkeySequence,
  HotkeySequenceRecorderOptions,
} from '@tanstack/hotkeys'

export interface ReactHotkeySequenceRecorder {
  /** Whether recording is currently active */
  isRecording: boolean
  /** Chords captured in the current session */
  steps: HotkeySequence
  /** Last committed sequence */
  recordedSequence: HotkeySequence | null
  startRecording: () => void
  stopRecording: () => void
  cancelRecording: () => void
  /** Commit current steps (no-op if empty) */
  commitRecording: () => void
}

/**
 * React hook for recording multi-chord sequences (Vim-style shortcuts).
 *
 * @param options - Configuration options for the hotkey sequence recorder
 */
export function useHotkeySequenceRecorder(
  options: HotkeySequenceRecorderOptions,
): ReactHotkeySequenceRecorder {
  const mergedOptions = {
    ...useDefaultHotkeysOptions().hotkeySequenceRecorder,
    ...options,
  } as HotkeySequenceRecorderOptions

  const recorderRef = useRef<HotkeySequenceRecorder | null>(null)

  if (!recorderRef.current) {
    recorderRef.current = new HotkeySequenceRecorder(mergedOptions)
  }

  recorderRef.current.setOptions(mergedOptions)

  const isRecording = useSelector(
    recorderRef.current.store,
    (state) => state.isRecording,
  )
  const steps = useSelector(recorderRef.current.store, (state) => state.steps)
  const recordedSequence = useSelector(
    recorderRef.current.store,
    (state) => state.recordedSequence,
  )

  useEffect(() => {
    return () => {
      recorderRef.current?.destroy()
    }
  }, [])

  return {
    isRecording,
    steps,
    recordedSequence,
    startRecording: () => recorderRef.current?.start(),
    stopRecording: () => recorderRef.current?.stop(),
    cancelRecording: () => recorderRef.current?.cancel(),
    commitRecording: () => recorderRef.current?.commit(),
  }
}
