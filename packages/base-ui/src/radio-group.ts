// Ported from .base-ui/packages/react/src/radio-group/RadioGroup.tsx (v1.6.0). Provides a
// shared value + roving focus (via CompositeRoot) to a series of <Radio.Root>s, rendering a
// `<div role="radiogroup">`. octane: forwardRef → ref-as-prop; native events.
import { createElement, useMemo, useRef, useState } from 'octane';

import { S, subSlot } from './internal';
import { CompositeRoot } from './utils/composite/CompositeRoot';
import { SHIFT } from './utils/composite/keys';
import { contains } from './utils/contains';
import { useBaseUiId } from './utils/useBaseUiId';
import { useControlled } from './utils/useControlled';
import { useStableCallback } from './utils/useStableCallback';
import { useValueChanged } from './utils/useValueChanged';
import { fieldValidityMapping, type FieldRootState } from './utils/field/constants';
import { useFieldRootContext } from './utils/field/FieldRootContext';
import { useFormContext } from './utils/field/FormContext';
import { useLabelableContext } from './utils/field/LabelableContext';
import { useRegisterFieldControl } from './utils/field/useRegisterFieldControl';
import { RadioGroupContext, type RadioGroupContextValue } from './utils/RadioGroupContext';
import { useFieldsetRootContext } from './fieldset';

const MODIFIER_KEYS = [SHIFT];

export interface RadioGroupState extends FieldRootState {
	readOnly: boolean;
	required: boolean;
}

export interface RadioGroupProps<Value = any> {
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	value?: Value;
	defaultValue?: Value;
	onValueChange?: (value: Value, eventDetails: any) => void;
	form?: string;
	name?: string;
	inputRef?: any;
	id?: string;
	render?: any;
	className?: any;
	style?: any;
	ref?: any;
	[key: string]: any;
}

