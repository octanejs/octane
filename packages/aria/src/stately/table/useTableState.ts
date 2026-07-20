// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/table/useTableState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; React element types → `any` descriptors (`children` is a
// [<TableHeader>, <TableBody>] descriptor pair); explicit dependency arrays are kept
// verbatim (they retain React's exact behavior in octane).
import type {
	Expandable,
	Key,
	MultipleSelection,
	Node,
	SelectionMode,
	Sortable,
	SortDescriptor,
	SortDirection,
} from '@react-types/shared';
import { useCallback, useMemo, useState } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { type GridState, useGridState } from '../grid/useGridState';
import { type ITableCollection, TableCollection } from './TableCollection';
import type { MultipleSelectionState } from '../selection/types';
import type { MultipleSelectionStateProps } from '../selection/useMultipleSelectionState';
import { useCollection } from '../collections/useCollection';
import { useControlledState } from '../utils/useControlledState';

export interface TableProps<T> extends MultipleSelection, Sortable, Expandable {
	/** The elements that make up the table. Includes the TableHeader, TableBody, Columns, and Rows. */
	children: [any, any];
	/** A list of row keys to disable. */
	disabledKeys?: Iterable<Key>;
	/**
	 * Whether pressing the escape key should clear selection in the table or not.
	 *
	 * Most experiences should not modify this option as it eliminates a keyboard user's ability to
	 * easily clear selection. Only use if the escape key is being handled externally or should not
	 * trigger selection clearing contextually.
	 *
	 * @default 'clearSelection'
	 */
	escapeKeyBehavior?: 'clearSelection' | 'none';
	/** Whether selection should occur on press up instead of press down. */
	shouldSelectOnPressUp?: boolean;
	/** The id of the column that displays hierarchical data. */
	treeColumn?: Key;
}

export interface TableState<T> extends GridState<T, ITableCollection<T>> {
	/** A collection of rows and columns in the table. */
	collection: ITableCollection<T>;
	/** Whether the row selection checkboxes should be displayed. */
	showSelectionCheckboxes: boolean;
	/** The current sorted column and direction. */
	sortDescriptor: SortDescriptor | null;
	/** Calls the provided onSortChange handler with the provided column key and sort direction. */
	sort(columnKey: Key, direction?: 'ascending' | 'descending'): void;
	/**
	 * Whether keyboard navigation is disabled, such as when the arrow keys should be handled by a
	 * component within a cell.
	 */
	isKeyboardNavigationDisabled: boolean;
	/**
	 * Set whether keyboard navigation is disabled, such as when the arrow keys should be handled by a
	 * component within a cell.
	 */
	setKeyboardNavigationDisabled: (val: boolean) => void;
	/** A set of keys for items that are expanded. */
	expandedKeys: Set<Key>;
	/** Toggles the expanded state for a row by its key. */
	toggleKey(key: Key): void;
	/** The id of the column that displays hierarchical data. */
	treeColumn: Key | null;
}

export interface CollectionBuilderContext<T> {
	showSelectionCheckboxes: boolean;
	showDragButtons: boolean;
	selectionMode: SelectionMode;
	columns: Node<T>[];
}

export interface TableStateProps<T> extends MultipleSelectionStateProps, Expandable, Sortable {
	/** The elements that make up the table. Includes the TableHeader, TableBody, Columns, and Rows. */
	children?: [any, any];
	/** A pre-constructed collection to use instead of building one from items and children. */
	collection?: ITableCollection<T>;
	/** Whether the row selection checkboxes should be displayed. */
	showSelectionCheckboxes?: boolean;
	/**
	 * Whether the row drag button should be displayed.
	 *
	 * @private
	 */
	showDragButtons?: boolean;
	/** @private - Do not use unless you know what you're doing. */
	UNSAFE_selectionState?: MultipleSelectionState;
	/** The id of the column that displays hierarchical data. */
	treeColumn?: Key;
}

const OPPOSITE_SORT_DIRECTION = {
	ascending: 'descending' as SortDirection,
	descending: 'ascending' as SortDirection,
};

