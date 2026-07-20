// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/table/useTreeGridState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; React element types → `any` descriptors; upstream's implicitly-typed
// `nodes` parameter is typed as `Iterable<GridNode<T>>`; the feature flag import points
// at the ported `../flags`; explicit dependency arrays are kept verbatim (they retain
// React's exact behavior in octane).
import type { Key } from '@react-types/shared';
import { useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { CollectionBuilder } from '../collections/CollectionBuilder';
import type { GridNode } from '../grid/GridCollection';
import { TableCollection } from './TableCollection';
import { tableNestedRows } from '../flags';
import { type TableState, type TableStateProps, useTableState } from './useTableState';
import { useControlledState } from '../utils/useControlledState';

export interface TreeGridState<T> extends Omit<TableState<T>, 'expandedKeys'> {
	/** A set of keys for items that are expanded. */
	expandedKeys: 'all' | Set<Key>;
	/** Toggles the expanded state for a row by its key. */
	toggleKey(key: Key): void;
	/** The key map containing nodes representing the collection's tree grid structure. */
	keyMap: Map<Key, GridNode<T>>;
	/** The number of leaf columns provided by the user. */
	userColumnCount: number;
}

export interface TreeGridStateProps<T> extends Omit<TableStateProps<T>, 'collection'> {
	/** The currently expanded keys in the collection (controlled). */
	UNSTABLE_expandedKeys?: 'all' | Iterable<Key>;
	/** The initial expanded keys in the collection (uncontrolled). */
	UNSTABLE_defaultExpandedKeys?: 'all' | Iterable<Key>;
	/** Handler that is called when items are expanded or collapsed. */
	UNSTABLE_onExpandedChange?: (keys: Set<Key>) => any;
}

/**
 * Provides state management for a tree grid component. Handles building a collection of columns and
 * rows from props. In addition, it tracks and manages expanded rows, row selection, and sort order
 * changes.
 */
export function UNSTABLE_useTreeGridState<T extends object>(
	props: TreeGridStateProps<T>,
): TreeGridState<T>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function UNSTABLE_useTreeGridState<T extends object>(
	props: TreeGridStateProps<T>,
	slot: symbol | undefined,
): TreeGridState<T>;
export function UNSTABLE_useTreeGridState(...args: any[]): TreeGridState<any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('UNSTABLE_useTreeGridState');
	const props = user[0] as TreeGridStateProps<any>;

	let {
		selectionMode = 'none',
		showSelectionCheckboxes,
		showDragButtons,
		UNSTABLE_expandedKeys: propExpandedKeys,
		UNSTABLE_defaultExpandedKeys: propDefaultExpandedKeys,
		UNSTABLE_onExpandedChange,
		children,
	} = props;

	if (!tableNestedRows()) {
		throw new Error('Feature flag for table nested rows must be enabled to use useTreeGridState.');
	}

	let [expandedKeys, setExpandedKeys] = useControlledState(
		propExpandedKeys ? convertExpanded(propExpandedKeys) : undefined,
		propDefaultExpandedKeys ? convertExpanded(propDefaultExpandedKeys) : new Set(),
		UNSTABLE_onExpandedChange,
		subSlot(slot, 'expanded'),
	);

	let context = useMemo(
		() => ({
			showSelectionCheckboxes: showSelectionCheckboxes && selectionMode !== 'none',
			showDragButtons: showDragButtons,
			selectionMode,
			columns: [],
		}),
		[children, showSelectionCheckboxes, selectionMode, showDragButtons],
		subSlot(slot, 'context'),
	);

	let builder = useMemo(() => new CollectionBuilder<any>(), [], subSlot(slot, 'builder'));
	let nodes = useMemo(
		() => builder.build({ children: children as any }, context),
		[builder, children, context],
		subSlot(slot, 'nodes'),
	);
	let treeGridCollection = useMemo(
		() => {
			return generateTreeGridCollection<any>(nodes, {
				showSelectionCheckboxes,
				showDragButtons,
				expandedKeys,
			});
		},
		[nodes, showSelectionCheckboxes, showDragButtons, expandedKeys],
		subSlot(slot, 'treeGrid'),
	);

	let onToggle = (key: Key) => {
		setExpandedKeys(toggleKey(expandedKeys, key, treeGridCollection));
	};

	let collection = useMemo(
		() => {
			return new TableCollection(treeGridCollection.tableNodes, null, context);
		},
		[context, treeGridCollection.tableNodes],
		subSlot(slot, 'collection'),
	);

	let tableState = useTableState({ ...props, collection }, subSlot(slot, 'table'));
	return {
		...tableState,
		keyMap: treeGridCollection.keyMap,
		userColumnCount: treeGridCollection.userColumnCount,
		expandedKeys,
		toggleKey: onToggle,
		treeColumn: tableState.treeColumn ?? collection.rowHeaderColumnKeys.keys().next().value ?? null,
	};
}

