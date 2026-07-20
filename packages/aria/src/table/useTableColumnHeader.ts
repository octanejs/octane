// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/table/useTableColumnHeader.ts).
// octane adaptations:
// - `TableState`/`GridNode` come from the ported stately hooks; `useGridCell` from the
//   ported src/grid/; `DOMAttributes` is a local structural prop-bag alias (the
//   `aria-sort` local keeps upstream's literal union).
// - The Parcel glob intl import becomes the generated src/intl/table index (verbatim
//   dictionaries).
// - Public-hook slot threading (splitSlot/subSlot); explicit dependency arrays are kept
//   verbatim.
import type { FocusableElement, RefObject } from '@react-types/shared';
import { getColumnHeaderId } from './utils';
import type { GridNode } from '../stately/grid/GridCollection';
import intlMessages from '../intl/table';
import { isAndroid } from '../utils/platform';
import { mergeProps } from '../utils/mergeProps';
import type { TableState } from '../stately/table/useTableState';
import { useDescription } from '../utils/useDescription';
import { useEffect } from 'octane';
import { useFocusable } from '../interactions/useFocusable';
import { useGridCell } from '../grid/useGridCell';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';
import { usePress } from '../interactions/usePress';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaTableColumnHeaderProps<T> {
	/**
	 * An object representing the [column header](https://www.w3.org/TR/wai-aria-1.1/#columnheader).
	 * Contains all the relevant information that makes up the column header.
	 */
	node: GridNode<T>;
	/**
	 * Whether the [column header](https://www.w3.org/TR/wai-aria-1.1/#columnheader) is contained in a
	 * virtual scroller.
	 */
	isVirtualized?: boolean;
}

export interface TableColumnHeaderAria {
	/** Props for the [column header](https://www.w3.org/TR/wai-aria-1.1/#columnheader) element. */
	columnHeaderProps: DOMAttributes;
	/** Whether the column is currently in a pressed state. */
	isPressed: boolean;
}

/**
 * Provides the behavior and accessibility implementation for a column header in a table.
 *
 * @param props - Props for the column header.
 * @param state - State of the table, as returned by `useTableState`.
 * @param ref - The ref attached to the column header element.
 */
export function useTableColumnHeader<T>(
	props: AriaTableColumnHeaderProps<T>,
	state: TableState<T>,
	ref: RefObject<FocusableElement | null>,
): TableColumnHeaderAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTableColumnHeader<T>(
	props: AriaTableColumnHeaderProps<T>,
	state: TableState<T>,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): TableColumnHeaderAria;
export function useTableColumnHeader(...args: any[]): TableColumnHeaderAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTableColumnHeader');
	const props = user[0] as AriaTableColumnHeaderProps<any>;
	const state = user[1] as TableState<any>;
	const ref = user[2] as RefObject<FocusableElement | null>;

	let { node } = props;
	let allowsSorting = node.props.allowsSorting;
	// if there are no focusable children, the column header will focus the cell
	let { gridCellProps } = useGridCell(
		{ ...props, focusMode: 'child' },
		state,
		ref,
		subSlot(slot, 'gridCell'),
	);

	let isSelectionCellDisabled =
		node.props.isSelectionCell && state.selectionManager.selectionMode === 'single';

	let { pressProps, isPressed } = usePress(
		{
			isDisabled: !allowsSorting || isSelectionCellDisabled,
			onPress() {
				state.sort(node.key);
			},
			ref,
		},
		subSlot(slot, 'press'),
	);

	// Needed to pick up the focusable context, enabling things like Tooltips for example
	let { focusableProps } = useFocusable({}, ref, subSlot(slot, 'focusable'));

	let ariaSort: 'ascending' | 'descending' | 'none' | 'other' | undefined = undefined;
	let isSortedColumn = state.sortDescriptor?.column === node.key;
	let sortDirection = state.sortDescriptor?.direction;
	// aria-sort not supported in Android Talkback
	if (node.props.allowsSorting && !isAndroid()) {
		ariaSort = isSortedColumn ? sortDirection : 'none';
	}

	let stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/table',
		subSlot(slot, 'strings'),
	);
	let sortDescription;
	if (allowsSorting) {
		sortDescription = `${stringFormatter.format('sortable')}`;
		// Android Talkback doesn't support aria-sort so we add sort order details to the aria-described by here
		if (isSortedColumn && sortDirection && isAndroid()) {
			sortDescription = `${sortDescription}, ${stringFormatter.format(sortDirection)}`;
		}
	}

	let descriptionProps = useDescription(sortDescription, subSlot(slot, 'description'));

	let shouldDisableFocus = state.collection.size === 0;
	useEffect(
		() => {
			if (shouldDisableFocus && state.selectionManager.focusedKey === node.key) {
				state.selectionManager.setFocusedKey(null);
			}
		},
		[shouldDisableFocus, state.selectionManager, node.key],
		subSlot(slot, 'disableFocus'),
	);

	return {
		columnHeaderProps: {
			...mergeProps(
				focusableProps,
				gridCellProps,
				pressProps,
				descriptionProps,
				// If the table is empty, make all column headers untabbable
				shouldDisableFocus ? { tabIndex: -1 } : null,
			),
			role: 'columnheader',
			id: getColumnHeaderId(state, node.key),
			'aria-colspan': node.colSpan && node.colSpan > 1 ? node.colSpan : undefined,
			'aria-sort': ariaSort,
		},
		isPressed,
	};
}
