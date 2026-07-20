// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/tree/useTreeItem.ts).
// octane adaptations:
// - The Parcel glob intl import becomes the generated src/intl/tree index (verbatim
//   locale JSONs from the pinned checkout).
// - `TreeState` comes from the ported stately tree hook; `DOMAttributes` is a local
//   structural prop-bag alias (upstream's is typed over React's synthetic handlers).
// - Public-hook slot threading (splitSlot/subSlot).
import type { FocusableElement, Node, RefObject } from '@react-types/shared';
import type { AriaButtonProps } from '../button/useButton';
import {
	type AriaGridListItemOptions,
	type GridListItemAria,
	useGridListItem,
} from '../gridlist/useGridListItem';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';
import intlMessages from '../intl/tree';
import type { TreeState } from '../stately/tree/useTreeState';
import { useLabels } from '../utils/useLabels';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaTreeItemOptions extends Omit<AriaGridListItemOptions, 'isVirtualized'> {
	/**
	 * An object representing the treegrid item. Contains all the relevant information that makes up
	 * the treegrid row.
	 */
	node: Node<unknown>;
}

export interface TreeItemAria extends GridListItemAria {
	/** Props for the tree grid row element. */
	rowProps: DOMAttributes;
	/** Props for the tree grid cell element within the tree grid list row. */
	gridCellProps: DOMAttributes;
	/** Props for the tree grid row description element, if any. */
	descriptionProps: DOMAttributes;
	/** Props for the tree grid row expand button. */
	expandButtonProps: AriaButtonProps;
}

/**
 * Provides the behavior and accessibility implementation for a row in a tree grid list.
 *
 * @param props - Props for the row.
 * @param state - State of the parent list, as returned by `useTreeState`.
 * @param ref - The ref attached to the row element.
 */
export function useTreeItem<T>(
	props: AriaTreeItemOptions,
	state: TreeState<T>,
	ref: RefObject<FocusableElement | null>,
): TreeItemAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTreeItem<T>(
	props: AriaTreeItemOptions,
	state: TreeState<T>,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): TreeItemAria;
export function useTreeItem(...args: any[]): TreeItemAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTreeItem');
	const props = user[0] as AriaTreeItemOptions;
	const state = user[1] as TreeState<any>;
	const ref = user[2] as RefObject<FocusableElement | null>;

	let { node } = props;
	let gridListAria = useGridListItem(props, state, ref, subSlot(slot, 'gridListItem'));
	let isExpanded = gridListAria.rowProps['aria-expanded'] === true;
	let stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/tree',
		subSlot(slot, 'strings'),
	);
	let labelProps = useLabels(
		{
			'aria-label': isExpanded
				? stringFormatter.format('collapse')
				: stringFormatter.format('expand'),
			'aria-labelledby': gridListAria.rowProps.id,
		},
		undefined,
		subSlot(slot, 'labels'),
	);

	let expandButtonProps = {
		onPress: () => {
			if (!gridListAria.isDisabled) {
				state.toggleKey(node.key);
				state.selectionManager.setFocused(true);
				state.selectionManager.setFocusedKey(node.key);
			}
		},
		excludeFromTabOrder: true,
		preventFocusOnPress: true,
		'data-react-aria-prevent-focus': true,
		...labelProps,
	};

	// TODO: should it return a state specifically for isExpanded? Or is aria attribute sufficient?
	return {
		...gridListAria,
		expandButtonProps,
	};
}
