// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Tree.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded
// ref is `props.ref` (Tree passes it into `useContextProps` explicitly; TreeItem,
// TreeSection, TreeLoadMoreItem and the drop-indicator wrapper adapt theirs with
// `useObjectRef` exactly like upstream's forwarded refs); the plain-`.ts` components use
// the S()/subSlot component-slot convention. The collection composes the Phase-4 engine:
// `CollectionBuilder`/`createLeafComponent`/`createBranchComponent` from
// `../collections/CollectionBuilder` and the renderer's `CollectionRoot`/`CollectionBranch`
// via `CollectionRendererContext`. Upstream's RAC-local `CollectionProps` import is our
// `ItemCollectionProps` (see ./Collection.ts). Upstream's `inertValue` (React <19 string
// compat) collapses to the plain boolean — octane follows React 19 `inert` semantics.
// `React.useMemo` in TreeItem is octane's `useMemo` with the identical explicit deps. The
// dnd branches use the PHASE-7 structural aliases from ./useDragAndDrop and stay inert
// until a consumer can construct `dragAndDropHooks` (that includes the
// `TreeDropTargetDelegate` wiring, which is only reachable through `hasDropHooks`).
// react-aria's private `useLoadMoreSentinel` comes from ../utils/useLoadMoreSentinel and
// `useCachedChildren` from ../collections/useCachedChildren. Explicit dep arrays are
// preserved verbatim. The flattened-collection derivation keeps upstream's render-phase
// setState idiom (octane matches React's render-phase-update semantics).
import type {
	DisabledBehavior,
	Expandable,
	HoverEvents,
	Key,
	LinkDOMProps,
	MultipleSelection,
	Node,
	PressEvents,
	SelectionBehavior,
	SelectionMode,
} from '@react-types/shared';
import {
	Fragment,
	createContext,
	createElement,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import {
	BaseCollection,
	CollectionNode,
	LoaderNode,
	SectionNode,
} from '../collections/BaseCollection';
import {
	CollectionBuilder,
	createBranchComponent,
	createLeafComponent,
} from '../collections/CollectionBuilder';
import { useCachedChildren } from '../collections/useCachedChildren';
import { FocusScope } from '../focus/FocusScope';
import { useFocusRing } from '../focus/useFocusRing';
import { useGridListSection } from '../gridlist/useGridListSection';
import { useGridListSelectionCheckbox } from '../gridlist/useGridListSelectionCheckbox';
import { useCollator } from '../i18n/useCollator';
import { useLocale } from '../i18n/I18nProvider';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { ListKeyboardDelegate } from '../selection/ListKeyboardDelegate';
import { type TreeState, useTreeState } from '../stately/tree/useTreeState';
import { useControlledState } from '../stately/utils/useControlledState';
import { type AriaTreeProps, useTree } from '../tree/useTree';
import { type AriaTreeItemOptions, useTreeItem } from '../tree/useTreeItem';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { useId } from '../utils/useId';
import { type LoadMoreSentinelProps, useLoadMoreSentinel } from '../utils/useLoadMoreSentinel';
import { useObjectRef } from '../utils/useObjectRef';
import { useVisuallyHidden } from '../visually-hidden/VisuallyHidden';
import { ButtonContext } from './Button';
import { CheckboxContext, CheckboxFieldContext } from './Checkbox';
import {
	CollectionRendererContext,
	DefaultCollectionRenderer,
	type ItemCollectionProps,
	type ItemRenderProps,
	type SectionProps,
} from './Collection';
import { Collection } from './Collection';
import {
	DragAndDropContext,
	DropIndicatorContext,
	type DropIndicatorProps,
	useDndPersistedKeys,
	useRenderDropIndicator,
} from './DragAndDrop';
import type {
	DragAndDropHooks,
	DraggableCollectionState,
	DraggableItemResult,
	DropIndicatorAria,
	DroppableCollectionResult,
	DroppableCollectionState,
} from './useDragAndDrop';
import {
	GridListHeader,
	GridListHeaderContext,
	GridListHeaderInnerContext,
	type GridListHeaderProps,
} from './GridList';
import { SelectionIndicatorContext } from './SelectionIndicator';
import { SharedElementTransition } from './SharedElementTransition';
import { TreeDropTargetDelegate } from './TreeDropTargetDelegate';
import {
	type ChildrenOrFunction,
	type ClassNameOrFunction,
	type ContextValue,
	DEFAULT_SLOT,
	dom,
	type DOMRenderProps,
	Provider,
	type RenderProps,
	type SlotProps,
	type StyleRenderProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;
type RefObject<T> = { current: T };
type ReactNode = any;

class TreeCollection<T> extends BaseCollection<T> {
	private expandedKeys: Set<Key> = new Set();

	withExpandedKeys(lastExpandedKeys: Set<Key>, expandedKeys: Set<Key>): TreeCollection<T> {
		let collection = this.clone();
		collection.expandedKeys = expandedKeys;

		// Clone ancestor section nodes so the renderer knows to re-render since the same item won't cause a new render but a clone creating a new object with the same value will
		// Without this change, the items won't expand and collapse when virtualized inside a section
		TreeCollection.cloneAncestorSections(expandedKeys, lastExpandedKeys, collection);
		TreeCollection.cloneAncestorSections(lastExpandedKeys, expandedKeys, collection);

		collection.frozen = this.frozen;
		return collection;
	}

	// diff lastExpandedKeys and expandedKeys so we only clone what has changed
	private static cloneAncestorSections<T>(
		keys: Iterable<Key>,
		excludeSet: Set<Key>,
		collection: TreeCollection<T>,
	) {
		for (let key of keys) {
			if (!excludeSet.has(key)) {
				let currentKey: Key | null = key;
				while (currentKey != null) {
					let item = collection.getItem(currentKey) as CollectionNode<T>;
					if (item?.type === 'section') {
						collection.keyMap.set(currentKey, item.clone());
						break;
					} else {
						currentKey = item?.parentKey ?? null;
					}
				}
			}
		}
	}

	*[Symbol.iterator](): IterableIterator<Node<T>> {
		let firstKey = this.getFirstKey();
		let node: Node<T> | null = firstKey != null ? this.getItem(firstKey) : null;

		while (node) {
			yield node as Node<T>;
			if (node.type === 'section') {
				node = node.nextKey != null ? this.getItem(node.nextKey) : null;
			} else {
				// This will include both item and content nodes
				// We handle the content nodes in useCollectionRenderer and ListLayout
				let key = this.getKeyAfter(node.key);
				node = key != null ? this.getItem(key) : null;
			}
		}
	}

	getLastKey(): Key | null {
		// Find the deepest expanded child. We don't use collection.getLastKey() here
		// because that will return the deepest child regardless of expandedKeys.
		// Instead, start from the last top-level key and walk down.
		let key = this.lastKey;
		if (key == null) {
			return null;
		}

		let node = this.getItem(key) as CollectionNode<T>;

		while (
			node?.lastChildKey != null &&
			(node.type !== 'item' || this.expandedKeys.has(node.key))
		) {
			node = this.getItem(node.lastChildKey) as CollectionNode<T>;
		}

		return node?.key ?? null;
	}

	getKeyAfter(key: Key): Key | null {
		let node = this.getItem(key) as CollectionNode<T>;
		if (!node) {
			return null;
		}

		if ((this.expandedKeys.has(node.key) || node.type !== 'item') && node.firstChildKey != null) {
			return node.firstChildKey;
		}

		while (node) {
			if (node.nextKey != null) {
				return node.nextKey;
			}

			if (node.parentKey != null) {
				node = this.getItem(node.parentKey) as CollectionNode<T>;
			} else {
				return null;
			}
		}

		return null;
	}

	getKeyBefore(key: Key): Key | null {
		let node = this.getItem(key) as CollectionNode<T>;
		if (!node) {
			return null;
		}

		if (node.prevKey != null) {
			node = this.getItem(node.prevKey) as CollectionNode<T>;

			// If the lastChildKey is expanded, check its lastChildKey
			while (
				node &&
				(node.type !== 'item' || this.expandedKeys.has(node.key)) &&
				node.lastChildKey != null
			) {
				node = this.getItem(node.lastChildKey) as CollectionNode<T>;
			}

			return node?.key ?? null;
		}

		return node.parentKey;
	}

	getChildren(key: Key): Iterable<Node<T>> {
		let self = this;
		return {
			*[Symbol.iterator]() {
				let parent = self.getItem(key) as CollectionNode<T> | null;
				let node =
					parent?.firstChildKey != null
						? (self.getItem(parent.firstChildKey) as CollectionNode<T>)
						: null;
				if (parent && parent.type === 'section' && node) {
					// Stop once either the node is null or the node is the parent's sibling
					while (node && node.key !== parent.nextKey) {
						yield self.getItem(node.key)!;
						// This will include content nodes which we skip in ListLayout
						let key = self.getKeyAfter(node.key);
						node = key != null ? (self.getItem(key)! as CollectionNode<T>) : null;
					}
				} else {
					while (node) {
						yield node as Node<T>;
						node = node.nextKey != null ? (self.getItem(node.nextKey)! as CollectionNode<T>) : null;
					}
				}
			},
		};
	}

	getTextValue(key: Key): string {
		let item = this.getItem(key);
		return item ? item.textValue : '';
	}
}

export interface TreeRenderProps {
	/**
	 * Whether the tree has no items and should display its empty state.
	 *
	 * @selector [data-empty]
	 */
	isEmpty: boolean;
	/**
	 * Whether the tree is currently focused.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the tree is currently keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * The type of selection that is allowed in the collection.
	 *
	 * @selector [data-selection-mode="single | multiple"]
	 */
	selectionMode: SelectionMode;
	/**
	 * Whether the tree allows dragging.
	 *
	 * @selector [data-allows-dragging]
	 */
	allowsDragging: boolean;
	/**
	 * Whether the tree is currently the active drop target.
	 *
	 * @selector [data-drop-target]
	 */
	isDropTarget: boolean;
	/**
	 * State of the tree.
	 */
	state: TreeState<unknown>;
}

export interface TreeEmptyStateRenderProps extends Omit<TreeRenderProps, 'isEmpty'> {}

export interface TreeProps<T>
	extends
		Omit<AriaTreeProps<T>, 'children'>,
		MultipleSelection,
		ItemCollectionProps<T>,
		StyleRenderProps<TreeRenderProps>,
		SlotProps,
		Expandable,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Tree'
	 */
	className?: ClassNameOrFunction<TreeRenderProps>;
	/**
	 * How multiple selection should behave in the tree.
	 *
	 * @default 'toggle'
	 */
	selectionBehavior?: SelectionBehavior;
	/** Provides content to display when there are no items in the list. */
	renderEmptyState?: (props: TreeEmptyStateRenderProps) => ReactNode;
	/**
	 * Whether `disabledKeys` applies to all interactions, or only selection.
	 *
	 * @default 'all'
	 */
	disabledBehavior?: DisabledBehavior;
	/**
	 * The drag and drop hooks returned by `useDragAndDrop` used to enable drag and drop behavior for
	 * the Tree.
	 */
	dragAndDropHooks?: DragAndDropHooks<NoInfer<T>>;
}

export const TreeContext = createContext<ContextValue<TreeProps<any>, HTMLDivElement>>(null);
export const TreeStateContext = createContext<TreeState<any> | null>(null);

/**
 * A tree provides users with a way to navigate nested hierarchical information, with support for
 * keyboard navigation and selection.
 */
export function Tree<T extends object>(props: TreeProps<T>): any {
	const slot = S('Tree');
	// Render the portal first so that we have the collection by the time we render the DOM in SSR.
	let ref: any;
	[props, ref] = useContextProps(props, (props as any).ref, TreeContext, subSlot(slot, 'ctx'));

	return createElement(CollectionBuilder, {
		content: createElement(Collection, props as any),
		createCollection: () => new TreeCollection<T>(),
		children: (collection: TreeCollection<T>) =>
			createElement(TreeInner, { props, collection, treeRef: ref }),
	} as any);
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

interface TreeInnerProps<T> {
	props: TreeProps<T>;
	collection: TreeCollection<T>;
	treeRef: RefObject<HTMLDivElement | null>;
}

function TreeInner<T>({ props, collection, treeRef: ref }: TreeInnerProps<T>): any {
	const slot = S('TreeInner');
	const { dragAndDropHooks } = props;
	let { direction } = useLocale(subSlot(slot, 'locale'));
	let collator = useCollator({ usage: 'search', sensitivity: 'base' }, subSlot(slot, 'collator'));
	let hasDragHooks = !!dragAndDropHooks?.useDraggableCollectionState;
	let hasDropHooks = !!dragAndDropHooks?.useDroppableCollectionState;
	let dragHooksProvided = useRef(hasDragHooks, subSlot(slot, 'dragProvided'));
	let dropHooksProvided = useRef(hasDropHooks, subSlot(slot, 'dropProvided'));

	useEffect(
		() => {
			if (dragHooksProvided.current !== hasDragHooks) {
				console.warn(
					'Drag hooks were provided during one render, but not another. This should be avoided as it may produce unexpected behavior.',
				);
			}
			if (dropHooksProvided.current !== hasDropHooks) {
				console.warn(
					'Drop hooks were provided during one render, but not another. This should be avoided as it may produce unexpected behavior.',
				);
			}
		},
		[hasDragHooks, hasDropHooks],
		subSlot(slot, 'dndWarn'),
	);
	let {
		selectionMode = 'none',
		expandedKeys: propExpandedKeys,
		defaultExpandedKeys: propDefaultExpandedKeys,
		onExpandedChange,
		disabledBehavior = 'all',
	} = props;
	let {
		CollectionRoot,
		isVirtualized,
		layoutDelegate,
		dropTargetDelegate: ctxDropTargetDelegate,
	} = useContext(CollectionRendererContext);

	// Kinda annoying that we have to replicate this code here as well as in useTreeState, but don't want to add
	// flattenCollection stuff to useTreeState. Think about this later
	let [expandedKeys, setExpandedKeys] = useControlledState(
		propExpandedKeys ? new Set(propExpandedKeys) : undefined,
		propDefaultExpandedKeys ? new Set(propDefaultExpandedKeys) : new Set(),
		onExpandedChange as any,
		subSlot(slot, 'expandedKeys'),
	);

	let [lastCollection, setLastCollection] = useState(collection, subSlot(slot, 'lastCollection'));
	let [lastExpandedKeys, setLastExpandedKeys] = useState(
		expandedKeys,
		subSlot(slot, 'lastExpandedKeys'),
	);
	let [flattenedCollection, setFlattenedCollection] = useState(
		() => collection.withExpandedKeys(lastExpandedKeys, expandedKeys),
		subSlot(slot, 'flattenedCollection'),
	);

	// if the lastExpandedKeys is not the same as the currentExpandedKeys or the collection has changed, then run this
	if (!areSetsEqual(lastExpandedKeys, expandedKeys) || collection !== lastCollection) {
		setFlattenedCollection(collection.withExpandedKeys(lastExpandedKeys, expandedKeys));
		setLastCollection(collection);
		setLastExpandedKeys(expandedKeys);
	}

	let state = useTreeState(
		{
			...props,
			selectionMode,
			expandedKeys,
			onExpandedChange: setExpandedKeys,
			collection: flattenedCollection,
			children: undefined,
			disabledBehavior,
		} as any,
		subSlot(slot, 'state'),
	);

	let { gridProps } = useTree(
		{
			...props,
			isVirtualized,
			layoutDelegate,
		} as any,
		state,
		ref,
		subSlot(slot, 'tree'),
	);

	let dragState: DraggableCollectionState | undefined = undefined;
	let dropState: DroppableCollectionState | undefined = undefined;
	let droppableCollection: DroppableCollectionResult | undefined = undefined;
	let isRootDropTarget = false;
	let dragPreview: any = null;
	let preview = useRef<any>(null, subSlot(slot, 'preview'));

	// PHASE-7: these branches call consumer-provided dnd hooks (upstream contract); they are
	// unreachable until `useDragAndDrop` is ported and a consumer can construct hooks.
	if (hasDragHooks && dragAndDropHooks) {
		dragState = dragAndDropHooks.useDraggableCollectionState!({
			collection: state.collection,
			selectionManager: state.selectionManager,
			preview: dragAndDropHooks.renderDragPreview ? preview : undefined,
		});
		dragAndDropHooks.useDraggableCollection!({}, dragState, ref);

		let DragPreview = dragAndDropHooks.DragPreview!;
		dragPreview = dragAndDropHooks.renderDragPreview
			? createElement(DragPreview, { ref: preview, children: dragAndDropHooks.renderDragPreview })
			: null;
	}

	let [treeDropTargetDelegate] = useState(
		() => new TreeDropTargetDelegate(),
		subSlot(slot, 'dropDelegate'),
	);
	if (hasDropHooks && dragAndDropHooks) {
		dropState = dragAndDropHooks.useDroppableCollectionState!({
			collection: state.collection,
			selectionManager: state.selectionManager,
		});
		let dropTargetDelegate =
			dragAndDropHooks.dropTargetDelegate ||
			ctxDropTargetDelegate ||
			new dragAndDropHooks.ListDropTargetDelegate(state.collection, ref, { direction });
		treeDropTargetDelegate.setup(dropTargetDelegate, state as any, direction);

		let keyboardDelegate = new ListKeyboardDelegate({
			collection: state.collection,
			collator,
			ref,
			disabledKeys: state.selectionManager.disabledKeys,
			disabledBehavior: state.selectionManager.disabledBehavior,
			direction,
			layoutDelegate,
		});

		droppableCollection = dragAndDropHooks.useDroppableCollection!(
			{
				keyboardDelegate,
				dropTargetDelegate: treeDropTargetDelegate,
				onDropActivate: (e: any) => {
					// Expand collapsed item when dragging over. For keyboard, allow collapsing.
					if (e.target.type === 'item') {
						let key = e.target.key;
						let item = state.collection.getItem(key);
						let isExpanded = expandedKeys.has(key);
						if (
							item &&
							item.hasChildNodes &&
							(!isExpanded || dragAndDropHooks?.isVirtualDragging?.())
						) {
							state.toggleKey(key);
						}
					}
				},
				onKeyDown: (e: KeyboardEvent) => {
					let target = dropState?.target;
					if (target && target.type === 'item' && target.dropPosition === 'on') {
						let item = state.collection.getItem(target.key);
						if (
							e.key === EXPANSION_KEYS['expand'][direction] &&
							item?.hasChildNodes &&
							!state.expandedKeys.has(target.key)
						) {
							state.toggleKey(target.key);
						} else if (
							e.key === EXPANSION_KEYS['collapse'][direction] &&
							item?.hasChildNodes &&
							state.expandedKeys.has(target.key)
						) {
							state.toggleKey(target.key);
						}
					}
				},
			},
			dropState,
			ref,
		);

		isRootDropTarget = dropState.isDropTarget({ type: 'root' });
	}

	let isTreeDraggable = !!(hasDragHooks && !dragState?.isDisabled);

	let { focusProps, isFocused, isFocusVisible } = useFocusRing(
		undefined,
		subSlot(slot, 'focusRing'),
	);
	let renderValues = {
		isEmpty: state.collection.size === 0,
		isFocused,
		isFocusVisible,
		isDropTarget: isRootDropTarget,
		selectionMode: state.selectionManager.selectionMode,
		allowsDragging: !!isTreeDraggable,
		state,
	};

	let renderProps = useRenderProps(
		{
			...props,
			children: undefined,
			defaultClassName: 'react-aria-Tree',
			values: renderValues,
		} as any,
		subSlot(slot, 'render'),
	);

	let emptyState: any = null;
	if (state.collection.size === 0 && props.renderEmptyState) {
		let { isEmpty: _isEmpty, ...values } = renderValues;
		let content = props.renderEmptyState({ ...values } as any);
		let treeGridRowProps = {
			'aria-level': 1,
		};

		emptyState = createElement('div', {
			role: 'row',
			style: { display: 'contents' },
			...treeGridRowProps,
			children: createElement('div', {
				role: 'gridcell',
				style: { display: 'contents' },
				children: content,
			}),
		});
	}

	let DOMProps = filterDOMProps(props, { global: true });

	// octane adaptation: hooks hoisted out of the createElement argument list (upstream calls
	// them inline in JSX attribute position).
	let persistedKeys = useDndPersistedKeys(
		state.selectionManager,
		dragAndDropHooks,
		dropState,
		subSlot(slot, 'persisted'),
	);
	let renderDropIndicator = useRenderDropIndicator(
		dragAndDropHooks,
		dropState,
		subSlot(slot, 'dropIndicator'),
	);

	return createElement(
		Fragment,
		null,
		createElement(FocusScope, {
			children: createElement(dom.div, {
				...mergeProps(
					DOMProps,
					renderProps,
					gridProps,
					focusProps,
					droppableCollection?.collectionProps,
				),
				ref,
				slot: props.slot || undefined,
				'data-empty': state.collection.size === 0 || undefined,
				'data-focused': isFocused || undefined,
				'data-drop-target': isRootDropTarget || undefined,
				'data-focus-visible': isFocusVisible || undefined,
				'data-selection-mode':
					state.selectionManager.selectionMode === 'none'
						? undefined
						: state.selectionManager.selectionMode,
				'data-allows-dragging': !!isTreeDraggable || undefined,
				// Positional (non-array) children: the trailing empty-state slot is an unkeyed
				// sibling of the collection Provider, exactly like upstream's JSX.
				children: createElement(
					Fragment,
					null,
					createElement(
						Provider,
						{
							values: [
								[TreeStateContext, state],
								[DragAndDropContext, { dragAndDropHooks, dragState, dropState }],
								[DropIndicatorContext, { render: TreeDropIndicatorWrapper }],
							] as any,
						} as any,
						hasDropHooks ? createElement(RootDropIndicator, {}) : null,
						createElement(SharedElementTransition, {
							children: createElement(CollectionRoot, {
								collection: state.collection,
								persistedKeys,
								scrollRef: ref,
								renderDropIndicator,
							}),
						}),
					),
					emptyState,
				),
			}),
		}),
		dragPreview,
	);
}

// TODO: readd the rest of the render props when tree supports them
export interface TreeItemRenderProps extends ItemRenderProps {
	/**
	 * Whether the tree item is expanded.
	 *
	 * @selector [data-expanded]
	 */
	isExpanded: boolean;
	/**
	 * Whether the tree item has child tree items.
	 *
	 * @selector [data-has-child-items]
	 */
	hasChildItems: boolean;
	/**
	 * What level the tree item has within the tree.
	 *
	 * @selector [data-level="number"]
	 */
	level: number;
	/**
	 * Whether the tree item's children have keyboard focus.
	 *
	 * @selector [data-focus-visible-within]
	 */
	isFocusVisibleWithin: boolean;
	/** The state of the tree. */
	state: TreeState<unknown>;
	/** The unique id of the tree row. */
	id: Key;
}

export interface TreeItemContentRenderProps extends TreeItemRenderProps {}

// The TreeItemContent is the one that accepts RenderProps because we would get much more complicated logic in TreeItem otherwise since we'd
// need to do a bunch of check to figure out what is the Content and what are the actual collection elements (aka child rows) of the TreeItem
export interface TreeItemContentProps {
	/**
	 * The children of the component. A function may be provided to alter the children based on
	 * component state.
	 */
	children: ChildrenOrFunction<TreeItemContentRenderProps>;
}

class TreeContentNode extends CollectionNode<any> {
	static readonly type = 'content';
}

export const TreeItemContent: (props: TreeItemContentProps) => any =
	/*#__PURE__*/ createLeafComponent(
		TreeContentNode,
		function TreeItemContent(props: TreeItemContentProps): any {
			const slot = S('TreeItemContent');
			let values = useContext(TreeItemContentContext)!;
			let renderProps = useRenderProps(
				{
					children: props.children,
					values,
				} as any,
				subSlot(slot, 'render'),
			);
			return createElement(CollectionRendererContext.Provider, {
				value: DefaultCollectionRenderer,
				children: renderProps.children,
			});
		},
	);

export const TreeItemContentContext = createContext<TreeItemContentRenderProps | null>(null);

export interface TreeItemProps<T = object>
	extends
		StyleRenderProps<TreeItemRenderProps>,
		LinkDOMProps,
		HoverEvents,
		PressEvents,
		Pick<AriaTreeItemOptions, 'hasChildItems'>,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-TreeItem'
	 */
	className?: ClassNameOrFunction<TreeItemRenderProps>;
	/** The unique id of the tree row. */
	id?: Key;
	/**
	 * The object value that this tree item represents. When using dynamic collections, this is set
	 * automatically.
	 */
	value?: T;
	/** A string representation of the tree item's contents, used for features like typeahead. */
	textValue: string;
	/** An accessibility label for this tree item. */
	'aria-label'?: string;
	/**
	 * The content of the tree item along with any nested children. Supports static nested tree items
	 * or use of a Collection to dynamically render nested tree items.
	 */
	children: ReactNode;
	/** Whether the item is disabled. */
	isDisabled?: boolean;
	/**
	 * Handler that is called when a user performs an action on this tree item. The exact user event
	 * depends on the collection's `selectionBehavior` prop and the interaction modality.
	 */
	onAction?: () => void;
}

class TreeItemNode extends CollectionNode<any> {
	static readonly type = 'item';
}

/**
 * A TreeItem represents an individual item in a Tree.
 */
export const TreeItem: <T extends object = object>(props: TreeItemProps<T> & { ref?: any }) => any =
	/*#__PURE__*/ createBranchComponent(TreeItemNode, function TreeItem<
		T,
	>(props: TreeItemProps<T>, forwardedRef: any, item?: Node<T>): any {
		const slot = S('TreeItem');
		let state = useContext(TreeStateContext)!;
		let ref = useObjectRef<HTMLDivElement>(forwardedRef, subSlot(slot, 'objectRef'));
		let { dragAndDropHooks, dragState, dropState } = useContext(DragAndDropContext);
		let isDraggable =
			dragState && !(dragState.isDisabled || dragState.selectionManager.isDisabled(item!.key));

		// TODO: remove this when we support description in tree row
		let { rowProps, gridCellProps, expandButtonProps, descriptionProps, ...states } = useTreeItem(
			{
				node: item!,
				shouldSelectOnPressUp: !!dragState,
			},
			state,
			ref,
			subSlot(slot, 'treeItem'),
		);
		let isExpanded = rowProps['aria-expanded'] === true;
		let hasChildItems =
			props.hasChildItems || [...state.collection.getChildren!(item!.key)]?.length > 1;
		let level = rowProps['aria-level'] || 1;

		let { hoverProps, isHovered } = useHover(
			{
				// because of https://bugs.webkit.org/show_bug.cgi?id=214609, supporting hover styles when a item is ONLY isDraggable
				// results in hover styles sticking around after a reorder/drop operation...
				isDisabled: !states.allowsSelection && !states.hasAction && !isDraggable,
				onHoverStart: props.onHoverStart,
				onHoverChange: props.onHoverChange,
				onHoverEnd: props.onHoverEnd,
			},
			subSlot(slot, 'hover'),
		);

		let { isFocusVisible, focusProps } = useFocusRing(undefined, subSlot(slot, 'focusRing'));
		let { isFocusVisible: isFocusVisibleWithin, focusProps: focusWithinProps } = useFocusRing(
			{
				within: true,
			},
			subSlot(slot, 'focusRingWithin'),
		);
		let { checkboxProps } = useGridListSelectionCheckbox(
			{ key: item!.key },
			state as any,
			subSlot(slot, 'checkbox'),
		);

		// PHASE-7: consumer-provided dnd item hooks (unreachable until useDragAndDrop is ported).
		let draggableItem: DraggableItemResult | null = null;
		if (dragState && dragAndDropHooks) {
			draggableItem = dragAndDropHooks.useDraggableItem!(
				{ key: item!.key, hasDragButton: true },
				dragState,
			);
		}

		let dropIndicator: DropIndicatorAria | null = null;
		let expandButtonRef = useRef<HTMLButtonElement | null>(null, subSlot(slot, 'expandButton'));
		let dropIndicatorRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'dropIndicatorRef'));
		let activateButtonRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'activateButton'));
		let { visuallyHiddenProps } = useVisuallyHidden(undefined, subSlot(slot, 'visuallyHidden'));
		if (dropState && dragAndDropHooks) {
			dropIndicator = dragAndDropHooks.useDropIndicator!(
				{
					target: { type: 'item', key: item!.key, dropPosition: 'on' },
					activateButtonRef,
				},
				dropState,
				dropIndicatorRef,
			);
		}

		let isDragging = dragState && dragState.isDragging(item!.key);
		let isDropTarget = dropIndicator?.isDropTarget;

		let selectionMode = state.selectionManager.selectionMode;
		let selectionBehavior = state.selectionManager.selectionBehavior;
		let renderPropValues = useMemo<TreeItemContentRenderProps>(
			() =>
				({
					...states,
					isHovered,
					isFocusVisible,
					isExpanded,
					hasChildItems,
					level,
					selectionMode,
					selectionBehavior,
					isFocusVisibleWithin,
					state,
					id: item!.key,
					allowsDragging: !!dragState,
					isDragging,
					isDropTarget,
				}) as any,
			[
				states,
				isHovered,
				isFocusVisible,
				isExpanded,
				hasChildItems,
				level,
				isFocusVisibleWithin,
				state,
				item!.key,
				dragState,
				isDragging,
				isDropTarget,
				selectionBehavior,
				selectionMode,
			],
			subSlot(slot, 'renderPropValues'),
		);

		let renderProps = useRenderProps(
			{
				...props,
				id: undefined,
				children: item!.rendered,
				defaultClassName: 'react-aria-TreeItem',
				defaultStyle: {
					'--tree-item-level': level,
				},
				values: renderPropValues,
			} as any,
			subSlot(slot, 'render'),
		);

		useEffect(
			() => {
				if (!item!.textValue && process.env.NODE_ENV !== 'production') {
					console.warn(
						'A `textValue` prop is required for <TreeItem> elements in order to support accessibility features such as type to select.',
					);
				}
			},
			[item!.textValue],
			subSlot(slot, 'textValueWarn'),
		);

		useEffect(
			() => {
				if (hasChildItems && !expandButtonRef.current && process.env.NODE_ENV !== 'production') {
					console.warn(
						'Expandable tree items must contain a expand button so screen reader users can expand/collapse the item.',
					);
				}
			},
			[],
			subSlot(slot, 'expandButtonWarn'),
		);

		let dragButtonRef = useRef<HTMLButtonElement | null>(null, subSlot(slot, 'dragButton'));
		useEffect(
			() => {
				if (dragState && !dragButtonRef.current && process.env.NODE_ENV !== 'production') {
					console.warn(
						'Draggable items in a Tree must contain a <Button slot="drag"> element so that keyboard and screen reader users can drag them.',
					);
				}
			},
			[],
			subSlot(slot, 'dragButtonWarn'),
		);

		let children = useCachedChildren(
			{
				items: state.collection.getChildren!(item!.key),
				children: (item: Node<any>) => {
					switch (item.type) {
						case 'content': {
							return item.render!(item);
						}
						// Skip item since we don't render the nested rows as children of the parent row, the flattened collection
						// will render them each as siblings instead
						case 'loader':
						case 'item':
							return createElement(Fragment, null);
						default:
							throw new Error('Unsupported element type in TreeRow: ' + item.type);
					}
				},
			},
			subSlot(slot, 'cachedChildren'),
		);

		let activateButtonId = useId(undefined, subSlot(slot, 'activateButtonId'));
		let DOMProps = filterDOMProps(props as any, { global: true });
		delete DOMProps.id;
		delete DOMProps.onClick;

		return createElement(
			Fragment,
			null,
			dropIndicator && !dropIndicator.isHidden
				? createElement('div', {
						role: 'row',
						'aria-level': rowProps['aria-level'],
						'aria-expanded': rowProps['aria-expanded'],
						'aria-label': dropIndicator.dropIndicatorProps['aria-label'],
						children: createElement('div', {
							role: 'gridcell',
							'aria-colindex': 1,
							style: { display: 'contents' },
							// Positional (non-array) children, exactly like upstream's JSX.
							children: createElement(
								Fragment,
								null,
								createElement('div', {
									role: 'button',
									...visuallyHiddenProps,
									...dropIndicator.dropIndicatorProps,
									ref: dropIndicatorRef,
								}),
								rowProps['aria-expanded'] != null
									? // Button to allow touch screen reader users to expand the item while dragging.
										createElement('div', {
											role: 'button',
											...visuallyHiddenProps,
											id: activateButtonId,
											'aria-label': expandButtonProps['aria-label'],
											'aria-labelledby': `${activateButtonId} ${rowProps.id}`,
											tabIndex: -1,
											ref: activateButtonRef,
										})
									: null,
							),
						}),
					})
				: null,
			createElement(dom.div, {
				...mergeProps(
					DOMProps,
					rowProps,
					focusProps,
					hoverProps,
					focusWithinProps,
					draggableItem?.dragProps,
				),
				...renderProps,
				ref,
				// TODO: missing selectionBehavior, hasAction and allowsSelection data attribute equivalents (available in renderProps). Do we want those?
				'data-expanded': (hasChildItems && isExpanded) || undefined,
				'data-has-child-items': hasChildItems || undefined,
				'data-level': level,
				'data-selected': states.isSelected || undefined,
				'data-disabled': states.isDisabled || undefined,
				'data-hovered': isHovered || undefined,
				'data-focused': states.isFocused || undefined,
				'data-focus-visible': isFocusVisible || undefined,
				'data-pressed': states.isPressed || undefined,
				'data-selection-mode':
					state.selectionManager.selectionMode === 'none'
						? undefined
						: state.selectionManager.selectionMode,
				'data-allows-dragging': !!dragState || undefined,
				'data-dragging': isDragging || undefined,
				'data-drop-target': isDropTarget || undefined,
				children: createElement('div', {
					...gridCellProps,
					style: { display: 'contents' },
					children: createElement(Provider, {
						values: [
							[
								CheckboxContext,
								{
									slots: {
										selection: checkboxProps,
									},
								},
							],
							[
								CheckboxFieldContext,
								{
									slots: {
										selection: checkboxProps,
									},
								},
							],
							// TODO: support description in the tree row
							// TODO: don't think I need to pass isExpanded to the button here since it can be sourced from the renderProps? Might be worthwhile passing it down?
							[
								ButtonContext,
								{
									slots: {
										[DEFAULT_SLOT]: {},
										chevron: {
											...expandButtonProps,
											ref: expandButtonRef,
										},
										drag: {
											...draggableItem?.dragButtonProps,
											ref: dragButtonRef,
											style: {
												pointerEvents: 'none',
											},
										},
									},
								},
							],
							[
								TreeItemContentContext,
								{
									...renderPropValues,
								},
							],
							[SelectionIndicatorContext, { isSelected: states.isSelected }],
						] as any,
						children,
					}),
				}),
			}),
		);
	});

