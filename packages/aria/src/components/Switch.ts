// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Switch.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` components use the S()/subSlot component-slot convention (`useContext`
// stays slotless — context-identity keyed); the ported useSwitch already carries octane's
// native change-event wiring for the hidden switch input — inputProps pass through untouched.
import type { HoverEvents, RefObject } from '@react-types/shared';
import { createContext, createElement, useContext } from 'octane';

import { useFocusRing } from '../focus/useFocusRing';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { type ToggleState, useToggleState } from '../stately/toggle/useToggleState';
import { type AriaSwitchProps, type SwitchAria, useSwitch } from '../switch/useSwitch';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { mergeRefs } from '../utils/mergeRefs';
import { useObjectRef } from '../utils/useObjectRef';
import { VisuallyHidden } from '../visually-hidden/VisuallyHidden';
import { FieldErrorContext } from './FieldError';
import { FormContext } from './Form';
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
	useSlottedContext,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;

export interface SwitchProps
	extends
		Omit<
			AriaSwitchProps,
			| 'children'
			| 'validationState'
			| 'validationBehavior'
			| 'isRequired'
			| 'isInvalid'
			| 'validate'
		>,
		HoverEvents,
		RenderProps<SwitchRenderProps, 'label'>,
		SlotProps,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Switch'
	 */
	className?: ClassNameOrFunction<SwitchRenderProps>;
	/**
	 * A ref for the HTML input element.
	 */
	inputRef?: RefObject<HTMLInputElement | null>;
}

export interface SwitchFieldProps
	extends
		Omit<AriaSwitchProps, 'children' | 'validationState' | 'validationBehavior'>,
		RACValidation,
		RenderProps<SwitchFieldRenderProps>,
		SlotProps,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-SwitchField'
	 */
	className?: ClassNameOrFunction<SwitchFieldRenderProps>;
	/**
	 * A ref for the HTML input element.
	 */
	inputRef?: RefObject<HTMLInputElement | null>;
}

export interface SwitchButtonProps
	extends
		HoverEvents,
		RenderProps<SwitchButtonRenderProps, 'label'>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-SwitchButton'
	 */
	className?: ClassNameOrFunction<SwitchButtonRenderProps>;
}

export interface SwitchRenderProps {
	/**
	 * Whether the switch is selected.
	 *
	 * @selector [data-selected]
	 */
	isSelected: boolean;
	/**
	 * Whether the switch is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
	/**
	 * Whether the switch is currently in a pressed state.
	 *
	 * @selector [data-pressed]
	 */
	isPressed: boolean;
	/**
	 * Whether the switch is focused, either via a mouse or keyboard.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the switch is keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the switch is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the switch is read only.
	 *
	 * @selector [data-readonly]
	 */
	isReadOnly: boolean;
	/**
	 * State of the switch.
	 */
	state: ToggleState;
}

export interface SwitchFieldRenderProps {
	/**
	 * Whether the switch is selected.
	 *
	 * @selector [data-selected]
	 */
	isSelected: boolean;
	/**
	 * Whether the switch is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the switch is read only.
	 *
	 * @selector [data-readonly]
	 */
	isReadOnly: boolean;
	/**
	 * Whether the switch invalid.
	 *
	 * @selector [data-invalid]
	 */
	isInvalid: boolean;
	/**
	 * Whether the switch is required.
	 *
	 * @selector [data-required]
	 */
	isRequired: boolean;
	/**
	 * State of the switch.
	 */
	state: ToggleState;
}

export interface SwitchButtonRenderProps extends SwitchRenderProps {
	/**
	 * Whether the switch invalid.
	 *
	 * @selector [data-invalid]
	 */
	isInvalid: boolean;
	/**
	 * Whether the switch is required.
	 *
	 * @selector [data-required]
	 */
	isRequired: boolean;
	/**
	 * State of the switch.
	 */
	state: ToggleState;
}

export const SwitchContext = createContext<ContextValue<SwitchProps, HTMLLabelElement>>(null);
export const SwitchFieldContext =
	createContext<ContextValue<SwitchFieldProps, HTMLDivElement>>(null);
export const ToggleStateContext = createContext<ToggleState | null>(null);

/**
 * A switch allows a user to turn a setting on or off.
 *
 * @deprecated Use SwitchField + SwitchButton instead.
 */
