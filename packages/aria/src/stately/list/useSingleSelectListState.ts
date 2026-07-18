// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/list/useSingleSelectListState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; explicit dependency arrays are kept verbatim (they retain React's exact
// behavior in octane).
import type {
	CollectionStateBase,
	Key,
	Node,
	Selection,
	SingleSelection,
} from '@react-types/shared';
import { useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { type ListState, useListState } from './useListState';
import { useControlledState } from '../utils/useControlledState';

export interface SingleSelectListProps<T>
	extends CollectionStateBase<T>, Omit<SingleSelection, 'disallowEmptySelection'> {
	/** Filter function to generate a filtered list of nodes. */
	filter?: (nodes: Iterable<Node<T>>) => Iterable<Node<T>>;
	/** @private */
	suppressTextValueWarning?: boolean;
}

export interface SingleSelectListState<T> extends ListState<T> {
	/** The key for the currently selected item. */
	readonly selectedKey: Key | null;

	/** Sets the selected key. */
	setSelectedKey(key: Key | null): void;

	/** The value of the currently selected item. */
	readonly selectedItem: Node<T> | null;
}

/**
 * Provides state management for list-like components with single selection.
 * Handles building a collection of items from props, and manages selection state.
 */
export function useSingleSelectListState<T extends object>(
	props: SingleSelectListProps<T>,
): SingleSelectListState<T>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSingleSelectListState<T extends object>(
	props: SingleSelectListProps<T>,
	slot: symbol | undefined,
): SingleSelectListState<T>;
export function useSingleSelectListState(...args: any[]): SingleSelectListState<any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSingleSelectListState');
	const props = user[0] as SingleSelectListProps<any>;

	let [selectedKey, setSelectedKey] = useControlledState(
		props.selectedKey,
		props.defaultSelectedKey ?? null,
		props.onSelectionChange,
		subSlot(slot, 'selectedKey'),
	);
	let selectedKeys = useMemo(
		() => (selectedKey != null ? [selectedKey] : []),
		[selectedKey],
		subSlot(slot, 'selectedKeys'),
	);
	let { collection, disabledKeys, selectionManager } = useListState(
		{
			...props,
			selectionMode: 'single',
			disallowEmptySelection: true,
			allowDuplicateSelectionEvents: true,
			selectedKeys,
			onSelectionChange: (keys: Selection) => {
				// impossible, but TS doesn't know that
				if (keys === 'all') {
					return;
				}
				let key = keys.values().next().value ?? null;

				// Always fire onSelectionChange, even if the key is the same
				// as the current key (useControlledState does not).
				if (key === selectedKey && props.onSelectionChange) {
					props.onSelectionChange(key);
				}

				setSelectedKey(key);
			},
		},
		subSlot(slot, 'list'),
	);

	let selectedItem = selectedKey != null ? collection.getItem(selectedKey) : null;

	return {
		collection,
		disabledKeys,
		selectionManager,
		selectedKey,
		setSelectedKey,
		selectedItem,
	};
}