function RadioGroup<Value = any>(props: RadioGroupProps<Value>): any {
	const slot = S('RadioGroup');
	const {
		render,
		className,
		disabled: disabledProp,
		readOnly,
		required,
		onValueChange: onValueChangeProp,
		value: externalValue,
		defaultValue,
		form,
		name: nameProp,
		inputRef: inputRefProp,
		id: idProp,
		style,
		ref,
		...elementProps
	} = props;

	const {
		setTouched: setFieldTouched,
		setFocused,
		validationMode,
		name: fieldName,
		disabled: fieldDisabled,
		state: fieldState,
		validation,
		setDirty,
		setFilled,
		validityData,
	} = useFieldRootContext();
	const { labelId } = useLabelableContext();
	const { clearErrors } = useFormContext();
	const fieldsetContext = useFieldsetRootContext(true);

	const disabled = fieldDisabled || disabledProp;
	const name = fieldName ?? nameProp;
	const id = useBaseUiId(idProp, subSlot(slot, 'id'));

	const [checkedValue, setCheckedValueUnwrapped] = useControlled<Value>(
		{ controlled: externalValue, default: defaultValue, name: 'RadioGroup', state: 'value' },
		subSlot(slot, 'value'),
	);
	const [touched, setTouched] = useState(false, subSlot(slot, 'touched'));

	const setCheckedValue = useStableCallback(
		(value: Value, eventDetails: any) => {
			onValueChangeProp?.(value, eventDetails);
			if (eventDetails.isCanceled) {
				return;
			}
			setCheckedValueUnwrapped(value);
		},
		subSlot(slot, 'setValue'),
	);

	const controlRef = useRef<HTMLElement | null>(null, subSlot(slot, 'controlRef'));
	const groupInputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'groupInput'));
	const firstEnabledInputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'firstInput'));

	function setInputRef(hiddenInput: HTMLInputElement | null): void | (() => void) {
		let cleanup: void | (() => void) | undefined;
		if (inputRefProp) {
			if (typeof inputRefProp === 'function') {
				cleanup = inputRefProp(hiddenInput);
			} else {
				inputRefProp.current = hiddenInput;
			}
		}
		groupInputRef.current = hiddenInput;
		validation.inputRef.current = hiddenInput;
		return cleanup;
	}

	const registerControlRef = useStableCallback(
		(element: HTMLElement | null, isDisabled = false) => {
			if (!element) {
				return;
			}
			if (isDisabled) {
				if (controlRef.current === element) {
					controlRef.current = null;
				}
				return;
			}
			if (controlRef.current == null) {
				controlRef.current = element;
			}
		},
		subSlot(slot, 'registerControl'),
	);

	const registerInputRef = useStableCallback(
		(input: HTMLInputElement | null) => {
			if (!input || input.disabled) {
				return undefined;
			}
			if (!firstEnabledInputRef.current) {
				firstEnabledInputRef.current = input;
			}
			const currentInput = groupInputRef.current;
			if (input.checked || currentInput == null || currentInput.disabled) {
				return setInputRef(input);
			}
			return undefined;
		},
		subSlot(slot, 'registerInput'),
	);

	const getFormValue = useStableCallback(
		() => {
			const input = groupInputRef.current;
			if (!input || input.disabled || !input.checked) {
				return null;
			}
			return checkedValue ?? null;
		},
		subSlot(slot, 'getFormValue'),
	);

	useRegisterFieldControl(
		controlRef,
		id,
		checkedValue ?? null,
		getFormValue,
		!disabled,
		nameProp,
		subSlot(slot, 'register'),
	);

	useValueChanged(
		checkedValue,
		() => {
			clearErrors(name);
			setDirty(checkedValue !== validityData.initialValue);
			setFilled(checkedValue != null);
			validation.change(checkedValue);
			const fallbackInput = firstEnabledInputRef.current;
			if (checkedValue == null && fallbackInput && !fallbackInput.disabled) {
				setInputRef(fallbackInput);
			}
		},
		subSlot(slot, 'valueChanged'),
	);

	const ariaLabelledby = elementProps['aria-labelledby'] ?? labelId ?? fieldsetContext?.legendId;

	const state: RadioGroupState = {
		...fieldState,
		disabled: disabled ?? false,
		required: required ?? false,
		readOnly: readOnly ?? false,
	};

	const contextValue: RadioGroupContextValue<Value> = useMemo(
		() => ({
			...fieldState,
			checkedValue,
			disabled,
			form,
			validation,
			name,
			readOnly,
			registerControlRef,
			registerInputRef,
			required,
			setCheckedValue,
			setTouched,
			touched,
		}),
		[
			checkedValue,
			disabled,
			form,
			validation,
			fieldState,
			name,
			readOnly,
			registerControlRef,
			registerInputRef,
			required,
			setCheckedValue,
			setTouched,
			touched,
		],
		subSlot(slot, 'ctx'),
	);

	const defaultProps: Record<string, any> = {
		id: idProp,
		role: 'radiogroup',
		'aria-required': required || undefined,
		'aria-disabled': disabled || undefined,
		'aria-readonly': readOnly || undefined,
		'aria-labelledby': ariaLabelledby,
		onFocus() {
			setFocused(true);
		},
		onBlur(event: any) {
			if (!contains(event.currentTarget, event.relatedTarget)) {
				setFieldTouched(true);
				setFocused(false);
				if (validationMode === 'onBlur') {
					validation.commit(checkedValue);
				}
			}
		},
		onKeyDownCapture(event: any) {
			if (event.key.startsWith('Arrow')) {
				setTouched(true);
				setFocused(true);
			}
		},
	};

	const compositeRoot = createElement(CompositeRoot, {
		render,
		className,
		style,
		state,
		props: [
			defaultProps,
			elementProps,
			(p: any) => validation.getValidationProps(disabled ?? false, p),
		],
		refs: [ref],
		stateAttributesMapping: fieldValidityMapping,
		enableHomeAndEndKeys: false,
		modifierKeys: MODIFIER_KEYS,
	});

	return createElement(RadioGroupContext.Provider, {
		value: contextValue,
		children: compositeRoot,
	});
}

export { RadioGroup };
