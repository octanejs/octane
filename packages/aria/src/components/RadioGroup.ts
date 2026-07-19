// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/RadioGroup.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` components use the S()/subSlot component-slot convention (`useContext`
// stays slotless — context-identity keyed); the ported useRadio already carries octane's
// native change-event wiring for the hidden radio input — inputProps pass through untouched.
import type { HoverEvents, Orientation, RefObject } from '@react-types/shared';
import { createContext, createElement, useContext, useMemo } from 'octane';

import { useFocusRing } from '../focus/useFocusRing';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { type AriaRadioProps, type RadioAria, useRadio } from '../radio/useRadio';
import { type AriaRadioGroupProps, useRadioGroup } from '../radio/useRadioGroup';
import { type RadioGroupState, useRadioGroupState } from '../stately/radio/useRadioGroupState';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { mergeRefs } from '../utils/mergeRefs';
import { useObjectRef } from '../utils/useObjectRef';
import { VisuallyHidden } from '../visually-hidden/VisuallyHidden';
import { FieldErrorContext } from './FieldError';
import { FormContext } from './Form';
import { LabelContext } from './Label';
import { SelectionIndicatorContext } from './SelectionIndicator';
import { SharedElementTransition } from './SharedElementTransition';
import { TextContext } from './Text';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	Provider,
	type RACValidation,
	removeDataAttributes,
	type RenderProps,
	type SlotProps,
	useContextProps,
	useRenderProps,
	useSlot,
	useSlottedContext,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;

export interface RadioGroupProps
	extends
		Omit<
			AriaRadioGroupProps,
			| 'children'
			| 'label'
			| 'description'
			| 'errorMessage'
			| 'validationState'
			| 'validationBehavior'
		>,
		RACValidation,
		RenderProps<RadioGroupRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-RadioGroup'
	 */
	className?: ClassNameOrFunction<RadioGroupRenderProps>;
}
export interface RadioProps
	extends
		Omit<AriaRadioProps, 'children'>,
		HoverEvents,
		RenderProps<RadioRenderProps, 'label'>,
		SlotProps,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Radio'
	 */
	className?: ClassNameOrFunction<RadioRenderProps>;
	/**
	 * A ref for the HTML input element.
	 */
	inputRef?: RefObject<HTMLInputElement | null>;
}

export interface RadioFieldProps
	extends
		Omit<AriaRadioProps, 'children'>,
		RenderProps<RadioFieldRenderProps>,
		SlotProps,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-RadioField'
	 */
	className?: ClassNameOrFunction<RadioFieldRenderProps>;
	/**
	 * A ref for the HTML input element.
	 */
	inputRef?: RefObject<HTMLInputElement | null>;
}

export interface RadioButtonProps
	extends
		HoverEvents,
		RenderProps<RadioButtonRenderProps, 'label'>,
		SlotProps,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-RadioButton'
	 */
	className?: ClassNameOrFunction<RadioButtonRenderProps>;
}

export interface RadioGroupRenderProps {
	/**
	 * The orientation of the radio group.
	 *
	 * @selector [data-orientation="horizontal | vertical"]
	 */
	orientation: Orientation;
	/**
	 * Whether the radio group is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the radio group is read only.
	 *
	 * @selector [data-readonly]
	 */
	isReadOnly: boolean;
	/**
	 * Whether the radio group is required.
	 *
	 * @selector [data-required]
	 */
	isRequired: boolean;
	/**
	 * Whether the radio group is invalid.
	 *
	 * @selector [data-invalid]
	 */
	isInvalid: boolean;
	/**
	 * State of the radio group.
	 */
	state: RadioGroupState;
}

export interface RadioRenderProps {
	/**
	 * Whether the radio is selected.
	 *
	 * @selector [data-selected]
	 */
	isSelected: boolean;
	/**
	 * Whether the radio is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
	/**
	 * Whether the radio is currently in a pressed state.
	 *
	 * @selector [data-pressed]
	 */
	isPressed: boolean;
	/**
	 * Whether the radio is focused, either via a mouse or keyboard.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the radio is keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the radio is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the radio is read only.
	 *
	 * @selector [data-readonly]
	 */
	isReadOnly: boolean;
	/**
	 * Whether the radio is invalid.
	 *
	 * @selector [data-invalid]
	 */
	isInvalid: boolean;
	/**
	 * Whether the checkbox is required.
	 *
	 * @selector [data-required]
	 */
	isRequired: boolean;
}

