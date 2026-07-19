// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Checkbox.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` components use the S()/subSlot component-slot convention (`useContext`
// stays slotless — context-identity keyed); `useCheckboxAria` keeps upstream's conditional hook
// calls (octane hooks are slot-keyed, so the group/standalone branches use distinct sub-slots);
// the ported useCheckbox/useCheckboxGroupItem already carry octane's native change-event wiring
// for the hidden checkbox input — inputProps pass through untouched.
import type { HoverEvents, RefObject } from '@react-types/shared';
import { createContext, createElement, useContext, useMemo } from 'octane';

import { type AriaCheckboxProps, type CheckboxAria, useCheckbox } from '../checkbox/useCheckbox';
import { type AriaCheckboxGroupProps, useCheckboxGroup } from '../checkbox/useCheckboxGroup';
import { useCheckboxGroupItem } from '../checkbox/useCheckboxGroupItem';
import { useFocusRing } from '../focus/useFocusRing';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import {
	type CheckboxGroupState,
	useCheckboxGroupState,
} from '../stately/checkbox/useCheckboxGroupState';
import { useToggleState } from '../stately/toggle/useToggleState';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { mergeRefs } from '../utils/mergeRefs';
import { useObjectRef } from '../utils/useObjectRef';
import { VisuallyHidden } from '../visually-hidden/VisuallyHidden';
import { FieldErrorContext } from './FieldError';
import { FormContext } from './Form';
import { LabelContext } from './Label';
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

export interface CheckboxGroupProps
	extends
		Omit<
			AriaCheckboxGroupProps,
			| 'children'
			| 'label'
			| 'description'
			| 'errorMessage'
			| 'validationState'
			| 'validationBehavior'
		>,
		RACValidation,
		RenderProps<CheckboxGroupRenderProps, 'div'>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-CheckboxGroup'
	 */
	className?: ClassNameOrFunction<CheckboxGroupRenderProps>;
}

export interface CheckboxProps
	extends
		Omit<AriaCheckboxProps, 'children' | 'validationState' | 'validationBehavior'>,
		HoverEvents,
		RACValidation,
		RenderProps<CheckboxRenderProps, 'label'>,
		SlotProps,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Checkbox'
	 */
	className?: ClassNameOrFunction<CheckboxRenderProps>;
	/**
	 * A ref for the HTML input element.
	 */
	inputRef?: RefObject<HTMLInputElement | null>;
}

export interface CheckboxFieldProps
	extends
		Omit<AriaCheckboxProps, 'children' | 'validationState' | 'validationBehavior'>,
		RACValidation,
		RenderProps<CheckboxFieldRenderProps>,
		SlotProps,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-CheckboxField'
	 */
	className?: ClassNameOrFunction<CheckboxFieldRenderProps>;
	/**
	 * A ref for the HTML input element.
	 */
	inputRef?: RefObject<HTMLInputElement | null>;
}

export interface CheckboxButtonProps
	extends
		HoverEvents,
		RenderProps<CheckboxButtonRenderProps, 'label'>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-CheckboxButton'
	 */
	className?: ClassNameOrFunction<CheckboxButtonRenderProps>;
}

export interface CheckboxGroupRenderProps {
	/**
	 * Whether the checkbox group is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the checkbox group is read only.
	 *
	 * @selector [data-readonly]
	 */
	isReadOnly: boolean;
	/**
	 * Whether the checkbox group is required.
	 *
	 * @selector [data-required]
	 */
	isRequired: boolean;
	/**
	 * Whether the checkbox group is invalid.
	 *
	 * @selector [data-invalid]
	 */
	isInvalid: boolean;
	/**
	 * State of the checkbox group.
	 */
	state: CheckboxGroupState;
}

