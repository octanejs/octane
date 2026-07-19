// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/NumberField.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref`, passed into `useContextProps` explicitly and re-applied as the merged object
// ref; the plain-`.ts` component uses the S()/subSlot component-slot convention; the
// Provider's two children (group div + optional hidden form input) keep a stable two-item
// array shape (null in the hidden-input position when `name` is absent). NATIVE EVENTS: the
// per-keystroke wiring rides octane's native `onInput` (produced inside useNumberField); the
// stepper buttons ride incrementButtonProps/decrementButtonProps through ButtonContext slots
// exactly like upstream. Upstream's `GlobalDOMAttributes` → a structural record.
import type { InputDOMProps } from '@react-types/shared';
import { createContext, createElement, useRef } from 'octane';

import { useLocale } from '../i18n/I18nProvider';
import { S, subSlot } from '../internal';
import { type AriaNumberFieldProps, useNumberField } from '../numberfield/useNumberField';
import {
	type NumberFieldState,
	useNumberFieldState,
} from '../stately/numberfield/useNumberFieldState';
import { filterDOMProps } from '../utils/filterDOMProps';
import { ButtonContext } from './Button';
import { FieldErrorContext } from './FieldError';
import { FormContext } from './Form';
import { GroupContext } from './Group';
import { InputContext } from './Input';
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

export interface NumberFieldRenderProps {
	/**
	 * Whether the number field is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the number field is invalid.
	 *
	 * @selector [data-invalid]
	 */
	isInvalid: boolean;
	/**
	 * Whether the number field is read only.
	 *
	 * @selector [data-readonly]
	 */
	isReadOnly: boolean;
	/**
	 * Whether the number field is required.
	 *
	 * @selector [data-required]
	 */
	isRequired: boolean;
	/**
	 * State of the number field.
	 */
	state: NumberFieldState;
}

export interface NumberFieldProps
	extends
		Omit<
			AriaNumberFieldProps,
			| 'label'
			| 'placeholder'
			| 'description'
			| 'errorMessage'
			| 'validationState'
			| 'validationBehavior'
		>,
		RACValidation,
		InputDOMProps,
		RenderProps<NumberFieldRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-NumberField'
	 */
	className?: ClassNameOrFunction<NumberFieldRenderProps>;
}

export const NumberFieldContext =
	createContext<ContextValue<NumberFieldProps, HTMLDivElement>>(null);
export const NumberFieldStateContext = createContext<NumberFieldState | null>(null);

/**
 * A number field allows a user to enter a number, and increment or decrement the value using
 * stepper buttons.
 */
export function NumberField(props: NumberFieldProps): any {
	const slot = S('NumberField');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, NumberFieldContext, subSlot(slot, 'ctx'));
	let { validationBehavior: formValidationBehavior } = useSlottedContext(FormContext) || {};
	let validationBehavior = props.validationBehavior ?? formValidationBehavior ?? 'native';
	let { locale } = useLocale(subSlot(slot, 'locale'));
	let state = useNumberFieldState(
		{
			...props,
			locale,
			validationBehavior,
		},
		subSlot(slot, 'state'),
	);

	let inputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'input'));
	let [labelRef, label] = useSlot(
		!props['aria-label'] && !props['aria-labelledby'],
		subSlot(slot, 'labelSlot'),
	);
	let {
		labelProps,
		groupProps,
		inputProps,
		incrementButtonProps,
		decrementButtonProps,
		descriptionProps,
		errorMessageProps,
		...validation
	} = useNumberField(
		{
			...removeDataAttributes(props),
			label,
			validationBehavior,
		},
		state,
		inputRef,
		subSlot(slot, 'numberField'),
	);

	let renderProps = useRenderProps(
		{
			...props,
			values: {
				state,
				isDisabled: props.isDisabled || false,
				isInvalid: validation.isInvalid || false,
				isRequired: props.isRequired || false,
				isReadOnly: props.isReadOnly || false,
			},
			defaultClassName: 'react-aria-NumberField',
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });
	delete DOMProps.id;

	return createElement(Provider, {
		values: [
			[NumberFieldStateContext, state],
			[GroupContext, groupProps],
			[InputContext, { ...inputProps, ref: inputRef }],
			[LabelContext, { ...labelProps, ref: labelRef }],
			[
				ButtonContext,
				{
					slots: {
						increment: incrementButtonProps,
						decrement: decrementButtonProps,
					},
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
			[FieldErrorContext, validation],
		] as any,
		// octane adaptation: keys keep the two-item child array (group div + optional
		// hidden form input) reconciling stably (upstream renders a JSX fragment).
		children: [
			createElement(dom.div, {
				key: 'numberfield',
				...DOMProps,
				...renderProps,
				ref,
				slot: props.slot || undefined,
				'data-disabled': props.isDisabled || undefined,
				'data-readonly': props.isReadOnly || undefined,
				'data-required': props.isRequired || undefined,
				'data-invalid': validation.isInvalid || undefined,
			}),
			props.name
				? createElement('input', {
						key: 'hidden-input',
						type: 'hidden',
						name: props.name,
						form: props.form,
						value: isNaN(state.numberValue) ? '' : state.numberValue,
						disabled: props.isDisabled || undefined,
					})
				: null,
		],
	});
}
