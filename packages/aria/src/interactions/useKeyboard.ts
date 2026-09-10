import {
	createKeyboardShortcutHandler,
	type KeyboardShortcutBindings,
} from './createKeyboardShortcutHandler';
import { getEventTarget, nodeContains } from '../utils/shadowdom/DOMFunctions';
// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/useKeyboard.ts).
// octane adaptations:
// - `KeyboardEvents` / `DOMAttributes` from '@react-types/shared' are typed over React's
//   synthetic events; local structural aliases over native KeyboardEvent replace them.
// - Shortcut and user callbacks share the BaseEvent wrapper so both have propagation controls.
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
	shortcuts?: KeyboardShortcutBindings;
	allowRepeats?: boolean;
	allowComposing?: boolean;
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

	let { shortcuts, allowRepeats = false, allowComposing = false } = props;
	let onKeyDown;
	let onKeyUp;
	if (shortcuts) {
		let shortcutHandler = createKeyboardShortcutHandler(shortcuts);
		onKeyDown = createEventHandler<KeyboardEvent>((e) => {
			props.onKeyDown?.(e);
			// If keyboard event didn't originate from a child of the current target,
			// then it's a React event coming through a portal. We should ignore it.
			if (!nodeContains(e.currentTarget as Node, getEventTarget(e) as Element)) {
				e.continuePropagation();
				return;
			}
			if ((e.repeat && !allowRepeats) || (e.isComposing && !allowComposing)) {
				e.continuePropagation();
				return;
			}

			shortcutHandler(e);
		});
		onKeyUp = createEventHandler<KeyboardEvent>((e) => {
			props.onKeyUp?.(e);
			// If keyboard event didn't originate from a child of the current target,
			// then it's a React event coming through a portal. We should ignore it.
			if (!nodeContains(e.currentTarget as Node, getEventTarget(e) as Element)) {
				e.continuePropagation();
				return;
			}
			if ((e.repeat && !allowRepeats) || (e.isComposing && !allowComposing)) {
				e.continuePropagation();
				return;
			}
			// implement shortcut handler on keyup, what should the map be called? or should it be another syntax on shortcuts?
			e.continuePropagation();
		});
	} else {
		onKeyDown = createEventHandler(props.onKeyDown);
		onKeyUp = createEventHandler(props.onKeyUp);
	}
	return {
		keyboardProps: props.isDisabled
			? {}
			: {
					onKeyDown,
					onKeyUp,
				},
	};
}