export interface CheckboxRenderProps {
	/**
	 * Whether the checkbox is selected.
	 *
	 * @selector [data-selected]
	 */
	isSelected: boolean;
	/**
	 * Whether the checkbox is indeterminate.
	 *
	 * @selector [data-indeterminate]
	 */
	isIndeterminate: boolean;
	/**
	 * Whether the checkbox is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
	/**
	 * Whether the checkbox is currently in a pressed state.
	 *
	 * @selector [data-pressed]
	 */
	isPressed: boolean;
	/**
	 * Whether the checkbox is focused, either via a mouse or keyboard.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the checkbox is keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the checkbox is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the checkbox is read only.
	 *
	 * @selector [data-readonly]
	 */
	isReadOnly: boolean;
	/**
	 * Whether the checkbox invalid.
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

export interface CheckboxFieldRenderProps {
	/**
	 * Whether the checkbox is selected.
	 *
	 * @selector [data-selected]
	 */
	isSelected: boolean;
	/**
	 * Whether the checkbox is indeterminate.
	 *
	 * @selector [data-indeterminate]
	 */
	isIndeterminate: boolean;
	/**
	 * Whether the checkbox is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the checkbox is read only.
	 *
	 * @selector [data-readonly]
	 */
	isReadOnly: boolean;
	/**
	 * Whether the checkbox invalid.
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

export interface CheckboxButtonRenderProps extends CheckboxRenderProps {}

export const CheckboxContext = createContext<ContextValue<CheckboxProps, HTMLLabelElement>>(null);
export const CheckboxFieldContext =
	createContext<ContextValue<CheckboxFieldProps, HTMLDivElement>>(null);
export const CheckboxGroupContext =
	createContext<ContextValue<CheckboxGroupProps, HTMLDivElement>>(null);
export const CheckboxGroupStateContext = createContext<CheckboxGroupState | null>(null);

/**
 * A checkbox group allows a user to select multiple items from a list of options.
 */
export function CheckboxGroup(props: CheckboxGroupProps): any {
	const slot = S('CheckboxGroup');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, CheckboxGroupContext, subSlot(slot, 'ctx'));
	let { validationBehavior: formValidationBehavior } =
		useSlottedContext(FormContext, undefined, subSlot(slot, 'form')) || {};
	let validationBehavior = props.validationBehavior ?? formValidationBehavior ?? 'native';
	let state = useCheckboxGroupState(
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
	let { groupProps, labelProps, descriptionProps, errorMessageProps, ...validation } =
		useCheckboxGroup(
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
				isDisabled: state.isDisabled,
				isReadOnly: state.isReadOnly,
				isRequired: props.isRequired || false,
				isInvalid: state.isInvalid,
				state,
			},
			defaultClassName: 'react-aria-CheckboxGroup',
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });

	return createElement(dom.div, {
		...mergeProps(DOMProps, renderProps, groupProps),
		ref,
		slot: props.slot || undefined,
		'data-readonly': state.isReadOnly || undefined,
		'data-required': props.isRequired || undefined,
		'data-invalid': state.isInvalid || undefined,
		'data-disabled': props.isDisabled || undefined,
		children: createElement(Provider, {
			values: [
				[CheckboxGroupStateContext, state],
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
			children: renderProps.children,
		}),
	});
}

interface InternalCheckboxContextValue extends CheckboxAria {
	inputRef: RefObject<HTMLInputElement | null>;
	defaultClassName: string;
	isIndeterminate?: boolean;
	isRequired?: boolean;
}

const InternalCheckboxContext = createContext<InternalCheckboxContextValue | null>(null);

/**
 * A checkbox allows a user to select an item, with support for validation and help text.
 */
