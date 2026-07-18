// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/tree/useTreeState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; explicit dependency arrays are kept verbatim — including upstream's
// eslint-suppressed `[tree, selectionState.focusedKey]` effect array (they retain React's
// exact behavior in octane).
import type {
	Collection,
	CollectionStateBase,
	DisabledBehavior,
	Expandable,
	Key,
	MultipleSelection,
	Node,
} from '@react-types/shared';
import { useCallback, useEffect, useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { SelectionManager } from '../selection/SelectionManager';
import { TreeCollection } from './TreeCollection';
import { useCollection } from '../collections/useCollection';
import { useControlledState } from '../utils/useControlledState';
import { useMultipleSelectionState } from '../selection/useMultipleSelectionState';

export interface TreeProps<T> extends CollectionStateBase<T>, Expandable, MultipleSelection {
	/** Whether `disabledKeys` applies to all interactions, or only selection. */
	disabledBehavior?: DisabledBehavior;
}
export interface TreeState<T> {
	/** A collection of items in the tree. */
	readonly collection: Collection<Node<T>>;

	/** A set of keys for items that are disabled. */
	readonly disabledKeys: Set<Key>;

	/** A set of keys for items that are expanded. */
	readonly expandedKeys: Set<Key>;

	/** Toggles the expanded state for an item by its key. */
	toggleKey(key: Key): void;

	/** Replaces the set of expanded keys. */
	setExpandedKeys(keys: Set<Key>): void;

	/** A selection manager to read and update multiple selection state. */
	readonly selectionManager: SelectionManager;
}

/**
 * Provides state management for tree-like components. Handles building a collection
 * of items from props, item expanded state, and manages multiple selection state.
 */
export function useTreeState<T>(props: TreeProps<T>): TreeState<T>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTreeState<T>(props: TreeProps<T>, slot: symbol | undefined): TreeState<T>;
export function useTreeState(...args: any[]): TreeState<any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTreeState');
	const props = user[0] as TreeProps<any>;

	let { onExpandedChange } = props;

	let [expandedKeys, setExpandedKeys] = useControlledState(
		props.expandedKeys ? new Set(props.expandedKeys) : undefined,
		props.defaultExpandedKeys ? new Set(props.defaultExpandedKeys) : new Set<Key>(),
		onExpandedChange,
		subSlot(slot, 'expanded'),
	);

	let selectionState = useMultipleSelectionState(props, subSlot(slot, 'selection'));
	let disabledKeys = useMemo(
		() => (props.disabledKeys ? new Set(props.disabledKeys) : new Set<Key>()),
		[props.disabledKeys],
		subSlot(slot, 'disabled'),
	);

	let tree = useCollection(
		props,
		useCallback(
			(nodes: Iterable<Node<any>>) => new TreeCollection(nodes, { expandedKeys }),
			[expandedKeys],
			subSlot(slot, 'factory'),
		),
		null,
		subSlot(slot, 'collection'),
	);

	// Reset focused key if that item is deleted from the collection.
	useEffect(
		() => {
			if (selectionState.focusedKey != null && !tree.getItem(selectionState.focusedKey)) {
				selectionState.setFocusedKey(null);
			}
		},
		[tree, selectionState.focusedKey],
		subSlot(slot, 'focusReset'),
	);

	let onToggle = (key: Key) => {
		setExpandedKeys(toggleKey(expandedKeys, key));
	};

	return {
		collection: tree,
		expandedKeys,
		disabledKeys,
		toggleKey: onToggle,
		setExpandedKeys,
		selectionManager: new SelectionManager(tree, selectionState),
	};
}

function toggleKey(set: Set<Key>, key: Key): Set<Key> {
	let res = new Set(set);
	if (res.has(key)) {
		res.delete(key);
	} else {
		res.add(key);
	}

	return res;
}
