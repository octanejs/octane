// Ported from .base-ui/packages/react/src/switch/ (v1.6.0): root/SwitchRoot,
// root/SwitchRootContext, stateAttributesMapping, thumb/SwitchThumb — plus its `index.parts`
// (the `Switch` namespace).
//
// A switch renders a `<span role="switch">` plus a hidden `<input type="checkbox">`. octane
// adaptations: (1) events are NATIVE — the handlers read the event directly (Base UI's
// `event.nativeEvent`); (2) the hidden input takes the live `checked` prop — octane inputs
// are CONTROLLED exactly like React's (property-driven, reasserted on every commit and after
// discrete events; only the INITIAL checked reflects to the attribute). Field/Form
// integration is inert when standalone (default contexts).
import { createContext, createElement, useContext, useLayoutEffect, useMemo, useRef } from 'octane';

import { S, subSlot } from './internal';
import { useRenderElement, type RenderProp } from './utils/useRenderElement';
import type { StateAttributesMapping } from './utils/getStateAttributesProps';
import { mergeProps } from './utils/mergeProps';
import { useBaseUiId } from './utils/useBaseUiId';
import { useButton } from './utils/useButton';
import { useControlled } from './utils/useControlled';
import { useComposedRefs } from './utils/composeRefs';
import { visuallyHidden, visuallyHiddenInput } from './utils/visuallyHidden';
import { ownerWindow } from './utils/owner';
import { createChangeEventDetails, REASONS } from './utils/createChangeEventDetails';
import { fieldValidityMapping, type FieldRootState } from './utils/field/constants';
import { useFieldRootContext } from './utils/field/FieldRootContext';
import { useFormContext } from './utils/field/FormContext';
import { useLabelableContext } from './utils/field/LabelableContext';
import { useRegisterFieldControl } from './utils/field/useRegisterFieldControl';
import { useAriaLabelledBy } from './utils/field/useAriaLabelledBy';
import { useLabelableId } from './utils/field/useLabelableId';
import { useValueChanged } from './utils/useValueChanged';

export interface SwitchRootState extends FieldRootState {
	checked: boolean;
	readOnly: boolean;
	required: boolean;
}

const stateAttributesMapping: StateAttributesMapping<SwitchRootState> = {
	...(fieldValidityMapping as StateAttributesMapping<any>),
	checked(value: boolean): Record<string, string> {
		if (value) {
			return { 'data-checked': '' };
		}
		return { 'data-unchecked': '' };
	},
};

// --- Context -----------------------------------------------------------------

const SwitchRootContext = createContext<SwitchRootState | undefined>(undefined);

function useSwitchRootContext(): SwitchRootState {
	const context = useContext(SwitchRootContext);
	if (context === undefined) {
		throw new Error(
			'Base UI: SwitchRootContext is missing. Switch parts must be placed within <Switch.Root>.',
		);
	}
	return context;
}

// --- Root --------------------------------------------------------------------

export interface SwitchRootProps {
	checked?: boolean;
	defaultChecked?: boolean;
	disabled?: boolean;
	readOnly?: boolean;
	required?: boolean;
	name?: string;
	form?: string;
	id?: string;
	inputRef?: any;
	nativeButton?: boolean;
	value?: string;
	uncheckedValue?: string;
	onCheckedChange?: (checked: boolean, eventDetails: any) => void;
	'aria-labelledby'?: string;
	render?: RenderProp<SwitchRootState>;
	className?: string | ((state: SwitchRootState) => string | undefined);
	style?: Record<string, any> | ((state: SwitchRootState) => Record<string, any> | undefined);
	ref?: any;
	[key: string]: any;
}

