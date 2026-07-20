// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/table/useTableCell.ts).
// octane adaptations:
// - `TableState`/`GridNode` come from the ported stately hooks; `useGridCell` from the
//   ported src/grid/; `DOMAttributes` is a local structural prop-bag alias.
// - Public-hook slot threading (splitSlot/subSlot).
import type { FocusableElement, RefObject } from '@react-types/shared';
import { getCellId } from './utils';
import type { GridNode } from '../stately/grid/GridCollection';
import type { TableState } from '../stately/table/useTableState';
import { useGridCell } from '../grid/useGridCell';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaTableCellProps {
	/**
	 * An object representing the table cell. Contains all the relevant information that makes up the
	 * row header.
	 */
	node: GridNode<unknown>;
	/** Whether the cell is contained in a virtual scroller. */
	isVirtualized?: boolean;
	/** Whether selection should occur on press up instead of press down. */
	shouldSelectOnPressUp?: boolean;
	/**
	 * Handler that is called when a user performs an action on the cell.
	 * Please use onCellAction at the collection level instead.
	 *
	 * @deprecated
	 */
	onAction?: () => void;
}

export interface TableCellAria {
	/** Props for the table cell element. */
	gridCellProps: DOMAttributes;
	/** Whether the cell is currently in a pressed state. */
	isPressed: boolean;
}

/**
 * Provides the behavior and accessibility implementation for a cell in a table.
 *
 * @param props - Props for the cell.
 * @param state - State of the table, as returned by `useTableState`.
 * @param ref - The ref attached to the cell element.
 */
export function useTableCell<T>(
	props: AriaTableCellProps,
	state: TableState<T>,
	ref: RefObject<FocusableElement | null>,
): TableCellAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTableCell<T>(
	props: AriaTableCellProps,
	state: TableState<T>,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): TableCellAria;
export function useTableCell(...args: any[]): TableCellAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTableCell');
	const props = user[0] as AriaTableCellProps;
	const state = user[1] as TableState<any>;
	const ref = user[2] as RefObject<FocusableElement | null>;

	let { gridCellProps, isPressed } = useGridCell(props, state, ref, subSlot(slot, 'gridCell'));
	let columnKey = props.node.column?.key;
	if (columnKey != null && state.collection.rowHeaderColumnKeys.has(columnKey)) {
		gridCellProps.role = 'rowheader';
		gridCellProps.id = getCellId(state, props.node.parentKey!, columnKey);
	}

	return {
		gridCellProps,
		isPressed,
	};
}
