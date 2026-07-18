// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/toggle/useToggleState.ts).
// octane adaptations: React's `ReactNode` children type → `any` (octane descriptors);
// `FocusableProps` comes from the ported interactions area (type-only — upstream's
// @react-types/shared version is typed over React synthetic events); public-hook slot
// threading (splitSlot/subSlot) per the binding convention. The public value-level
// `onChange` callback is unchanged (the onInput rule applies only to DOM wiring).
import type { InputBase, Validation } from '@react-types/shared';
import { useState } from 'octane';

import type { FocusableProps } from '../../interactions/useFocusable';

import { S, splitSlot, subSlot } from '../../internal';
import { useControlledState } from '../utils/useControlledState';

export interface ToggleStateOptions extends InputBase {
	/**
	 * Whether the element should be selected (uncontrolled).
	 */
	defaultSelected?: boolean;
	/**
	 * Whether the element should be selected (controlled).
	 */
	isSelected?: boolean;
	/**
	 * Handler that is called when the element's selection state changes.
	 */
	onChange?: (isSelected: boolean) => void;
}

export interface ToggleProps extends ToggleStateOptions, Validation<boolean>, FocusableProps {
	/**
	 * The label for the element.
	 */
	children?: any;
	/**
	 * The value of the input element, used when submitting an HTML form. See
	 * [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input#htmlattrdefvalue).
	 */
	value?: string;
}

export interface ToggleState {
	/** Whether the toggle is selected. */
	readonly isSelected: boolean;

	/** Whether the toggle is selected by default. */
	readonly defaultSelected: boolean;

	/** Updates selection state. */
	setSelected(isSelected: boolean): void;

	/** Toggle the selection state. */
	toggle(): void;
}

/**
 * Provides state management for toggle components like checkboxes and switches.
 */
export function useToggleState(props?: ToggleStateOptions): ToggleState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useToggleState(
	props: ToggleStateOptions | undefined,
	slot: symbol | undefined,
): ToggleState;
export function useToggleState(...args: any[]): ToggleState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useToggleState');
	const props = (user[0] as ToggleStateOptions | undefined) ?? {};

	let { isReadOnly } = props;

	// have to provide an empty function so useControlledState doesn't throw a fit
	// can't use useControlledState's prop calling because we need the event object from the change
	let [isSelected, setSelected] = useControlledState(
		props.isSelected,
		props.defaultSelected || false,
		props.onChange,
		subSlot(slot, 'selected'),
	);
	let [initialValue] = useState(isSelected, subSlot(slot, 'initial'));

	function updateSelected(value: boolean) {
		if (!isReadOnly) {
			setSelected(value);
		}
	}

	function toggleState() {
		if (!isReadOnly) {
			setSelected(!isSelected);
		}
	}

	return {
		isSelected,
		defaultSelected: props.defaultSelected ?? initialValue,
		setSelected: updateSelected,
		toggle: toggleState,
	};
}
