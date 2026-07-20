// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/table/useTableHeaderRow.ts).
// octane adaptations:
// - `TableState` comes from the ported stately table hook; `GridRowProps` from the ported
//   src/grid/useGridRow; `DOMAttributes` is a local structural prop-bag alias.
// - The hook composes no base hooks, so the optional trailing slot is accepted (uniform
//   calling convention) and unused.
import type { RefObject } from '@react-types/shared';
import type { GridRowProps } from '../grid/useGridRow';
import type { TableState } from '../stately/table/useTableState';

import { splitSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface TableHeaderRowAria {
	/** Props for the grid row element. */
	rowProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a header row in a table.
 *
 * @param props - Props for the row.
 * @param state - State of the table, as returned by `useTableState`.
 */
export function useTableHeaderRow<T>(
	props: GridRowProps<T>,
	state: TableState<T>,
	ref: RefObject<Element | null>,
): TableHeaderRowAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTableHeaderRow<T>(
	props: GridRowProps<T>,
	state: TableState<T>,
	ref: RefObject<Element | null>,
	slot: symbol | undefined,
): TableHeaderRowAria;
export function useTableHeaderRow(...args: any[]): TableHeaderRowAria {
	const [user] = splitSlot(args);
	const props = user[0] as GridRowProps<any>;
	const state = user[1] as TableState<any>;

	let { node, isVirtualized } = props;
	let rowProps: DOMAttributes = {
		role: 'row',
	};

	if (isVirtualized && state.treeColumn == null) {
		rowProps['aria-rowindex'] = node.index + 1; // aria-rowindex is 1 based
	}

	return {
		rowProps,
	};
}
