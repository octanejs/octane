// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Autocomplete.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; the component is a plain
// function with the S()/subSlot component-slot convention (no ref — upstream Autocomplete
// is not a forwardRef component; it renders no DOM of its own). React types → the binding's
// ported equivalents. `FieldInputContext` keeps the exact Phase-4 value shape the field
// primitives already consume — TextField/SearchField/NumberField pass it to
// `useContextProps(props, inputRef, FieldInputContext as any, ...)`: the context's
// `onChange`/`value` are VALUE-level members of the ported (native-event) AriaTextFieldProps
// surface, so the merged props flow straight into useTextField, which wires onChange onto
// octane's NATIVE `input` event. No synthetic onChange anywhere.
import type {
	AriaLabelingProps,
	DOMProps,
	FocusableElement,
	Node,
	ValueBase,
} from '@react-types/shared';
import { createContext, createElement, useRef } from 'octane';

import { type AriaAutocompleteProps, useAutocomplete } from '../autocomplete/useAutocomplete';
// octane adaptation: the ported NATIVE-event handler bags (upstream: FocusEvents/
// KeyboardEvents from '@react-types/shared', typed over React synthetic events).
import type { FocusEvents } from '../interactions/useFocus';
import type { KeyboardEvents } from '../interactions/useKeyboard';
import type { AriaTextFieldProps } from '../textfield/useTextField';
import {
	type AutocompleteState,
	useAutocompleteState,
} from '../stately/autocomplete/useAutocompleteState';
import { mergeProps } from '../utils/mergeProps';
import { S, subSlot } from '../internal';
import {
	type ContextValue,
	Provider,
	removeDataAttributes,
	type SlotProps,
	type SlottedContextValue,
	useSlottedContext,
} from './utils';

export interface AutocompleteProps<T = object> extends AriaAutocompleteProps<T>, SlotProps {}
export const AutocompleteContext =
	createContext<SlottedContextValue<Partial<AutocompleteProps<any>>>>(null);
export const AutocompleteStateContext = createContext<AutocompleteState | null>(null);

export interface SelectableCollectionContextValue<T> extends DOMProps, AriaLabelingProps {
	filter?: (nodeTextValue: string, node: Node<T>) => boolean;
	/** Whether the collection items should use virtual focus instead of being focused directly. */
	shouldUseVirtualFocus?: boolean;
	/** Whether typeahead is disabled. */
	disallowTypeAhead?: boolean;
}
interface FieldInputContextValue<T = FocusableElement>
	extends
		DOMProps,
		FocusEvents<T>,
		KeyboardEvents,
		Pick<ValueBase<string>, 'onChange' | 'value'>,
		Pick<
			AriaTextFieldProps,
			| 'enterKeyHint'
			| 'aria-controls'
			| 'aria-autocomplete'
			| 'aria-activedescendant'
			| 'spellCheck'
			| 'autoCorrect'
			| 'autoComplete'
		> {}

export const SelectableCollectionContext =
	createContext<ContextValue<SelectableCollectionContextValue<any>, HTMLElement>>(null);
export const FieldInputContext =
	createContext<ContextValue<FieldInputContextValue, FocusableElement>>(null);

/**
 * An autocomplete allows users to search or filter a list of suggestions.
 */
export function Autocomplete<T>(props: AutocompleteProps<T>): any {
	const slot = S('Autocomplete');
	let ctx = useSlottedContext(AutocompleteContext, props.slot);
	props = mergeProps(ctx, props) as AutocompleteProps<T>;
	let { filter, disableAutoFocusFirst } = props;
	let state = useAutocompleteState(props, subSlot(slot, 'state'));
	let inputRef = useRef<HTMLInputElement | null>(null, subSlot(slot, 'inputRef'));
	let collectionRef = useRef<HTMLElement | null>(null, subSlot(slot, 'collectionRef'));
	let {
		inputProps,
		collectionProps,
		collectionRef: mergedCollectionRef,
		filter: filterFn,
	} = useAutocomplete(
		{
			...removeDataAttributes(props),
			filter,
			disableAutoFocusFirst,
			inputRef,
			collectionRef,
		},
		state,
		subSlot(slot, 'autocomplete'),
	);

	return createElement(Provider, {
		values: [
			[AutocompleteStateContext, state],
			[
				FieldInputContext,
				{
					...inputProps,
					ref: inputRef,
				},
			],
			[
				SelectableCollectionContext,
				{
					...collectionProps,
					filter: filterFn,
					ref: mergedCollectionRef,
				},
			],
		] as any,
		children: props.children,
	});
}
