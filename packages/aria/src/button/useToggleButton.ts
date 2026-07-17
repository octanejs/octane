// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/button/useToggleButton.ts).
// octane adaptations:
// - `react-stately/useToggleState` → the ported `../stately/toggle/useToggleState`.
// - React's per-element attribute types → the shared structural prop bag (see useButton).
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention.
import type { RefObject } from '@react-types/shared';

import {
	AriaBaseButtonProps,
	AriaButtonElementTypeProps,
	ButtonAria,
	ButtonProps,
	ElementType,
	useButton,
} from './useButton';
import { chain } from '../utils/chain';
import { mergeProps } from '../utils/mergeProps';
import { S, splitSlot, subSlot } from '../internal';
import type { ToggleState } from '../stately/toggle/useToggleState';

// octane adaptation: minimal structural prop bag (upstream's drags React attribute types).
type DOMAttributes = Record<string, any>;

export interface ToggleButtonProps extends ButtonProps {
	/** Whether the element should be selected (controlled). */
	isSelected?: boolean;
	/** Whether the element should be selected (uncontrolled). */
	defaultSelected?: boolean;
	/** Handler that is called when the element's selection state changes. */
	onChange?: (isSelected: boolean) => void;
}

export interface AriaToggleButtonProps<T extends ElementType = 'button'>
	extends
		ToggleButtonProps,
		Omit<
			AriaBaseButtonProps,
			| 'aria-current'
			| 'form'
			| 'formAction'
			| 'formEncType'
			| 'formMethod'
			| 'formNoValidate'
			| 'formTarget'
			| 'name'
			| 'value'
			| 'type'
		>,
		AriaButtonElementTypeProps<T> {}

export interface AriaToggleButtonOptions<E extends ElementType> extends Omit<
	AriaToggleButtonProps<E>,
	'children'
> {}

export interface ToggleButtonAria<T> extends ButtonAria<T> {
	/** Whether the button is selected. */
	isSelected: boolean;
	/** Whether the button is disabled. */
	isDisabled: boolean;
}

// Order with overrides is important: 'button' should be default
export function useToggleButton(
	props: AriaToggleButtonOptions<'button'>,
	state: ToggleState,
	ref: RefObject<HTMLButtonElement | null>,
): ToggleButtonAria<DOMAttributes>;
export function useToggleButton(
	props: AriaToggleButtonOptions<'a'>,
	state: ToggleState,
	ref: RefObject<HTMLAnchorElement | null>,
): ToggleButtonAria<DOMAttributes>;
export function useToggleButton(
	props: AriaToggleButtonOptions<'div'>,
	state: ToggleState,
	ref: RefObject<HTMLDivElement | null>,
): ToggleButtonAria<DOMAttributes>;
export function useToggleButton(
	props: AriaToggleButtonOptions<'input'>,
	state: ToggleState,
	ref: RefObject<HTMLInputElement | null>,
): ToggleButtonAria<DOMAttributes>;
export function useToggleButton(
	props: AriaToggleButtonOptions<'span'>,
	state: ToggleState,
	ref: RefObject<HTMLSpanElement | null>,
): ToggleButtonAria<DOMAttributes>;
export function useToggleButton(
	props: AriaToggleButtonOptions<ElementType>,
	state: ToggleState,
	ref: RefObject<Element | null>,
): ToggleButtonAria<DOMAttributes>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useToggleButton(
	props: AriaToggleButtonOptions<ElementType>,
	state: ToggleState,
	ref: RefObject<any>,
	slot: symbol | undefined,
): ToggleButtonAria<DOMAttributes>;
/**
 * Provides the behavior and accessibility implementation for a toggle button component.
 * ToggleButtons allow users to toggle a selection on or off, for example switching between two
 * states or modes.
 */
export function useToggleButton(...args: any[]): ToggleButtonAria<DOMAttributes> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useToggleButton');
	const props = user[0] as AriaToggleButtonOptions<ElementType>;
	const state = user[1] as ToggleState;
	const ref = user[2] as RefObject<any>;

	const { isSelected } = state;
	const { isPressed, buttonProps } = useButton(
		{
			...props,
			onPress: chain(state.toggle, props.onPress),
		},
		ref,
		subSlot(slot, 'button'),
	);

	return {
		isPressed,
		isSelected,
		isDisabled: props.isDisabled || false,
		buttonProps: mergeProps(buttonProps, {
			'aria-pressed': isSelected,
		}),
	};
}
