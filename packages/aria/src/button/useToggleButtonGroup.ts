// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/button/useToggleButtonGroup.ts).
// octane adaptations: React's per-element attribute overloads collapse into the shared
// structural result (same as useButton/useToggleButton); public-hook slot threading.
import type {
	AriaLabelingProps,
	DOMAttributes,
	Key,
	Orientation,
	RefObject,
} from '@react-types/shared';

import { S, splitSlot, subSlot } from '../internal';
import { AriaToggleButtonProps, ToggleButtonAria, useToggleButton } from './useToggleButton';
import type { ElementType } from './useButton';
import type { ToggleGroupProps, ToggleGroupState } from '../stately/toggle/useToggleGroupState';
import type { ToggleState } from '../stately/toggle/useToggleState';
import { useToolbar } from '../toolbar/useToolbar';

export interface AriaToggleButtonGroupProps extends ToggleGroupProps, AriaLabelingProps {
	/**
	 * The orientation of the the toggle button group.
	 *
	 * @default 'horizontal'
	 */
	orientation?: Orientation;
}

export interface ToggleButtonGroupAria {
	/**
	 * Props for the toggle button group container.
	 */
	groupProps: DOMAttributes;
}

export function useToggleButtonGroup(
	props: AriaToggleButtonGroupProps,
	state: ToggleGroupState,
	ref: RefObject<HTMLElement | null>,
): ToggleButtonGroupAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useToggleButtonGroup(
	props: AriaToggleButtonGroupProps,
	state: ToggleGroupState,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): ToggleButtonGroupAria;
export function useToggleButtonGroup(...args: any[]): ToggleButtonGroupAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useToggleButtonGroup');
	const props = user[0] as AriaToggleButtonGroupProps;
	const state = user[1] as ToggleGroupState;
	const ref = user[2] as RefObject<HTMLElement | null>;

	let { isDisabled } = props;
	let { toolbarProps } = useToolbar(props, ref, subSlot(slot, 'toolbar'));

	return {
		groupProps: {
			...toolbarProps,
			role: state.selectionMode === 'single' ? 'radiogroup' : toolbarProps.role,
			'aria-disabled': isDisabled,
		},
	};
}

export interface AriaToggleButtonGroupItemProps<E extends ElementType = 'button'> extends Omit<
	AriaToggleButtonProps<E>,
	'id' | 'isSelected' | 'defaultSelected' | 'onChange'
> {
	/** An identifier for the item in the `selectedKeys` of a ToggleButtonGroup. */
	id: Key;
}

export interface AriaToggleButtonGroupItemOptions<E extends ElementType> extends Omit<
	AriaToggleButtonGroupItemProps<E>,
	'children'
> {}

export function useToggleButtonGroupItem(
	props: AriaToggleButtonGroupItemOptions<ElementType>,
	state: ToggleGroupState,
	ref: RefObject<any>,
): ToggleButtonAria<DOMAttributes>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useToggleButtonGroupItem(
	props: AriaToggleButtonGroupItemOptions<ElementType>,
	state: ToggleGroupState,
	ref: RefObject<any>,
	slot: symbol | undefined,
): ToggleButtonAria<DOMAttributes>;
export function useToggleButtonGroupItem(...args: any[]): ToggleButtonAria<DOMAttributes> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useToggleButtonGroupItem');
	const props = user[0] as AriaToggleButtonGroupItemOptions<ElementType>;
	const state = user[1] as ToggleGroupState;
	const ref = user[2] as RefObject<any>;

	let toggleState: ToggleState = {
		isSelected: state.selectedKeys.has(props.id),
		defaultSelected: false,
		setSelected(isSelected: boolean) {
			state.setSelected(props.id, isSelected);
		},
		toggle() {
			state.toggleKey(props.id);
		},
	};

	let { isPressed, isSelected, isDisabled, buttonProps } = useToggleButton(
		{
			...props,
			id: undefined,
			isDisabled: props.isDisabled || state.isDisabled,
		} as any,
		toggleState,
		ref,
		subSlot(slot, 'toggleButton'),
	);
	if (state.selectionMode === 'single') {
		buttonProps.role = 'radio';
		(buttonProps as any)['aria-checked'] = toggleState.isSelected;
		delete (buttonProps as any)['aria-pressed'];
	}

	return {
		isPressed,
		isSelected,
		isDisabled,
		buttonProps,
	};
}
