// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/gridlist/useGridListItem.ts).
// octane adaptations:
// - Handlers receive NATIVE events (there is no synthetic layer): keydown handlers take
//   the native KeyboardEvent, `e.nativeEvent` reads collapse to the event itself (the
//   ArrowUp/ArrowDown re-dispatch builds `new KeyboardEvent(e.type, e)` — WebIDL
//   dictionary conversion reads the inherited native-event accessors), and upstream's
//   synthetic `e.isPropagationStopped()` reads the native `cancelBubble` flag (same
//   source of truth the ported interactions/utils shim uses). `onKeyDownCapture` maps to
//   the capture phase natively in octane, matching upstream's React capture prop.
// - `ListState`/`TreeState` come from the ported stately hooks; `HTMLAttributes` /
//   `DOMAttributes` collapse to a structural prop bag.
// - Public-hook slot threading (splitSlot/subSlot).
import { chain } from '../utils/chain';
import type {
	Collection,
	FocusableElement,
	Key,
	RefObject,
	Node as RSNode,
} from '@react-types/shared';
import { focusSafely } from '../interactions/focusSafely';
import {
	getActiveElement,
	getEventTarget,
	isFocusWithin,
	nodeContains,
} from '../utils/shadowdom/DOMFunctions';
import { getFocusableTreeWalker } from '../focus/FocusScope';
import { getRowId, listMap } from './utils';
import { getScrollParent } from '../utils/getScrollParent';
import { useRef } from 'octane';
import { isFocusVisible } from '../interactions/useFocusVisible';
import { isTabbable } from '../utils/isFocusable';
import type { ListState } from '../stately/list/useListState';
import { mergeProps } from '../utils/mergeProps';
import { scrollIntoViewport } from '../utils/scrollIntoView';
import { SelectableItemStates, useSelectableItem } from '../selection/useSelectableItem';
import type { TreeState } from '../stately/tree/useTreeState';
import { useLocale } from '../i18n/I18nProvider';
import { useSlotId } from '../utils/useId';
import { useSyntheticLinkProps } from '../utils/openLink';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export interface AriaGridListItemOptions {
	/**
	 * An object representing the list item. Contains all the relevant information that makes up the
	 * list row.
	 */
	node: RSNode<unknown>;
	/** Whether the list row is contained in a virtual scroller. */
	isVirtualized?: boolean;
	/** Whether selection should occur on press up instead of press down. */
	shouldSelectOnPressUp?: boolean;
	/** Whether this item has children, even if not loaded yet. */
	hasChildItems?: boolean;
}

export interface GridListItemAria extends SelectableItemStates {
	/** Props for the list row element. */
	rowProps: DOMAttributes;
	/** Props for the grid cell element within the list row. */
	gridCellProps: DOMAttributes;
	/** Props for the list item description element, if any. */
	descriptionProps: DOMAttributes;
}

const EXPANSION_KEYS = {
	expand: {
		ltr: 'ArrowRight',
		rtl: 'ArrowLeft',
	},
	collapse: {
		ltr: 'ArrowLeft',
		rtl: 'ArrowRight',
	},
};

/**
 * Provides the behavior and accessibility implementation for a row in a grid list.
 *
 * @param props - Props for the row.
 * @param state - State of the parent list, as returned by `useListState`.
 * @param ref - The ref attached to the row element.
 */
