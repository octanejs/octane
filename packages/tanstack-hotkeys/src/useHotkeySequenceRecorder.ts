import { useEffect, useRef } from 'octane';
import { HotkeySequenceRecorder } from '@tanstack/hotkeys';
import { useDefaultHotkeysOptions } from './context';
import { useSelectorSlot } from './internal';
import type { HotkeySequence, HotkeySequenceRecorderOptions } from '@tanstack/hotkeys';

const isRecordingSlot = Symbol.for(
	'@octanejs/tanstack-hotkeys:useHotkeySequenceRecorder:isRecording',
);
const stepsSlot = Symbol.for('@octanejs/tanstack-hotkeys:useHotkeySequenceRecorder:steps');
const recordedSequenceSlot = Symbol.for(
	'@octanejs/tanstack-hotkeys:useHotkeySequenceRecorder:recordedSequence',
);

// Upstream export name kept verbatim ("React"-prefixed) so ports from
// @tanstack/react-hotkeys only need to change the import specifier.
export interface ReactHotkeySequenceRecorder {
	/** Whether recording is currently active */
	isRecording: boolean;
	/** Chords captured in the current session */
	steps: HotkeySequence;
	/** Last committed sequence */
	recordedSequence: HotkeySequence | null;
	startRecording: () => void;
	stopRecording: () => void;
	cancelRecording: () => void;
	/** Commit current steps (no-op if empty) */
	commitRecording: () => void;
}

/**
 * Octane hook for recording multi-chord sequences (Vim-style shortcuts).
 *
 * @param options - Configuration options for the hotkey sequence recorder
 */
export function useHotkeySequenceRecorder(
	options: HotkeySequenceRecorderOptions,
): ReactHotkeySequenceRecorder {
	const mergedOptions = {
		...useDefaultHotkeysOptions().hotkeySequenceRecorder,
		...options,
	} as HotkeySequenceRecorderOptions;

	const recorderRef = useRef<HotkeySequenceRecorder | null>(null);

	if (!recorderRef.current) {
		recorderRef.current = new HotkeySequenceRecorder(mergedOptions);
	}

	recorderRef.current.setOptions(mergedOptions);

	const isRecording = useSelectorSlot(
		recorderRef.current.store,
		(state) => state.isRecording,
		isRecordingSlot,
	);
	const steps = useSelectorSlot(recorderRef.current.store, (state) => state.steps, stepsSlot);
	const recordedSequence = useSelectorSlot(
		recorderRef.current.store,
		(state) => state.recordedSequence,
		recordedSequenceSlot,
	);

	useEffect(() => {
		return () => {
			recorderRef.current?.destroy();
		};
	}, []);

	return {
		isRecording,
		steps,
		recordedSequence,
		startRecording: () => recorderRef.current?.start(),
		stopRecording: () => recorderRef.current?.stop(),
		cancelRecording: () => recorderRef.current?.cancel(),
		commitRecording: () => recorderRef.current?.commit(),
	};
}
