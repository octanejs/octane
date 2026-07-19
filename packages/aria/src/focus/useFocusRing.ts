// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/focus/useFocusRing.ts).
// octane adaptations:
// - `DOMAttributes` from '@react-types/shared' drags React attribute types; a local
//   structural alias replaces it (the focus props are octane NATIVE delegated event props).
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention; sibling
//   ported hooks (useFocus, useFocusWithin, useFocusVisibleListener) are called with a
//   trailing `subSlot(slot, ...)`. Explicit dep arrays are preserved exactly.

import { useCallback, useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { isFocusVisible, useFocusVisibleListener } from '../interactions/useFocusVisible';
import { useFocus } from '../interactions/useFocus';
import { useFocusWithin } from '../interactions/useFocusWithin';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React attribute types).
export type DOMAttributes = Record<string, any>;

export interface AriaFocusRingProps {
	/**
	 * Whether to show the focus ring when something
	 * inside the container element has focus (true), or
	 * only if the container itself has focus (false).
	 *
	 * @default 'false'
	 */
	within?: boolean;

	/** Whether the element is a text input. */
	isTextInput?: boolean;

	/** Whether the element will be auto focused. */
	autoFocus?: boolean;
}

export interface FocusRingAria {
	/** Whether the element is currently focused. */
	isFocused: boolean;

	/** Whether keyboard focus should be visible. */
	isFocusVisible: boolean;

	/** Props to apply to the container element with the focus ring. */
	focusProps: DOMAttributes;
}

/**
 * Determines whether a focus ring should be shown to indicate keyboard focus.
 * Focus rings are visible only when the user is interacting with a keyboard,
 * not with a mouse, touch, or other input methods.
 */
export function useFocusRing(props?: AriaFocusRingProps): FocusRingAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useFocusRing(
	props: AriaFocusRingProps | undefined,
	slot: symbol | undefined,
): FocusRingAria;
export function useFocusRing(...args: any[]): FocusRingAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFocusRing');
	const props = (user[0] as AriaFocusRingProps) ?? {};

	let { autoFocus = false, isTextInput, within } = props;
	let state = useRef(
		{
			isFocused: false,
			isFocusVisible: autoFocus || isFocusVisible(),
		},
		subSlot(slot, 'state'),
	);
	let [isFocused, setFocused] = useState(false, subSlot(slot, 'focused'));
	let [isFocusVisibleState, setFocusVisible] = useState(
		() => state.current.isFocused && state.current.isFocusVisible,
		subSlot(slot, 'visible'),
	);

	let updateState = useCallback(
		() => setFocusVisible(state.current.isFocused && state.current.isFocusVisible),
		[],
		subSlot(slot, 'update'),
	);

	let onFocusChange = useCallback(
		(isFocused: boolean) => {
			state.current.isFocused = isFocused;
			state.current.isFocusVisible = isFocusVisible();
			setFocused(isFocused);
			updateState();
		},
		[updateState],
		subSlot(slot, 'change'),
	);

	useFocusVisibleListener(
		(isFocusVisible) => {
			state.current.isFocusVisible = isFocusVisible;
			updateState();
		},
		[isTextInput, isFocused],
		{ enabled: isFocused, isTextInput },
		subSlot(slot, 'listener'),
	);

	let { focusProps } = useFocus(
		{
			isDisabled: within,
			onFocusChange,
		},
		subSlot(slot, 'focus'),
	);

	let { focusWithinProps } = useFocusWithin(
		{
			isDisabled: !within,
			onFocusWithinChange: onFocusChange,
		},
		subSlot(slot, 'within'),
	);

	return {
		isFocused,
		isFocusVisible: isFocusVisibleState,
		focusProps: within ? focusWithinProps : focusProps,
	};
}