/**
 * Provides state management for a table component. Handles building a collection of columns and
 * rows from props. In addition, it tracks row selection and manages sort order changes.
 */
export function useTableState<T extends object>(props: TableStateProps<T>): TableState<T>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTableState<T extends object>(
	props: TableStateProps<T>,
	slot: symbol | undefined,
): TableState<T>;
export function useTableState(...args: any[]): TableState<any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTableState');
	const props = user[0] as TableStateProps<any>;

	let [isKeyboardNavigationDisabled, setKeyboardNavigationDisabled] = useState(
		false,
		subSlot(slot, 'kbdNav'),
	);
	let {
		selectionMode = 'none',
		showSelectionCheckboxes,
		showDragButtons,
		treeColumn = null,
	} = props;

	let context = useMemo(
		() => ({
			showSelectionCheckboxes: showSelectionCheckboxes && selectionMode !== 'none',
			showDragButtons: showDragButtons,
			selectionMode,
			columns: [],
		}),
		[props.children, showSelectionCheckboxes, selectionMode, showDragButtons],
		subSlot(slot, 'context'),
	);

	let collection = useCollection<any, ITableCollection<any>>(
		props,
		useCallback(
			(nodes) => new TableCollection(nodes, null, context),
			[context],
			subSlot(slot, 'factory'),
		),
		context,
		subSlot(slot, 'collection'),
	);
	let { disabledKeys, selectionManager } = useGridState(
		{
			...props,
			collection,
			disabledBehavior: props.disabledBehavior || 'selection',
		},
		subSlot(slot, 'grid'),
	);

	let [expandedKeys, setExpandedKeys] = useControlledState(
		props.expandedKeys ? new Set(props.expandedKeys) : undefined,
		props.defaultExpandedKeys ? new Set(props.defaultExpandedKeys) : new Set(),
		props.onExpandedChange,
		subSlot(slot, 'expanded'),
	);

	return {
		collection,
		disabledKeys,
		selectionManager,
		showSelectionCheckboxes: props.showSelectionCheckboxes || false,
		sortDescriptor: props.sortDescriptor ?? null,
		isKeyboardNavigationDisabled: collection.size === 0 || isKeyboardNavigationDisabled,
		setKeyboardNavigationDisabled,
		sort(columnKey: Key, direction?: 'ascending' | 'descending') {
			props.onSortChange?.({
				column: columnKey,
				direction:
					direction ??
					(props.sortDescriptor?.column === columnKey
						? OPPOSITE_SORT_DIRECTION[props.sortDescriptor.direction]
						: 'ascending'),
			});
		},
		expandedKeys,
		toggleKey(key) {
			setExpandedKeys((keys) => {
				let newKeys = new Set(keys);
				if (newKeys.has(key)) {
					newKeys.delete(key);
				} else {
					newKeys.add(key);
				}

				return newKeys;
			});
		},
		treeColumn,
	};
}

/**
 * Filters a collection using the provided filter function and returns a new TableState.
 */
export function UNSTABLE_useFilteredTableState<T extends object>(
	state: TableState<T>,
	filterFn: ((nodeValue: string, node: Node<T>) => boolean) | null | undefined,
): TableState<T>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function UNSTABLE_useFilteredTableState<T extends object>(
	state: TableState<T>,
	filterFn: ((nodeValue: string, node: Node<T>) => boolean) | null | undefined,
	slot: symbol | undefined,
): TableState<T>;
export function UNSTABLE_useFilteredTableState(...args: any[]): TableState<any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('UNSTABLE_useFilteredTableState');
	const state = user[0] as TableState<any>;
	const filterFn = user[1] as ((nodeValue: string, node: Node<any>) => boolean) | null | undefined;

	let collection = useMemo(
		() => (filterFn ? state.collection.filter!(filterFn) : state.collection),
		[state.collection, filterFn],
		subSlot(slot, 'collection'),
	) as ITableCollection<any>;
	let selectionManager = state.selectionManager.withCollection(collection);
	// TODO: handle focus key reset? That logic is in useGridState

	return {
		...state,
		collection,
		selectionManager,
	};
}
