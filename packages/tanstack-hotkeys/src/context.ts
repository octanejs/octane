import { createContext, useContext } from 'octane';
import type { HotkeyRecorderOptions, HotkeySequenceRecorderOptions } from '@tanstack/hotkeys';
import type { UseHotkeyOptions } from './useHotkey';
import type { UseHotkeySequenceOptions } from './useHotkeySequence';

export interface HotkeysProviderOptions {
	hotkey?: Partial<UseHotkeyOptions>;
	hotkeyRecorder?: Partial<HotkeyRecorderOptions>;
	hotkeySequence?: Partial<UseHotkeySequenceOptions>;
	hotkeySequenceRecorder?: Partial<HotkeySequenceRecorderOptions>;
}

export interface HotkeysContextValue {
	defaultOptions: HotkeysProviderOptions;
}

export const HotkeysContext = createContext<HotkeysContextValue | null>(null);

export function useHotkeysContext() {
	return useContext(HotkeysContext);
}

export function useDefaultHotkeysOptions() {
	const context = useContext(HotkeysContext);
	return context?.defaultOptions ?? {};
}