export interface TreeLoadMoreItemRenderProps {
	/**
	 * What level the tree item has within the tree.
	 *
	 * @selector [data-level]
	 */
	level: number;
}

export interface TreeLoadMoreItemProps
	extends Omit<LoadMoreSentinelProps, 'collection'>, RenderProps<TreeLoadMoreItemRenderProps> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-TreeLoadMoreItem'
	 */
	className?: ClassNameOrFunction<TreeLoadMoreItemRenderProps>;
	/**
	 * The load more spinner to render when loading additional items.
	 */
	children?: ChildrenOrFunction<TreeLoadMoreItemRenderProps>;
	/**
	 * Whether or not the loading spinner should be rendered or not.
	 */
	isLoading?: boolean;
}

export const TreeLoadMoreItem: (props: TreeLoadMoreItemProps & { ref?: any }) => any =
	createLeafComponent(LoaderNode, function TreeLoadingSentinel<
		T,
	>(props: TreeLoadMoreItemProps, forwardedRef: any, item?: Node<T>): any {
		const slot = S('TreeLoadMoreItem');
		let { isVirtualized } = useContext(CollectionRendererContext);
		let state = useContext(TreeStateContext)!;
		let { isLoading, onLoadMore, scrollOffset, ...otherProps } = props;
		let sentinelRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'sentinel'));
		let memoedLoadMoreProps = useMemo(
			() => ({
				onLoadMore,
				// this collection will update anytime a row is expanded/collapsed becaused the flattenedRows will change.
				// This means onLoadMore will trigger but that might be ok cause the user should have logic to handle multiple loadMore calls
				collection: state?.collection,
				sentinelRef,
				scrollOffset,
			}),
			[onLoadMore, scrollOffset, state?.collection],
			subSlot(slot, 'loadMoreProps'),
		);
		useLoadMoreSentinel(memoedLoadMoreProps as any, sentinelRef as any, subSlot(slot, 'loadMore'));

		let ref = useObjectRef<HTMLDivElement>(forwardedRef, subSlot(slot, 'objectRef'));
		let { rowProps, gridCellProps } = useTreeItem(
			{ node: item! },
			state,
			ref,
			subSlot(slot, 'treeItem'),
		);
		let level = rowProps['aria-level'] || 1;

		// For now don't include aria-posinset and aria-setsize on loader since they aren't keyboard focusable
		// Arguably shouldn't include them ever since it might be confusing to the user to include the loaders as part of the
		// item count
		let ariaProps = {
			role: 'row',
			'aria-level': rowProps['aria-level'],
		};

		let renderProps = useRenderProps(
			{
				...otherProps,
				id: undefined,
				children: item!.rendered,
				defaultClassName: 'react-aria-TreeLoader',
				values: {
					level,
				},
			} as any,
			subSlot(slot, 'render'),
		);
		let style = {};

		if (isVirtualized) {
			style = { display: 'contents' };
		}

		return createElement(
			Fragment,
			null,
			// Alway render the sentinel. For now onus is on the user for styling when using flex + gap
			// (this would introduce a gap even though it doesn't take room). octane adaptation:
			// upstream `inertValue` is React <19 string compat; octane follows React 19 boolean
			// `inert` semantics.
			createElement('div', {
				style: { position: 'relative', width: 0, height: 0 },
				inert: true,
				children: createElement('div', {
					'data-testid': 'loadMoreSentinel',
					ref: sentinelRef,
					style: { position: 'absolute', height: 1, width: 1 },
				}),
			}),
			isLoading && renderProps.children
				? createElement(dom.div, {
						ref,
						...mergeProps(filterDOMProps(props as any), ariaProps),
						...renderProps,
						'data-level': level,
						children: createElement('div', {
							...gridCellProps,
							style,
							children: renderProps.children,
						}),
					})
				: null,
		);
	});

