// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/autocomplete/useAutocompleteState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; `ReactNode` → a structural `any` alias (octane renderables); the public
// value-level `onInputChange(value)` callback is unchanged (the onInput rule applies
// only to DOM wiring, which lives in useTextField/useAutocomplete).
import { useState } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { useControlledState } from '../utils/useControlledState';

// octane adaptation: structural alias for React's ReactNode.
type ReactNode = any;

export interface AutocompleteState {
	/** The current value of the autocomplete input. */
	inputValue: string;
	/** Sets the value of the autocomplete input. */
	setInputValue(value: string): void;
	/** The id of the current aria-activedescendant of the autocomplete input. */
	focusedNodeId: string | null;
	/** Sets the id of the current aria-activedescendant of the autocomplete input. */
	setFocusedNodeId(value: string | null): void;
}

export interface AutocompleteProps {
	/** The value of the autocomplete input (controlled). */
	inputValue?: string;
	/** The default value of the autocomplete input (uncontrolled). */
	defaultInputValue?: string;
	/** Handler that is called when the autocomplete input value changes. */
	onInputChange?: (value: string) => void;
	/**
	 * The children wrapped by the autocomplete. Consists of at least an input element and a
	 * collection element to filter.
	 */
	children: ReactNode;
}

// Emulate our other stately hooks which accept all "base" props even if not used
export interface AutocompleteStateOptions extends Omit<AutocompleteProps, 'children'> {}

/**
 * Provides state management for an autocomplete component.
 */
export function useAutocompleteState(props: AutocompleteStateOptions): AutocompleteState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useAutocompleteState(
	props: AutocompleteStateOptions,
	slot: symbol | undefined,
): AutocompleteState;
export function useAutocompleteState(...args: any[]): AutocompleteState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useAutocompleteState');
	const props = user[0] as AutocompleteStateOptions;

	let {
		onInputChange: propsOnInputChange,
		inputValue: propsInputValue,
		defaultInputValue: propsDefaultInputValue = '',
	} = props;

	let onInputChange = (value: string) => {
		if (propsOnInputChange) {
			propsOnInputChange(value);
		}
	};

	let [focusedNodeId, setFocusedNodeId] = useState<string | null>(
		null,
		subSlot(slot, 'focusedNodeId'),
	);
	let [inputValue, setInputValue] = useControlledState(
		propsInputValue,
		propsDefaultInputValue!,
		onInputChange,
		subSlot(slot, 'inputValue'),
	);

	return {
		inputValue,
		setInputValue,
		focusedNodeId,
		setFocusedNodeId,
	};
}