export interface RadioFieldRenderProps {
	/**
	 * Whether the radio is selected.
	 *
	 * @selector [data-selected]
	 */
	isSelected: boolean;
	/**
	 * Whether the radio is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the radio is read only.
	 *
	 * @selector [data-readonly]
	 */
	isReadOnly: boolean;
	/**
	 * Whether the radio is invalid.
	 *
	 * @selector [data-invalid]
	 */
	isInvalid: boolean;
	/**
	 * Whether the checkbox is required.
	 *
	 * @selector [data-required]
	 */
	isRequired: boolean;
}

export interface RadioButtonRenderProps extends RadioRenderProps {}

export const RadioGroupContext = createContext<ContextValue<RadioGroupProps, HTMLDivElement>>(null);
export const RadioContext =
	createContext<ContextValue<Partial<RadioProps>, HTMLLabelElement>>(null);
export const RadioFieldContext =
	createContext<ContextValue<Partial<RadioFieldProps>, HTMLDivElement>>(null);
export const RadioGroupStateContext = createContext<RadioGroupState | null>(null);

/**
 * A radio group allows a user to select a single item from a list of mutually exclusive options.
 */
export function RadioGroup(props: RadioGroupProps): any {
	const slot = S('RadioGroup');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, RadioGroupContext, subSlot(slot, 'ctx'));
	let { validationBehavior: formValidationBehavior } =
		useSlottedContext(FormContext, undefined, subSlot(slot, 'form')) || {};
	let validationBehavior = props.validationBehavior ?? formValidationBehavior ?? 'native';
	let state = useRadioGroupState(
		{
			...props,
			validationBehavior,
		},
		subSlot(slot, 'state'),
	);

	let [labelRef, label] = useSlot(
		!props['aria-label'] && !props['aria-labelledby'],
		subSlot(slot, 'labelSlot'),
	);
	let { radioGroupProps, labelProps, descriptionProps, errorMessageProps, ...validation } =
		useRadioGroup(
			{
				...props,
				label,
				validationBehavior,
			},
			state,
			subSlot(slot, 'group'),
		);

	let renderProps = useRenderProps(
		{
			...props,
			values: {
				orientation: props.orientation || 'vertical',
				isDisabled: state.isDisabled,
				isReadOnly: state.isReadOnly,
				isRequired: state.isRequired,
				isInvalid: state.isInvalid,
				state,
			},
			defaultClassName: 'react-aria-RadioGroup',
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });

	return createElement(dom.div, {
		...mergeProps(DOMProps, renderProps, radioGroupProps),
		ref,
		slot: props.slot || undefined,
		'data-orientation': props.orientation || 'vertical',
		'data-invalid': state.isInvalid || undefined,
		'data-disabled': state.isDisabled || undefined,
		'data-readonly': state.isReadOnly || undefined,
		'data-required': state.isRequired || undefined,
		children: createElement(Provider, {
			values: [
				[RadioGroupStateContext, state],
				[LabelContext, { ...labelProps, ref: labelRef, elementType: 'span' }],
				[
					TextContext,
					{
						slots: {
							description: descriptionProps,
							errorMessage: errorMessageProps,
						},
					},
				],
				[FieldErrorContext, validation],
			] as any,
			children: createElement(SharedElementTransition, { children: renderProps.children }),
		}),
	});
}

/**
 * A radio represents an individual option within a radio group.
 *
 * @deprecated Use RadioField + RadioButton instead.
 */
export function Radio(props: RadioProps): any {
	const slot = S('Radio');
	let { inputRef: userProvidedInputRef = null, ...otherProps } = props;
	let ref: any;
	[props, ref] = useContextProps(
		otherProps as RadioProps,
		(otherProps as any).ref,
		RadioContext,
		subSlot(slot, 'ctx'),
	);
	let state = useContext(RadioGroupStateContext)!;
	let inputRef = useObjectRef(
		useMemo(
			() => mergeRefs(userProvidedInputRef, props.inputRef !== undefined ? props.inputRef : null),
			[userProvidedInputRef, props.inputRef],
			subSlot(slot, 'mergeRefs'),
		),
		subSlot(slot, 'objectRef'),
	);
	let aria = useRadio(
		{
			...removeDataAttributes<RadioProps>(props),
			// ReactNode type doesn't allow function children.
			children: typeof props.children === 'function' ? true : props.children,
		},
		state,
		inputRef,
		subSlot(slot, 'radio'),
	);

	return createElement(InternalRadioContext.Provider, {
		value: { ...aria, inputRef, defaultClassName: 'react-aria-Radio' },
		children: createElement(RadioButton, { ...props, ref } as any),
	});
}

