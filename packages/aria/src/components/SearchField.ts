// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/SearchField.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// arrives positionally from `createHideableComponent` (which forwards `props.ref`); the
// plain-`.ts` component uses the S()/subSlot component-slot convention. NATIVE EVENTS: the
// per-keystroke wiring rides octane's native `onInput` (produced inside useSearchField), and
// the clear button clears through the native path (useSearchField's clearButtonProps → the
// ButtonContext); no synthetic `onChange` is added. Upstream's `GlobalDOMAttributes` → a
// structural record.
import { createContext, createElement, useRef } from 'octane';

import { createHideableComponent } from '../collections/Hidden';
import { S, subSlot } from '../internal';
import { type AriaSearchFieldProps, useSearchField } from '../searchfield/useSearchField';
import {
	type SearchFieldState,
	useSearchFieldState,
} from '../stately/searchfield/useSearchFieldState';
import { filterDOMProps } from '../utils/filterDOMProps';
import { FieldInputContext } from './Autocomplete';
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

export interface SearchFieldRenderProps {
	/**
	 * Whether the search field is empty.
	 *
	 * @selector [data-empty]
	 */
	isEmpty: boolean;
	/**
	 * Whether the search field is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
	/**
	 * Whether the search field is invalid.
	 *
	 * @selector [data-invalid]
	 */
	isInvalid: boolean;
	/**
	 * Whether the search field is read only.
	 *
	 * @selector [data-readonly]
	 */
	isReadOnly: boolean;
	/**
	 * Whether the search field is required.
	 *
	 * @selector [data-required]
	 */
	isRequired: boolean;
	/**
	 * State of the search field.
	 */
	state: SearchFieldState;
}

export interface SearchFieldProps
	extends
		Omit<
			AriaSearchFieldProps,
			| 'label'
			| 'placeholder'
			| 'description'
			| 'errorMessage'
			| 'validationState'
			| 'validationBehavior'
		>,
		RACValidation,
		RenderProps<SearchFieldRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-SearchField'
	 */
	className?: ClassNameOrFunction<SearchFieldRenderProps>;
}

export const SearchFieldContext =
	createContext<ContextValue<SearchFieldProps, HTMLDivElement>>(null);

/**
 * A search field allows a user to enter and clear a search query.
 */
export const SearchField = /*#__PURE__*/ createHideableComponent(function SearchField(
	props: SearchFieldProps,
	ref: any,
) {
	const slot = S('SearchField');
	[props, ref] = useContextProps(props, ref, SearchFieldContext, subSlot(slot, 'ctx'));
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
	let state = useSearchFieldState(
		{
			...props,
			validationBehavior,
		},
		subSlot(slot, 'state'),
	);

	let {
		labelProps,
		inputProps,
		clearButtonProps,
		descriptionProps,
		errorMessageProps,
		...validation
	} = useSearchField(
		{
			...removeDataAttributes(props),
			label,
			validationBehavior,
		},
		state,
		inputRef,
		subSlot(slot, 'searchField'),
	);

	let renderProps = useRenderProps(
		{
			...props,
			values: {
				isEmpty: state.value === '',
				isDisabled: props.isDisabled || false,
				isInvalid: validation.isInvalid || false,
				isReadOnly: props.isReadOnly || false,
				isRequired: props.isRequired || false,
				state,
			},
			defaultClassName: 'react-aria-SearchField',
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
		'data-empty': state.value === '' || undefined,
		'data-disabled': props.isDisabled || undefined,
		'data-invalid': validation.isInvalid || undefined,
		'data-readonly': props.isReadOnly || undefined,
		'data-required': props.isRequired || undefined,
		children: createElement(Provider, {
			values: [
				[LabelContext, { ...labelProps, ref: labelRef }],
				[InputContext, { ...inputProps, ref: inputRef }],
				[ButtonContext, clearButtonProps],
				[
					TextContext,
					{
						slots: {
							description: descriptionProps,
							errorMessage: errorMessageProps,
						},
					},
				],
				[GroupContext, { isInvalid: validation.isInvalid, isDisabled: props.isDisabled || false }],
				[FieldErrorContext, validation],
			] as any,
			children: renderProps.children,
		}),
	});
});
