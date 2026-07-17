// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/switch/useSwitch.ts).
// octane adaptations: React's per-element attribute types → the structural bags the
// ported useToggle returns; public-hook slot threading.
import type { InputDOMProps, RefObject, ValidationResult } from '@react-types/shared';

import { S, splitSlot, subSlot } from '../internal';
import { AriaToggleProps, useToggle } from '../toggle/useToggle';
import type { ToggleProps, ToggleState } from '../stately/toggle/useToggleState';

type DOMAttributes = Record<string, any>;

export interface SwitchProps extends ToggleProps {}

export interface AriaSwitchProps extends SwitchProps, InputDOMProps, AriaToggleProps {
	/**
	 * Identifies the element (or elements) whose contents or presence are controlled by the current
	 * element.
	 */
	'aria-controls'?: string;
}

export interface SwitchAria extends ValidationResult {
	/** Props for the label wrapper element. */
	labelProps: DOMAttributes;
	/** Props for the input element. */
	inputProps: DOMAttributes;
	/** Props for the switch description element, if any. */
	descriptionProps: DOMAttributes;
	/** Props for the switch error message element, if any. */
	errorMessageProps: DOMAttributes;
	/** Whether the switch is selected. */
	isSelected: boolean;
	/** Whether the switch is in a pressed state. */
	isPressed: boolean;
	/** Whether the switch is disabled. */
	isDisabled: boolean;
	/** Whether the switch is read only. */
	isReadOnly: boolean;
}

export function useSwitch(
	props: AriaSwitchProps,
	state: ToggleState,
	ref: RefObject<HTMLInputElement | null>,
): SwitchAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSwitch(
	props: AriaSwitchProps,
	state: ToggleState,
	ref: RefObject<HTMLInputElement | null>,
	slot: symbol | undefined,
): SwitchAria;
export function useSwitch(...args: any[]): SwitchAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSwitch');
	const props = user[0] as AriaSwitchProps;
	const state = user[1] as ToggleState;
	const ref = user[2] as RefObject<HTMLInputElement | null>;

	let { labelProps, inputProps, isSelected, ...states } = useToggle(
		props,
		state,
		ref,
		subSlot(slot, 'toggle'),
	);

	return {
		labelProps,
		inputProps: {
			...inputProps,
			role: 'switch',
			checked: isSelected,
		},
		isSelected,
		...states,
	};
}
