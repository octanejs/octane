import { useEffect, useRef } from 'octane';
import { HotkeyRecorder } from '@tanstack/hotkeys';
import { useDefaultHotkeysOptions } from './context';
import { useSelectorSlot } from './internal';
import type { Hotkey, HotkeyRecorderOptions } from '@tanstack/hotkeys';

const isRecordingSlot = Symbol.for('@octanejs/tanstack-hotkeys:useHotkeyRecorder:isRecording');
const recordedHotkeySlot = Symbol.for(
	'@octanejs/tanstack-hotkeys:useHotkeyRecorder:recordedHotkey',
);

// Upstream export name kept verbatim ("React"-prefixed) so ports from
// @tanstack/react-hotkeys only need to change the import specifier.
export interface ReactHotkeyRecorder {
	/** Whether recording is currently active */
	isRecording: boolean;
	/** The currently recorded hotkey (for live preview) */
	recordedHotkey: Hotkey | null;
	/** Start recording a new hotkey */
	startRecording: () => void;
	/** Stop recording (same as cancel) */
	stopRecording: () => void;
	/** Cancel recording without saving */
	cancelRecording: () => void;
}

/**
 * Octane hook for recording keyboard shortcuts.
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
export function useHotkeyRecorder(options: HotkeyRecorderOptions): ReactHotkeyRecorder {
	const mergedOptions = {
		...useDefaultHotkeysOptions().hotkeyRecorder,
		...options,
	} as HotkeyRecorderOptions;

	const recorderRef = useRef<HotkeyRecorder | null>(null);

	// Create recorder instance once
	if (!recorderRef.current) {
		recorderRef.current = new HotkeyRecorder(mergedOptions);
	}

	// Sync options on every render (same pattern as useHotkey)
	// This ensures callbacks always have access to latest values
	recorderRef.current.setOptions(mergedOptions);

	// Subscribe to recorder state using useSelector (same pattern as useHeldKeys)
	const isRecording = useSelectorSlot(
		recorderRef.current.store,
		(state) => state.isRecording,
		isRecordingSlot,
	);
	const recordedHotkey = useSelectorSlot(
		recorderRef.current.store,
		(state) => state.recordedHotkey,
		recordedHotkeySlot,
	);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			recorderRef.current?.destroy();
		};
	}, []);

	return {
		isRecording,
		recordedHotkey,
		startRecording: () => recorderRef.current?.start(),
		stopRecording: () => recorderRef.current?.stop(),
		cancelRecording: () => recorderRef.current?.cancel(),
	};
}
