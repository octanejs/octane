// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/gridlist/useGridList.ts).
// octane adaptations:
// - `ListState` comes from the ported stately list hook; `DOMAttributes` is a local
//   structural prop-bag alias (upstream's is typed over React's synthetic handlers).
// - The grid-area imports resolve to the ported GRID SUBSET (useGridSelectionAnnouncement
//   and useHighlightSelectionDescription — see src/grid/).
// - Public-hook slot threading (splitSlot/subSlot).
import type {
	AriaLabelingProps,
	CollectionBase,
	DisabledBehavior,
	DOMProps,
	FocusStrategy,
	Key,
	KeyboardDelegate,
	LayoutDelegate,
	MultipleSelection,
	RefObject,
} from '@react-types/shared';
import { filterDOMProps } from '../utils/filterDOMProps';
import { listMap } from './utils';
import type { ListState } from '../stately/list/useListState';
import { mergeProps } from '../utils/mergeProps';
import { useGridSelectionAnnouncement } from '../grid/useGridSelectionAnnouncement';
import { useHasTabbableChild } from '../focus/useHasTabbableChild';
import { useHighlightSelectionDescription } from '../grid/useHighlightSelectionDescription';
import { useId } from '../utils/useId';
import { useSelectableList } from '../selection/useSelectableList';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface GridListProps<T> extends CollectionBase<T>, MultipleSelection {
	/** Whether to auto focus the gridlist or an option. */
	autoFocus?: boolean | FocusStrategy;
	/**
	 * Handler that is called when a user performs an action on an item. The exact user event depends
	 * on the collection's `selectionBehavior` prop and the interaction modality.
	 */
	onAction?: (key: Key) => void;
	/**
	 * Whether `disabledKeys` applies to all interactions, or only selection.
	 *
	 * @default 'all'
	 */
	disabledBehavior?: DisabledBehavior;
	/** Whether selection should occur on press up instead of press down. */
	shouldSelectOnPressUp?: boolean;
}

export interface AriaGridListProps<T> extends GridListProps<T>, DOMProps, AriaLabelingProps {
	/**
	 * Whether keyboard navigation to focusable elements within grid list items is
	 * via the left/right arrow keys or the tab key.
	 *
	 * @default 'arrow'
	 */
	keyboardNavigationBehavior?: 'arrow' | 'tab';
	/**
	 * Whether pressing the escape key should clear selection in the grid list or not.
	 *
	 * Most experiences should not modify this option as it eliminates a keyboard user's ability to
	 * easily clear selection. Only use if the escape key is being handled externally or should not
	 * trigger selection clearing contextually.
	 *
	 * @default 'clearSelection'
	 */
	escapeKeyBehavior?: 'clearSelection' | 'none';
}

export interface AriaGridListOptions<T> extends Omit<AriaGridListProps<T>, 'children'> {
	/** Whether the list uses virtual scrolling. */
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
	 * A delegate object that provides layout information for items in the collection.
	 * By default this uses the DOM, but this can be overridden to implement things like
	 * virtualized scrolling.
	 */
	layoutDelegate?: LayoutDelegate;
	/**
	 * Whether focus should wrap around when the end/start is reached.
	 *
	 * @default false
	 */
	shouldFocusWrap?: boolean;
	/**
	 * The behavior of links in the collection.
	 * - 'action': link behaves like onAction.
	 * - 'selection': link follows selection interactions (e.g. if URL drives selection).
	 * - 'override': links override all other interactions (link items are not selectable).
	 *
	 * @default 'action'
	 */
	linkBehavior?: 'action' | 'selection' | 'override';
	/**
	 * Which item in the collection to focus when tabbing into the collection. Overrides default
	 * roving tab index like behavior.
	 *
	 * @private
	 */
	UNSTABLE_focusOnEntry?: 'first' | 'last';
}

export interface GridListAria {
	/** Props for the grid element. */
	gridProps: DOMAttributes;
}

/**
 * Provides the behavior and accessibility implementation for a list component with interactive
 * children. A grid list displays data in a single column and enables a user to navigate its
 * contents via directional navigation keys.
 *
 * @param props - Props for the list.
 * @param state - State for the list, as returned by `useListState`.
 * @param ref - The ref attached to the list element.
 */
export function useGridList<T>(
	props: AriaGridListOptions<T>,
	state: ListState<T>,
	ref: RefObject<HTMLElement | null>,
): GridListAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useGridList<T>(
	props: AriaGridListOptions<T>,
	state: ListState<T>,
	ref: RefObject<HTMLElement | null>,
	slot: symbol | undefined,
): GridListAria;
export function useGridList(...args: any[]): GridListAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useGridList');
	const props = user[0] as AriaGridListOptions<any>;
	const state = user[1] as ListState<any>;
	const ref = user[2] as RefObject<HTMLElement | null>;

	let {
		isVirtualized,
		keyboardDelegate,
		layoutDelegate,
		onAction,
		disallowTypeAhead,
		linkBehavior = 'action',
		keyboardNavigationBehavior = 'arrow',
		escapeKeyBehavior = 'clearSelection',
		shouldSelectOnPressUp,
	} = props;

	if (!props['aria-label'] && !props['aria-labelledby']) {
		console.warn('An aria-label or aria-labelledby prop is required for accessibility.');
	}

	let { listProps } = useSelectableList(
		{
			selectionManager: state.selectionManager,
			collection: state.collection,
			disabledKeys: state.disabledKeys,
			ref,
			keyboardDelegate,
			layoutDelegate,
			isVirtualized,
			selectOnFocus: state.selectionManager.selectionBehavior === 'replace',
			shouldFocusWrap: props.shouldFocusWrap,
			linkBehavior,
			disallowTypeAhead,
			autoFocus: props.autoFocus,
			escapeKeyBehavior,
			UNSTABLE_focusOnEntry: props.UNSTABLE_focusOnEntry,
		},
		subSlot(slot, 'selectableList'),
	);

	let id = useId(props.id, subSlot(slot, 'id'));
	listMap.set(state, {
		id,
		onAction,
		linkBehavior,
		keyboardNavigationBehavior,
		shouldSelectOnPressUp,
	});

	let descriptionProps = useHighlightSelectionDescription(
		{
			selectionManager: state.selectionManager,
			hasItemActions: !!onAction,
		},
		subSlot(slot, 'highlightDescription'),
	);

	let hasTabbableChild = useHasTabbableChild(
		ref,
		{
			isDisabled: state.collection.size !== 0,
		},
		subSlot(slot, 'hasTabbableChild'),
	);

	let domProps = filterDOMProps(props, { labelable: true });
	let gridProps: DOMAttributes = mergeProps(
		domProps,
		{
			role: 'grid',
			id,
			'aria-multiselectable':
				state.selectionManager.selectionMode === 'multiple' ? 'true' : undefined,
		},
		// If collection is empty, make sure the grid is tabbable unless there is a child tabbable element.
		state.collection.size === 0 ? { tabIndex: hasTabbableChild ? -1 : 0 } : listProps,
		descriptionProps,
	);

	if (isVirtualized) {
		gridProps['aria-rowcount'] = state.collection.size;
		gridProps['aria-colcount'] = 1;
	}

	useGridSelectionAnnouncement({}, state, subSlot(slot, 'selectionAnnouncement'));

	return {
		gridProps,
	};
}
