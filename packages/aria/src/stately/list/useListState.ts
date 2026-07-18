// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/list/useListState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; the private `useFocusedKeyReset` helper hook takes the caller's derived
// sub-slot as an ordinary parameter; explicit dependency arrays are kept verbatim (they
// retain React's exact behavior in octane).
import type {
	Collection,
	CollectionStateBase,
	Key,
	LayoutDelegate,
	Node,
} from '@react-types/shared';
import { useCallback, useEffect, useMemo, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { ListCollection } from './ListCollection';
import {
	type MultipleSelectionStateProps,
	useMultipleSelectionState,
} from '../selection/useMultipleSelectionState';
import { SelectionManager } from '../selection/SelectionManager';
import { useCollection } from '../collections/useCollection';

export interface ListProps<T> extends CollectionStateBase<T>, MultipleSelectionStateProps {
	/** Filter function to generate a filtered list of nodes. */
	filter?: (nodes: Iterable<Node<T>>) => Iterable<Node<T>>;
	/** @private */
	suppressTextValueWarning?: boolean;
	/**
	 * A delegate object that provides layout information for items in the collection.
	 * This can be used to override the behavior of shift selection.
	 */
	layoutDelegate?: LayoutDelegate;
}

export interface ListState<T> {
	/** A collection of items in the list. */
	collection: Collection<Node<T>>;

	/** A set of items that are disabled. */
	disabledKeys: Set<Key>;

	/** A selection manager to read and update multiple selection state. */
	selectionManager: SelectionManager;
}

/**
 * Provides state management for list-like components. Handles building a collection
 * of items from props, and manages multiple selection state.
 */
export function useListState<T>(props: ListProps<T>): ListState<T>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useListState<T>(props: ListProps<T>, slot: symbol | undefined): ListState<T>;
export function useListState(...args: any[]): ListState<any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useListState');
	const props = user[0] as ListProps<any>;

	let { filter, layoutDelegate } = props;

	let selectionState = useMultipleSelectionState(props, subSlot(slot, 'selection'));
	let disabledKeys = useMemo(
		() => (props.disabledKeys ? new Set(props.disabledKeys) : new Set<Key>()),
		[props.disabledKeys],
		subSlot(slot, 'disabled'),
	);

	let factory = useCallback(
		(nodes: Iterable<Node<any>>) =>
			filter ? new ListCollection(filter(nodes)) : new ListCollection(nodes as Iterable<Node<any>>),
		[filter],
		subSlot(slot, 'factory'),
	);
	let context = useMemo(
		() => ({ suppressTextValueWarning: props.suppressTextValueWarning }),
		[props.suppressTextValueWarning],
		subSlot(slot, 'context'),
	);

	let collection = useCollection(props, factory, context, subSlot(slot, 'collection'));

	let selectionManager = useMemo(
		() => new SelectionManager(collection, selectionState, { layoutDelegate }),
		[collection, selectionState, layoutDelegate],
		subSlot(slot, 'manager'),
	);

	useFocusedKeyReset(collection, selectionManager, subSlot(slot, 'focusReset'));

	return {
		collection,
		disabledKeys,
		selectionManager,
	};
}

/**
 * Filters a collection using the provided filter function and returns a new ListState.
 */
export function UNSTABLE_useFilteredListState<T>(
	state: ListState<T>,
	filterFn: ((nodeValue: string, node: Node<T>) => boolean) | null | undefined,
): ListState<T>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function UNSTABLE_useFilteredListState<T>(
	state: ListState<T>,
	filterFn: ((nodeValue: string, node: Node<T>) => boolean) | null | undefined,
	slot: symbol | undefined,
): ListState<T>;
export function UNSTABLE_useFilteredListState(...args: any[]): ListState<any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('UNSTABLE_useFilteredListState');
	const state = user[0] as ListState<any>;
	const filterFn = user[1] as ((nodeValue: string, node: Node<any>) => boolean) | null | undefined;

	let collection = useMemo(
		() => (filterFn ? state.collection.filter!(filterFn) : state.collection),
		[state.collection, filterFn],
		subSlot(slot, 'collection'),
	);
	let selectionManager = state.selectionManager.withCollection(collection);
	useFocusedKeyReset(collection, selectionManager, subSlot(slot, 'focusReset'));
	return {
		collection,
		selectionManager,
		disabledKeys: state.disabledKeys,
	};
}

function useFocusedKeyReset<T>(
	collection: Collection<Node<T>>,
	selectionManager: SelectionManager,
	slot: symbol | undefined,
) {
	// Reset focused key if that item is deleted from the collection.
	const cachedCollection = useRef<Collection<Node<T>> | null>(null, subSlot(slot, 'cached'));
	useEffect(
		() => {
			if (
				selectionManager.focusedKey != null &&
				!collection.getItem(selectionManager.focusedKey) &&
				cachedCollection.current
			) {
				// Walk forward in the old collection to find the next key that still exists in the new collection.
				let key = cachedCollection.current.getKeyAfter(selectionManager.focusedKey);
				let nextFocusedKey: Key | null = null;
				while (key != null) {
					let node = collection.getItem(key);
					if (node && node.type === 'item' && !selectionManager.isDisabled(key)) {
						nextFocusedKey = key;
						break;
					}

					key = cachedCollection.current.getKeyAfter(key);
				}

				// If no such key exists, walk backward.
				if (nextFocusedKey == null) {
					key = cachedCollection.current.getKeyBefore(selectionManager.focusedKey);
					while (key != null) {
						let node = collection.getItem(key);
						if (node && node.type === 'item' && !selectionManager.isDisabled(key)) {
							nextFocusedKey = key;
							break;
						}

						key = cachedCollection.current.getKeyBefore(key);
					}
				}

				selectionManager.setFocusedKey(nextFocusedKey);
			}
			cachedCollection.current = collection;
		},
		[collection, selectionManager],
		subSlot(slot, 'reset'),
	);
}
