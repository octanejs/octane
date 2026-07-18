// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/tag/useTag.ts).
// octane adaptations:
// - Handlers receive NATIVE events: the Delete/Backspace removal handler takes the
//   native KeyboardEvent.
// - The Parcel glob intl import becomes the generated src/intl/tag index (verbatim
//   dictionaries).
// - `ListState` comes from the ported stately list hook; `DOMAttributes` is a local
//   structural prop-bag alias.
// - Public-hook slot threading (splitSlot/subSlot).
import type { AriaButtonProps } from '../button/useButton';
import type { FocusableElement, Node, RefObject } from '@react-types/shared';
import { filterDOMProps } from '../utils/filterDOMProps';
import { hookData } from './useTagGroup';
import intlMessages from '../intl/tag';
import type { ListState } from '../stately/list/useListState';
import { mergeProps } from '../utils/mergeProps';
import { SelectableItemStates } from '../selection/useSelectableItem';
import { useDescription } from '../utils/useDescription';
import { useFocusable } from '../interactions/useFocusable';
import { useGridListItem } from '../gridlist/useGridListItem';
import { useId } from '../utils/useId';
import { useInteractionModality } from '../interactions/useFocusVisible';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';
import { useSyntheticLinkProps } from '../utils/openLink';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface TagAria extends SelectableItemStates {
	/** Props for the tag row element. */
	rowProps: DOMAttributes;
	/** Props for the tag cell element. */
	gridCellProps: DOMAttributes;
	/** Props for the tag remove button. */
	removeButtonProps: AriaButtonProps;
	/** Whether the tag can be removed. */
	allowsRemoving: boolean;
}

export interface AriaTagProps<T> {
	/** An object representing the tag. Contains all the relevant information that makes up the tag. */
	item: Node<T>;
	// octane adaptation (part of upstream's surface via DOMProps/AriaLabelingProps reads
	// below): optional aria attributes forwarded to the cell.
	'aria-errormessage'?: string;
	'aria-label'?: string;
}

/**
 * Provides the behavior and accessibility implementation for a tag component.
 *
 * @param props - Props to be applied to the tag.
 * @param state - State for the tag group, as returned by `useListState`.
 * @param ref - A ref to a DOM element for the tag.
 */
export function useTag<T>(
	props: AriaTagProps<T>,
	state: ListState<T>,
	ref: RefObject<FocusableElement | null>,
): TagAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTag<T>(
	props: AriaTagProps<T>,
	state: ListState<T>,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): TagAria;
export function useTag(...args: any[]): TagAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTag');
	const props = user[0] as AriaTagProps<any>;
	const state = user[1] as ListState<any>;
	const ref = user[2] as RefObject<FocusableElement | null>;

	let { item } = props;
	let stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/tag',
		subSlot(slot, 'strings'),
	);
	let buttonId = useId(subSlot(slot, 'buttonId'));

	let { onRemove } = hookData.get(state) || {};
	let { rowProps, gridCellProps, ...states } = useGridListItem(
		{
			node: item,
		},
		state,
		ref,
		subSlot(slot, 'gridListItem'),
	);

	let { descriptionProps: _, ...stateWithoutDescription } = states;

	let isDisabled = state.disabledKeys.has(item.key) || item.props.isDisabled;
	let onKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (isDisabled) {
				return;
			}

			e.preventDefault();
			if (state.selectionManager.isSelected(item.key)) {
				onRemove?.(new Set(state.selectionManager.selectedKeys));
			} else {
				onRemove?.(new Set([item.key]));
			}
		}
	};

	let modality = useInteractionModality(subSlot(slot, 'modality'));
	if (modality === 'virtual' && typeof window !== 'undefined' && 'ontouchstart' in window) {
		modality = 'pointer';
	}
	let description =
		onRemove && (modality === 'keyboard' || modality === 'virtual')
			? stringFormatter.format('removeDescription')
			: '';
	let descProps = useDescription(description, subSlot(slot, 'description'));

	let isItemFocused = item.key === state.selectionManager.focusedKey;
	let isFocused = state.selectionManager.focusedKey != null;
	let tabIndex = -1;
	if (!isDisabled && (isItemFocused || !isFocused)) {
		tabIndex = 0;
	}

	let domProps = filterDOMProps(item.props);
	let linkProps = useSyntheticLinkProps(item.props);
	let { focusableProps } = useFocusable(
		{
			...item.props,
			isDisabled,
		},
		ref,
		subSlot(slot, 'focusable'),
	);

	return {
		removeButtonProps: {
			'aria-label': stringFormatter.format('removeButtonLabel'),
			'aria-labelledby': `${buttonId} ${rowProps.id}`,
			isDisabled,
			id: buttonId,
			onPress: () => (onRemove ? onRemove(new Set([item.key])) : null),
		},
		rowProps: mergeProps(focusableProps, rowProps, domProps, linkProps, {
			tabIndex,
			onKeyDown: onRemove ? onKeyDown : undefined,
			'aria-describedby': descProps['aria-describedby'],
		}),
		gridCellProps: mergeProps(gridCellProps, {
			'aria-errormessage': props['aria-errormessage'],
			'aria-label': props['aria-label'],
		}),
		...stateWithoutDescription,
		allowsRemoving: !!onRemove,
	};
}
