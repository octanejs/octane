// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/selection/useMultipleSelectionState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; explicit dependency arrays are kept verbatim (they retain React's exact
// behavior in octane).
import type {
	DisabledBehavior,
	FocusStrategy,
	Key,
	MultipleSelection,
	SelectionBehavior,
	SelectionMode,
} from '@react-types/shared';
import { useEffect, useMemo, useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import type { MultipleSelectionState } from './types';
import { Selection } from './Selection';
import { useControlledState } from '../utils/useControlledState';

function equalSets(setA: any, setB: any): boolean {
	if (setA.size !== setB.size) {
		return false;
	}

	for (let item of setA) {
		if (!setB.has(item)) {
			return false;
		}
	}

	return true;
}

export interface MultipleSelectionStateProps extends MultipleSelection {
	/**
	 * How multiple selection should behave in the collection.
	 *
	 * @default 'toggle'
	 */
	selectionBehavior?: SelectionBehavior;
	/** Whether onSelectionChange should fire even if the new set of keys is the same as the last. */
	allowDuplicateSelectionEvents?: boolean;
	/**
	 * Whether `disabledKeys` applies to all interactions, or only selection.
	 *
	 * @default 'all'
	 */
	disabledBehavior?: DisabledBehavior;
}

/**
 * Manages state for multiple selection and focus in a collection.
 */
export function useMultipleSelectionState(
	props: MultipleSelectionStateProps,
): MultipleSelectionState;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useMultipleSelectionState(
	props: MultipleSelectionStateProps,
	slot: symbol | undefined,
): MultipleSelectionState;
export function useMultipleSelectionState(...args: any[]): MultipleSelectionState {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useMultipleSelectionState');
	const props = user[0] as MultipleSelectionStateProps;

	let {
		selectionMode = 'none' as SelectionMode,
		disallowEmptySelection = false,
		allowDuplicateSelectionEvents,
		selectionBehavior: selectionBehaviorProp = 'toggle',
		disabledBehavior = 'all',
	} = props;

	// We want synchronous updates to `isFocused` and `focusedKey` after their setters are called.
	// But we also need to trigger a react re-render. So, we have both a ref (sync) and state (async).
	let isFocusedRef = useRef(false, subSlot(slot, 'focusedRef'));
	let [, setFocused] = useState(false, subSlot(slot, 'focused'));
	let focusedKeyRef = useRef<Key | null>(null, subSlot(slot, 'focusedKeyRef'));
	let childFocusStrategyRef = useRef<FocusStrategy | null>(null, subSlot(slot, 'childFocus'));
	let [, setFocusedKey] = useState<Key | null>(null, subSlot(slot, 'focusedKey'));
	let selectedKeysProp = useMemo(
		() => convertSelection(props.selectedKeys),
		[props.selectedKeys],
		subSlot(slot, 'selectedProp'),
	);
	let defaultSelectedKeys = useMemo(
		() => convertSelection(props.defaultSelectedKeys, new Selection()),
		[props.defaultSelectedKeys],
		subSlot(slot, 'defaultSelected'),
	);
	let [selectedKeys, setSelectedKeys] = useControlledState(
		selectedKeysProp,
		defaultSelectedKeys!,
		props.onSelectionChange,
		subSlot(slot, 'selected'),
	);
	let disabledKeysProp = useMemo(
		() => (props.disabledKeys ? new Set(props.disabledKeys) : new Set<Key>()),
		[props.disabledKeys],
		subSlot(slot, 'disabled'),
	);
	let [selectionBehavior, setSelectionBehavior] = useState(
		selectionBehaviorProp,
		subSlot(slot, 'behavior'),
	);

	// If the selectionBehavior prop is set to replace, but the current state is toggle (e.g. due to long press
	// to enter selection mode on touch), and the selection becomes empty, reset the selection behavior.
	if (
		selectionBehaviorProp === 'replace' &&
		selectionBehavior === 'toggle' &&
		typeof selectedKeys === 'object' &&
		selectedKeys.size === 0
	) {
		setSelectionBehavior('replace');
	}

	// If the selectionBehavior prop changes, update the state as well.
	let lastSelectionBehavior = useRef(selectionBehaviorProp, subSlot(slot, 'lastBehavior'));
	useEffect(
		() => {
			if (selectionBehaviorProp !== lastSelectionBehavior.current) {
				setSelectionBehavior(selectionBehaviorProp);
				lastSelectionBehavior.current = selectionBehaviorProp;
			}
		},
		[selectionBehaviorProp],
		subSlot(slot, 'behaviorSync'),
	);

	return {
		selectionMode,
		disallowEmptySelection,
		selectionBehavior,
		setSelectionBehavior,
		get isFocused() {
			return isFocusedRef.current;
		},
		setFocused(f) {
			isFocusedRef.current = f;
			setFocused(f);
		},
		get focusedKey() {
			return focusedKeyRef.current;
		},
		get childFocusStrategy() {
			return childFocusStrategyRef.current;
		},
		setFocusedKey(k, childFocusStrategy = 'first') {
			focusedKeyRef.current = k;
			childFocusStrategyRef.current = childFocusStrategy;
			setFocusedKey(k);
		},
		selectedKeys,
		setSelectedKeys(keys) {
			if (allowDuplicateSelectionEvents || !equalSets(keys, selectedKeys)) {
				// `keys` is contextually the shared Selection type ('all' | Set<Key>) while the
				// controlled tuple is inferred over the local Selection class; the runtime value
				// is always accepted, so narrow the type at the verbatim call.
				setSelectedKeys(keys as 'all' | Selection);
			}
		},
		disabledKeys: disabledKeysProp,
		disabledBehavior,
	};
}

function convertSelection(
	selection: 'all' | Iterable<Key> | null | undefined,
	defaultValue?: Selection,
): 'all' | Selection | undefined {
	if (!selection) {
		return defaultValue;
	}

	return selection === 'all' ? 'all' : new Selection(selection);
}
