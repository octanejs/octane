// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/checkbox/useCheckboxGroup.ts).
// octane adaptations: `FocusEvents` is the ported native-event version (from
// interactions/useFocus); public-hook slot threading.
import type {
	AriaLabelingProps,
	AriaValidationProps,
	DOMAttributes,
	DOMProps,
	InputDOMProps,
	ValidationResult,
} from '@react-types/shared';

import type { FocusEvents } from '../interactions/useFocus';
import { S, splitSlot, subSlot } from '../internal';
import { checkboxGroupData } from './utils';
import type {
	CheckboxGroupProps,
	CheckboxGroupState,
} from '../stately/checkbox/useCheckboxGroupState';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { useField } from '../label/useField';
import { useFocusWithin } from '../interactions/useFocusWithin';

export interface AriaCheckboxGroupProps
	extends
		CheckboxGroupProps,
		InputDOMProps,
		DOMProps,
		AriaLabelingProps,
		AriaValidationProps,
		FocusEvents {}

export interface CheckboxGroupAria extends ValidationResult {
	/** Props for the checkbox group wrapper element. */
	groupProps: DOMAttributes;
	/** Props for the checkbox group's visible label (if any). */
	labelProps: DOMAttributes;
	/** Props for the checkbox group description element, if any. */
	descriptionProps: DOMAttributes;
	/** Props for the checkbox group error message element, if any. */
	errorMessageProps: DOMAttributes;
}

export function useCheckboxGroup(
	props: AriaCheckboxGroupProps,
	state: CheckboxGroupState,
): CheckboxGroupAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useCheckboxGroup(
	props: AriaCheckboxGroupProps,
	state: CheckboxGroupState,
	slot: symbol | undefined,
): CheckboxGroupAria;
export function useCheckboxGroup(...args: any[]): CheckboxGroupAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCheckboxGroup');
	const props = user[0] as AriaCheckboxGroupProps;
	const state = user[1] as CheckboxGroupState;

	let { isDisabled, name, form, validationBehavior = 'aria' } = props;
	let { isInvalid, validationErrors, validationDetails } = state.displayValidation;
	let { labelProps, fieldProps, descriptionProps, errorMessageProps } = useField(
		{
			...props,
			// Checkbox group is not an HTML input element so it
			// shouldn't be labeled by a <label> element.
			labelElementType: 'span',
			isInvalid,
			errorMessage: props.errorMessage || validationErrors,
		},
		subSlot(slot, 'field'),
	);

	checkboxGroupData.set(state, {
		name,
		form,
		descriptionId: (descriptionProps as any).id,
		errorMessageId: (errorMessageProps as any).id,
		validationBehavior,
	});

	let domProps = filterDOMProps(props, { labelable: true });
	let { focusWithinProps } = useFocusWithin(
		{
			onBlurWithin: props.onBlur,
			onFocusWithin: props.onFocus,
			onFocusWithinChange: props.onFocusChange,
		},
		subSlot(slot, 'focusWithin'),
	);

	return {
		groupProps: mergeProps(domProps, {
			role: 'group',
			'aria-disabled': isDisabled || undefined,
			...fieldProps,
			...focusWithinProps,
		}),
		labelProps,
		descriptionProps,
		errorMessageProps,
		isInvalid,
		validationErrors,
		validationDetails,
	};
}
