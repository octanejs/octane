// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/select/useSelectState.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; `FocusableProps` comes from the ported interactions area (type-only —
// upstream's @react-types/shared version is typed over React synthetic events); public
// value-level callbacks (onChange/onSelectionChange/onOpenChange) are unchanged (the
// onInput rule applies only to DOM wiring); explicit dependency arrays are kept
// verbatim (they retain React's exact behavior in octane).
import type {
	CollectionBase,
	CollectionStateBase,
	FocusStrategy,
	HelpTextProps,
	InputBase,
	Key,
	LabelableProps,
	Node,
	Selection,
	TextInputBase,
	Validation,
	ValueBase,
} from '@react-types/shared';
import { useMemo, useState } from 'octane';

import type { FocusableProps } from '../../interactions/useFocusable';

import { S, splitSlot, subSlot } from '../../internal';
import { type FormValidationState, useFormValidationState } from '../form/useFormValidationState';
import { type ListState, useListState } from '../list/useListState';
import {
	type OverlayTriggerState,
	useOverlayTriggerState,
} from '../overlays/useOverlayTriggerState';
import { useControlledState } from '../utils/useControlledState';

export type SelectionMode = 'single' | 'multiple';
export type ValueType<M extends SelectionMode> = M extends 'single' ? Key | null : readonly Key[];
export type ChangeValueType<M extends SelectionMode> = M extends 'single' ? Key | null : Key[];
type ValidationType<M extends SelectionMode> = M extends 'single' ? Key : Key[];

export interface SelectProps<T, M extends SelectionMode = 'single'>
	extends
		CollectionBase<T>,
		Omit<InputBase, 'isReadOnly'>,
		ValueBase<ValueType<M>, ChangeValueType<M>>,
		Validation<ValidationType<M>>,
		HelpTextProps,
		LabelableProps,
		TextInputBase,
		FocusableProps {
	/**
	 * Whether single or multiple selection is enabled.
	 *
	 * @default 'single'
	 */
	selectionMode?: M;
	/**
	 * The currently selected key in the collection (controlled).
	 *
	 * @deprecated
	 */
	selectedKey?: Key | null;
	/**
	 * The initial selected key in the collection (uncontrolled).
	 *
	 * @deprecated
	 */
	defaultSelectedKey?: Key | null;
	/**
	 * Handler that is called when the selection changes.
	 *
	 * @deprecated
	 */
	onSelectionChange?: (key: Key | null) => void;
	/** Sets the open state of the menu. */
	isOpen?: boolean;
	/** Sets the default open state of the menu. */
	defaultOpen?: boolean;
	/** Method that is called when the open state of the menu changes. */
	onOpenChange?: (isOpen: boolean) => void;
	/**
	 * Whether the Select should close when an item is selected. Defaults to true if selectionMode is
	 * single, false otherwise.
	 */
	shouldCloseOnSelect?: boolean;
	/** Whether the select should be allowed to be open when the collection is empty. */
	allowsEmptyCollection?: boolean;
}

export interface SelectStateOptions<T, M extends SelectionMode = 'single'>
	extends Omit<SelectProps<T, M>, 'children'>, CollectionStateBase<T> {}

export interface SelectState<T, M extends SelectionMode = 'single'>
	extends ListState<T>, OverlayTriggerState, FormValidationState {
	/**
	 * The key for the first selected item.
	 *
	 * @deprecated
	 */
	readonly selectedKey: Key | null;

	/**
	 * The default selected key.
	 *
	 * @deprecated
	 */
	readonly defaultSelectedKey: Key | null;

	/**
	 * Sets the selected key.
	 *
	 * @deprecated
	 */
	setSelectedKey(key: Key | null): void;

	/** The current select value. */
	readonly value: ValueType<M>;

	/** The default select value. */
	readonly defaultValue: ValueType<M>;

	/** Sets the select value. */
	setValue(value: Key | readonly Key[] | null): void;

	/**
	 * The value of the first selected item.
	 *
	 * @deprecated
	 */
	readonly selectedItem: Node<T> | null;

	/** The value of the selected items. */
	readonly selectedItems: Node<T>[];

	/** Whether the select is currently focused. */
	readonly isFocused: boolean;

	/** Sets whether the select is focused. */
	setFocused(isFocused: boolean): void;

	/** Controls which item will be auto focused when the menu opens. */
	readonly focusStrategy: FocusStrategy | null;

	/** Opens the menu. */
	open(focusStrategy?: FocusStrategy | null): void;

	/** Toggles the menu. */
	toggle(focusStrategy?: FocusStrategy | null): void;
}

/**
 * Provides state management for a select component. Handles building a collection
 * of items from props, handles the open state for the popup menu, and manages
 * multiple selection state.
 */
