// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/GridList.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded
// ref is `props.ref` (GridList passes it into `useContextProps` explicitly; GridListItem,
// GridListSection and the drop-indicator wrapper adapt theirs with `useObjectRef` exactly
// like upstream's forwarded refs); the plain-`.ts` components use the S()/subSlot
// component-slot convention. The collection composes the Phase-4 engine:
// `CollectionBuilder`/`createLeafComponent`/`createBranchComponent` from
// `../collections/CollectionBuilder` and the renderer's `CollectionRoot`/`CollectionBranch`
// via `CollectionRendererContext`. Upstream's RAC-local `CollectionProps` import is our
// `ItemCollectionProps` (see ./Collection.ts). Upstream's `inertValue` (React <19 string
// compat) collapses to the plain boolean — octane follows React 19 `inert` semantics. The
// dnd branches use the PHASE-7 structural aliases from ./useDragAndDrop and stay inert
// until a consumer can construct `dragAndDropHooks`. react-aria's private
// `useLoadMoreSentinel` comes from ../utils/useLoadMoreSentinel (shared with ListBox).
// Explicit dep arrays are preserved verbatim.
import type {
	HoverEvents,
	Collection as ICollection,
	Key,
	LinkDOMProps,
	Node,
	Orientation,
	PressEvents,
	SelectionBehavior,
} from '@react-types/shared';
import {
	Fragment,
	createContext,
	createElement,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from 'octane';

import { HeaderNode, ItemNode, LoaderNode, SectionNode } from '../collections/BaseCollection';
import {
	CollectionBuilder,
	createBranchComponent,
	createLeafComponent,
} from '../collections/CollectionBuilder';
import { FocusScope } from '../focus/FocusScope';
import { useFocusRing } from '../focus/useFocusRing';
import { type AriaGridListProps, useGridList } from '../gridlist/useGridList';
import { useGridListItem } from '../gridlist/useGridListItem';
import { useGridListSection } from '../gridlist/useGridListSection';
import { useGridListSelectionCheckbox } from '../gridlist/useGridListSelectionCheckbox';
import { useCollator } from '../i18n/useCollator';
import { useLocale } from '../i18n/I18nProvider';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { ListKeyboardDelegate } from '../selection/ListKeyboardDelegate';
import {
	type ListState,
	UNSTABLE_useFilteredListState,
	useListState,
} from '../stately/list/useListState';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { type LoadMoreSentinelProps, useLoadMoreSentinel } from '../utils/useLoadMoreSentinel';
import { useObjectRef } from '../utils/useObjectRef';
import { useVisuallyHidden } from '../visually-hidden/VisuallyHidden';
import {
	FieldInputContext,
	SelectableCollectionContext,
	type SelectableCollectionContextValue,
} from './Autocomplete';
import { ButtonContext } from './Button';
import { CheckboxContext, CheckboxFieldContext } from './Checkbox';
import {
	Collection,
	CollectionRendererContext,
	DefaultCollectionRenderer,
	type ItemCollectionProps,
	type ItemRenderProps,
	type SectionProps,
} from './Collection';
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
import { ListStateContext } from './ListBox';
import { SelectionIndicatorContext } from './SelectionIndicator';
import { SharedElementTransition } from './SharedElementTransition';
import { TextContext } from './Text';
import {
	type ClassNameOrFunction,
	type ContextValue,
	DEFAULT_SLOT,
	dom,
	type DOMProps,
	type DOMRenderProps,
	Provider,
	type RenderProps,
	type SlotProps,
	type StyleProps,
	type StyleRenderProps,
	useContextProps,
	useRenderProps,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;
type RefObject<T> = { current: T };
type ReactNode = any;
type HTMLAttributes = Record<string, any>;

export interface GridListRenderProps {
	/**
	 * Whether the list has no items and should display its empty state.
	 *
	 * @selector [data-empty]
	 */
	isEmpty: boolean;
	/**
	 * Whether the grid list is currently focused.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the grid list is currently keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the grid list is currently the active drop target.
	 *
	 * @selector [data-drop-target]
	 */
	isDropTarget: boolean;
	/**
	 * Whether the items are arranged in a stack or grid.
	 *
	 * @selector [data-layout="stack | grid"]
	 */
	layout: 'stack' | 'grid';
	/**
	 * The primary orientation of the items.
	 *
	 * @selector [data-orientation="vertical | horizontal"]
	 */
	orientation: Orientation;
	/**
	 * State of the grid list.
	 */
	state: ListState<unknown>;
}

export interface GridListProps<T>
	extends
		Omit<AriaGridListProps<T>, 'children'>,
		ItemCollectionProps<T>,
		StyleRenderProps<GridListRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-GridList'
	 */
	className?: ClassNameOrFunction<GridListRenderProps>;
	/**
	 * Whether typeahead navigation is disabled.
	 *
	 * @default false
	 */
	disallowTypeAhead?: boolean;
	/**
	 * How multiple selection should behave in the collection.
	 *
	 * @default 'toggle'
	 */
	selectionBehavior?: SelectionBehavior;
	/**
	 * The drag and drop hooks returned by `useDragAndDrop` used to enable drag and drop behavior for
	 * the GridList.
	 */
	dragAndDropHooks?: DragAndDropHooks<NoInfer<T>>;
	/** Provides content to display when there are no items in the list. */
	renderEmptyState?: (props: GridListRenderProps) => ReactNode;
	/**
	 * Whether the items are arranged in a stack or grid.
	 *
	 * @default 'stack'
	 */
	layout?: 'stack' | 'grid';
	/**
	 * The primary orientation of the items. Usually this is the direction that the collection
	 * scrolls.
	 *
	 * @default 'vertical'
	 */
	orientation?: Orientation;
	/**
	 * Which item in the collection to focus when tabbing into the collection. Overrides default
	 * roving tab index like behavior.
	 *
	 * @private
	 */
	UNSTABLE_focusOnEntry?: 'first' | 'last';
}

export const GridListContext =
	createContext<ContextValue<GridListProps<any>, HTMLDivElement>>(null);

/**
 * A grid list displays a list of interactive items, with support for keyboard navigation,
 * single or multiple selection, and row actions.
 */
export function GridList<T extends object>(props: GridListProps<T>): any {
	const slot = S('GridList');
	// Render the portal first so that we have the collection by the time we render the DOM in SSR.
	let ref: any;
	[props, ref] = useContextProps(props, (props as any).ref, GridListContext, subSlot(slot, 'ctx'));

	return createElement(CollectionBuilder, {
		content: createElement(Collection, props as any),
		children: (collection: ICollection<Node<any>>) =>
			createElement(GridListInner, { props, collection, gridListRef: ref }),
	});
}

interface GridListInnerProps<T> {
	props: GridListProps<T> & SelectableCollectionContextValue<T>;
	collection: ICollection<Node<any>>;
	gridListRef: RefObject<HTMLElement | null>;
}

function GridListInner<T>({ props, collection, gridListRef: ref }: GridListInnerProps<T>): any {
	const slot = S('GridListInner');
	[props, ref] = useContextProps(
		props,
		ref as any,
		SelectableCollectionContext,
		subSlot(slot, 'ctx'),
	) as any;
	let {
		shouldUseVirtualFocus: _shouldUseVirtualFocus,
		filter,
		disallowTypeAhead,
		UNSTABLE_focusOnEntry,
		...DOMCollectionProps
	} = props;
	let {
		dragAndDropHooks,
		keyboardNavigationBehavior = 'arrow',
		layout = 'stack',
		orientation = 'vertical',
	} = props;
	let {
		CollectionRoot,
		isVirtualized,
		layoutDelegate,
		dropTargetDelegate: ctxDropTargetDelegate,
	} = useContext(CollectionRendererContext);
	let gridlistState = useListState(
		{
			...DOMCollectionProps,
			collection,
			children: undefined,
			layoutDelegate,
		} as any,
		subSlot(slot, 'state'),
	);

	let filteredState = UNSTABLE_useFilteredListState(
		gridlistState as ListState<T>,
		filter,
		subSlot(slot, 'filtered'),
	);
	let collator = useCollator({ usage: 'search', sensitivity: 'base' }, subSlot(slot, 'collator'));
	let { disabledBehavior, disabledKeys } = filteredState.selectionManager;
	let { direction } = useLocale(subSlot(slot, 'locale'));
	let keyboardDelegate = useMemo(
		() =>
			new ListKeyboardDelegate({
				collection: filteredState.collection,
				collator,
				ref,
				disabledKeys,
				disabledBehavior,
				layoutDelegate,
				layout,
				orientation,
				direction,
			}),
		[
			filteredState.collection,
			ref,
			layout,
			orientation,
			disabledKeys,
			disabledBehavior,
			layoutDelegate,
			collator,
			direction,
		],
		subSlot(slot, 'keyboardDelegate'),
	);

	let { gridProps } = useGridList(
		{
			...DOMCollectionProps,
			keyboardDelegate,
			// Only tab navigation is supported in grid layout.
			keyboardNavigationBehavior: layout === 'grid' ? 'tab' : keyboardNavigationBehavior,
			isVirtualized,
			shouldSelectOnPressUp: props.shouldSelectOnPressUp,
			disallowTypeAhead,
			UNSTABLE_focusOnEntry,
		} as any,
		filteredState,
		ref,
		subSlot(slot, 'gridList'),
	);

	let selectionManager = filteredState.selectionManager;
	let isListDraggable = !!dragAndDropHooks?.useDraggableCollectionState;
	let isListDroppable = !!dragAndDropHooks?.useDroppableCollectionState;
	let dragHooksProvided = useRef(isListDraggable, subSlot(slot, 'dragProvided'));
	let dropHooksProvided = useRef(isListDroppable, subSlot(slot, 'dropProvided'));
	useEffect(
		() => {
			if (process.env.NODE_ENV === 'production') {
				return;
			}
			if (dragHooksProvided.current !== isListDraggable) {
				console.warn(
					'Drag hooks were provided during one render, but not another. This should be avoided as it may produce unexpected behavior.',
				);
			}
			if (dropHooksProvided.current !== isListDroppable) {
				console.warn(
					'Drop hooks were provided during one render, but not another. This should be avoided as it may produce unexpected behavior.',
				);
			}
		},
		[isListDraggable, isListDroppable],
		subSlot(slot, 'dndWarn'),
	);

	let dragState: DraggableCollectionState | undefined = undefined;
	let dropState: DroppableCollectionState | undefined = undefined;
	let droppableCollection: DroppableCollectionResult | undefined = undefined;
	let isRootDropTarget = false;
	let dragPreview: any = null;
	let preview = useRef<any>(null, subSlot(slot, 'preview'));

	// PHASE-7: these branches call consumer-provided dnd hooks (upstream contract); they are
	// unreachable until `useDragAndDrop` is ported and a consumer can construct hooks.
	if (isListDraggable && dragAndDropHooks) {
		dragState = dragAndDropHooks.useDraggableCollectionState!({
			collection: filteredState.collection,
			selectionManager,
			preview: dragAndDropHooks.renderDragPreview ? preview : undefined,
		});
		dragAndDropHooks.useDraggableCollection!({}, dragState, ref);

		let DragPreview = dragAndDropHooks.DragPreview!;
		dragPreview = dragAndDropHooks.renderDragPreview
			? createElement(DragPreview, { ref: preview, children: dragAndDropHooks.renderDragPreview })
			: null;
	}

	if (isListDroppable && dragAndDropHooks) {
		dropState = dragAndDropHooks.useDroppableCollectionState!({
			collection: filteredState.collection,
			selectionManager,
		});

		let dropTargetDelegate =
			dragAndDropHooks.dropTargetDelegate ||
			ctxDropTargetDelegate ||
			new dragAndDropHooks.ListDropTargetDelegate(collection, ref, {
				layout,
				direction,
				orientation,
			});
		droppableCollection = dragAndDropHooks.useDroppableCollection!(
			{
				keyboardDelegate,
				dropTargetDelegate,
			},
			dropState,
			ref,
		);

		isRootDropTarget = dropState.isDropTarget({ type: 'root' });
	}

	let { focusProps, isFocused, isFocusVisible } = useFocusRing(
		undefined,
		subSlot(slot, 'focusRing'),
	);
	let isEmpty = filteredState.collection.size === 0;
	let renderValues = {
		isDropTarget: isRootDropTarget,
		orientation,
		isEmpty,
		isFocused,
		isFocusVisible,
		layout,
		state: filteredState,
	};
	let renderProps = useRenderProps(
		{
			...props,
			children: undefined,
			defaultClassName: 'react-aria-GridList',
			values: renderValues,
		} as any,
		subSlot(slot, 'render'),
	);

	let emptyState: any = null;
	let emptyStatePropOverrides: HTMLAttributes | null = null;

	if (isEmpty && props.renderEmptyState) {
		let content = props.renderEmptyState(renderValues as any);
		emptyState = createElement('div', {
			role: 'row',
			'aria-rowindex': 1,
			style: { display: 'contents' },
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
		selectionManager,
		dragAndDropHooks,
		dropState,
		subSlot(slot, 'persisted'),
	);
	let renderDropIndicator = useRenderDropIndicator(
		dragAndDropHooks,
		dropState,
		subSlot(slot, 'dropIndicator'),
	);

	return createElement(FocusScope, {
		children: createElement(dom.div, {
			...mergeProps(
				DOMProps,
				renderProps,
				gridProps,
				focusProps,
				droppableCollection?.collectionProps,
				emptyStatePropOverrides,
			),
			ref,
			slot: props.slot || undefined,
			onScroll: props.onScroll,
			'data-drop-target': isRootDropTarget || undefined,
			'data-empty': isEmpty || undefined,
			'data-focused': isFocused || undefined,
			'data-focus-visible': isFocusVisible || undefined,
			'data-layout': layout,
			'data-orientation': orientation,
			// Positional (non-array) children: the trailing empty/drag-preview slots are
			// unkeyed siblings of the collection Provider, exactly like upstream's JSX.
			children: createElement(
				Fragment,
				null,
				createElement(
					Provider,
					{
						values: [
							[ListStateContext, filteredState],
							[DragAndDropContext, { dragAndDropHooks, dragState, dropState }],
							[DropIndicatorContext, { render: GridListDropIndicatorWrapper }],
						] as any,
					} as any,
					isListDroppable ? createElement(RootDropIndicator, {}) : null,
					createElement(SharedElementTransition, {
						children: createElement(CollectionRoot, {
							collection: filteredState.collection,
							scrollRef: ref,
							persistedKeys,
							renderDropIndicator,
						}),
					}),
				),
				emptyState,
				dragPreview,
			),
		}),
	});
}

export interface GridListItemRenderProps extends ItemRenderProps {
	/** The unique id of the item. */
	id?: Key;
	/**
	 * Whether the item's children have keyboard focus.
	 *
	 * @selector [data-focus-visible-within]
	 */
	isFocusVisibleWithin: boolean;
	/**
	 * State of the grid list.
	 */
	state: ListState<unknown>;
}

export interface GridListItemProps<T = object>
	extends
		RenderProps<GridListItemRenderProps>,
		LinkDOMProps,
		HoverEvents,
		PressEvents,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-GridListItem'
	 */
	className?: ClassNameOrFunction<GridListItemRenderProps>;
	/** The unique id of the item. */
	id?: Key;
	/**
	 * The object value that this item represents. When using dynamic collections, this is set
	 * automatically.
	 */
	value?: T;
	/** A string representation of the item's contents, used for features like typeahead. */
	textValue?: string;
	/** Whether the item is disabled. */
	isDisabled?: boolean;
	/**
	 * Handler that is called when a user performs an action on the item. The exact user event depends
	 * on the collection's `selectionBehavior` prop and the interaction modality.
	 */
	onAction?: () => void;
}

/**
 * A GridListItem represents an individual item in a GridList.
 */
export const GridListItem: <T extends object = object>(
	props: GridListItemProps<T> & { ref?: any },
) => any = /*#__PURE__*/ createLeafComponent(
	ItemNode,
	// The third (item) parameter is declared so `render.length === 3` keeps the
	// engine's "cannot be rendered outside a collection" guard; it is always
	// provided when rendered from a collection node.
	function GridListItem<T>(props: GridListItemProps<T>, forwardedRef: any, item?: Node<T>): any {
		const slot = S('GridListItem');
		let state = useContext(ListStateContext)!;
		let { dragAndDropHooks, dragState, dropState } = useContext(DragAndDropContext);
		let ref = useObjectRef<HTMLDivElement>(forwardedRef, subSlot(slot, 'objectRef'));
		let { isVirtualized } = useContext(CollectionRendererContext);
		let isDraggable =
			dragState && !(dragState.isDisabled || dragState.selectionManager.isDisabled(item!.key));
		let { rowProps, gridCellProps, descriptionProps, ...states } = useGridListItem(
			{
				node: item!,
				shouldSelectOnPressUp: !!dragState,
				isVirtualized,
			},
			state,
			ref,
			subSlot(slot, 'gridListItem'),
		);

		let { hoverProps, isHovered } = useHover(
			{
				// because of https://bugs.webkit.org/show_bug.cgi?id=214609, supporting hover styles when a item is ONLY isDraggable
				// results in hover styles sticking around after a reorder/drop operation...
				isDisabled: !states.allowsSelection && !states.hasAction && !isDraggable,
				onHoverStart: item!.props.onHoverStart,
				onHoverChange: item!.props.onHoverChange,
				onHoverEnd: item!.props.onHoverEnd,
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
			state,
			subSlot(slot, 'checkbox'),
		);

		let buttonProps =
			state.selectionManager.disabledBehavior === 'all' && states.isDisabled
				? { isDisabled: true }
				: {};

		// PHASE-7: consumer-provided dnd item hooks (unreachable until useDragAndDrop is ported).
		let draggableItem: DraggableItemResult | null = null;
		if (dragState && dragAndDropHooks) {
			draggableItem = dragAndDropHooks.useDraggableItem!(
				{ key: item!.key, hasDragButton: true },
				dragState,
			);
		}

		let dropIndicator: DropIndicatorAria | null = null;
		let dropIndicatorRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'dropIndicatorRef'));
		let { visuallyHiddenProps } = useVisuallyHidden(undefined, subSlot(slot, 'visuallyHidden'));
		if (dropState && dragAndDropHooks) {
			dropIndicator = dragAndDropHooks.useDropIndicator!(
				{
					target: { type: 'item', key: item!.key, dropPosition: 'on' },
				},
				dropState,
				dropIndicatorRef,
			);
		}

		let isDragging = dragState && dragState.isDragging(item!.key);
		let renderProps = useRenderProps<GridListItemRenderProps, any>(
			{
				...props,
				id: undefined,
				children: item!.rendered,
				defaultClassName: 'react-aria-GridListItem',
				values: {
					...states,
					isHovered,
					isFocusVisible,
					isFocusVisibleWithin,
					selectionMode: state.selectionManager.selectionMode,
					selectionBehavior: state.selectionManager.selectionBehavior,
					allowsDragging: !!dragState,
					isDragging,
					isDropTarget: dropIndicator?.isDropTarget,
					id: item!.key,
					state,
				},
			} as any,
			subSlot(slot, 'render'),
		);

		let dragButtonRef = useRef<HTMLButtonElement | null>(null, subSlot(slot, 'dragButton'));
		useEffect(
			() => {
				if (dragState && !dragButtonRef.current) {
					console.warn(
						'Draggable items in a GridList must contain a <Button slot="drag"> element so that keyboard and screen reader users can drag them.',
					);
				}
			},
			[],
			subSlot(slot, 'dragButtonWarn'),
		);

		useEffect(
			() => {
				if (!item!.textValue && process.env.NODE_ENV !== 'production') {
					console.warn(
						'A `textValue` prop is required for <GridListItem> elements with non-plain text children in order to support accessibility features such as type to select.',
					);
				}
			},
			[item!.textValue],
			subSlot(slot, 'textValueWarn'),
		);

		let DOMProps = filterDOMProps(props as any, { global: true });
		delete DOMProps.id;
		delete DOMProps.onClick;

		return createElement(
			Fragment,
			null,
			dropIndicator && !dropIndicator.isHidden
				? createElement('div', {
						role: 'row',
						style: { position: 'absolute' },
						children: createElement('div', {
							role: 'gridcell',
							children: createElement('div', {
								role: 'button',
								...visuallyHiddenProps,
								...dropIndicator?.dropIndicatorProps,
								ref: dropIndicatorRef,
							}),
						}),
					})
				: null,
			createElement(dom.div, {
				...mergeProps(
					DOMProps,
					renderProps,
					rowProps,
					focusProps,
					focusWithinProps,
					hoverProps,
					draggableItem?.dragProps,
				),
				ref,
				'data-selected': states.isSelected || undefined,
				'data-disabled': states.isDisabled || undefined,
				'data-hovered': isHovered || undefined,
				'data-focused': states.isFocused || undefined,
				'data-focus-visible': isFocusVisible || undefined,
				'data-focus-visible-within': isFocusVisibleWithin || undefined,
				'data-pressed': states.isPressed || undefined,
				'data-allows-dragging': !!dragState || undefined,
				'data-dragging': isDragging || undefined,
				'data-drop-target': dropIndicator?.isDropTarget || undefined,
				'data-selection-mode':
					state.selectionManager.selectionMode === 'none'
						? undefined
						: state.selectionManager.selectionMode,
				children: createElement('div', {
					...gridCellProps,
					style: { display: 'contents' },
					children: createElement(Provider, {
						values: [
							[
								CheckboxContext,
								{
									slots: {
										[DEFAULT_SLOT]: {},
										selection: checkboxProps,
									},
								},
							],
							[
								CheckboxFieldContext,
								{
									slots: {
										[DEFAULT_SLOT]: {},
										selection: checkboxProps,
									},
								},
							],
							[
								ButtonContext,
								{
									slots: {
										[DEFAULT_SLOT]: buttonProps,
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
								TextContext,
								{
									slots: {
										[DEFAULT_SLOT]: {},
										description: descriptionProps,
									},
								},
							],
							[CollectionRendererContext, DefaultCollectionRenderer],
							[ListStateContext, null],
							[SelectableCollectionContext, null],
							[FieldInputContext, null],
							[SelectionIndicatorContext, { isSelected: states.isSelected }],
						] as any,
						children: renderProps.children,
					}),
				}),
			}),
		);
	},
);

function GridListDropIndicatorWrapper(props: DropIndicatorProps, forwardedRef: any): any {
	const slot = S('GridListDropIndicatorWrapper');
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

	return createElement(GridListDropIndicator, {
		...props,
		dropIndicatorProps,
		isDropTarget,
		buttonRef,
		ref,
	});
}

interface GridListDropIndicatorProps extends DropIndicatorProps {
	dropIndicatorProps: Record<string, any>;
	isDropTarget: boolean;
	buttonRef: RefObject<HTMLDivElement | null>;
	ref?: any;
}

// octane adaptation: no forwardRef — the forwarded ref arrives as `props.ref` (upstream wraps
// this in `forwardRef` as GridListDropIndicatorForwardRef).
function GridListDropIndicator(props: GridListDropIndicatorProps): any {
	const slot = S('GridListDropIndicator');
	let { dropIndicatorProps, isDropTarget, buttonRef, ref, ...otherProps } = props;

	let { visuallyHiddenProps } = useVisuallyHidden(undefined, subSlot(slot, 'visuallyHidden'));
	let renderProps = useRenderProps(
		{
			...otherProps,
			defaultClassName: 'react-aria-DropIndicator',
			values: {
				isDropTarget,
			},
		} as any,
		subSlot(slot, 'render'),
	);

	return createElement(dom.div, {
		...renderProps,
		role: 'row',
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
	const slot = S('GridListRootDropIndicator');
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

export interface GridListLoadMoreItemProps
	extends
		Omit<LoadMoreSentinelProps, 'collection'>,
		StyleProps,
		DOMRenderProps<'div', undefined>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-GridListLoadMoreItem'
	 */
	className?: string;
	/**
	 * The load more spinner to render when loading additional items.
	 */
	children?: ReactNode;
	/**
	 * Whether or not the loading spinner should be rendered or not.
	 */
	isLoading?: boolean;
}

export const GridListLoadMoreItem: (props: GridListLoadMoreItemProps & { ref?: any }) => any =
	createLeafComponent(
		LoaderNode,
		// Third (item) parameter declared for the engine's `render.length === 3` guard.
		function GridListLoadingIndicator(
			props: GridListLoadMoreItemProps,
			ref: any,
			item?: Node<object>,
		): any {
			const slot = S('GridListLoadMoreItem');
			let state = useContext(ListStateContext)!;
			let { isVirtualized } = useContext(CollectionRendererContext);
			let { isLoading, onLoadMore, scrollOffset, ...otherProps } = props;

			let sentinelRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'sentinel'));
			let memoedLoadMoreProps = useMemo(
				() => ({
					onLoadMore,
					collection: state?.collection,
					sentinelRef,
					scrollOffset,
				}),
				[onLoadMore, scrollOffset, state?.collection],
				subSlot(slot, 'loadMoreProps'),
			);
			useLoadMoreSentinel(
				memoedLoadMoreProps as any,
				sentinelRef as any,
				subSlot(slot, 'loadMore'),
			);

			let renderProps = useRenderProps(
				{
					...otherProps,
					id: undefined,
					children: item!.rendered,
					defaultClassName: 'react-aria-GridListLoadingIndicator',
					values: undefined,
				} as any,
				subSlot(slot, 'render'),
			);
			// For now don't include aria-posinset and aria-setsize on loader since they aren't keyboard focusable
			// Arguably shouldn't include them ever since it might be confusing to the user to include the loaders as part of the
			// item count

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
							...renderProps,
							...filterDOMProps(props, { global: true }),
							role: 'row',
							ref,
							children: createElement('div', {
								'aria-colindex': isVirtualized ? 1 : undefined,
								role: 'gridcell',
								children: renderProps.children,
							}),
						})
					: null,
			);
		},
	);