function TreeDropIndicatorWrapper(props: DropIndicatorProps, forwardedRef: any): any {
	const slot = S('TreeDropIndicatorWrapper');
	let ref = useObjectRef<HTMLElement>(forwardedRef, subSlot(slot, 'objectRef'));
	let { dragAndDropHooks, dropState } = useContext(DragAndDropContext);
	let buttonRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'buttonRef'));
	let { dropIndicatorProps, isHidden, isDropTarget } = dragAndDropHooks!.useDropIndicator!(
		props,
		dropState!,
		buttonRef,
	);

	if (isHidden) {
		return null;
	}

	let level =
		dropState && props.target.type === 'item'
			? (dropState.collection.getItem(props.target.key)?.level || 0) + 1
			: 1;
	return createElement(TreeDropIndicator, {
		...props,
		dropIndicatorProps,
		isDropTarget,
		ref,
		buttonRef,
		level,
	});
}

interface TreeDropIndicatorProps extends DropIndicatorProps {
	dropIndicatorProps: Record<string, any>;
	isDropTarget: boolean;
	buttonRef: RefObject<HTMLDivElement | null>;
	level: number;
	ref?: any;
}

// octane adaptation: no forwardRef — the forwarded ref arrives as `props.ref` (upstream wraps
// this in `forwardRef` as TreeDropIndicatorForwardRef).
function TreeDropIndicator(props: TreeDropIndicatorProps): any {
	const slot = S('TreeDropIndicator');
	let { dropIndicatorProps, isDropTarget, buttonRef, level, ref, ...otherProps } = props;
	let { visuallyHiddenProps } = useVisuallyHidden(undefined, subSlot(slot, 'visuallyHidden'));
	let renderProps = useRenderProps(
		{
			...otherProps,
			defaultClassName: 'react-aria-DropIndicator',
			defaultStyle: {
				position: 'relative',
				'--tree-item-level': level,
			},
			values: {
				isDropTarget,
			},
		} as any,
		subSlot(slot, 'render'),
	);

	return createElement(dom.div, {
		...renderProps,
		role: 'row',
		'aria-level': level,
		ref,
		'data-drop-target': isDropTarget || undefined,
		// Positional (non-array) children inside the gridcell, exactly like upstream's JSX.
		children: createElement('div', {
			role: 'gridcell',
			children: createElement(
				Fragment,
				null,
				createElement('div', {
					...visuallyHiddenProps,
					role: 'button',
					...dropIndicatorProps,
					ref: buttonRef,
				}),
				renderProps.children,
			),
		}),
	});
}