function toggleKey<T>(
	currentExpandedKeys: 'all' | Set<Key>,
	key: Key,
	collection: TreeGridCollection<T>,
): Set<Key> {
	let updatedExpandedKeys: Set<Key>;
	if (currentExpandedKeys === 'all') {
		updatedExpandedKeys = new Set(
			collection.flattenedRows
				.filter(
					(row) =>
						row.props.UNSTABLE_childItems || row.props.children.length > collection.userColumnCount,
				)
				.map((row) => row.key),
		);
		updatedExpandedKeys.delete(key);
	} else {
		updatedExpandedKeys = new Set(currentExpandedKeys);
		if (updatedExpandedKeys.has(key)) {
			updatedExpandedKeys.delete(key);
		} else {
			updatedExpandedKeys.add(key);
		}
	}

	return updatedExpandedKeys;
}

function convertExpanded(expanded: 'all' | Iterable<Key>): 'all' | Set<Key> {
	if (!expanded) {
		return new Set<Key>();
	}

	return expanded === 'all' ? 'all' : new Set(expanded);
}

interface TreeGridCollectionOptions {
	showSelectionCheckboxes?: boolean;
	showDragButtons?: boolean;
	expandedKeys: 'all' | Set<Key>;
}

interface TreeGridCollection<T> {
	keyMap: Map<Key, GridNode<T>>;
	tableNodes: GridNode<T>[];
	flattenedRows: GridNode<T>[];
	userColumnCount: number;
}
function generateTreeGridCollection<T>(
	nodes: Iterable<GridNode<T>>,
	opts: TreeGridCollectionOptions,
): TreeGridCollection<T> {
	let { expandedKeys = new Set() } = opts;

	let body: GridNode<T> | null = null;
	let flattenedRows: GridNode<T>[] = [];
	let userColumnCount = 0;
	let originalColumns: GridNode<T>[] = [];
	let keyMap = new Map();

	let topLevelRows: GridNode<T>[] = [];
	let visit = (node: GridNode<T>) => {
		switch (node.type) {
			case 'body':
				body = node;
				keyMap.set(body.key, body);
				break;
			case 'column':
				if (!node.hasChildNodes) {
					userColumnCount++;
				}
				break;
			case 'item':
				topLevelRows.push(node);
				return;
		}

		for (let child of node.childNodes) {
			visit(child);
		}
	};

	for (let node of nodes) {
		if (node.type === 'column') {
			originalColumns.push(node);
		}
		visit(node);
	}

	// Update each grid node in the treegrid table with values specific to a treegrid structure. Also store a set of flattened row nodes for TableCollection to consume
	let visitNode = (node: GridNode<T>) => {
		if (node.type === 'item') {
			flattenedRows.push(node);
		}

		keyMap.set(node.key, node);

		for (let child of node.childNodes) {
			if (!(child.type === 'item' && expandedKeys !== 'all' && !expandedKeys.has(node.key))) {
				if (child.type === 'item') {
					visitNode(child);
				} else {
					// We enforce that the cells come before rows so can just reuse cell index
					visitNode(child);
				}
			}
		}
	};

	for (let node of topLevelRows) {
		visitNode(node as GridNode<T>);
	}

	return {
		keyMap,
		userColumnCount,
		flattenedRows,
		tableNodes: [...originalColumns, { ...body!, childNodes: flattenedRows }],
	};
}
