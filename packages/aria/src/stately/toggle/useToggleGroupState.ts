// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/toggle/useToggleGroupState.ts).
// Its import closure is confined to `useControlledState` + `@react-types/shared` (no
// list/selection modules), so it lands in Phase 1. octane adaptations: public-hook slot
// threading (splitSlot/subSlot) per the binding convention; explicit `Set<Key>` element
// types on the default-set constructions (strict inference); explicit useMemo dep arrays
// preserved exactly.
import type { Key } from '@react-types/shared';
import { useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { useControlledState } from '../utils/useControlledState';

export interface ToggleGroupProps {
	/**
	 * Whether single or multiple selection is enabled.
	 *
	 * @default 'single'
	 */
	selectionMode?: 'single' | 'multiple';
	/** Whether the collection allows empty selection. */
	disallowEmptySelection?: boolean;
	/** The currently selected keys in the collection (controlled). */
	selectedKeys?: Iterable<Key>;
	/** The initial selected keys in the collection (uncontrolled). */
	defaultSelectedKeys?: Iterable<Key>;
	/** Handler that is called when the selection changes. */
	onSelectionChange?: (keys: Set<Key>) => void;
	/** Whether all items are disabled. */
	isDisabled?: boolean;
}

export interface ToggleGroupState {
	/** Whether single or multiple selection is enabled. */
	readonly selectionMode: 'single' | 'multiple';

	/** Whether all items are disabled. */
	readonly isDisabled: boolean;

	/** A set of keys for items that are selected. */
	readonly selectedKeys: Set<Key>;

	/** Toggles the selected state for an item by its key. */
	toggleKey(key: Key): void;

	/** Sets whether the given key is selected. */
	setSelected(key: Key, isSelected: boolean): void;

	/** Replaces the set of selected keys. */
	setSelectedKeys(keys: Set<Key>): void;
}

/**
 * Manages state for a group of toggles.
 * It supports both single and multiple selected items.
 */
export function useToggleGroupState(props: ToggleGroupProps): ToggleGroupState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useToggleGroupState(
	props: ToggleGroupProps,
	slot: symbol | undefined,
): ToggleGroupState;
export function useToggleGroupState(...args: any[]): ToggleGroupState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useToggleGroupState');
	const props = user[0] as ToggleGroupProps;

	let { selectionMode = 'single', disallowEmptySelection, isDisabled = false } = props;
	let [selectedKeys, setSelectedKeys] = useControlledState(
		useMemo(
			() => (props.selectedKeys ? new Set(props.selectedKeys) : undefined),
			[props.selectedKeys],
			subSlot(slot, 'controlled'),
		),
		useMemo(
			() => (props.defaultSelectedKeys ? new Set(props.defaultSelectedKeys) : new Set<Key>()),
			[props.defaultSelectedKeys],
			subSlot(slot, 'default'),
		),
		props.onSelectionChange,
		subSlot(slot, 'keys'),
	);

	return {
		selectionMode,
		isDisabled,
		selectedKeys,
		setSelectedKeys,
		toggleKey(key) {
			let keys: Set<Key>;
			if (selectionMode === 'multiple') {
				keys = new Set(selectedKeys);
				if (keys.has(key) && (!disallowEmptySelection || keys.size > 1)) {
					keys.delete(key);
				} else {
					keys.add(key);
				}
			} else {
				keys = new Set(selectedKeys.has(key) && !disallowEmptySelection ? [] : [key]);
			}

			setSelectedKeys(keys);
		},
		setSelected(key, isSelected) {
			if (isSelected !== selectedKeys.has(key)) {
				this.toggleKey(key);
			}
		},
	};
}
