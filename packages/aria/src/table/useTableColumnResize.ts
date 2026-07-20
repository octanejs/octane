// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/table/useTableColumnResize.ts).
// octane adaptations:
// - Handlers receive NATIVE events (there is no synthetic layer): React's `ChangeEvent`
//   becomes the native change Event and `getEventTarget(e)` casts to the input. The
//   returned `inputProps.onChange` stays a native `change` handler (the visually hidden
//   resizer is a range input — screen readers drive it via commit-style value changes,
//   matching upstream's intent).
// - `TableColumnResizeState`/`ColumnSize`/`GridNode` come from the ported stately hooks;
//   `DOMAttributes` is a local structural prop-bag alias.
// - The Parcel glob intl import becomes the generated src/intl/table index (verbatim
//   dictionaries).
// - Public-hook slot threading (splitSlot/subSlot); explicit dependency arrays are kept
//   verbatim. Column-resize pixel math is layout-driven and inert in jsdom; the logic is
//   ported verbatim regardless.
import { useCallback, useEffect, useRef } from 'octane';
import type { ColumnSize } from '../stately/table/Column';
import type { FocusableElement, Key, RefObject } from '@react-types/shared';
import { focusSafely } from '../interactions/focusSafely';
import { getActiveElement, getEventTarget } from '../utils/shadowdom/DOMFunctions';
import { getColumnHeaderId } from './utils';
import type { GridNode } from '../stately/grid/GridCollection';
import intlMessages from '../intl/table';
import { mergeProps } from '../utils/mergeProps';
import type { TableColumnResizeState } from '../stately/table/useTableColumnResizeState';
import { useDescription } from '../utils/useDescription';
import { useEffectEvent } from '../utils/useEffectEvent';
import { useId } from '../utils/useId';
import { useInteractionModality } from '../interactions/useFocusVisible';
import { useKeyboard } from '../interactions/useKeyboard';
import { useLocale } from '../i18n/I18nProvider';
import { useLocalizedStringFormatter } from '../i18n/useLocalizedStringFormatter';
import { useMove } from '../interactions/useMove';
import { usePress } from '../interactions/usePress';
import { useVisuallyHidden } from '../visually-hidden/VisuallyHidden';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface TableColumnResizeAria {
	/** Props for the visually hidden input element. */
	inputProps: DOMAttributes;
	/** Props for the resizer element. */
	resizerProps: DOMAttributes;
	/** Whether this column is currently being resized. */
	isResizing: boolean;
}

export interface AriaTableColumnResizeProps<T> {
	/**
	 * An object representing the [column header](https://www.w3.org/TR/wai-aria-1.1/#columnheader).
	 * Contains all the relevant information that makes up the column header.
	 */
	column: GridNode<T>;
	/** Aria label for the hidden input. Gets read when resizing. */
	'aria-label': string;
	/**
	 * Ref to the trigger if resizing was started from a column header menu. If it's provided, focus
	 * will be returned there when resizing is done. If it isn't provided, it is assumed that the
	 * resizer is visible at all time and keyboard resizing is started via pressing Enter on the
	 * resizer and not on focus.
	 */
	triggerRef?: RefObject<FocusableElement | null>;
	/** If resizing is disabled. */
	isDisabled?: boolean;
	/** Called when resizing starts. */
	onResizeStart?: (widths: Map<Key, ColumnSize>) => void;
	/** Called for every resize event that results in new column sizes. */
	onResize?: (widths: Map<Key, ColumnSize>) => void;
	/** Called when resizing ends. */
	onResizeEnd?: (widths: Map<Key, ColumnSize>) => void;
}

/**
 * Provides the behavior and accessibility implementation for a table column resizer element.
 *
 * @param props - Props for the resizer.
 * @param state - State for the table's resizable columns, as returned by
 *   `useTableColumnResizeState`.
 * @param ref - The ref attached to the resizer's visually hidden input element.
 */
