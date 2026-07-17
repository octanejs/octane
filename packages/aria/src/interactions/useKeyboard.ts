// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/useKeyboard.ts).
// octane adaptations:
// - `KeyboardEvents` / `DOMAttributes` from '@react-types/shared' are typed over React's
//   synthetic events; local structural aliases over native KeyboardEvent replace them.
// - Public-hook slot threading (splitSlot) per the binding convention; no octane base hooks
//   are composed here, so the slot is absorbed and unused.
import type { BaseEvent } from './createEventHandler';
import { createEventHandler } from './createEventHandler';
import { splitSlot } from '../internal';

// octane adaptation: native-event handler props (upstream: KeyboardEvents from '@react-types/shared').
export interface KeyboardEvents {
	/** Handler that is called when a key is pressed. */
	onKeyDown?: (e: BaseEvent<KeyboardEvent>) => void;
	/** Handler that is called when a key is released. */
	onKeyUp?: (e: BaseEvent<KeyboardEvent>) => void;
}

// octane adaptation: minimal structural DOMAttributes (upstream's drags React attribute types).
export type DOMAttributes = Record<string, any>;

export interface KeyboardProps extends KeyboardEvents {
	/** Whether the keyboard events should be disabled. */
	isDisabled?: boolean;
}

export interface KeyboardResult {
	/** Props to spread onto the target element. */
	keyboardProps: DOMAttributes;
}

/**
 * Handles keyboard interactions for a focusable element.
 */
export function useKeyboard(props: KeyboardProps): KeyboardResult;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useKeyboard(props: KeyboardProps, slot: symbol | undefined): KeyboardResult;
export function useKeyboard(...args: any[]): KeyboardResult {
	const [user] = splitSlot(args);
	const props = user[0] as KeyboardProps;

	return {
		keyboardProps: props.isDisabled
			? {}
			: {
					onKeyDown: createEventHandler(props.onKeyDown),
					onKeyUp: createEventHandler(props.onKeyUp),
				},
	};
}