interface InternalRadioContextValue extends RadioAria {
	inputRef: RefObject<HTMLInputElement | null>;
	defaultClassName: string;
}

const InternalRadioContext = createContext<InternalRadioContextValue | null>(null);

/**
 * A RadioField represents an individual option within a radio group, containing a RadioButton and
 * optional description.
 */
export function RadioField(props: RadioFieldProps): any {
	const slot = S('RadioField');
	let { inputRef: userProvidedInputRef = null, ...otherProps } = props;
	let ref: any;
	[props, ref] = useContextProps(
		otherProps as RadioFieldProps,
		(otherProps as any).ref,
		RadioFieldContext,
		subSlot(slot, 'ctx'),
	);
	let state = useContext(RadioGroupStateContext)!;
	let inputRef = useObjectRef(
		useMemo(
			() => mergeRefs(userProvidedInputRef, props.inputRef !== undefined ? props.inputRef : null),
			[userProvidedInputRef, props.inputRef],
			subSlot(slot, 'mergeRefs'),
		),
		subSlot(slot, 'objectRef'),
	);
	let aria = useRadio(
		{
			...removeDataAttributes<RadioFieldProps>(props),
			// ReactNode type doesn't allow function children.
			children: typeof props.children === 'function' ? true : props.children,
		},
		state,
		inputRef,
		subSlot(slot, 'radio'),
	);
	let { descriptionProps, isSelected, isDisabled } = aria;

	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-RadioField',
			values: {
				isSelected,
				isDisabled,
				isReadOnly: state.isReadOnly,
				isInvalid: state.isInvalid,
				isRequired: state.isRequired,
			},
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });
	delete DOMProps.id;
	delete (DOMProps as any).onClick;

	return createElement(dom.div, {
		...mergeProps(DOMProps, renderProps),
		ref,
		'data-selected': isSelected || undefined,
		'data-disabled': isDisabled || undefined,
		'data-readonly': state.isReadOnly || undefined,
		'data-invalid': state.isInvalid || undefined,
		'data-required': state.isRequired || undefined,
		children: createElement(Provider, {
			values: [
				[SelectionIndicatorContext, { isSelected }],
				[
					InternalRadioContext,
					{
						...aria,
						inputRef,
						defaultClassName: 'react-aria-RadioButton',
					},
				],
				[
					TextContext,
					{
						slots: {
							description: descriptionProps,
						},
					},
				],
			] as any,
			children: renderProps.children,
		}),
	});
}

/**
 * A RadioButton is the clickable area of a radio, including the indicator and label.
 */
export function RadioButton(props: RadioButtonProps): any {
	const slot = S('RadioButton');
	let { labelProps, inputProps, isSelected, isDisabled, isPressed, defaultClassName, inputRef } =
		useContext(InternalRadioContext)!;
	let state = useContext(RadioGroupStateContext)!;
	let { isFocused, isFocusVisible, focusProps } = useFocusRing(
		undefined,
		subSlot(slot, 'focusRing'),
	);
	let interactionDisabled = isDisabled || state.isReadOnly;

	let { hoverProps, isHovered } = useHover(
		{
			...props,
			isDisabled: interactionDisabled,
		},
		subSlot(slot, 'hover'),
	);

	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName,
			values: {
				isSelected,
				isPressed,
				isHovered,
				isFocused,
				isFocusVisible,
				isDisabled,
				isReadOnly: state.isReadOnly,
				isInvalid: state.isInvalid,
				isRequired: state.isRequired,
			},
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });
	delete DOMProps.id;
	delete (DOMProps as any).onClick;

	return createElement(
		dom.label,
		{
			...mergeProps(DOMProps, labelProps, hoverProps, renderProps),
			ref: (props as any).ref,
			'data-selected': isSelected || undefined,
			'data-pressed': isPressed || undefined,
			'data-hovered': isHovered || undefined,
			'data-focused': isFocused || undefined,
			'data-focus-visible': isFocusVisible || undefined,
			'data-disabled': isDisabled || undefined,
			'data-readonly': state.isReadOnly || undefined,
			'data-invalid': state.isInvalid || undefined,
			'data-required': state.isRequired || undefined,
		},
		createElement(VisuallyHidden, {
			elementType: 'span',
			children: createElement('input', {
				...mergeProps(inputProps, focusProps),
				ref: inputRef,
			}),
		}),
		renderProps.children,
	);
}
