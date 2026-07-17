// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/disclosure/useDisclosureGroupState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; upstream's dep-less `useEffect` becomes an explicit `null` (run after every
// render); explicit `Set<Key>` element types on the default-set constructions (strict
// inference).
import type { Key } from '@react-types/shared';
import { useEffect, useMemo } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { useControlledState } from '../utils/useControlledState';

export interface DisclosureGroupProps {
	/** Whether multiple items can be expanded at the same time. */
	allowsMultipleExpanded?: boolean;
	/** Whether all items are disabled. */
	isDisabled?: boolean;
	/** The currently expanded keys in the group (controlled). */
	expandedKeys?: Iterable<Key>;
	/** The initial expanded keys in the group (uncontrolled). */
	defaultExpandedKeys?: Iterable<Key>;
	/** Handler that is called when items are expanded or collapsed. */
	onExpandedChange?: (keys: Set<Key>) => any;
}

export interface DisclosureGroupState {
	/** Whether multiple items can be expanded at the same time. */
	readonly allowsMultipleExpanded: boolean;

	/** Whether all items are disabled. */
	readonly isDisabled: boolean;

	/** A set of keys for items that are expanded. */
	readonly expandedKeys: Set<Key>;

	/** Toggles the expanded state for an item by its key. */
	toggleKey(key: Key): void;

	/** Replaces the set of expanded keys. */
	setExpandedKeys(keys: Set<Key>): void;
}

/**
 * Manages state for a group of disclosures, e.g. an accordion.
 * It supports both single and multiple expanded items.
 */
export function useDisclosureGroupState(props: DisclosureGroupProps): DisclosureGroupState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useDisclosureGroupState(
	props: DisclosureGroupProps,
	slot: symbol | undefined,
): DisclosureGroupState;
export function useDisclosureGroupState(...args: any[]): DisclosureGroupState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useDisclosureGroupState');
	const props = user[0] as DisclosureGroupProps;

	let { allowsMultipleExpanded = false, isDisabled = false } = props;
	let [expandedKeys, setExpandedKeys] = useControlledState(
		useMemo(
			() => (props.expandedKeys ? new Set(props.expandedKeys) : undefined),
			[props.expandedKeys],
			subSlot(slot, 'controlled'),
		),
		useMemo(
			() => (props.defaultExpandedKeys ? new Set(props.defaultExpandedKeys) : new Set<Key>()),
			[props.defaultExpandedKeys],
			subSlot(slot, 'default'),
		),
		props.onExpandedChange,
		subSlot(slot, 'keys'),
	);

	useEffect(
		() => {
			// Ensure only one item is expanded if allowsMultipleExpanded is false.
			if (!allowsMultipleExpanded && expandedKeys.size > 1) {
				let firstKey = expandedKeys.values().next().value;
				if (firstKey != null) {
					setExpandedKeys(new Set([firstKey]));
				}
			}
		},
		null,
		subSlot(slot, 'single'),
	);

	return {
		allowsMultipleExpanded,
		isDisabled,
		expandedKeys,
		setExpandedKeys,
		toggleKey(key) {
			let keys: Set<Key>;
			if (allowsMultipleExpanded) {
				keys = new Set(expandedKeys);
				if (keys.has(key)) {
					keys.delete(key);
				} else {
					keys.add(key);
				}
			} else {
				keys = new Set(expandedKeys.has(key) ? [] : [key]);
			}

			setExpandedKeys(keys);
		},
	};
}
