// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/searchfield/useSearchFieldState.ts).
// octane adaptations: `FocusableProps` comes from the ported interactions area (type-only —
// upstream's @react-types/shared version is typed over React synthetic events);
// public-hook slot threading (splitSlot/subSlot) per the binding convention. The public
// value-level `onChange` callback is unchanged (the onInput rule applies only to DOM wiring).
import type {
	HelpTextProps,
	InputBase,
	LabelableProps,
	TextInputBase,
	Validation,
	ValueBase,
} from '@react-types/shared';

import type { FocusableProps } from '../../interactions/useFocusable';
import { S, splitSlot, subSlot } from '../../internal';
import { useControlledState } from '../utils/useControlledState';

// Copied here to avoid depending on @react-aria/textfield from stately.
export interface TextFieldProps<T = HTMLInputElement>
	extends
		InputBase,
		Validation<string>,
		HelpTextProps,
		FocusableProps<T>,
		TextInputBase,
		ValueBase<string>,
		LabelableProps {}

export interface SearchFieldProps extends TextFieldProps {
	/** Handler that is called when the SearchField is submitted. */
	onSubmit?: (value: string) => void;

	/** Handler that is called when the clear button is pressed. */
	onClear?: () => void;
}

export interface SearchFieldState {
	/** The current value of the search field. */
	readonly value: string;

	/** Sets the value of the search field. */
	setValue(value: string): void;
}

/**
 * Provides state management for a search field.
 */
export function useSearchFieldState(props: SearchFieldProps): SearchFieldState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSearchFieldState(
	props: SearchFieldProps,
	slot: symbol | undefined,
): SearchFieldState;
export function useSearchFieldState(...args: any[]): SearchFieldState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSearchFieldState');
	const props = user[0] as SearchFieldProps;

	let [value, setValue] = useControlledState(
		toString(props.value),
		toString(props.defaultValue) || '',
		props.onChange,
		subSlot(slot, 'value'),
	);

	return {
		value,
		setValue,
	};
}

function toString(val: any) {
	if (val == null) {
		return;
	}

	return val.toString();
}