export interface GridListSectionProps<T> extends SectionProps<T>, DOMRenderProps<'div', undefined> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-GridListSection'
	 */
	className?: string;
}

/**
 * A GridListSection represents a section within a GridList.
 */
export const GridListSection: <T extends object = object>(
	props: GridListSectionProps<T> & { ref?: any },
) => any = /*#__PURE__*/ createBranchComponent(SectionNode, function GridListSection<
	T,
>(props: GridListSectionProps<T>, forwardedRef: any, item?: Node<T>): any {
	const slot = S('GridListSection');
	let state = useContext(ListStateContext)!;
	let { CollectionBranch } = useContext(CollectionRendererContext);
	let headingRef = useRef<HTMLElement | null>(null, subSlot(slot, 'heading'));
	let ref = useObjectRef<HTMLDivElement>(forwardedRef, subSlot(slot, 'objectRef'));
	let { rowHeaderProps, rowProps, rowGroupProps } = useGridListSection(
		{
			'aria-label': props['aria-label'] ?? undefined,
		},
		state,
		ref,
		subSlot(slot, 'section'),
	);
	let renderProps = useRenderProps(
		{
			...props,
			id: undefined,
			children: undefined,
			defaultClassName: 'react-aria-GridListSection',
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

export interface GridListHeaderProps
	extends DOMRenderProps<'div', undefined>, DOMProps, GlobalDOMAttributes {}

export const GridListHeaderContext = createContext<
	ContextValue<GridListHeaderProps, HTMLDivElement>
>({});
export const GridListHeaderInnerContext = createContext<HTMLAttributes | null>(null);

export const GridListHeader: (props: GridListHeaderProps & { ref?: any }) => any =
	/*#__PURE__*/ createLeafComponent(
		HeaderNode,
		function Header(props: GridListHeaderProps, forwardedRef: any): any {
			const slot = S('GridListHeader');
			let ref: any;
			[props, ref] = useContextProps(
				props,
				forwardedRef,
				GridListHeaderContext,
				subSlot(slot, 'ctx'),
			);
			let rowHeaderProps = useContext(GridListHeaderInnerContext);

			return createElement(dom.div, {
				render: props.render,
				className: 'react-aria-GridListHeader',
				ref,
				...props,
				children: createElement('div', {
					...rowHeaderProps,
					style: { display: 'contents' },
					children: props.children,
				}),
			});
		},
	);
