import { getHotkeyManager, getSequenceManager, toHotkeyRegistrationView } from '@tanstack/hotkeys';
import type { HotkeyRegistrationView, SequenceRegistrationView } from '@tanstack/hotkeys';
import { useSelectorSlot } from './internal';

const hotkeysSlot = Symbol.for('@octanejs/tanstack-hotkeys:useHotkeyRegistrations:hotkeys');
const sequencesSlot = Symbol.for('@octanejs/tanstack-hotkeys:useHotkeyRegistrations:sequences');

/**
 * Return type for useHotkeyRegistrations.
 */
export interface HotkeyRegistrationsResult {
	/** All registered hotkeys (public view, no callbacks) */
	hotkeys: Array<HotkeyRegistrationView>;
	/** All registered sequences */
	sequences: Array<SequenceRegistrationView>;
}

/**
 * Octane hook that reactively reads all hotkey and sequence registrations
 * from the singleton managers.
 *
 * This is a standalone hook that does NOT require the HotkeysProvider.
 * It subscribes to both HotkeyManager and SequenceManager stores and
 * re-renders when registrations change.
 *
 * @returns Object with `hotkeys` and `sequences` arrays
 *
 * @example
 * ```tsx
 * function ShortcutPalette() {
 *   const { hotkeys, sequences } = useHotkeyRegistrations()
 *
 *   return (
 *     <ul>
 *       {hotkeys.map((reg) => (
 *         <li key={reg.id}>
 *           {reg.options.meta?.name ?? reg.hotkey}
 *         </li>
 *       ))}
 *       {sequences.map((reg) => (
 *         <li key={reg.id}>
 *           {reg.options.meta?.name ?? reg.sequence.join(' ')}
 *         </li>
 *       ))}
 *     </ul>
 *   )
 * }
 * ```
 */
export function useHotkeyRegistrations(): HotkeyRegistrationsResult {
	const hotkeyManager = getHotkeyManager();
	const sequenceManager = getSequenceManager();

	const hotkeys = useSelectorSlot(
		hotkeyManager.registrations,
		(state) => Array.from(state.values()).map(toHotkeyRegistrationView),
		hotkeysSlot,
	);

	const sequences = useSelectorSlot(
		sequenceManager.registrations,
		(state) => Array.from(state.values()),
		sequencesSlot,
	);

	return { hotkeys, sequences };
}