export function CheckboxField(props: CheckboxFieldProps): any {
	const slot = S('CheckboxField');
	let { inputRef: userProvidedInputRef = null, ...otherProps } = props;
	let ref: any;
	[props, ref] = useContextProps(
		otherProps as CheckboxFieldProps,
		(otherProps as any).ref,
		CheckboxFieldContext,
		subSlot(slot, 'ctx'),
	);
	let groupState = useContext(CheckboxGroupStateContext);
	let [aria, inputRef] = useCheckboxAria(props, userProvidedInputRef, subSlot(slot, 'aria'));
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
			defaultClassName: 'react-aria-CheckboxField',
			values: {
				isSelected,
				isIndeterminate: props.isIndeterminate || false,
				isDisabled,
				isReadOnly,
				isInvalid,
				isRequired: props.isRequired || false,
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
		'data-indeterminate': props.isIndeterminate || undefined,
		'data-disabled': isDisabled || undefined,
		'data-readonly': isReadOnly || undefined,
		'data-invalid': isInvalid || undefined,
		'data-required': props.isRequired || undefined,
		children: createElement(Provider, {
			values: [
				[
					InternalCheckboxContext,
					{
						...aria,
						inputRef,
						defaultClassName: 'react-aria-CheckboxButton',
						isIndeterminate: props.isIndeterminate,
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
				// In a CheckboxGroup, validation is handled at the group level instead of repeated on each checkbox.
				[FieldErrorContext, groupState ? null : { isInvalid, validationDetails, validationErrors }],
			] as any,
			children: renderProps.children,
		}),
	});
}

function useCheckboxAria(
	props: CheckboxProps | CheckboxFieldProps,
	userProvidedInputRef: RefObject<HTMLInputElement | null> | null,
	slot: symbol | undefined,
): [CheckboxAria, RefObject<HTMLInputElement | null>] {
	let { validationBehavior: formValidationBehavior } =
		useSlottedContext(FormContext, undefined, subSlot(slot, 'form')) || {};
	let validationBehavior = props.validationBehavior ?? formValidationBehavior ?? 'native';
	let groupState = useContext(CheckboxGroupStateContext);
	let inputRef = useObjectRef(
		useMemo(
			() => mergeRefs(userProvidedInputRef, props.inputRef !== undefined ? props.inputRef : null),
			[userProvidedInputRef, props.inputRef],
			subSlot(slot, 'mergeRefs'),
		),
		subSlot(slot, 'objectRef'),
	);
	let checkboxProps = {
		...removeDataAttributes(props),
		children: typeof props.children === 'function' ? true : props.children,
		value: props.value!,
		validationBehavior,
	};

	// octane divergence from React's rules of hooks (intentional, supported): hooks are
	// slot-keyed, so the group/standalone branches may run conditionally as long as each
	// call site keeps a distinct stable slot.
	let aria = groupState
		? useCheckboxGroupItem(checkboxProps, groupState, inputRef, subSlot(slot, 'groupItem'))
		: useCheckbox(
				checkboxProps,
				useToggleState(props, subSlot(slot, 'toggleState')),
				inputRef,
				subSlot(slot, 'checkbox'),
			);
	return [aria, inputRef];
}

/**
 * A checkbox allows a user to select multiple items from a list of individual items, or
 * to mark one individual item as selected.
 *
 * @deprecated Use CheckboxField + CheckboxButton instead.
 */
export function Checkbox(props: CheckboxProps): any {
	const slot = S('Checkbox');
	let { inputRef: userProvidedInputRef = null, ...otherProps } = props;
	let ref: any;
	[props, ref] = useContextProps(
		otherProps as CheckboxProps,
		(otherProps as any).ref,
		CheckboxContext,
		subSlot(slot, 'ctx'),
	);
	let [aria, inputRef] = useCheckboxAria(props, userProvidedInputRef, subSlot(slot, 'aria'));

	return createElement(InternalCheckboxContext.Provider, {
		value: {
			...aria,
			inputRef,
			defaultClassName: 'react-aria-Checkbox',
			isIndeterminate: props.isIndeterminate,
			isRequired: props.isRequired,
		},
		children: createElement(CheckboxButton, { ...props, ref } as any),
	});
}

/**
 * A checkbox button is the clickable area of a checkbox, including the indicator and label.
 */
export function CheckboxButton(props: CheckboxButtonProps): any {
	const slot = S('CheckboxButton');
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
		isIndeterminate,
		isRequired,
	} = useContext(InternalCheckboxContext)!;
	let { isFocused, isFocusVisible, focusProps } = useFocusRing(
		undefined,
		subSlot(slot, 'focusRing'),
	);
	let isInteractionDisabled = isDisabled || isReadOnly;

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
				isIndeterminate: isIndeterminate || false,
				isPressed,
				isHovered,
				isFocused,
				isFocusVisible,
				isDisabled,
				isReadOnly,
				isInvalid,
				isRequired: isRequired || false,
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
			'data-indeterminate': isIndeterminate || undefined,
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