export function useGridListItem<T>(
	props: AriaGridListItemOptions,
	state: ListState<T> | TreeState<T>,
	ref: RefObject<FocusableElement | null>,
): GridListItemAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useGridListItem<T>(
	props: AriaGridListItemOptions,
	state: ListState<T> | TreeState<T>,
	ref: RefObject<FocusableElement | null>,
	slot: symbol | undefined,
): GridListItemAria;
export function useGridListItem(...args: any[]): GridListItemAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useGridListItem');
	const props = user[0] as AriaGridListItemOptions;
	const state = user[1] as ListState<any> | TreeState<any>;
	const ref = user[2] as RefObject<FocusableElement | null>;

	// Copied from useGridCell + some modifications to make it not so grid specific
	let { node, isVirtualized } = props;

	// let stringFormatter = useLocalizedStringFormatter(intlMessages, '@react-aria/gridlist');
	let { direction } = useLocale(subSlot(slot, 'locale'));
	let { onAction, linkBehavior, keyboardNavigationBehavior, shouldSelectOnPressUp } =
		listMap.get(state)!;
	let descriptionId = useSlotId(undefined, subSlot(slot, 'descriptionId'));

	// We need to track the key of the item at the time it was last focused so that we force
	// focus to go to the item when the DOM node is reused for a different item in a virtualizer.
	let keyWhenFocused = useRef<Key | null>(null, subSlot(slot, 'keyWhenFocused'));
	let focus = () => {
		// Don't shift focus to the row if the active element is a element within the row already
		// (e.g. clicking on a row button)
		if (
			ref.current !== null &&
			((keyWhenFocused.current != null && node.key !== keyWhenFocused.current) ||
				!isFocusWithin(ref.current))
		) {
			focusSafely(ref.current);
		}
	};

	let treeGridRowProps: DOMAttributes = {};
	let hasChildRows = props.hasChildItems;
	let hasLink = state.selectionManager.isLink(node.key);
	if (node != null && 'expandedKeys' in state) {
		// TODO: ideally node.hasChildNodes would be a way to tell if a row has child nodes, but the row's contents make it so that value is always
		// true...
		let children = state.collection.getChildren?.(node.key);
		hasChildRows = hasChildRows || [...(children ?? [])].length > 1;

		if (
			onAction == null &&
			!hasLink &&
			state.selectionManager.selectionMode === 'none' &&
			hasChildRows
		) {
			onAction = () => state.toggleKey(node.key);
		}

		let isExpanded = hasChildRows ? state.expandedKeys.has(node.key) : undefined;
		let setSize = 1;
		let index = node.index;
		if (node.level >= 0 && node?.parentKey != null) {
			let parent = state.collection.getItem(node.parentKey);
			if (parent) {
				// siblings must exist because our original node exists
				let siblings = getDirectChildren(parent, state.collection);
				setSize = [...siblings].filter((row) => row.type === 'item').length;
				if (index > 0 && siblings[0].type !== 'item') {
					index -= 1; // subtract one for the parent item's content node
				}
			}
		} else {
			setSize = [...state.collection].filter(
				(row) => row.level === 0 && row.type === 'item',
			).length;
		}

		treeGridRowProps = {
			'aria-expanded': isExpanded,
			'aria-level': node.level + 1,
			'aria-posinset': index + 1,
			'aria-setsize': setSize,
		};
	}

	let { itemProps, ...itemStates } = useSelectableItem(
		{
			selectionManager: state.selectionManager,
			key: node.key,
			ref,
			isVirtualized,
			shouldSelectOnPressUp: props.shouldSelectOnPressUp || shouldSelectOnPressUp,
			onAction:
				onAction || node.props?.onAction
					? chain(node.props?.onAction, onAction ? () => onAction(node.key) : undefined)
					: undefined,
			focus,
			linkBehavior,
		},
		subSlot(slot, 'selectableItem'),
	);

	let onKeyDownCapture = (e: KeyboardEvent) => {
		let activeElement = getActiveElement();
		if (
			!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element) ||
			!ref.current ||
			!activeElement
		) {
			return;
		}

		let walker = getFocusableTreeWalker(ref.current);
		walker.currentNode = activeElement;

		if (
			handleTreeExpansionKeys(e, state, node, hasChildRows, direction, activeElement, ref.current)
		) {
			return;
		}

		switch (e.key) {
			case 'ArrowLeft': {
				if (keyboardNavigationBehavior === 'arrow') {
					// Find the next focusable element within the row.
					let focusable =
						direction === 'rtl'
							? (walker.nextNode() as FocusableElement)
							: (walker.previousNode() as FocusableElement);

					if (focusable) {
						e.preventDefault();
						e.stopPropagation();
						focusSafely(focusable);
						scrollIntoViewport(focusable, { containingElement: getScrollParent(ref.current) });
					} else {
						// If there is no next focusable child, then return focus back to the row
						e.preventDefault();
						e.stopPropagation();
						if (direction === 'rtl') {
							focusSafely(ref.current);
							scrollIntoViewport(ref.current, { containingElement: getScrollParent(ref.current) });
						} else {
							walker.currentNode = ref.current;
							let lastElement = last(walker);
							if (lastElement) {
								focusSafely(lastElement);
								scrollIntoViewport(lastElement, {
									containingElement: getScrollParent(ref.current),
								});
							}
						}
					}
				}
				break;
			}
			case 'ArrowRight': {
				if (keyboardNavigationBehavior === 'arrow') {
					let focusable =
						direction === 'rtl'
							? (walker.previousNode() as FocusableElement)
							: (walker.nextNode() as FocusableElement);

					if (focusable) {
						e.preventDefault();
						e.stopPropagation();
						focusSafely(focusable);
						scrollIntoViewport(focusable, { containingElement: getScrollParent(ref.current) });
					} else {
						e.preventDefault();
						e.stopPropagation();
						if (direction === 'ltr') {
							focusSafely(ref.current);
							scrollIntoViewport(ref.current, { containingElement: getScrollParent(ref.current) });
						} else {
							walker.currentNode = ref.current;
							let lastElement = last(walker);
							if (lastElement) {
								focusSafely(lastElement);
								scrollIntoViewport(lastElement, {
									containingElement: getScrollParent(ref.current),
								});
							}
						}
					}
				}
				break;
			}
			case 'ArrowUp':
			case 'ArrowDown':
				// Prevent this event from reaching row children, e.g. menu buttons. We want arrow keys to navigate
				// to the row above/below instead. We need to re-dispatch the event from a higher parent so it still
				// bubbles and gets handled by useSelectableCollection.
				if (!e.altKey && nodeContains(ref.current, getEventTarget(e) as Element)) {
					e.stopPropagation();
					e.preventDefault();
					// octane adaptation: the native event IS `e.nativeEvent`.
					ref.current.parentElement?.dispatchEvent(new KeyboardEvent(e.type, e));
				}
				break;
		}
	};

	let onFocus = (e: FocusEvent) => {
		keyWhenFocused.current = node.key;
		if (getEventTarget(e) !== ref.current) {
			// useSelectableItem only handles setting the focused key when
			// the focused element is the row itself. We also want to
			// set the focused key when a child element receives focus.
			// If focus is currently visible (e.g. the user is navigating with the keyboard),
			// then skip this. We want to restore focus to the previously focused row
			// in that case since the list should act like a single tab stop.
			if (!isFocusVisible()) {
				state.selectionManager.setFocusedKey(node.key);
			}
			return;
		}
	};

	let onKeyDown = (e: KeyboardEvent) => {
		let activeElement = getActiveElement();
		if (
			!nodeContains(e.currentTarget as Element, getEventTarget(e) as Element) ||
			!ref.current ||
			!activeElement
		) {
			return;
		}

		if (keyboardNavigationBehavior === 'tab') {
			// Stop propagation for all events that originate from the children of the gridlist item since we don't want to trigger
			// grid level interactions (row navigation/typeselect/etc)
			// exception made for Tab since that needs to propagate to useSelectableCollection to tab out of the gridlist, might be others?
			if (getEventTarget(e) !== ref.current && e.key !== 'Tab') {
				e.stopPropagation();
				return;
			}

			if (
				handleTreeExpansionKeys(e, state, node, hasChildRows, direction, activeElement, ref.current)
			) {
				return;
			}
		}

		switch (e.key) {
			case 'Tab': {
				if (keyboardNavigationBehavior === 'tab') {
					// If there is another focusable element within this item, stop propagation so the tab key
					// is handled by the browser and not by useSelectableCollection (which would take us out of the list).
					let walker = getFocusableTreeWalker(ref.current, { tabbable: true });
					walker.currentNode = activeElement;
					let next = e.shiftKey ? walker.previousNode() : walker.nextNode();

					if (next) {
						e.stopPropagation();
					}
				}
			}
		}
	};

	let syntheticLinkProps = useSyntheticLinkProps(node.props);
	let linkProps = itemStates.hasAction ? syntheticLinkProps : {};
	// TODO: re-add when we get translations and fix this for iOS VO
	// let rowAnnouncement;
	// if (onAction) {
	//   rowAnnouncement = stringFormatter.format('hasActionAnnouncement');
	// } else if (hasLink) {
	//   rowAnnouncement = stringFormatter.format('hasLinkAnnouncement', {
	//     link: node.props.href
	//   });
	// }

	let rowProps: DOMAttributes = mergeProps(itemProps, linkProps, {
		role: 'row',
		onKeyDownCapture: keyboardNavigationBehavior === 'arrow' ? onKeyDownCapture : undefined,
		onFocus,
		// 'aria-label': [(node.textValue || undefined), rowAnnouncement].filter(Boolean).join(', '),
		'aria-label': (node as any)['aria-label'] || node.textValue || undefined,
		'aria-selected': state.selectionManager.canSelectItem(node.key)
			? state.selectionManager.isSelected(node.key)
			: undefined,
		'aria-disabled': state.selectionManager.isDisabled(node.key) || undefined,
		'aria-labelledby':
			descriptionId && ((node as any)['aria-label'] || node.textValue)
				? `${getRowId(state, node.key)} ${descriptionId}`
				: undefined,
		id: getRowId(state, node.key),
	});

	// we need to guard against space/enter triggering selection/row link via usePress (from itemProps) so check if propagation
	// is stopped. this also fixes space not working in a textfield in a tree parent row
	let baseOnKeyDown = rowProps.onKeyDown;
	rowProps.onKeyDown = (e: KeyboardEvent) => {
		onKeyDown(e);
		// octane adaptation: synthetic isPropagationStopped() → the native cancelBubble flag.
		if (!(e as any).cancelBubble) {
			baseOnKeyDown?.(e);
		}
	};

	// guard against presses triggering row selecition when they happen on elements within the row
	// am currently assuming if it is tabbable it is interactive, but maybe can use a different kind of check
	let baseOnPointerDown = rowProps.onPointerDown;
	rowProps.onPointerDown = (e: PointerEvent) => {
		let target = getEventTarget(e) as Element | null;
		if (target && target !== ref.current && isTabbable(target)) {
			e.stopPropagation();
			return;
		}
		baseOnPointerDown?.(e);
	};

	let baseOnMouseDown = rowProps.onMouseDown;
	rowProps.onMouseDown = (e: MouseEvent) => {
		let target = getEventTarget(e) as Element | null;
		if (target && target !== ref.current && isTabbable(target)) {
			e.stopPropagation();
			return;
		}
		baseOnMouseDown?.(e);
	};

	if (isVirtualized) {
		let { collection } = state;
		let nodes = [...collection];
		// TODO: refactor ListCollection to store an absolute index of a node's position?
		rowProps['aria-rowindex'] = nodes.find((node) => node.type === 'section')
			? [...collection.getKeys()]
					.filter((key) => collection.getItem(key)?.type !== 'section')
					.findIndex((key) => key === node.key) + 1
			: node.index + 1;
	}

	let gridCellProps = {
		role: 'gridcell',
		'aria-colindex': 1,
	};

	// TODO: should isExpanded and hasChildRows be a item state that gets returned by the hook?
	return {
		rowProps: { ...mergeProps(rowProps, treeGridRowProps) },
		gridCellProps,
		descriptionProps: {
			id: descriptionId,
		},
		...itemStates,
	};
}

