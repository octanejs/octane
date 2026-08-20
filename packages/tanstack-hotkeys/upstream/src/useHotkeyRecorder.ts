import { useEffect, useRef } from 'react'
import { useSelector } from '@tanstack/react-store'
import { HotkeyRecorder } from '@tanstack/hotkeys'
import { useDefaultHotkeysOptions } from './HotkeysProvider'
import type { Hotkey, HotkeyRecorderOptions } from '@tanstack/hotkeys'

export interface ReactHotkeyRecorder {
  /** Whether recording is currently active */
  isRecording: boolean
  /** The currently recorded hotkey (for live preview) */
  recordedHotkey: Hotkey | null
  /** Start recording a new hotkey */
  startRecording: () => void
  /** Stop recording (same as cancel) */
  stopRecording: () => void
  /** Cancel recording without saving */
  cancelRecording: () => void
}

/**
 * React hook for recording keyboard shortcuts.
 *
 * This hook provides a thin wrapper around the framework-agnostic `HotkeyRecorder`
 * class, managing all the complexity of capturing keyboard events, converting them
 * to hotkey strings, and handling edge cases like Escape to cancel or Backspace/Delete
 * to clear.
 *
 * @param options - Configuration options for the recorder
 * @returns An object with recording state and control functions
 *
 * @example
 * ```tsx
 * function ShortcutSettings() {
 *   const [shortcut, setShortcut] = useState<Hotkey>('Mod+S')
 *
 *   const recorder = useHotkeyRecorder({
 *     onRecord: (hotkey) => {
 *       setShortcut(hotkey)
 *     },
 *     onCancel: () => {
 *       console.log('Recording cancelled')
 *     },
 *   })
 *
 *   return (
 *     <div>
 *       <button onClick={recorder.startRecording}>
 *         {recorder.isRecording ? 'Recording...' : 'Edit Shortcut'}
 *       </button>
 *       {recorder.recordedHotkey && (
 *         <div>Recording: {recorder.recordedHotkey}</div>
 *       )}
 *     </div>
 *   )
 * }
 * ```
 */
export function useHotkeyRecorder(
  options: HotkeyRecorderOptions,
): ReactHotkeyRecorder {
  const mergedOptions = {
    ...useDefaultHotkeysOptions().hotkeyRecorder,
    ...options,
  } as HotkeyRecorderOptions

  const recorderRef = useRef<HotkeyRecorder | null>(null)

  // Create recorder instance once
  if (!recorderRef.current) {
    recorderRef.current = new HotkeyRecorder(mergedOptions)
  }

  // Sync options on every render (same pattern as useHotkey)
  // This ensures callbacks always have access to latest values
  recorderRef.current.setOptions(mergedOptions)

  // Subscribe to recorder state using useSelector (same pattern as useHeldKeys)
  const isRecording = useSelector(
    recorderRef.current.store,
    (state) => state.isRecording,
  )
  const recordedHotkey = useSelector(
    recorderRef.current.store,
    (state) => state.recordedHotkey,
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.destroy()
    }
  }, [])

  return {
    isRecording,
    recordedHotkey,
    startRecording: () => recorderRef.current?.start(),
    stopRecording: () => recorderRef.current?.stop(),
    cancelRecording: () => recorderRef.current?.cancel(),
  }
}
