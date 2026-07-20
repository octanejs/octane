// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/grid/useGridState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; upstream's conditional `useMultipleSelectionState` call (behind
// `UNSAFE_selectionState`) is valid octane — hooks are slot-keyed, not order-keyed;
// explicit dependency arrays are kept verbatim (they retain React's exact behavior
// in octane).
import type { Key } from '@react-types/shared';
import { useEffect, useMemo, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { getChildNodes, getFirstItem, getLastItem } from '../collections/getChildNodes';
import type { GridNode, IGridCollection } from './GridCollection';
import type { MultipleSelectionState } from '../selection/types';
import {
	type MultipleSelectionStateProps,
	useMultipleSelectionState,
} from '../selection/useMultipleSelectionState';
import { SelectionManager } from '../selection/SelectionManager';

export interface GridState<T, C extends IGridCollection<T>> {
	collection: C;
	/** A set of keys for rows that are disabled. */
	disabledKeys: Set<Key>;
	/** A selection manager to read and update row selection state. */
	selectionManager: SelectionManager;
	/**
	 * Whether keyboard navigation is disabled, such as when the arrow keys should be handled by a
	 * component within a cell.
	 */
	isKeyboardNavigationDisabled: boolean;
}

export interface GridStateOptions<
	T,
	C extends IGridCollection<T>,
> extends MultipleSelectionStateProps {
	collection: C;
	disabledKeys?: Iterable<Key>;
	focusMode?: 'row' | 'cell';
	/** @private - Do not use unless you know what you're doing. */
	UNSAFE_selectionState?: MultipleSelectionState;
}

/**
 * Provides state management for a grid component. Handles row selection and focusing a grid cell's
 * focusable child if applicable.
 */
export function useGridState<T extends object, C extends IGridCollection<T>>(
	props: GridStateOptions<T, C>,
): GridState<T, C>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useGridState<T extends object, C extends IGridCollection<T>>(
	props: GridStateOptions<T, C>,
	slot: symbol | undefined,
): GridState<T, C>;
export function useGridState(...args: any[]): GridState<any, IGridCollection<any>> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useGridState');
	const props = user[0] as GridStateOptions<any, IGridCollection<any>>;

	let { collection, focusMode } = props;
	let selectionState =
		props.UNSAFE_selectionState || useMultipleSelectionState(props, subSlot(slot, 'selection'));
	let disabledKeys = useMemo(
		() => (props.disabledKeys ? new Set(props.disabledKeys) : new Set<Key>()),
		[props.disabledKeys],
		subSlot(slot, 'disabled'),
	);

	let setFocusedKey = selectionState.setFocusedKey;
	selectionState.setFocusedKey = (key, child) => {
		// If focusMode is cell and an item is focused, focus a child cell instead.
		if (focusMode === 'cell' && key != null) {
			let item = collection.getItem(key);
			if (item?.type === 'item') {
				let children = getChildNodes(item, collection);
				if (child === 'last') {
					key = getLastItem(children)?.key ?? null;
				} else {
					key = getFirstItem(children)?.key ?? null;
				}
			}
		}

		setFocusedKey(key, child);
	};

	let selectionManager = useMemo(
		() => new SelectionManager(collection, selectionState),
		[collection, selectionState],
		subSlot(slot, 'manager'),
	);

	// Reset focused key if that item is deleted from the collection.
	const cachedCollection = useRef<IGridCollection<any> | null>(null, subSlot(slot, 'cached'));
	useEffect(
		() => {
			if (
				selectionState.focusedKey != null &&
				cachedCollection.current &&
				!collection.getItem(selectionState.focusedKey)
			) {
				const node = cachedCollection.current.getItem(selectionState.focusedKey);
				const parentNode =
					node?.parentKey != null &&
					(node.type === 'cell' || node.type === 'rowheader' || node.type === 'column')
						? cachedCollection.current.getItem(node.parentKey)
						: node;
				if (!parentNode) {
					selectionState.setFocusedKey(null);
					return;
				}
				const cachedRows = cachedCollection.current.rows;
				const rows = collection.rows;
				const diff = cachedRows.length - rows.length;
				let index = Math.min(
					diff > 1 ? Math.max(parentNode.index - diff + 1, 0) : parentNode.index,
					rows.length - 1,
				);
				let newRow: GridNode<any> | null = null;
				while (index >= 0) {
					if (!selectionManager.isDisabled(rows[index].key) && rows[index].type !== 'headerrow') {
						newRow = rows[index];
						break;
					}
					// Find next, not disabled row.
					if (index < rows.length - 1) {
						index++;
						// Otherwise, find previous, not disabled row.
					} else {
						if (index > parentNode.index) {
							index = parentNode.index;
						}
						index--;
					}
				}
				if (newRow) {
					const childNodes = newRow.hasChildNodes ? [...getChildNodes(newRow, collection)] : [];
					const keyToFocus =
						newRow.hasChildNodes && parentNode !== node && node && node.index < childNodes.length
							? childNodes[node.index].key
							: newRow.key;
					selectionState.setFocusedKey(keyToFocus);
				} else {
					selectionState.setFocusedKey(null);
				}
			}
			cachedCollection.current = collection;
		},
		[collection, selectionManager, selectionState, selectionState.focusedKey],
		subSlot(slot, 'focusReset'),
	);

	return {
		collection,
		disabledKeys,
		isKeyboardNavigationDisabled: false,
		selectionManager,
	};
}
