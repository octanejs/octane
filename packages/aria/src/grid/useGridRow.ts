// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/grid/useGridRow.ts).
// octane adaptations:
// - `GridState`/`IGridCollection`/`GridNode` come from the ported stately grid hooks;
//   `DOMAttributes` is a local structural prop-bag alias.
// - Public-hook slot threading (splitSlot/subSlot).
import { chain } from '../utils/chain';

import type { FocusableElement, RefObject } from '@react-types/shared';
import type { IGridCollection as GridCollection, GridNode } from '../stately/grid/GridCollection';
import { gridMap } from './utils';
import type { GridState } from '../stately/grid/useGridState';
import { SelectableItemStates, useSelectableItem } from '../selection/useSelectableItem';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface GridRowProps<T> {
	/**
	 * An object representing the grid row. Contains all the relevant information that makes up the
	 * grid row.
	 */
	node: GridNode<T>;
	/** Whether the grid row is contained in a virtual scroller. */
	isVirtualized?: boolean;
	/** Whether selection should occur on press up instead of press down. */
	shouldSelectOnPressUp?: boolean;
	/**
	 * Handler that is called when a user performs an action on the row.
	 * Please use onCellAction at the collection level instead.
	 *
	 * @deprecated
	 */
	onAction?: () => void;
}

export interface GridRowAria extends SelectableItemStates {
	/** Props for the grid row element. */
	rowProps: DOMAttributes;
	/** Whether the row is currently in a pressed state. */
	isPressed: boolean;
}

/**
 * Provides the behavior and accessibility implementation for a row in a grid.
 *
 * @param props - Props for the row.
 * @param state - State of the parent grid, as returned by `useGridState`.
 */
export function useGridRow<T, C extends GridCollection<T>, S extends GridState<T, C>>(
	props: GridRowProps<T>,
	state: S,
	ref: RefObject<FocusableElement | null>,
): GridRowAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useGridRow<T, C extends GridCollection<T>, S extends GridState<T, C>>(
	props: GridRowProps<T>,
	state: S,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): GridRowAria;
export function useGridRow(...args: any[]): GridRowAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useGridRow');
	const props = user[0] as GridRowProps<any>;
	const state = user[1] as GridState<any, GridCollection<any>>;
	const ref = user[2] as RefObject<FocusableElement | null>;

	let { node, isVirtualized, shouldSelectOnPressUp, onAction } = props;

	let { actions, shouldSelectOnPressUp: gridShouldSelectOnPressUp } = gridMap.get(state)!;
	let onRowAction = actions.onRowAction ? () => actions.onRowAction?.(node.key) : onAction;
	let { itemProps, ...states } = useSelectableItem(
		{
			selectionManager: state.selectionManager,
			key: node.key,
			ref,
			isVirtualized,
			shouldSelectOnPressUp: gridShouldSelectOnPressUp || shouldSelectOnPressUp,
			onAction:
				onRowAction || node?.props?.onAction
					? chain(node?.props?.onAction, onRowAction)
					: undefined,
			isDisabled: state.collection.size === 0,
		},
		subSlot(slot, 'selectableItem'),
	);

	let isSelected = state.selectionManager.isSelected(node.key);

	let rowProps: DOMAttributes = {
		role: 'row',
		'aria-selected': state.selectionManager.selectionMode !== 'none' ? isSelected : undefined,
		'aria-disabled': states.isDisabled || undefined,
		...itemProps,
	};

	if (isVirtualized) {
		rowProps['aria-rowindex'] = node.index + 1; // aria-rowindex is 1 based
	}

	return {
		rowProps,
		...states,
	};
}