function RootDropIndicator(): any {
	const slot = S('TreeRootDropIndicator');
	let { dragAndDropHooks, dropState } = useContext(DragAndDropContext);
	let ref = useRef<HTMLDivElement | null>(null, subSlot(slot, 'ref'));
	let { dropIndicatorProps } = dragAndDropHooks!.useDropIndicator!(
		{
			target: { type: 'root' },
		},
		dropState!,
		ref,
	);
	let isDropTarget = dropState!.isDropTarget({ type: 'root' });
	let { visuallyHiddenProps } = useVisuallyHidden(undefined, subSlot(slot, 'visuallyHidden'));

	if (!isDropTarget && dropIndicatorProps['aria-hidden']) {
		return null;
	}

	return createElement('div', {
		role: 'row',
		'aria-hidden': dropIndicatorProps['aria-hidden'],
		style: { position: 'absolute' },
		children: createElement('div', {
			role: 'gridcell',
			children: createElement('div', {
				role: 'button',
				...visuallyHiddenProps,
				...dropIndicatorProps,
				ref,
			}),
		}),
	});
}

export interface GridListSectionProps<T>
	extends SectionProps<T>, DOMRenderProps<'div', undefined> {}

/**
 * A TreeSection represents a section within a Tree.
 */
export const TreeSection: <T extends object = object>(
	props: GridListSectionProps<T> & { ref?: any },
) => any = /*#__PURE__*/ createBranchComponent(SectionNode, function TreeSection<
	T,
>(props: GridListSectionProps<T>, forwardedRef: any, item?: Node<T>): any {
	const slot = S('TreeSection');
	let state = useContext(TreeStateContext)!;
	let { CollectionBranch } = useContext(CollectionRendererContext);
	let headingRef = useRef<HTMLElement | null>(null, subSlot(slot, 'heading'));
	let ref = useObjectRef<HTMLDivElement>(forwardedRef, subSlot(slot, 'objectRef'));
	let { rowHeaderProps, rowProps, rowGroupProps } = useGridListSection(
		{
			'aria-label': props['aria-label'] ?? undefined,
		},
		state as any,
		ref,
		subSlot(slot, 'section'),
	);
	let renderProps = useRenderProps(
		{
			...props,
			id: undefined,
			children: undefined,
			defaultClassName: 'react-aria-TreeSection',
			values: undefined,
		} as any,
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props as any, { global: true });
	delete DOMProps.id;

	return createElement(dom.div, {
		...mergeProps(DOMProps, renderProps, rowGroupProps),
		ref,
		children: createElement(Provider, {
			values: [
				[GridListHeaderContext, { ...rowProps, ref: headingRef }],
				[GridListHeaderInnerContext, { ...rowHeaderProps }],
			] as any,
			children: createElement(CollectionBranch, {
				collection: state.collection,
				parent: item!,
			}),
		}),
	});
});

export const TreeHeader = (props: GridListHeaderProps): ReactNode => {
	return createElement(GridListHeader, {
		className: 'react-aria-TreeHeader',
		...props,
		children: props.children,
	});
};

function areSetsEqual<T>(a: Set<T>, b: Set<T>): boolean {
	if (a.size !== b.size) {
		return false;
	}

	for (let item of a) {
		if (!b.has(item)) {
			return false;
		}
	}
	return true;
}
