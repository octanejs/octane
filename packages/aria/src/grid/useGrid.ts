// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/grid/useGrid.ts).
// octane adaptations:
// - Handlers receive NATIVE events: React's `FocusEventHandler` becomes a native
//   FocusEvent handler and `e.currentTarget` casts to Element for the shadow-DOM
//   helpers (octane's delegated dispatch guarantees the per-handler currentTarget).
// - `GridState`/`IGridCollection` come from the ported stately grid hooks;
//   `DOMAttributes` is a local structural prop-bag alias (upstream's is typed over
//   React's synthetic handlers).
// - Public-hook slot threading (splitSlot/subSlot); explicit dependency arrays are kept
//   verbatim.
import type {
	AriaLabelingProps,
	DOMProps,
	Key,
	KeyboardDelegate,
	RefObject,
} from '@react-types/shared';
import { filterDOMProps } from '../utils/filterDOMProps';
import { useCallback, useMemo } from 'octane';
import { getEventTarget, nodeContains } from '../utils/shadowdom/DOMFunctions';
import type { IGridCollection as GridCollection } from '../stately/grid/GridCollection';
import { GridKeyboardDelegate } from './GridKeyboardDelegate';
import { gridMap } from './utils';
import type { GridState } from '../stately/grid/useGridState';
import { mergeProps } from '../utils/mergeProps';
import { useCollator } from '../i18n/useCollator';
import { useGridSelectionAnnouncement } from './useGridSelectionAnnouncement';
import { useHasTabbableChild } from '../focus/useHasTabbableChild';
import { useHighlightSelectionDescription } from './useHighlightSelectionDescription';
import { useId } from '../utils/useId';
import { useLocale } from '../i18n/I18nProvider';
import { useSelectableCollection } from '../selection/useSelectableCollection';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface GridProps extends DOMProps, AriaLabelingProps {
	/** Whether the grid uses virtual scrolling. */
	isVirtualized?: boolean;
	/**
	 * Whether typeahead navigation is disabled.
	 *
	 * @default false
	 */
	disallowTypeAhead?: boolean;
	/**
	 * An optional keyboard delegate implementation for type to select,
	 * to override the default.
	 */
	keyboardDelegate?: KeyboardDelegate;
	/**
	 * Whether initial grid focus should be placed on the grid row or grid cell.
	 *
	 * @default 'row'
	 */
	focusMode?: 'row' | 'cell';
	/**
	 * A function that returns the text that should be announced by assistive technology when a row is
	 * added or removed from selection.
	 *
	 * @default (key) => state.collection.getItem(key)?.textValue
	 */
	getRowText?: (key: Key) => string;
	/**
	 * The ref attached to the scrollable body. Used to provided automatic scrolling on item focus for
	 * non-virtualized grids.
	 */
	scrollRef?: RefObject<HTMLElement | null>;
	/** Handler that is called when a user performs an action on the row. */
	onRowAction?: (key: Key) => void;
	/** Handler that is called when a user performs an action on the cell. */
	onCellAction?: (key: Key) => void;
	/**
	 * Whether pressing the escape key should clear selection in the grid or not.
	 *
	 * Most experiences should not modify this option as it eliminates a keyboard user's ability to
	 * easily clear selection. Only use if the escape key is being handled externally or should not
	 * trigger selection clearing contextually.
	 *
	 * @default 'clearSelection'
	 */
	escapeKeyBehavior?: 'clearSelection' | 'none';
	/** Whether selection should occur on press up instead of press down. */
	shouldSelectOnPressUp?: boolean;
}

export interface GridAria {
	/** Props for the grid element. */
	gridProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a grid component. A grid displays data
 * in one or more rows and columns and enables a user to navigate its contents via directional
 * navigation keys.
 *
 * @param props - Props for the grid.
 * @param state - State for the grid, as returned by `useGridState`.
 * @param ref - The ref attached to the grid element.
 */
export function useGrid<T>(
	props: GridProps,
	state: GridState<T, GridCollection<T>>,
	ref: RefObject<HTMLElement | null>,
): GridAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useGrid<T>(
	props: GridProps,
	state: GridState<T, GridCollection<T>>,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): GridAria;
export function useGrid(...args: any[]): GridAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useGrid');
	const props = user[0] as GridProps;
	const state = user[1] as GridState<any, GridCollection<any>>;
	const ref = user[2] as RefObject<HTMLElement | null>;

