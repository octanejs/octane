'use client';
import * as React from 'octane';
import { useComboboxInputValueContext } from '../../combobox/root/ComboboxRootContext.tsrx';

/**
 * The current value of the autocomplete.
 * Doesn't render its own HTML element.
 *
 * Documentation: [Base UI Autocomplete](https://base-ui.com/react/components/autocomplete)
 */
export function AutocompleteValue(props: AutocompleteValue.Props): React.ReactElement {
	const { children } = props;

	const inputValue = useComboboxInputValueContext();

	let returnValue = null;
	if (typeof children === 'function' && !React.isChildrenBlock(children)) {
		returnValue = children(String(inputValue));
	} else if (children != null) {
		returnValue = children;
	} else {
		returnValue = inputValue;
	}

	return <React.Fragment>{returnValue}</React.Fragment>;
}

export interface AutocompleteValueState {}

export interface AutocompleteValueProps {
	children?:
		NonNullable<React.OctaneNode> | null | undefined | ((value: string) => React.OctaneNode);
}

export namespace AutocompleteValue {
	export type State = AutocompleteValueState;
	export type Props = AutocompleteValueProps;
}
