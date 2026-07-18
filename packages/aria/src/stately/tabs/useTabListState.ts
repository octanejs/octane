// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/tabs/useTabListState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; upstream's intentionally dep-less useEffect becomes an explicit `null`
// (run after every render).
import type {
	Collection,
	CollectionBase,
	CollectionStateBase,
	Key,
	Node,
	SingleSelection,
} from '@react-types/shared';
import { useEffect, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import {
	type SingleSelectListState,
	useSingleSelectListState,
} from '../list/useSingleSelectListState';

export interface TabListProps<T>
	extends
		CollectionBase<T>,
		Omit<
			SingleSelection,
			'disallowEmptySelection' | 'selectedKey' | 'defaultSelectedKey' | 'onSelectionChange'
		> {
	/**
	 * Whether the TabList is disabled.
	 * Shows that a selection exists, but is not available in that circumstance.
	 */
	isDisabled?: boolean;
	/** The currently selected key in the collection (controlled). */
	selectedKey?: Key;
	/** The initial selected keys in the collection (uncontrolled). */
	defaultSelectedKey?: Key;
	/** Handler that is called when the selection changes. */
	onSelectionChange?: (key: Key) => void;
}

export interface TabListStateOptions<T>
	extends Omit<TabListProps<T>, 'children'>, CollectionStateBase<T> {}

export interface TabListState<T> extends SingleSelectListState<T> {
	/** Whether the tab list is disabled. */
	isDisabled: boolean;
}

/**
 * Provides state management for a Tabs component. Tabs include a TabList which tracks
 * which tab is currently selected and displays the content associated with that Tab in a TabPanel.
 */
export function useTabListState<T extends object>(props: TabListStateOptions<T>): TabListState<T>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTabListState<T extends object>(
	props: TabListStateOptions<T>,
	slot: symbol | undefined,
): TabListState<T>;
export function useTabListState(...args: any[]): TabListState<any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTabListState');
	const props = user[0] as TabListStateOptions<any>;

	let state = useSingleSelectListState<any>(
		{
			...props,
			onSelectionChange: props.onSelectionChange
				? (key: Key | null) => {
						if (key != null) {
							props.onSelectionChange?.(key);
						}
					}
				: undefined,
			suppressTextValueWarning: true,
			defaultSelectedKey:
				props.defaultSelectedKey ??
				findDefaultSelectedKey(
					props.collection,
					props.disabledKeys ? new Set(props.disabledKeys) : new Set(),
				) ??
				undefined,
		},
		subSlot(slot, 'list'),
	);

	let { selectionManager, collection, selectedKey: currentSelectedKey } = state;

	let lastSelectedKey = useRef(currentSelectedKey, subSlot(slot, 'lastSelected'));
	useEffect(
		() => {
			// Ensure a tab is always selected (in case no selected key was specified or if selected item was deleted from collection)
			let selectedKey = currentSelectedKey;
			if (
				props.selectedKey == null &&
				(selectionManager.isEmpty || selectedKey == null || !collection.getItem(selectedKey))
			) {
				selectedKey = findDefaultSelectedKey(collection, state.disabledKeys);
				if (selectedKey != null) {
					// directly set selection because replace/toggle selection won't consider disabled keys
					selectionManager.setSelectedKeys([selectedKey]);
				}
			}

			// If the tablist doesn't have focus and the selected key changes or if there isn't a focused key yet, change focused key to the selected key if it exists.
			if (
				(selectedKey != null && selectionManager.focusedKey == null) ||
				(!selectionManager.isFocused && selectedKey !== lastSelectedKey.current)
			) {
				selectionManager.setFocusedKey(selectedKey);
			}
			lastSelectedKey.current = selectedKey;
		},
		null,
		subSlot(slot, 'ensureSelected'),
	);

	return {
		...state,
		isDisabled: props.isDisabled || false,
	};
}

function findDefaultSelectedKey<T>(
	collection: Collection<Node<T>> | undefined,
	disabledKeys: Set<Key>,
) {
	let selectedKey: Key | null = null;
	if (collection) {
		selectedKey = collection.getFirstKey();
		// loop over tabs until we find one that isn't disabled and select that
		while (
			selectedKey != null &&
			(disabledKeys.has(selectedKey) || collection.getItem(selectedKey)?.props?.isDisabled) &&
			selectedKey !== collection.getLastKey()
		) {
			selectedKey = collection.getKeyAfter(selectedKey);
		}
		// if this check is true, then every item is disabled, it makes more sense to default to the first key than the last
		if (
			selectedKey != null &&
			(disabledKeys.has(selectedKey) || collection.getItem(selectedKey)?.props?.isDisabled) &&
			selectedKey === collection.getLastKey()
		) {
			selectedKey = collection.getFirstKey();
		}
	}

	return selectedKey;
}