function SwitchRoot(props: SwitchRootProps): any {
	const slot = S('SwitchRoot');
	const {
		checked: checkedProp,
		className,
		defaultChecked,
		'aria-labelledby': ariaLabelledByProp,
		form,
		id: idProp,
		inputRef: externalInputRef,
		name: nameProp,
		nativeButton = false,
		onCheckedChange,
		readOnly = false,
		required = false,
		disabled: disabledProp = false,
		render,
		uncheckedValue,
		value,
		style,
		ref,
		...elementProps
	} = props;

	const { clearErrors } = useFormContext();
	const {
		state: fieldState,
		setTouched,
		setDirty,
		validityData,
		setFilled,
		setFocused,
		validationMode,
		disabled: fieldDisabled,
		name: fieldName,
		validation,
	} = useFieldRootContext();
	const { labelId } = useLabelableContext();

	const disabled = fieldDisabled || disabledProp;
	const name = fieldName ?? nameProp;

	const inputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'inputRef'));
	const handleInputRef = useComposedRefs(
		inputRef,
		externalInputRef,
		validation.inputRef,
		subSlot(slot, 'handleInputRef'),
	);

	const switchRef = useRef<HTMLButtonElement | null>(null, subSlot(slot, 'switchRef'));

	const id = useBaseUiId(undefined, subSlot(slot, 'id'));

	const controlId = useLabelableId(
		{ id: idProp, implicit: false, controlRef: switchRef },
		subSlot(slot, 'controlId'),
	);
	const hiddenInputId = nativeButton ? undefined : controlId;

	const [checked, setCheckedState] = useControlled<boolean>(
		{
			controlled: checkedProp,
			default: Boolean(defaultChecked),
			name: 'Switch',
			state: 'checked',
		},
		subSlot(slot, 'checked'),
	);

	useRegisterFieldControl(
		switchRef,
		id,
		checked,
		undefined,
		!disabled,
		nameProp,
		subSlot(slot, 'register'),
	);

	useLayoutEffect(
		() => {
			if (inputRef.current) {
				setFilled(inputRef.current.checked);
			}
		},
		[inputRef, setFilled],
		subSlot(slot, 'e:filled'),
	);

	useValueChanged(
		checked,
		() => {
			clearErrors(name);
			setDirty(checked !== validityData.initialValue);
			setFilled(checked);
			validation.change(checked);
		},
		subSlot(slot, 'valueChanged'),
	);

	const { getButtonProps, buttonRef } = useButton(
		{ disabled, native: nativeButton },
		subSlot(slot, 'button'),
	);
	const ariaLabelledBy = useAriaLabelledBy(
		ariaLabelledByProp,
		labelId,
		inputRef,
		!nativeButton,
		hiddenInputId,
		subSlot(slot, 'ariaLabelledBy'),
	);

	const rootProps: Record<string, any> = {
		id: nativeButton ? controlId : id,
		role: 'switch',
		'aria-checked': checked,
		'aria-readonly': readOnly || undefined,
		'aria-required': required || undefined,
		'aria-labelledby': ariaLabelledBy,
		onFocus() {
			if (!disabled) {
				setFocused(true);
			}
		},
		onBlur() {
			const element = inputRef.current;
			if (!element || disabled) {
				return;
			}
			setTouched(true);
			setFocused(false);
			if (validationMode === 'onBlur') {
				validation.commit(element.checked);
			}
		},
		onClick(event: any) {
			if (readOnly || disabled) {
				return;
			}
			event.preventDefault();
			const input = inputRef.current;
			if (!input) {
				return;
			}
			input.dispatchEvent(
				new (ownerWindow(input).PointerEvent)('click', {
					bubbles: true,
					shiftKey: event.shiftKey,
					ctrlKey: event.ctrlKey,
					altKey: event.altKey,
					metaKey: event.metaKey,
				}),
			);
		},
	};

	const inputProps: Record<string, any> = mergeProps(
		{
			checked,
			disabled,
			form,
			id: hiddenInputId,
			name,
			required,
			style: name ? visuallyHiddenInput : visuallyHidden,
			tabIndex: -1,
			type: 'checkbox',
			'aria-hidden': true,
			ref: handleInputRef,
			onChange(event: any) {
				// octane: the handler receives the native event directly.
				if (event.defaultPrevented) {
					return;
				}
				if (readOnly) {
					event.preventDefault();
					return;
				}
				const nextChecked = event.currentTarget.checked;
				const eventDetails = createChangeEventDetails(REASONS.none, event);
				onCheckedChange?.(nextChecked, eventDetails);
				if (eventDetails.isCanceled) {
					return;
				}
				setCheckedState(nextChecked);
			},
			onFocus() {
				switchRef.current?.focus();
			},
		},
		(p: any) => validation.getValidationProps(disabled, p),
		value !== undefined ? { value } : {},
	);

	const state: SwitchRootState = useMemo(
		() => ({
			...fieldState,
			checked,
			disabled,
			readOnly,
			required,
		}),
		[fieldState, checked, disabled, readOnly, required],
		subSlot(slot, 'state'),
	);

	const element = useRenderElement(
		'span',
		{ render, className, style },
		{
			state,
			ref: [ref, switchRef, buttonRef],
			props: [
				rootProps,
				elementProps,
				getButtonProps,
				(p: any) => validation.getValidationProps(disabled, p),
			],
			stateAttributesMapping,
		},
		subSlot(slot, 're'),
	);

	const hiddenValueInput =
		!checked && name && uncheckedValue !== undefined
			? createElement('input', {
					type: 'hidden',
					form,
					name,
					value: uncheckedValue,
					disabled,
				})
			: null;

	return createElement(SwitchRootContext.Provider, {
		value: state,
		children: [element, hiddenValueInput, createElement('input', inputProps)],
	});
}

// --- Thumb -------------------------------------------------------------------

function SwitchThumb(props: any): any {
	const slot = S('SwitchThumb');
	const { render, className, style, ref, ...elementProps } = props;
	const state = useSwitchRootContext();
	return useRenderElement(
		'span',
		{ render, className, style },
		{ state, ref, props: elementProps, stateAttributesMapping },
		subSlot(slot, 're'),
	);
}

// --- Namespace (mirrors `export * as Switch`) --------------------------------

export const Switch = {
	Root: SwitchRoot,
	Thumb: SwitchThumb,
};
