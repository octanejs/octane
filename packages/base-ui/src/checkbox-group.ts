// Ported from .base-ui/packages/react/src/checkbox-group/CheckboxGroup.tsx (v1.6.0). Provides a
// shared value array to a set of <Checkbox.Root>s (with an optional select-all parent checkbox
// via `allValues` + `useCheckboxGroupParent`). Renders a `<div role="group">`. octane:
// forwardRef → ref-as-prop.
import { createElement, useCallback, useMemo, useRef } from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement, type RenderProp } from './utils/useRenderElement';
import { useBaseUiId } from './utils/useBaseUiId';
import { useControlled } from './utils/useControlled';
import { useStableCallback } from './utils/useStableCallback';
import { useValueChanged } from './utils/useValueChanged';
import { areArraysEqual } from './utils/areArraysEqual';
import { useCheckboxGroupParent } from './utils/useCheckboxGroupParent';
import { CheckboxGroupContext, type CheckboxGroupContextValue } from './utils/CheckboxGroupContext';
import { fieldValidityMapping, type FieldRootState } from './utils/field/constants';
import { useFieldRootContext } from './utils/field/FieldRootContext';
import { useFormContext } from './utils/field/FormContext';
import { useLabelableContext } from './utils/field/LabelableContext';
import { useRegisterFieldControl } from './utils/field/useRegisterFieldControl';
import { PARENT_CHECKBOX } from './checkbox';

const EMPTY_ARRAY: string[] = [];

export interface CheckboxGroupState extends FieldRootState {
	disabled: boolean;
}

export interface CheckboxGroupProps {
	value?: string[];
	defaultValue?: string[];
	onValueChange?: (value: string[], eventDetails: any) => void;
	allValues?: string[];
	disabled?: boolean;
	id?: string;
	render?: RenderProp<CheckboxGroupState>;
	className?: string | ((state: CheckboxGroupState) => string | undefined);
	style?: Record<string, any> | ((state: CheckboxGroupState) => Record<string, any> | undefined);
	ref?: any;
	[key: string]: any;
}

function CheckboxGroup(props: CheckboxGroupProps): any {
	const slot = S('CheckboxGroup');
	const {
		allValues,
		className,
		defaultValue: defaultValueProp,
		disabled: disabledProp = false,
		id: idProp,
		onValueChange,
		render,
		value: externalValue,
		style,
		ref,
		...elementProps
	} = props;

	const {
		disabled: fieldDisabled,
		name: fieldName,
		state: fieldState,
		validation,
		setFilled,
		setDirty,
		validityData,
	} = useFieldRootContext();
	const { labelId, getDescriptionProps } = useLabelableContext();
	const { clearErrors } = useFormContext();

	const disabled = fieldDisabled || disabledProp;

	const defaultValue = useMemo<string[] | undefined>(
		() => {
			if (externalValue === undefined) {
				return defaultValueProp ?? [];
			}
			return undefined;
		},
		[externalValue, defaultValueProp],
		subSlot(slot, 'defaultValue'),
	);

	const [value, setValueUnwrapped] = useControlled<string[]>(
		{ controlled: externalValue, default: defaultValue, name: 'CheckboxGroup', state: 'value' },
		subSlot(slot, 'value'),
	);

	const setValue = useStableCallback(
		(v: string[], eventDetails: any) => {
			onValueChange?.(v, eventDetails);
			if (eventDetails.isCanceled) {
				return;
			}
			setValueUnwrapped(v);
		},
		subSlot(slot, 'setValue'),
	);

	const parent = useCheckboxGroupParent(
		{ allValues, value, onValueChange: setValue },
		subSlot(slot, 'parent'),
	);

	const id = useBaseUiId(idProp, subSlot(slot, 'id'));

	const controlRef = useRef<HTMLButtonElement | null>(null, subSlot(slot, 'controlRef'));

	const registerControlRef = useCallback(
		(element: HTMLButtonElement | null) => {
			if (controlRef.current == null && element != null && !element.hasAttribute(PARENT_CHECKBOX)) {
				controlRef.current = element;
			}
		},
		[],
		subSlot(slot, 'registerControl'),
	);

	useRegisterFieldControl(
		controlRef,
		id,
		value,
		undefined,
		!!fieldName && !disabled,
		fieldName,
		subSlot(slot, 'register'),
	);

	const resolvedValue = value ?? EMPTY_ARRAY;

	useValueChanged(
		resolvedValue,
		() => {
			if (fieldName) {
				clearErrors(fieldName);
			}
			const initialValue = Array.isArray(validityData.initialValue)
				? (validityData.initialValue as readonly string[])
				: EMPTY_ARRAY;
			setFilled(resolvedValue.length > 0);
			setDirty(!areArraysEqual(resolvedValue, initialValue));
			validation.change(resolvedValue);
		},
		subSlot(slot, 'valueChanged'),
	);

	const state: CheckboxGroupState = { ...fieldState, disabled };

	const contextValue: CheckboxGroupContextValue = useMemo(
		() => ({
			allValues,
			value,
			defaultValue,
			setValue,
			parent,
			disabled,
			validation,
			registerControlRef,
		}),
		[allValues, value, defaultValue, setValue, parent, disabled, validation, registerControlRef],
		subSlot(slot, 'ctx'),
	);

	const element = useRenderElement(
		'div',
		{ render, className, style },
		{
			state,
			ref,
			props: [
				{ id: idProp, role: 'group', 'aria-labelledby': labelId },
				elementProps,
				getDescriptionProps,
			],
			stateAttributesMapping: fieldValidityMapping,
		},
		subSlot(slot, 're'),
	);

	return createElement(CheckboxGroupContext.Provider, { value: contextValue, children: element });
}

export { CheckboxGroup };