export function useTableColumnResize<T>(
	props: AriaTableColumnResizeProps<T>,
	state: TableColumnResizeState<T>,
	ref: RefObject<HTMLInputElement | null>,
): TableColumnResizeAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useTableColumnResize<T>(
	props: AriaTableColumnResizeProps<T>,
	state: TableColumnResizeState<T>,
	ref: RefObject<HTMLInputElement | null>,
	slot: symbol | undefined,
): TableColumnResizeAria;
export function useTableColumnResize(...args: any[]): TableColumnResizeAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useTableColumnResize');
	const props = user[0] as AriaTableColumnResizeProps<any>;
	const state = user[1] as TableColumnResizeState<any>;
	const ref = user[2] as RefObject<HTMLInputElement | null>;

	let {
		column: item,
		triggerRef,
		isDisabled,
		onResizeStart,
		onResize,
		onResizeEnd,
		'aria-label': ariaLabel,
	} = props;
	const stringFormatter = useLocalizedStringFormatter(
		intlMessages,
		'@react-aria/table',
		subSlot(slot, 'strings'),
	);
	let id = useId(subSlot(slot, 'id'));
	let isResizing = state.resizingColumn === item.key;
	let isResizingRef = useRef(isResizing, subSlot(slot, 'isResizing'));
	let lastSize = useRef<Map<Key, ColumnSize> | null>(null, subSlot(slot, 'lastSize'));
	let wasFocusedOnResizeStart = useRef(false, subSlot(slot, 'wasFocused'));
	let editModeEnabled = state.tableState.isKeyboardNavigationDisabled;

	let { direction } = useLocale(subSlot(slot, 'locale'));

	let startResize = useCallback(
		(item: GridNode<any>) => {
			if (!isResizingRef.current) {
				lastSize.current = state.updateResizedColumns(item.key, state.getColumnWidth(item.key));
				state.startResize(item.key);
				state.tableState.setKeyboardNavigationDisabled(true);
				onResizeStart?.(lastSize.current);
			}
			isResizingRef.current = true;
		},
		[state, onResizeStart],
		subSlot(slot, 'startResize'),
	);

	let resize = useCallback(
		(item: GridNode<any>, newWidth: number) => {
			let sizes = state.updateResizedColumns(item.key, newWidth);
			onResize?.(sizes);
			lastSize.current = sizes;
		},
		[state, onResize],
		subSlot(slot, 'resize'),
	);

	let endResize = useCallback(
		(item: GridNode<any>) => {
			if (isResizingRef.current) {
				if (lastSize.current == null) {
					lastSize.current = state.updateResizedColumns(item.key, state.getColumnWidth(item.key));
				}

				state.endResize();
				state.tableState.setKeyboardNavigationDisabled(false);
				onResizeEnd?.(lastSize.current);
				isResizingRef.current = false;

				if (triggerRef?.current && !wasFocusedOnResizeStart.current) {
					// switch focus back to the column header unless the resizer was already focused when resizing started.
					focusSafely(triggerRef.current);
				}
			}
			lastSize.current = null;
		},
		[state, triggerRef, onResizeEnd],
		subSlot(slot, 'endResize'),
	);

	let { keyboardProps } = useKeyboard(
		{
			onKeyDown: (e) => {
				if (editModeEnabled) {
					if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') {
						e.preventDefault();
						endResize(item);
					}
				} else {
					// Continue propagation on keydown events so they still bubbles to useSelectableCollection and are handled there
					e.continuePropagation();

					if (e.key === 'Enter') {
						startResize(item);
					}
				}
			},
		},
		subSlot(slot, 'keyboard'),
	);

	const columnResizeWidthRef = useRef<number>(0, subSlot(slot, 'resizeWidth'));
	const { moveProps } = useMove(
		{
			onMoveStart() {
				columnResizeWidthRef.current = state.getColumnWidth(item.key);
				startResize(item);
			},
			onMove(e) {
				let { deltaX, deltaY, pointerType } = e;
				if (direction === 'rtl') {
					deltaX *= -1;
				}
				if (pointerType === 'keyboard') {
					if (deltaY !== 0 && deltaX === 0) {
						deltaX = deltaY * -1;
					}
					deltaX *= 10;
				}
				// if moving up/down only, no need to resize
				if (deltaX !== 0) {
					columnResizeWidthRef.current += deltaX;
					resize(item, columnResizeWidthRef.current);
				}
			},
			onMoveEnd(e) {
				let { pointerType } = e;
				columnResizeWidthRef.current = 0;
				if (
					pointerType === 'mouse' ||
					(pointerType === 'touch' && wasFocusedOnResizeStart.current)
				) {
					endResize(item);
				}
			},
		},
		subSlot(slot, 'move'),
	);

	let onKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (editModeEnabled) {
				moveProps.onKeyDown?.(e);
			}
		},
		[editModeEnabled, moveProps],
		subSlot(slot, 'onKeyDown'),
	);

	let min = Math.floor(state.getColumnMinWidth(item.key));
	let max = Math.floor(state.getColumnMaxWidth(item.key));
	if (max === Infinity) {
		max = Number.MAX_SAFE_INTEGER;
	}
	let value = Math.floor(state.getColumnWidth(item.key));
	let modality: string | null = useInteractionModality(subSlot(slot, 'modality'));
	if (modality === 'virtual' && typeof window !== 'undefined' && 'ontouchstart' in window) {
		modality = 'touch';
	}
	let description =
		triggerRef?.current == null &&
		(modality === 'keyboard' || modality === 'virtual') &&
		!isResizing
			? stringFormatter.format('resizerDescription')
			: undefined;
	let descriptionProps = useDescription(description, subSlot(slot, 'description'));
	let ariaProps = {
		'aria-label': ariaLabel,
		'aria-orientation': 'horizontal' as 'horizontal',
		'aria-labelledby': `${id} ${getColumnHeaderId(state.tableState, item.key)}`,
		'aria-valuetext': stringFormatter.format('columnSize', { value }),
		type: 'range',
		min,
		max,
		value,
		...descriptionProps,
	};

	const focusInput = useCallback(
		() => {
			if (ref.current) {
				focusSafely(ref.current);
			}
		},
		[ref],
		subSlot(slot, 'focusInput'),
	);

	let resizingColumn = state.resizingColumn;
	let prevResizingColumn = useRef<Key | null>(null, subSlot(slot, 'prevResizing'));
	let startResizeEvent = useEffectEvent(startResize, subSlot(slot, 'startResizeEvent'));
	useEffect(
		() => {
			if (
				prevResizingColumn.current !== resizingColumn &&
				resizingColumn != null &&
				resizingColumn === item.key
			) {
				wasFocusedOnResizeStart.current = getActiveElement() === ref.current;
				startResizeEvent(item);
				// Delay focusing input until Android Chrome's delayed click after touchend happens: https://bugs.chromium.org/p/chromium/issues/detail?id=1150073
				let timeout = setTimeout(() => focusInput(), 0);
				// VoiceOver on iOS has problems focusing the input from a menu.
				let VOTimeout = setTimeout(focusInput, 400);
				return () => {
					clearTimeout(timeout);
					clearTimeout(VOTimeout);
				};
			}
			prevResizingColumn.current = resizingColumn;
		},
		[resizingColumn, item, focusInput, ref],
		subSlot(slot, 'resizeEffect'),
	);

	let onChange = (e: Event) => {
		let currentWidth = state.getColumnWidth(item.key);
		let nextValue = parseFloat((getEventTarget(e) as HTMLInputElement).value);

		if (nextValue > currentWidth) {
			nextValue = currentWidth + 10;
		} else {
			nextValue = currentWidth - 10;
		}
		resize(item, nextValue);
	};

	let { pressProps } = usePress(
		{
			preventFocusOnPress: true,
			onPressStart: (e) => {
				if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey || e.pointerType === 'keyboard') {
					return;
				}
				if (e.pointerType === 'virtual' && state.resizingColumn != null) {
					endResize(item);
					return;
				}

				// Sometimes onPress won't trigger for quick taps on mobile so we want to focus the input so blurring away
				// can cancel resize mode for us.
				focusInput();

				// If resizer is always visible, mobile screenreader user can access the visually hidden resizer directly and thus we don't need
				// to handle a virtual click to start the resizer.
				if (e.pointerType !== 'virtual') {
					startResize(item);
				}
			},
			onPress: (e) => {
				if (
					((e.pointerType === 'touch' && wasFocusedOnResizeStart.current) ||
						e.pointerType === 'mouse') &&
					state.resizingColumn != null
				) {
					endResize(item);
				}
			},
		},
		subSlot(slot, 'press'),
	);
	let { visuallyHiddenProps } = useVisuallyHidden(undefined, subSlot(slot, 'visuallyHidden'));

	return {
		resizerProps: mergeProps(keyboardProps, { ...moveProps, onKeyDown }, pressProps, {
			style: { touchAction: 'none' },
		}),
		inputProps: mergeProps(
			visuallyHiddenProps,
			{
				id,
				onBlur: () => {
					endResize(item);
				},
				onChange,
				disabled: isDisabled,
			},
			ariaProps,
		),
		isResizing,
	};
}
