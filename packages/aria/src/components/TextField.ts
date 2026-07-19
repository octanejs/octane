// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/TextField.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// arrives positionally from `createHideableComponent` (which forwards `props.ref`); the
// plain-`.ts` component uses the S()/subSlot component-slot convention. NATIVE EVENTS: the
// per-keystroke wiring rides octane's native `onInput` (produced inside useTextField); no
// synthetic `onChange` is added here. `DOMProps` comes from './utils' (RAC's own bag), NOT
// `@react-types/shared`; upstream's `GlobalDOMAttributes` → a structural record.
import { createContext, createElement, useCallback, useRef, useState } from 'octane';

import { createHideableComponent } from '../collections/Hidden';
import { S, subSlot } from '../internal';
import { type AriaTextFieldProps, useTextField } from '../textfield/useTextField';
import { filterDOMProps } from '../utils/filterDOMProps';
import { FieldInputContext } from './Autocomplete';
import { FieldErrorContext } from './FieldError';
import { FormContext } from './Form';
import { GroupContext } from './Group';
import { InputContext } from './Input';
import { LabelContext } from './Label';
import { TextAreaContext } from './TextArea';
import { TextContext } from './Text';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	type DOMProps,
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

export interface TextFieldRenderProps {
	/**
	 * Whether the text field is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the value is invalid.
	 *
	 * @selector [data-invalid]
	 */
	isInvalid: boolean;
	/**
	 * Whether the text field is read only.
	 *
	 * @selector [data-readonly]
	 */
	isReadOnly: boolean;
	/**
	 * Whether the text field is required.
	 *
	 * @selector [data-required]
	 */
	isRequired: boolean;
}

export interface TextFieldProps
	extends
		Omit<
			AriaTextFieldProps,
			| 'label'
			| 'placeholder'
			| 'description'
			| 'errorMessage'
			| 'validationState'
			| 'validationBehavior'
		>,
		RACValidation,
		Omit<DOMProps, 'style' | 'className' | 'children'>,
		SlotProps,
		RenderProps<TextFieldRenderProps>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-TextField'
	 */
	className?: ClassNameOrFunction<TextFieldRenderProps>;
	/** Whether the value is invalid. */
	isInvalid?: boolean;
}

export const TextFieldContext = createContext<ContextValue<TextFieldProps, HTMLDivElement>>(null);

/**
 * A text field allows a user to enter a plain text value with a keyboard.
 */
export const TextField = /*#__PURE__*/ createHideableComponent(function TextField(
	props: TextFieldProps,
	ref: any,
) {
	const slot = S('TextField');
	[props, ref] = useContextProps(props, ref, TextFieldContext, subSlot(slot, 'ctx'));
	let { validationBehavior: formValidationBehavior } = useSlottedContext(FormContext) || {};
	let validationBehavior = props.validationBehavior ?? formValidationBehavior ?? 'native';
	let inputRef: any = useRef<HTMLInputElement | null>(null, subSlot(slot, 'input'));
	// octane adaptation: destructuring assignment instead of upstream's `inputRef as unknown`
	// lvalue cast — the merged object ref replaces the local ref exactly like upstream.
	[props, inputRef] = useContextProps(
		props,
		inputRef,
		FieldInputContext as any,
		subSlot(slot, 'fieldInput'),
	);
	let [labelRef, label] = useSlot(
		!props['aria-label'] && !props['aria-labelledby'],
		subSlot(slot, 'labelSlot'),
	);
	let [inputElementType, setInputElementType] = useState('input', subSlot(slot, 'elementType'));
	let { labelProps, inputProps, descriptionProps, errorMessageProps, ...validation } =
		useTextField<any>(
			{
				...removeDataAttributes(props),
				inputElementType,
				label,
				validationBehavior,
			},
			inputRef,
			subSlot(slot, 'textField'),
		);

	// Intercept setting the input ref so we can determine what kind of element we have.
	// useTextField uses this to determine what props to include.
	let inputOrTextAreaRef = useCallback(
		(el: any) => {
			inputRef.current = el;
			if (el) {
				setInputElementType(el instanceof HTMLTextAreaElement ? 'textarea' : 'input');
			}
		},
		[inputRef],
		subSlot(slot, 'inputOrTextAreaRef'),
	);

	let renderProps = useRenderProps(
		{
			...props,
			values: {
				isDisabled: props.isDisabled || false,
				isInvalid: validation.isInvalid,
				isReadOnly: props.isReadOnly || false,
				isRequired: props.isRequired || false,
			},
			defaultClassName: 'react-aria-TextField',
		},
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });
	delete DOMProps.id;

	return createElement(dom.div, {
		...DOMProps,
		...renderProps,
		ref,
		slot: props.slot || undefined,
		'data-disabled': props.isDisabled || undefined,
		'data-invalid': validation.isInvalid || undefined,
		'data-readonly': props.isReadOnly || undefined,
		'data-required': props.isRequired || undefined,
		children: createElement(Provider, {
			values: [
				[LabelContext, { ...labelProps, ref: labelRef }],
				[InputContext, { ...inputProps, ref: inputOrTextAreaRef }],
				[TextAreaContext, { ...inputProps, ref: inputOrTextAreaRef }],
				[
					GroupContext,
					{
						role: 'presentation',
						isInvalid: validation.isInvalid,
						isDisabled: props.isDisabled || false,
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
			children: renderProps.children,
		}),
	});
});