function handleTreeExpansionKeys<T>(
	e: KeyboardEvent,
	state: ListState<T> | TreeState<T>,
	node: RSNode<unknown>,
	hasChildRows: boolean | undefined,
	direction: string,
	activeElement: Element | null,
	rowRef: FocusableElement | null,
): boolean {
	if (!('expandedKeys' in state) || activeElement !== rowRef) {
		return false;
	}
	if (
		e.key === (EXPANSION_KEYS['expand'] as Record<string, string>)[direction] &&
		state.selectionManager.focusedKey === node.key &&
		hasChildRows &&
		!state.expandedKeys.has(node.key)
	) {
		state.toggleKey(node.key);
		e.stopPropagation();
		return true;
	} else if (
		e.key === (EXPANSION_KEYS['collapse'] as Record<string, string>)[direction] &&
		state.selectionManager.focusedKey === node.key
	) {
		// If item is collapsible, collapse it; else move to parent
		if (hasChildRows && state.expandedKeys.has(node.key)) {
			state.toggleKey(node.key);
			e.stopPropagation();
			return true;
		} else if (
			!state.expandedKeys.has(node.key) &&
			node.parentKey &&
			state.collection.getItem(node.parentKey)?.type === 'item'
		) {
			// Item is a leaf or already collapsed, move focus to parent
			state.selectionManager.setFocusedKey(node.parentKey);
			e.stopPropagation();
			return true;
		}
	}
	return false;
}

function last(walker: TreeWalker) {
	let next: FocusableElement | null = null;
	let last: FocusableElement | null = null;
	do {
		last = walker.lastChild() as FocusableElement | null;
		if (last) {
			next = last;
		}
	} while (last);
	return next;
}

function getDirectChildren<T>(parent: RSNode<T>, collection: Collection<RSNode<T>>) {
	// We can't assume that we can use firstChildKey because if a person builds a tree using hooks, they would not have access to that property (using type Node vs CollectionNode)
	// Instead, get all children and start at the first node (rather than just using firstChildKey) and only look at its siblings
	let children = collection.getChildren?.(parent.key);
	let childArray = children ? Array.from(children) : [];
	let node = childArray.length > 0 ? childArray[0] : null;
	let siblings: RSNode<T>[] = [];
	while (node) {
		siblings.push(node);
		node = node.nextKey != null ? collection.getItem(node.nextKey) : null;
	}
	return siblings;
}
