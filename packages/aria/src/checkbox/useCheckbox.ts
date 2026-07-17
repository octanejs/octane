// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/checkbox/useCheckbox.ts).
// octane adaptations: React's per-element attribute types → the structural bags the
// ported useToggle returns; the label's onMouseDown receives the NATIVE MouseEvent;
// public-hook slot threading.
import type { InputDOMProps, RefObject, ValidationResult } from '@react-types/shared';
import { useEffect, useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { AriaToggleProps, useToggle } from '../toggle/useToggle';
import { mergeProps } from '../utils/mergeProps';
import type { ToggleProps, ToggleState } from '../stately/toggle/useToggleState';

type DOMAttributes = Record<string, any>;

export interface CheckboxProps extends ToggleProps {
	/**
	 * Indeterminism is presentational only.
	 * The indeterminate visual representation remains regardless of user interaction.
	 */
	isIndeterminate?: boolean;
}

export interface AriaCheckboxProps extends CheckboxProps, InputDOMProps, AriaToggleProps {}

export interface CheckboxAria extends ValidationResult {
	/** Props for the label wrapper element. */
	labelProps: DOMAttributes;
	/** Props for the input element. */
	inputProps: DOMAttributes;
	/** Props for the checkbox description element, if any. */
	descriptionProps: DOMAttributes;
	/** Props for the checkbox error message element, if any. */
	errorMessageProps: DOMAttributes;
	/** Whether the checkbox is selected. */
	isSelected: boolean;
	/** Whether the checkbox is in a pressed state. */
	isPressed: boolean;
	/** Whether the checkbox is disabled. */
	isDisabled: boolean;
	/** Whether the checkbox is read only. */
	isReadOnly: boolean;
}

export function useCheckbox(
	props: AriaCheckboxProps,
	state: ToggleState,
	inputRef: RefObject<HTMLInputElement | null>,
): CheckboxAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useCheckbox(
	props: AriaCheckboxProps,
	state: ToggleState,
	inputRef: RefObject<HTMLInputElement | null>,
	slot: symbol | undefined,
): CheckboxAria;
export function useCheckbox(...args: any[]): CheckboxAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCheckbox');
	const props = user[0] as AriaCheckboxProps;
	const state = user[1] as ToggleState;
	const inputRef = user[2] as RefObject<HTMLInputElement | null>;

	let {
		labelProps,
		inputProps,
		descriptionProps,
		errorMessageProps,
		isSelected,
		isPressed,
		isDisabled,
		isReadOnly,
		isInvalid,
		validationErrors,
		validationDetails,
	} = useToggle(props, state, inputRef, subSlot(slot, 'toggle'));

	let { isIndeterminate } = props;
	useEffect(
		() => {
			// indeterminate is a property, but it can only be set via javascript
			// https://css-tricks.com/indeterminate-checkboxes/
			if (inputRef.current) {
				inputRef.current.indeterminate = !!isIndeterminate;
			}
		},
		null,
		subSlot(slot, 'indeterminate'),
	);

	return {
		labelProps: mergeProps(
			labelProps,
			useMemo(
				() => ({
					// Prevent label from being focused when mouse down on it.
					// Note, this does not prevent the input from being focused in the `click` event.
					onMouseDown: (e: MouseEvent) => e.preventDefault(),
				}),
				[],
				subSlot(slot, 'labelDown'),
			),
		),
		inputProps,
		descriptionProps,
		errorMessageProps,
		isSelected,
		isPressed,
		isDisabled,
		isReadOnly,
		isInvalid,
		validationErrors,
		validationDetails,
	};
}
