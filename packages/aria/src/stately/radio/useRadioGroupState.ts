// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/radio/useRadioGroupState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; the module-level instance/name counters port verbatim. The public
// value-level `onChange` callback is unchanged (the onInput rule applies only to DOM wiring).
import type {
	FocusEvents,
	HelpTextProps,
	InputBase,
	InputDOMProps,
	LabelableProps,
	Orientation,
	Validation,
	ValidationState,
	ValueBase,
} from '@react-types/shared';
import { useMemo, useState } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { FormValidationState, useFormValidationState } from '../form/useFormValidationState';
import { useControlledState } from '../utils/useControlledState';

export interface RadioGroupProps
	extends
		ValueBase<string | null, string>,
		InputBase,
		Pick<InputDOMProps, 'name'>,
		Validation<string>,
		LabelableProps,
		HelpTextProps,
		FocusEvents {
	/**
	 * The axis the Radio Button(s) should align with.
	 *
	 * @default 'vertical'
	 */
	orientation?: Orientation;
}

export interface RadioGroupState extends FormValidationState {
	/**
	 * The name for the group, used for native form submission.
	 *
	 * @private
	 * @deprecated
	 */
	readonly name: string;

	/** Whether the radio group is disabled. */
	readonly isDisabled: boolean;

	/** Whether the radio group is read only. */
	readonly isReadOnly: boolean;

	/** Whether the radio group is required. */
	readonly isRequired: boolean;

	/**
	 * Whether the radio group is valid or invalid.
	 *
	 * @deprecated Use `isInvalid` instead.
	 */
	readonly validationState: ValidationState | null;

	/** Whether the radio group is invalid. */
	readonly isInvalid: boolean;

	/** The currently selected value. */
	readonly selectedValue: string | null;

	/** The default selected value. */
	readonly defaultSelectedValue: string | null;

	/** Sets the selected value. */
	setSelectedValue(value: string | null): void;

	/** The value of the last focused radio. */
	readonly lastFocusedValue: string | null;

	/** Sets the last focused value. */
	setLastFocusedValue(value: string | null): void;
}

let instance = Math.round(Math.random() * 10000000000);
let i = 0;

/**
 * Provides state management for a radio group component. Provides a name for the group,
 * and manages selection and focus state.
 */
export function useRadioGroupState(props: RadioGroupProps): RadioGroupState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useRadioGroupState(
	props: RadioGroupProps,
	slot: symbol | undefined,
): RadioGroupState;
export function useRadioGroupState(...args: any[]): RadioGroupState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useRadioGroupState');
	const props = user[0] as RadioGroupProps;

	// Preserved here for backward compatibility. React Aria now generates the name instead of stately.
	let name = useMemo(
		() => props.name || `radio-group-${instance}-${++i}`,
		[props.name],
		subSlot(slot, 'name'),
	);
	let [selectedValue, setSelected] = useControlledState(
		props.value,
		props.defaultValue ?? null,
		props.onChange,
		subSlot(slot, 'selected'),
	);
	let [initialValue] = useState(selectedValue, subSlot(slot, 'initial'));
	let [lastFocusedValue, setLastFocusedValue] = useState<string | null>(
		null,
		subSlot(slot, 'lastFocused'),
	);

	let validation = useFormValidationState(
		{
			...props,
			value: selectedValue,
		},
		subSlot(slot, 'validation'),
	);

	let setSelectedValue = (value: string | null) => {
		if (!props.isReadOnly && !props.isDisabled) {
			setSelected(value);
			validation.commitValidation();
		}
	};

	let isInvalid = validation.displayValidation.isInvalid;

	return {
		...validation,
		name,
		selectedValue: selectedValue,
		defaultSelectedValue: props.value !== undefined ? initialValue : (props.defaultValue ?? null),
		setSelectedValue,
		lastFocusedValue,
		setLastFocusedValue,
		isDisabled: props.isDisabled || false,
		isReadOnly: props.isReadOnly || false,
		isRequired: props.isRequired || false,
		validationState: props.validationState || (isInvalid ? 'invalid' : null),
		isInvalid,
	};
}
