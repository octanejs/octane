// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/interactions/useFocus.ts).
// octane adaptations:
// - Handlers receive NATIVE FocusEvents (React's FocusEvent<Target> type → native FocusEvent),
//   so `FocusEvents` / `DOMAttributes` from '@react-types/shared' (typed over React events)
//   become local structural aliases.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.

// Portions of the code in this file are based on code from react.
// Original licensing for the following can be found in the
// NOTICE file in the root directory of this source tree.
// See https://github.com/facebook/react/tree/cc7c1aece46a6b69b41958d731e0fd27c94bfc6c/packages/react-interactions

import type { FocusableElement } from '@react-types/shared';
import { useCallback } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { getActiveElement, getEventTarget } from '../utils/shadowdom/DOMFunctions';
import { getOwnerDocument } from '../utils/domHelpers';
import { useSyntheticBlurEvent } from './utils';

// octane adaptation: native-event handler props (upstream: FocusEvents<Target> from
// '@react-types/shared'). The Target parameter is kept for signature parity.
export interface FocusEvents<Target = FocusableElement> {
	/** Handler that is called when the element receives focus. */
	onFocus?: (e: FocusEvent) => void;
	/** Handler that is called when the element loses focus. */
	onBlur?: (e: FocusEvent) => void;
	/** Handler that is called when the element's focus status changes. */
	onFocusChange?: (isFocused: boolean) => void;
}

// octane adaptation: minimal structural DOMAttributes (upstream's drags React attribute types).
export type DOMAttributes<T = FocusableElement> = Record<string, any>;

export interface FocusProps<Target = FocusableElement> extends FocusEvents<Target> {
	/** Whether the focus events should be disabled. */
	isDisabled?: boolean;
}

export interface FocusResult<Target = FocusableElement> {
	/** Props to spread onto the target element. */
	focusProps: DOMAttributes<Target>;
}

/**
 * Handles focus events for the immediate target.
 * Focus events on child elements will be ignored.
 */
export function useFocus<Target extends FocusableElement = FocusableElement>(
	props: FocusProps<Target>,
): FocusResult<Target>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useFocus<Target extends FocusableElement = FocusableElement>(
	props: FocusProps<Target>,
	slot: symbol | undefined,
): FocusResult<Target>;
export function useFocus(...args: any[]): FocusResult {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useFocus');
	const props = user[0] as FocusProps;

	let { isDisabled, onFocus: onFocusProp, onBlur: onBlurProp, onFocusChange } = props;

	const onBlur: FocusProps['onBlur'] = useCallback(
		(e: FocusEvent) => {
			if (getEventTarget(e) === e.currentTarget) {
				if (onBlurProp) {
					onBlurProp(e);
				}

				if (onFocusChange) {
					onFocusChange(false);
				}

				return true;
			}
		},
		[onBlurProp, onFocusChange],
		subSlot(slot, 'blur'),
	);

	const onSyntheticFocus = useSyntheticBlurEvent(onBlur!, subSlot(slot, 'syntheticBlur'));

	const onFocus: FocusProps['onFocus'] = useCallback(
		(e: FocusEvent) => {
			// Double check that document.activeElement actually matches e.target in case a previously chained
			// focus handler already moved focus somewhere else.

			let eventTarget = getEventTarget(e);
			const ownerDocument = getOwnerDocument(eventTarget as Element);
			const activeElement = ownerDocument ? getActiveElement(ownerDocument) : getActiveElement();
			if (eventTarget === e.currentTarget && eventTarget === activeElement) {
				if (onFocusProp) {
					onFocusProp(e);
				}

				if (onFocusChange) {
					onFocusChange(true);
				}

				onSyntheticFocus(e);
			}
		},
		[onFocusChange, onFocusProp, onSyntheticFocus],
		subSlot(slot, 'focus'),
	);

	return {
		focusProps: {
			onFocus: !isDisabled && (onFocusProp || onFocusChange || onBlurProp) ? onFocus : undefined,
			onBlur: !isDisabled && (onBlurProp || onFocusChange) ? onBlur : undefined,
		},
	};
}