	let {
		isVirtualized,
		disallowTypeAhead,
		keyboardDelegate,
		focusMode,
		scrollRef,
		getRowText,
		onRowAction,
		onCellAction,
		escapeKeyBehavior = 'clearSelection',
		shouldSelectOnPressUp,
	} = props;
	let { selectionManager: manager } = state;

	if (!props['aria-label'] && !props['aria-labelledby']) {
		console.warn('An aria-label or aria-labelledby prop is required for accessibility.');
	}

	// By default, a KeyboardDelegate is provided which uses the DOM to query layout information (e.g. for page up/page down).
	// When virtualized, the layout object will be passed in as a prop and override this.
	let collator = useCollator({ usage: 'search', sensitivity: 'base' }, subSlot(slot, 'collator'));
	let { direction } = useLocale(subSlot(slot, 'locale'));
	let disabledBehavior = state.selectionManager.disabledBehavior;
	let delegate = useMemo(
		() =>
			keyboardDelegate ||
			new GridKeyboardDelegate({
				collection: state.collection,
				disabledKeys: state.disabledKeys,
				disabledBehavior,
				ref,
				direction,
				collator,
				focusMode,
			}),
		[
			keyboardDelegate,
			state.collection,
			state.disabledKeys,
			disabledBehavior,
			ref,
			direction,
			collator,
			focusMode,
		],
		subSlot(slot, 'delegate'),
	);

	let { collectionProps } = useSelectableCollection(
		{
			ref,
			selectionManager: manager,
			keyboardDelegate: delegate,
			isVirtualized,
			scrollRef,
			disallowTypeAhead,
			escapeKeyBehavior,
		},
		subSlot(slot, 'selectableCollection'),
	);

	let id = useId(props.id, subSlot(slot, 'id'));
	gridMap.set(state, {
		keyboardDelegate: delegate,
		actions: { onRowAction, onCellAction },
		shouldSelectOnPressUp,
	});

	let descriptionProps = useHighlightSelectionDescription(
		{
			selectionManager: manager,
			hasItemActions: !!(onRowAction || onCellAction),
		},
		subSlot(slot, 'highlightDescription'),
	);

	let domProps = filterDOMProps(props, { labelable: true });

	let onFocus = useCallback(
		(e: FocusEvent) => {
			if (manager.isFocused) {
				// If a focus event bubbled through a portal, reset focus state.
				if (!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)) {
					manager.setFocused(false);
				}

				return;
			}

			// Focus events can bubble through portals. Ignore these events.
			if (!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element)) {
				return;
			}

			manager.setFocused(true);
		},
		[manager],
		subSlot(slot, 'onFocus'),
	);

	// Continue to track collection focused state even if keyboard navigation is disabled
	let navDisabledHandlers = useMemo(
		() => ({
			onBlur: collectionProps.onBlur,
			onFocus,
		}),
		[onFocus, collectionProps.onBlur],
		subSlot(slot, 'navDisabled'),
	);

	let hasTabbableChild = useHasTabbableChild(
		ref,
		{
			isDisabled: state.collection.size !== 0,
		},
		subSlot(slot, 'hasTabbableChild'),
	);

	let gridProps: DOMAttributes = mergeProps(
		domProps,
		{
			role: 'grid',
			id,
			'aria-multiselectable': manager.selectionMode === 'multiple' ? 'true' : undefined,
		},
		state.isKeyboardNavigationDisabled ? navDisabledHandlers : collectionProps,
		// If collection is empty, make sure the grid is tabbable unless there is a child tabbable element.
		(state.collection.size === 0 && { tabIndex: hasTabbableChild ? -1 : 0 }) || undefined,
		descriptionProps,
	);

	if (isVirtualized) {
		gridProps['aria-rowcount'] = state.collection.size;
		gridProps['aria-colcount'] = state.collection.columnCount;
	}

	useGridSelectionAnnouncement({ getRowText }, state, subSlot(slot, 'selectionAnnouncement'));
	return {
		gridProps,
	};
}