export function Switch(props: SwitchProps): any {
	const slot = S('Switch');
	let { inputRef: userProvidedInputRef = null, ...otherProps } = props;
	let ref: any;
	[props, ref] = useContextProps(
		otherProps as SwitchProps,
		(otherProps as any).ref,
		SwitchContext,
		subSlot(slot, 'ctx'),
	);
	let inputRef = useObjectRef(
		mergeRefs(userProvidedInputRef, props.inputRef !== undefined ? props.inputRef : null),
		subSlot(slot, 'inputRef'),
	);
	let state = useToggleState(props, subSlot(slot, 'toggleState'));
	let aria = useSwitch(
		{
			...removeDataAttributes(props),
			// ReactNode type doesn't allow function children.
			children: typeof props.children === 'function' ? true : props.children,
		},
		state,
		inputRef,
		subSlot(slot, 'switch'),
	);

	return createElement(Provider, {
		values: [
			[ToggleStateContext, state],
			[
				InternalSwitchContext,
				{
					...aria,
					inputRef,
					defaultClassName: 'react-aria-Switch',
				},
			],
		] as any,
		children: createElement(SwitchButton, { ...props, ref } as any),
	});
}

interface InternalSwitchContextValue extends SwitchAria {
	inputRef: RefObject<HTMLInputElement | null>;
	defaultClassName: string;
	isRequired?: boolean;
}

const InternalSwitchContext = createContext<InternalSwitchContextValue | null>(null);

/**
 * A switch allows a user to turn a setting on or off, with support for validation and help text.
 */
export function SwitchField(props: SwitchFieldProps): any {
	const slot = S('SwitchField');
	let { inputRef: userProvidedInputRef = null, ...otherProps } = props;
	let ref: any;
	[props, ref] = useContextProps(
		otherProps as SwitchFieldProps,
		(otherProps as any).ref,
		SwitchFieldContext,
		subSlot(slot, 'ctx'),
	);
	let { validationBehavior: formValidationBehavior } =
		useSlottedContext(FormContext, undefined, subSlot(slot, 'form')) || {};
	let validationBehavior = props.validationBehavior ?? formValidationBehavior ?? 'native';
	let inputRef = useObjectRef(
		mergeRefs(userProvidedInputRef, props.inputRef !== undefined ? props.inputRef : null),
		subSlot(slot, 'inputRef'),
	);
	let state = useToggleState(props, subSlot(slot, 'toggleState'));
	let aria = useSwitch(
		{
			...removeDataAttributes(props),
			// ReactNode type doesn't allow function children.
			children: typeof props.children === 'function' ? true : props.children,
			validationBehavior,
		},
		state,
		inputRef,
		subSlot(slot, 'switch'),
	);
	let {
		descriptionProps,
		errorMessageProps,
		isSelected,
		isDisabled,
		isReadOnly,
		isInvalid,
		validationDetails,
		validationErrors,
	} = aria;

	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-SwitchField',
			values: {
				isSelected,
				isDisabled,
				isReadOnly,
				isInvalid,
				isRequired: props.isRequired || false,
				state,
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
		slot: props.slot || undefined,
		'data-selected': isSelected || undefined,
		'data-disabled': isDisabled || undefined,
		'data-readonly': isReadOnly || undefined,
		'data-invalid': isInvalid || undefined,
		'data-required': props.isRequired || undefined,
		children: createElement(Provider, {
			values: [
				[ToggleStateContext, state],
				[
					InternalSwitchContext,
					{
						...aria,
						inputRef,
						defaultClassName: 'react-aria-SwitchButton',
						isRequired: props.isRequired,
					},
				],
				[
					TextContext,
					{
						slots: {
							description: descriptionProps,
							errorMessage: errorMessageProps,
						},
					},
				],
				[FieldErrorContext, { isInvalid, validationDetails, validationErrors }],
			] as any,
			children: renderProps.children,
		}),
	});
}

/**
 * A switch button is the clickable area of a switch, including the indicator and label.
 */
export function SwitchButton(props: SwitchButtonProps): any {
	const slot = S('SwitchButton');
	let {
		labelProps,
		inputProps,
		isSelected,
		isDisabled,
		isReadOnly,
		isPressed,
		isInvalid,
		inputRef,
		defaultClassName,
		isRequired,
	} = useContext(InternalSwitchContext)!;
	let { isFocused, isFocusVisible, focusProps } = useFocusRing(
		undefined,
		subSlot(slot, 'focusRing'),
	);
	let isInteractionDisabled = isDisabled || isReadOnly;
	let state = useContext(ToggleStateContext)!;

	let { hoverProps, isHovered } = useHover(
		{
			...props,
			isDisabled: isInteractionDisabled,
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
				isReadOnly,
				isInvalid,
				isRequired: isRequired || false,
				state,
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
			slot: props.slot || undefined,
			'data-selected': isSelected || undefined,
			'data-pressed': isPressed || undefined,
			'data-hovered': isHovered || undefined,
			'data-focused': isFocused || undefined,
			'data-focus-visible': isFocusVisible || undefined,
			'data-disabled': isDisabled || undefined,
			'data-readonly': isReadOnly || undefined,
			'data-invalid': isInvalid || undefined,
			'data-required': isRequired || undefined,
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
