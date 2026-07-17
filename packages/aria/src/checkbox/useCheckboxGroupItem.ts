// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/checkbox/useCheckboxGroupItem.ts).
// octane adaptation: public-hook slot threading; upstream's dep-less `useEffect` →
// explicit `null` deps (run every render).
import type { RefObject, ValidationResult } from '@react-types/shared';
import { useEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { AriaCheckboxProps, CheckboxAria, useCheckbox } from './useCheckbox';
import { checkboxGroupData } from './utils';
import type { CheckboxGroupState } from '../stately/checkbox/useCheckboxGroupState';
import {
	DEFAULT_VALIDATION_RESULT,
	privateValidationStateProp,
	useFormValidationState,
} from '../stately/form/useFormValidationState';
import { useToggleState } from '../stately/toggle/useToggleState';

export interface AriaCheckboxGroupItemProps extends Omit<
	AriaCheckboxProps,
	'isSelected' | 'defaultSelected'
> {
	value: string;
}

export function useCheckboxGroupItem(
	props: AriaCheckboxGroupItemProps,
	state: CheckboxGroupState,
	inputRef: RefObject<HTMLInputElement | null>,
): CheckboxAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useCheckboxGroupItem(
	props: AriaCheckboxGroupItemProps,
	state: CheckboxGroupState,
	inputRef: RefObject<HTMLInputElement | null>,
	slot: symbol | undefined,
): CheckboxAria;
export function useCheckboxGroupItem(...args: any[]): CheckboxAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCheckboxGroupItem');
	const props = user[0] as AriaCheckboxGroupItemProps;
	const state = user[1] as CheckboxGroupState;
	const inputRef = user[2] as RefObject<HTMLInputElement | null>;

	const toggleState = useToggleState(
		{
			isReadOnly: props.isReadOnly || state.isReadOnly,
			isSelected: state.isSelected(props.value),
			defaultSelected: state.defaultValue.includes(props.value),
			onChange(isSelected: boolean) {
				if (isSelected) {
					state.addValue(props.value);
				} else {
					state.removeValue(props.value);
				}
				if (props.onChange) {
					props.onChange(isSelected);
				}
			},
		},
		subSlot(slot, 'toggleState'),
	);

	let { name, form, descriptionId, errorMessageId, validationBehavior } =
		checkboxGroupData.get(state)!;
	validationBehavior = props.validationBehavior ?? validationBehavior;

	// Local validation for this checkbox.
	let { realtimeValidation } = useFormValidationState(
		{
			...props,
			value: toggleState.isSelected,
			// Server validation is handled at the group level.
			name: undefined,
			validationBehavior: 'aria',
		},
		subSlot(slot, 'validation'),
	);

	// Update the checkbox group state when realtime validation changes.
	let nativeValidation = useRef(DEFAULT_VALIDATION_RESULT, subSlot(slot, 'nativeValidation'));
	let updateValidation = () => {
		state.setInvalid(
			props.value,
			realtimeValidation.isInvalid ? realtimeValidation : nativeValidation.current,
		);
	};

	useEffect(updateValidation, null, subSlot(slot, 'updateValidation'));

	// Combine group and checkbox level validation.
	let combinedRealtimeValidation = state.realtimeValidation.isInvalid
		? state.realtimeValidation
		: realtimeValidation;
	let displayValidation =
		validationBehavior === 'native' ? state.displayValidation : combinedRealtimeValidation;

	let res = useCheckbox(
		{
			...props,
			isReadOnly: props.isReadOnly || state.isReadOnly,
			isDisabled: props.isDisabled || state.isDisabled,
			name: props.name || name,
			form: props.form || form,
			isRequired: props.isRequired ?? state.isRequired,
			validationBehavior,
			[privateValidationStateProp]: {
				realtimeValidation: combinedRealtimeValidation,
				displayValidation,
				resetValidation: state.resetValidation,
				commitValidation: state.commitValidation,
				updateValidation(v: ValidationResult) {
					nativeValidation.current = v;
					updateValidation();
				},
			},
		} as any,
		toggleState,
		inputRef,
		subSlot(slot, 'checkbox'),
	);

	return {
		...res,
		inputProps: {
			...res.inputProps,
			'aria-describedby':
				[res.inputProps['aria-describedby'], state.isInvalid ? errorMessageId : null, descriptionId]
					.filter(Boolean)
					.join(' ') || undefined,
		},
	};
}