export function useSelectState<T, M extends SelectionMode = 'single'>(
	props: SelectStateOptions<T, M>,
): SelectState<T, M>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useSelectState<T, M extends SelectionMode = 'single'>(
	props: SelectStateOptions<T, M>,
	slot: symbol | undefined,
): SelectState<T, M>;
export function useSelectState(...args: any[]): SelectState<any, any> {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useSelectState');
	const props = user[0] as SelectStateOptions<any, any>;

	let { selectionMode = 'single', shouldCloseOnSelect = selectionMode === 'single' } = props;
	let triggerState = useOverlayTriggerState(props, subSlot(slot, 'trigger'));
	let [focusStrategy, setFocusStrategy] = useState<FocusStrategy | null>(
		null,
		subSlot(slot, 'focusStrategy'),
	);
	let defaultValue = useMemo(
		() => {
			return props.defaultValue !== undefined
				? props.defaultValue
				: selectionMode === 'single'
					? (props.defaultSelectedKey ?? null)
					: [];
		},
		[props.defaultValue, props.defaultSelectedKey, selectionMode],
		subSlot(slot, 'defaultValue'),
	);
	let value = useMemo(
		() => {
			return props.value !== undefined
				? props.value
				: selectionMode === 'single'
					? props.selectedKey
					: undefined;
		},
		[props.value, props.selectedKey, selectionMode],
		subSlot(slot, 'value'),
	);
	let [controlledValue, setControlledValue] = useControlledState<Key | readonly Key[] | null>(
		value,
		defaultValue,
		props.onChange as any,
		subSlot(slot, 'controlled'),
	);
	// Only display the first selected item if in single selection mode but the value is an array.
	let displayValue =
		selectionMode === 'single' && Array.isArray(controlledValue)
			? controlledValue[0]
			: controlledValue;
	let setValue = (value: Key | Key[] | null) => {
		if (selectionMode === 'single') {
			let key = Array.isArray(value) ? (value[0] ?? null) : value;
			setControlledValue(key);
			if (key !== displayValue) {
				props.onSelectionChange?.(key);
			}
		} else {
			let keys: Key[] = [];
			if (Array.isArray(value)) {
				keys = value;
			} else if (value != null) {
				keys = [value];
			}

			setControlledValue(keys);
		}
	};

	let listState = useListState(
		{
			...props,
			selectionMode,
			disallowEmptySelection: selectionMode === 'single',
			allowDuplicateSelectionEvents: true,
			selectedKeys: useMemo(
				() => convertValue(displayValue),
				[displayValue],
				subSlot(slot, 'selectedKeys'),
			),
			onSelectionChange: (keys: Selection) => {
				// impossible, but TS doesn't know that
				if (keys === 'all') {
					return;
				}

				if (selectionMode === 'single') {
					let key = keys.values().next().value ?? null;
					setValue(key);
				} else {
					setValue([...keys]);
				}
				if (shouldCloseOnSelect) {
					triggerState.close();
				}

				validationState.commitValidation();
			},
		},
		subSlot(slot, 'list'),
	);

	let selectedKey = listState.selectionManager.firstSelectedKey;
	let selectedItems = useMemo(
		() => {
			return [...listState.selectionManager.selectedKeys]
				.map((key) => listState.collection.getItem(key))
				.filter((item) => item != null);
		},
		[listState.selectionManager.selectedKeys, listState.collection],
		subSlot(slot, 'selectedItems'),
	);

	let validationState = useFormValidationState(
		{
			...props,
			value:
				Array.isArray(displayValue) && displayValue.length === 0 ? null : (displayValue as any),
		},
		subSlot(slot, 'validation'),
	);

	let [isFocused, setFocused] = useState(false, subSlot(slot, 'focused'));
	let [initialValue] = useState(displayValue, subSlot(slot, 'initial'));

	return {
		...validationState,
		...listState,
		...triggerState,
		value: displayValue,
		defaultValue: defaultValue ?? initialValue,
		setValue,
		selectedKey,
		setSelectedKey: setValue,
		selectedItem: selectedItems[0] ?? null,
		selectedItems,
		defaultSelectedKey:
			props.defaultSelectedKey ?? (props.selectionMode === 'single' ? (initialValue as Key) : null),
		focusStrategy,
		open(focusStrategy: FocusStrategy | null = null) {
			// Don't open if the collection is empty.
			if (listState.collection.size !== 0 || props.allowsEmptyCollection) {
				setFocusStrategy(focusStrategy);
				triggerState.open();
			}
		},
		toggle(focusStrategy: FocusStrategy | null = null) {
			if (listState.collection.size !== 0 || props.allowsEmptyCollection) {
				setFocusStrategy(focusStrategy);
				triggerState.toggle();
			}
		},
		isFocused,
		setFocused,
	};
}

function convertValue(value: Key | Key[] | null | undefined) {
	if (value === undefined) {
		return undefined;
	}
	if (value === null) {
		return [];
	}
	return Array.isArray(value) ? value : [value];
}
