// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/checkbox/useCheckboxGroupState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention. The public value-level `onChange` callback is unchanged (the onInput rule
// applies only to DOM wiring).
import type {
	HelpTextProps,
	InputBase,
	InputDOMProps,
	LabelableProps,
	Validation,
	ValidationResult,
	ValidationState,
	ValueBase,
} from '@react-types/shared';
import { useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import {
	FormValidationState,
	mergeValidation,
	useFormValidationState,
} from '../form/useFormValidationState';
import { useControlledState } from '../utils/useControlledState';

export interface CheckboxGroupProps
	extends
		ValueBase<string[]>,
		Pick<InputDOMProps, 'name'>,
		InputBase,
		LabelableProps,
		HelpTextProps,
		Validation<string[]> {}

export interface CheckboxGroupState extends FormValidationState {
	/** Current selected values. */
	readonly value: readonly string[];
	/** Default selected values. */
	readonly defaultValue: readonly string[];

	/** Whether the checkbox group is disabled. */
	readonly isDisabled: boolean;

	/** Whether the checkbox group is read only. */
	readonly isReadOnly: boolean;

	/**
	 * The current validation state of the checkbox group.
	 *
	 * @deprecated Use `isInvalid` instead.
	 */
	readonly validationState: ValidationState | null;

	/** Whether the checkbox group is invalid. */
	readonly isInvalid: boolean;

	/**
	 * Whether the checkboxes in the group are required.
	 * This changes to false once at least one item is selected.
	 */
	readonly isRequired: boolean;

	/** Returns whether the given value is selected. */
	isSelected(value: string): boolean;

	/** Sets the selected values. */
	setValue(value: string[]): void;

	/** Adds a value to the set of selected values. */
	addValue(value: string): void;

	/** Removes a value from the set of selected values. */
	removeValue(value: string): void;

	/** Toggles a value in the set of selected values. */
	toggleValue(value: string): void;

	/** Sets whether one of the checkboxes is invalid. */
	setInvalid(value: string, validation: ValidationResult): void;
}

/**
 * Provides state management for a checkbox group component. Provides a name for the group,
 * and manages selection and focus state.
 */
export function useCheckboxGroupState(props?: CheckboxGroupProps): CheckboxGroupState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useCheckboxGroupState(
	props: CheckboxGroupProps | undefined,
	slot: symbol | undefined,
): CheckboxGroupState;
export function useCheckboxGroupState(...args: any[]): CheckboxGroupState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useCheckboxGroupState');
	const props = (user[0] as CheckboxGroupProps | undefined) ?? {};

	let [selectedValues, setValue] = useControlledState(
		props.value,
		props.defaultValue || [],
		props.onChange,
		subSlot(slot, 'value'),
	);
	let [initialValues] = useState(selectedValues, subSlot(slot, 'initial'));
	let isRequired = !!props.isRequired && selectedValues.length === 0;

	let invalidValues = useRef(new Map<string, ValidationResult>(), subSlot(slot, 'invalid'));
	let validation = useFormValidationState(
		{
			...props,
			value: selectedValues,
		},
		subSlot(slot, 'validation'),
	);

	let isInvalid = validation.displayValidation.isInvalid;
	const state: CheckboxGroupState = {
		...validation,
		value: selectedValues,
		defaultValue: props.defaultValue ?? initialValues,
		setValue(value) {
			if (props.isReadOnly || props.isDisabled) {
				return;
			}

			setValue(value);
		},
		isDisabled: props.isDisabled || false,
		isReadOnly: props.isReadOnly || false,
		isSelected(value) {
			return selectedValues.includes(value);
		},
		addValue(value) {
			if (props.isReadOnly || props.isDisabled) {
				return;
			}
			setValue((selectedValues) => {
				if (!selectedValues.includes(value)) {
					return selectedValues.concat(value);
				}
				return selectedValues;
			});
		},
		removeValue(value) {
			if (props.isReadOnly || props.isDisabled) {
				return;
			}
			if (selectedValues.includes(value)) {
				setValue(selectedValues.filter((existingValue) => existingValue !== value));
			}
		},
		toggleValue(value) {
			if (props.isReadOnly || props.isDisabled) {
				return;
			}
			if (selectedValues.includes(value)) {
				setValue(selectedValues.filter((existingValue) => existingValue !== value));
			} else {
				setValue(selectedValues.concat(value));
			}
		},
		setInvalid(value, v) {
			let s = new Map(invalidValues.current);
			if (v.isInvalid) {
				s.set(value, v);
			} else {
				s.delete(value);
			}

			invalidValues.current = s;
			validation.updateValidation(mergeValidation(...s.values()));
		},
		validationState: props.validationState ?? (isInvalid ? 'invalid' : null),
		isInvalid,
		isRequired,
	};

	return state;
}
