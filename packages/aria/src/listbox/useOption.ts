// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/listbox/useOption.ts).
// octane adaptations:
// - `DOMAttributes` is a local structural prop-bag alias (upstream's is typed over React's
//   synthetic handlers); `optionProps` is typed as that bag so the virtualized
//   `aria-posinset`/`aria-setsize` assignments type-check.
// - `getItemCount` / `ListState` from the ported stately collections/list.
// - Public-hook slot threading (splitSlot/subSlot) per the binding convention
//   (`useLinkProps` composes only context-reading hooks and takes no slot, matching
//   the ported useLink).
import { chain } from '../utils/chain';

import type { FocusableElement, Key, RefObject } from '@react-types/shared';
import { filterDOMProps } from '../utils/filterDOMProps';
import { getItemCount } from '../stately/collections/getItemCount';
import { getItemId, listData } from './utils';
import { isFocusVisible } from '../interactions/useFocusVisible';
import type { ListState } from '../stately/list/useListState';
import { mergeProps } from '../utils/mergeProps';
import { type SelectableItemStates, useSelectableItem } from '../selection/useSelectableItem';
import { useHover } from '../interactions/useHover';
import { useLinkProps } from '../utils/openLink';
import { useSlotId } from '../utils/useId';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface OptionAria extends SelectableItemStates {
	/** Props for the option element. */
	optionProps: DOMAttributes;

	/** Props for the main text element inside the option. */
	labelProps: DOMAttributes;

	/** Props for the description text element inside the option, if any. */
	descriptionProps: DOMAttributes;

	/** Whether the option is currently focused. */
	isFocused: boolean;

	/** Whether the option is keyboard focused. */
	isFocusVisible: boolean;
}

export interface AriaOptionProps {
	/**
	 * Whether the option is disabled.
	 *
	 * @deprecated
	 */
	isDisabled?: boolean;

	/**
	 * Whether the option is selected.
	 *
	 * @deprecated
	 */
	isSelected?: boolean;

	/** A screen reader only label for the option. */
	'aria-label'?: string;

	/** The unique key for the option. */
	key: Key;

	/**
	 * Whether selection should occur on press up instead of press down.
	 *
	 * @deprecated
	 */
	shouldSelectOnPressUp?: boolean;

	/**
	 * Whether the option should be focused when the user hovers over it.
	 *
	 * @deprecated
	 */
	shouldFocusOnHover?: boolean;

	/**
	 * Whether the option is contained in a virtual scrolling listbox.
	 *
	 * @deprecated
	 */
	isVirtualized?: boolean;

	/**
	 * Whether the option should use virtual focus instead of being focused directly.
	 *
	 * @deprecated
	 */
	shouldUseVirtualFocus?: boolean;
}

/**
 * Provides the behavior and accessibility implementation for an option in a listbox.
 * See `useListBox` for more details about listboxes.
 *
 * @param props - Props for the option.
 * @param state - State for the listbox, as returned by `useListState`.
 */
export function useOption<T>(
	props: AriaOptionProps,
	state: ListState<T>,
	ref: RefObject<FocusableElement | null>,
): OptionAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useOption<T>(
	props: AriaOptionProps,
	state: ListState<T>,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): OptionAria;
export function useOption(...args: any[]): OptionAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useOption');
	const props = user[0] as AriaOptionProps;
	const state = user[1] as ListState<unknown>;
	const ref = user[2] as RefObject<FocusableElement | null>;

	let { key } = props;

	let data = listData.get(state);

	let isDisabled = props.isDisabled ?? state.selectionManager.isDisabled(key);
	let isSelected = props.isSelected ?? state.selectionManager.isSelected(key);
	let shouldSelectOnPressUp = props.shouldSelectOnPressUp ?? data?.shouldSelectOnPressUp;
	let shouldFocusOnHover = props.shouldFocusOnHover ?? data?.shouldFocusOnHover;
	let shouldUseVirtualFocus = props.shouldUseVirtualFocus ?? data?.shouldUseVirtualFocus;
	let isVirtualized = props.isVirtualized ?? data?.isVirtualized;

	let labelId = useSlotId(undefined, subSlot(slot, 'labelId'));
	let descriptionId = useSlotId(undefined, subSlot(slot, 'descriptionId'));

	let optionProps: DOMAttributes = {
		role: 'option',
		'aria-disabled': isDisabled || undefined,
		'aria-selected': state.selectionManager.selectionMode !== 'none' ? isSelected : undefined,
		'aria-label': props['aria-label'],
		'aria-labelledby': labelId,
		'aria-describedby': descriptionId,
	};

	let item = state.collection.getItem(key);
	if (isVirtualized) {
		let index = Number(item?.index);
		optionProps['aria-posinset'] = Number.isNaN(index) ? undefined : index + 1;
		optionProps['aria-setsize'] = getItemCount(state.collection);
	}

	let onAction = data?.onAction ? () => data?.onAction?.(key) : undefined;
	let id = getItemId(state, key);
	let { itemProps, isPressed, isFocused, hasAction, allowsSelection } = useSelectableItem(
		{
			selectionManager: state.selectionManager,
			key,
			ref,
			shouldSelectOnPressUp,
			allowsDifferentPressOrigin: shouldSelectOnPressUp && shouldFocusOnHover,
			isVirtualized,
			shouldUseVirtualFocus,
			isDisabled,
			onAction:
				onAction || item?.props?.onAction ? chain(item?.props?.onAction, onAction) : undefined,
			linkBehavior: data?.linkBehavior,
			// @ts-ignore
			UNSTABLE_itemBehavior: data?.['UNSTABLE_itemBehavior'],
			id,
		},
		subSlot(slot, 'item'),
	);

	let { hoverProps } = useHover(
		{
			isDisabled: isDisabled || !shouldFocusOnHover,
			onHoverStart() {
				if (!isFocusVisible()) {
					state.selectionManager.setFocused(true);
					state.selectionManager.setFocusedKey(key);
				}
			},
		},
		subSlot(slot, 'hover'),
	);

	let domProps = filterDOMProps(item?.props);
	delete domProps.id;
	let linkProps = useLinkProps(item?.props);

	return {
		optionProps: {
			...optionProps,
			...mergeProps(domProps, itemProps, hoverProps, linkProps),
			id,
		},
		labelProps: {
			id: labelId,
		},
		descriptionProps: {
			id: descriptionId,
		},
		isFocused,
		isFocusVisible: isFocused && state.selectionManager.isFocused && isFocusVisible(),
		isSelected,
		isDisabled,
		isPressed,
		allowsSelection,
		hasAction,
	};
}
