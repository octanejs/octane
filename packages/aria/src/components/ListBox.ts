// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/ListBox.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded
// ref is `props.ref` (ListBox passes it into `useContextProps` explicitly; ListBoxItem and
// the drop-indicator wrapper adapt theirs with `useObjectRef` exactly like upstream's
// forwarded refs); the plain-`.ts` components use the S()/subSlot component-slot convention.
// The collection composes the Phase-4 engine: `CollectionBuilder`/`createLeafComponent`/
// `createBranchComponent` from `../collections/CollectionBuilder` and the renderer's
// `CollectionRoot`/`CollectionBranch` via `CollectionRendererContext`. Upstream's RAC-local
// `CollectionProps` import is our `ItemCollectionProps` (see ./Collection.ts). Upstream's
// `inertValue` (React <19 string compat) collapses to the plain boolean — octane follows
// React 19 `inert` semantics. The dnd branches use the PHASE-7 structural aliases from
// ./useDragAndDrop and stay inert until a consumer can construct `dragAndDropHooks`.
// react-aria's private `useLoadMoreSentinel` lives in ../utils/useLoadMoreSentinel
// (shared with GridList). Explicit dep arrays are preserved verbatim.
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

import { ItemNode, LoaderNode, SectionNode } from '../collections/BaseCollection';
import {
	CollectionBuilder,
	createBranchComponent,
	createLeafComponent,
} from '../collections/CollectionBuilder';
import { FocusScope } from '../focus/FocusScope';
import { useFocusRing } from '../focus/useFocusRing';
import { useCollator } from '../i18n/useCollator';
import { useLocale } from '../i18n/I18nProvider';
// octane adaptation: the ported NATIVE-event handler bags (upstream: FocusEvents/
// KeyboardEvents from '@react-types/shared', typed over React synthetic events).
import { type FocusEvents, useFocus } from '../interactions/useFocus';
import { useHover } from '../interactions/useHover';
import { type KeyboardEvents, useKeyboard } from '../interactions/useKeyboard';
import { S, subSlot } from '../internal';
import { type AriaListBoxOptions, type AriaListBoxProps, useListBox } from '../listbox/useListBox';
import { useListBoxSection } from '../listbox/useListBoxSection';
import { useOption } from '../listbox/useOption';
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
import { SelectableCollectionContext, type SelectableCollectionContextValue } from './Autocomplete';
import {
	Collection,
	CollectionRendererContext,
	type ItemCollectionProps,
	type ItemRenderProps,
	SectionContext,
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
	DroppableCollectionResult,
	DroppableCollectionState,
	DroppableItemResult,
} from './useDragAndDrop';
import { HeaderContext } from './Header';
import { SelectionIndicatorContext } from './SelectionIndicator';
import { SeparatorContext } from './Separator';
import { SharedElementTransition } from './SharedElementTransition';
import { TextContext } from './Text';
import {
	type ClassNameOrFunction,
	type ContextValue,
	DEFAULT_SLOT,
	dom,
	type DOMRenderProps,
	type PossibleLinkDOMRenderProps,
	Provider,
	type RenderProps,
	type SlotProps,
	type StyleProps,
	type StyleRenderProps,
	useContextProps,
	useRenderProps,
	useSlot,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;
type RefObject<T> = { current: T };
type ReactNode = any;

export interface ListBoxRenderProps {
	/**
	 * Whether the listbox has no items and should display its empty state.
	 *
	 * @selector [data-empty]
	 */
	isEmpty: boolean;
	/**
	 * Whether the listbox is currently focused.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the listbox is currently keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the listbox is currently the active drop target.
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
	 * State of the listbox.
	 */
	state: ListState<unknown>;
}

export interface ListBoxProps<T>
	extends
		Omit<AriaListBoxProps<T>, 'children' | 'label'>,
		ItemCollectionProps<T>,
		StyleRenderProps<ListBoxRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-ListBox'
	 */
	className?: ClassNameOrFunction<ListBoxRenderProps>;
	/**
	 * How multiple selection should behave in the collection.
	 *
	 * @default 'toggle'
	 */
	selectionBehavior?: SelectionBehavior;
	/**
	 * The drag and drop hooks returned by `useDragAndDrop` used to enable drag and drop behavior for
	 * the ListBox.
	 */
	dragAndDropHooks?: DragAndDropHooks<NoInfer<T>>;
	/** Provides content to display when there are no items in the list. */
	renderEmptyState?: (props: ListBoxRenderProps) => ReactNode;
	/**
	 * Whether the items are arranged in a stack or grid.
	 *
	 * @default 'stack'
	 */
	layout?: 'stack' | 'grid';
	/**
	 * The primary orientation of the items. Usually this is the
	 * direction that the collection scrolls.
	 *
	 * @default 'vertical'
	 */
	orientation?: Orientation;
}

export const ListBoxContext = createContext<ContextValue<ListBoxProps<any>, HTMLDivElement>>(null);
export const ListStateContext = createContext<ListState<any> | null>(null);

/**
 * A listbox displays a list of options and allows a user to select one or more of them.
 */
export function ListBox<T extends object>(props: ListBoxProps<T>): any {
	const slot = S('ListBox');
	let ref: any;
	[props, ref] = useContextProps(props, (props as any).ref, ListBoxContext, subSlot(slot, 'ctx'));
	let state = useContext(ListStateContext);

	// The structure of ListBox is a bit strange because it needs to work inside other components like ComboBox and Select.
	// Those components render two copies of their children so that the collection can be built even when the popover is closed.
	// The first copy sends a collection document via context which we render the collection portal into.
	// The second copy sends a ListState object via context which we use to render the ListBox without rebuilding the state.
	// Otherwise, we have a standalone ListBox, so we need to create a collection and state ourselves.
	if (state) {
		return createElement(ListBoxInner, { state, props, listBoxRef: ref });
	}

	return createElement(CollectionBuilder, {
		content: createElement(Collection, props as any),
		children: (collection: ICollection<Node<any>>) =>
			createElement(StandaloneListBox, { props, listBoxRef: ref, collection }),
	});
}

interface StandaloneListBoxProps<T> {
	props: ListBoxProps<T>;
	listBoxRef: RefObject<HTMLDivElement | null>;
	collection: ICollection<Node<T>>;
}

function StandaloneListBox<T extends object>({
	props,
	listBoxRef,
	collection,
}: StandaloneListBoxProps<T>): any {
	const slot = S('StandaloneListBox');
	props = { ...props, collection, children: null, items: null } as any;
	let { layoutDelegate } = useContext(CollectionRendererContext);
	let state = useListState({ ...props, layoutDelegate } as any, subSlot(slot, 'state'));
	return createElement(ListBoxInner, { state, props, listBoxRef });
}

interface ListBoxInnerProps<T> {
	state: ListState<T>;
	props: ListBoxProps<T> &
		AriaListBoxOptions<T> & { filter?: SelectableCollectionContextValue<T>['filter'] };
	listBoxRef: RefObject<HTMLElement | null>;
}

function ListBoxInner<T>({ state: inputState, props, listBoxRef }: ListBoxInnerProps<T>): any {
	const slot = S('ListBoxInner');
	[props, listBoxRef] = useContextProps(
		props,
		listBoxRef as any,
		SelectableCollectionContext,
		subSlot(slot, 'ctx'),
	) as any;
	let { dragAndDropHooks, layout = 'stack', orientation = 'vertical', filter } = props;
	let state = UNSTABLE_useFilteredListState(inputState, filter, subSlot(slot, 'filtered'));
	let { collection, selectionManager } = state;
	let isListDraggable = !!dragAndDropHooks?.useDraggableCollectionState;
	let isListDroppable = !!dragAndDropHooks?.useDroppableCollectionState;
	let { direction } = useLocale(subSlot(slot, 'locale'));
	let { disabledBehavior, disabledKeys } = selectionManager;
	let collator = useCollator({ usage: 'search', sensitivity: 'base' }, subSlot(slot, 'collator'));
	let {
		isVirtualized,
		layoutDelegate,
		dropTargetDelegate: ctxDropTargetDelegate,
		CollectionRoot,
	} = useContext(CollectionRendererContext);
	let keyboardDelegate = useMemo(
		() =>
			props.keyboardDelegate ||
			new ListKeyboardDelegate({
				collection,
				collator,
				ref: listBoxRef,
				disabledKeys,
				disabledBehavior,
				layout,
				orientation,
				direction,
				layoutDelegate,
			}),
		[
			collection,
			collator,
			listBoxRef,
			disabledBehavior,
			disabledKeys,
			orientation,
			direction,
			props.keyboardDelegate,
			layout,
			layoutDelegate,
		],
		subSlot(slot, 'keyboardDelegate'),
	);

	let { listBoxProps } = useListBox(
		{
			...props,
			shouldSelectOnPressUp: isListDraggable || props.shouldSelectOnPressUp,
			keyboardDelegate,
			isVirtualized,
		},
		state,
		listBoxRef,
		subSlot(slot, 'listBox'),
	);

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
			collection,
			selectionManager,
			preview: dragAndDropHooks.renderDragPreview ? preview : undefined,
		});
		dragAndDropHooks.useDraggableCollection!({}, dragState, listBoxRef);

		let DragPreview = dragAndDropHooks.DragPreview!;
		dragPreview = dragAndDropHooks.renderDragPreview
			? createElement(DragPreview, { ref: preview, children: dragAndDropHooks.renderDragPreview })
			: null;
	}

	if (isListDroppable && dragAndDropHooks) {
		dropState = dragAndDropHooks.useDroppableCollectionState!({
			collection,
			selectionManager,
		});

		let dropTargetDelegate =
			dragAndDropHooks.dropTargetDelegate ||
			ctxDropTargetDelegate ||
			new dragAndDropHooks.ListDropTargetDelegate(collection, listBoxRef, {
				orientation,
				layout,
				direction,
			});
		droppableCollection = dragAndDropHooks.useDroppableCollection!(
			{
				keyboardDelegate,
				dropTargetDelegate,
			},
			dropState,
			listBoxRef,
		);

		isRootDropTarget = dropState.isDropTarget({ type: 'root' });
	}

	let { focusProps, isFocused, isFocusVisible } = useFocusRing(
		undefined,
		subSlot(slot, 'focusRing'),
	);
	let isEmpty = state.collection.size === 0;
	let renderValues = {
		isDropTarget: isRootDropTarget,
		isEmpty,
		isFocused,
		isFocusVisible,
		layout: props.layout || 'stack',
		orientation,
		state,
	};
	let renderProps = useRenderProps(
		{
			...props,
			children: undefined,
			defaultClassName: 'react-aria-ListBox',
			values: renderValues,
		} as any,
		subSlot(slot, 'render'),
	);

	let emptyState: any = null;
	if (isEmpty && props.renderEmptyState) {
		emptyState = createElement('div', {
			role: 'option',
			style: { display: 'contents' },
			children: props.renderEmptyState(renderValues as any),
		});
	}

	let DOMProps = filterDOMProps(props, { global: true });

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
				listBoxProps,
				focusProps,
				droppableCollection?.collectionProps,
			),
			ref: listBoxRef,
			slot: props.slot || undefined,
			onScroll: props.onScroll,
			'data-drop-target': isRootDropTarget || undefined,
			'data-empty': isEmpty || undefined,
			'data-focused': isFocused || undefined,
			'data-focus-visible': isFocusVisible || undefined,
			'data-layout': props.layout || 'stack',
			'data-orientation': orientation,
			// Positional (non-array) children: the trailing empty/drag-preview slots are
			// unkeyed siblings of the collection Provider, exactly like upstream's JSX.
			children: createElement(
				Fragment,
				null,
				createElement(Provider, {
					values: [
						[ListBoxContext, props],
						[ListStateContext, state],
						[DragAndDropContext, { dragAndDropHooks, dragState, dropState }],
						[SeparatorContext, { elementType: 'div' }],
						[DropIndicatorContext, { render: ListBoxDropIndicatorWrapper }],
						[SectionContext, { name: 'ListBoxSection', render: ListBoxSectionInner }],
					] as any,
					children: createElement(SharedElementTransition, {
						children: createElement(CollectionRoot, {
							collection,
							scrollRef: listBoxRef,
							persistedKeys,
							renderDropIndicator,
						}),
					}),
				}),
				emptyState,
				dragPreview,
			),
		}),
	});
}

export interface ListBoxSectionProps<T>
	extends SectionProps<T>, DOMRenderProps<'section', undefined> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-ListBoxSection'
	 */
	className?: string;
}

function ListBoxSectionInner<T>(
	props: ListBoxSectionProps<T>,
	ref: any,
	section: Node<T>,
	className = 'react-aria-ListBoxSection',
): any {
	const slot = S('ListBoxSection');
	let state = useContext(ListStateContext)!;
	let { dragAndDropHooks, dropState } = useContext(DragAndDropContext)!;
	let { CollectionBranch } = useContext(CollectionRendererContext);
	let [headingRef, heading] = useSlot(undefined, subSlot(slot, 'heading'));
	let { headingProps, groupProps } = useListBoxSection(
		{
			heading,
			'aria-label': props['aria-label'] ?? undefined,
		},
		subSlot(slot, 'section'),
	);
	let renderProps = useRenderProps(
		{
			...props,
			id: undefined,
			children: undefined,
			defaultClassName: className,
			values: undefined,
		} as any,
		subSlot(slot, 'render'),
	);
	let renderDropIndicator = useRenderDropIndicator(
		dragAndDropHooks,
		dropState,
		subSlot(slot, 'dropIndicator'),
	);

	let DOMProps = filterDOMProps(props as any, { global: true });
	delete DOMProps.id;

	return createElement(dom.section, {
		...mergeProps(DOMProps, renderProps, groupProps),
		ref,
		children: createElement(HeaderContext.Provider, {
			value: { ...headingProps, ref: headingRef },
			children: createElement(CollectionBranch, {
				collection: state.collection,
				parent: section,
				renderDropIndicator,
			}),
		}),
	});
}

/**
 * A ListBoxSection represents a section within a ListBox.
 */
export const ListBoxSection: <T extends object = object>(
	props: ListBoxSectionProps<T> & { ref?: any },
) => any = /*#__PURE__*/ createBranchComponent(SectionNode, ListBoxSectionInner);

export interface ListBoxItemRenderProps extends ItemRenderProps {}

export interface ListBoxItemProps<T = object>
	extends
		Omit<RenderProps<ListBoxItemRenderProps>, 'render'>,
		PossibleLinkDOMRenderProps<'div', ListBoxItemRenderProps>,
		LinkDOMProps,
		HoverEvents,
		PressEvents,
		KeyboardEvents,
		FocusEvents<HTMLDivElement>,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-ListBoxItem'
	 */
	className?: ClassNameOrFunction<ListBoxItemRenderProps>;
	/** The unique id of the item. */
	id?: Key;
	/**
	 * The object value that this item represents. When using dynamic collections, this is set
	 * automatically.
	 */
	value?: T;
	/** A string representation of the item's contents, used for features like typeahead. */
	textValue?: string;
	/** An accessibility label for this item. */
	'aria-label'?: string;
	/** Whether the item is disabled. */
	isDisabled?: boolean;
	/**
	 * Handler that is called when a user performs an action on the item. The exact user event depends
	 * on the collection's `selectionBehavior` prop and the interaction modality.
	 */
	onAction?: () => void;
}

/**
 * A ListBoxItem represents an individual option in a ListBox.
 */
export const ListBoxItem: <T extends object = object>(
	props: ListBoxItemProps<T> & { ref?: any },
) => any = /*#__PURE__*/ createLeafComponent(
	ItemNode,
	// The third (item) parameter is declared so `render.length === 3` keeps the
	// engine's "cannot be rendered outside a collection" guard; it is always
	// provided when rendered from a collection node.
	function ListBoxItem<T>(props: ListBoxItemProps<T>, forwardedRef: any, item?: Node<T>): any {
		const slot = S('ListBoxItem');
		let ref = useObjectRef<any>(forwardedRef, subSlot(slot, 'objectRef'));
		let state = useContext(ListStateContext)!;
		let { dragAndDropHooks, dragState, dropState } = useContext(DragAndDropContext)!;
		let isDraggable =
			dragState && !(dragState.isDisabled || dragState.selectionManager.isDisabled(item!.key));
		let { optionProps, labelProps, descriptionProps, ...states } = useOption(
			{ key: item!.key, 'aria-label': props?.['aria-label'] },
			state,
			ref,
			subSlot(slot, 'option'),
		);

		let { hoverProps, isHovered } = useHover(
			{
				isDisabled: !states.allowsSelection && !states.hasAction && !isDraggable,
				onHoverStart: item!.props.onHoverStart,
				onHoverChange: item!.props.onHoverChange,
				onHoverEnd: item!.props.onHoverEnd,
			},
			subSlot(slot, 'hover'),
		);

		let { keyboardProps } = useKeyboard(props, subSlot(slot, 'keyboard'));
		let { focusProps } = useFocus(props, subSlot(slot, 'focus'));

		// PHASE-7: consumer-provided dnd item hooks (unreachable until useDragAndDrop is ported).
		let draggableItem: DraggableItemResult | null = null;
		if (dragState && dragAndDropHooks) {
			draggableItem = dragAndDropHooks.useDraggableItem!(
				{ key: item!.key, hasAction: states.hasAction },
				dragState,
			);
		}

		let droppableItem: DroppableItemResult | null = null;
		if (dropState && dragAndDropHooks) {
			droppableItem = dragAndDropHooks.useDroppableItem!(
				{
					target: { type: 'item', key: item!.key, dropPosition: 'on' },
				},
				dropState,
				ref,
			);
		}

		let isDragging = dragState && dragState.isDragging(item!.key);
		let renderProps = useRenderProps<ListBoxItemRenderProps, any>(
			{
				...props,
				id: undefined,
				children: props.children,
				defaultClassName: 'react-aria-ListBoxItem',
				values: {
					...states,
					isHovered,
					selectionMode: state.selectionManager.selectionMode,
					selectionBehavior: state.selectionManager.selectionBehavior,
					allowsDragging: !!dragState,
					isDragging,
					isDropTarget: droppableItem?.isDropTarget,
				},
			} as any,
			subSlot(slot, 'render'),
		);

		useEffect(
			() => {
				if (!item!.textValue && process.env.NODE_ENV !== 'production') {
					console.warn(
						'A `textValue` prop is required for <ListBoxItem> elements with non-plain text children in order to support accessibility features such as type to select.',
					);
				}
			},
			[item!.textValue],
			subSlot(slot, 'textValueWarn'),
		);

		let ElementType = props.href ? dom.a : dom.div;
		let DOMProps = filterDOMProps(props as any, { global: true });
		delete DOMProps.id;
		delete DOMProps.onClick;

		if (props.href && optionProps.tabIndex == null) {
			optionProps.tabIndex = -1;
		}

		return createElement(ElementType, {
			...mergeProps(
				DOMProps,
				renderProps,
				optionProps,
				hoverProps,
				keyboardProps,
				focusProps,
				draggableItem?.dragProps,
				droppableItem?.dropProps,
			),
			ref,
			'data-allows-dragging': !!dragState || undefined,
			'data-selected': states.isSelected || undefined,
			'data-disabled': states.isDisabled || undefined,
			'data-hovered': isHovered || undefined,
			'data-focused': states.isFocused || undefined,
			'data-focus-visible': states.isFocusVisible || undefined,
			'data-pressed': states.isPressed || undefined,
			'data-dragging': isDragging || undefined,
			'data-drop-target': droppableItem?.isDropTarget || undefined,
			'data-selection-mode':
				state.selectionManager.selectionMode === 'none'
					? undefined
					: state.selectionManager.selectionMode,
			children: createElement(Provider, {
				values: [
					[
						TextContext,
						{
							slots: {
								[DEFAULT_SLOT]: labelProps,
								label: labelProps,
								description: descriptionProps,
							},
						},
					],
					[SelectionIndicatorContext, { isSelected: states.isSelected }],
				] as any,
				children: renderProps.children,
			}),
		});
	},
);

function ListBoxDropIndicatorWrapper(props: DropIndicatorProps, forwardedRef: any): any {
	const slot = S('ListBoxDropIndicatorWrapper');
	let ref = useObjectRef<HTMLElement>(forwardedRef, subSlot(slot, 'objectRef'));
	let { dragAndDropHooks, dropState } = useContext(DragAndDropContext)!;
	let { dropIndicatorProps, isHidden, isDropTarget } = dragAndDropHooks!.useDropIndicator!(
		props,
		dropState!,
		ref,
	);

	if (isHidden) {
		return null;
	}

	return createElement(ListBoxDropIndicator, {
		...props,
		dropIndicatorProps,
		isDropTarget,
		ref,
	});
}

interface ListBoxDropIndicatorProps extends DropIndicatorProps {
	dropIndicatorProps: Record<string, any>;
	isDropTarget: boolean;
	ref?: any;
}

// octane adaptation: no forwardRef — the forwarded ref arrives as `props.ref` (upstream wraps
// this in `forwardRef` as ListBoxDropIndicatorForwardRef).
function ListBoxDropIndicator(props: ListBoxDropIndicatorProps): any {
	const slot = S('ListBoxDropIndicator');
	let { dropIndicatorProps, isDropTarget, ref, ...otherProps } = props;

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
		...dropIndicatorProps,
		...renderProps,
		role: 'option',
		ref,
		'data-drop-target': isDropTarget || undefined,
	});
}

export interface ListBoxLoadMoreItemProps
	extends
		Omit<LoadMoreSentinelProps, 'collection'>,
		StyleProps,
		DOMRenderProps<'div', undefined>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-ListBoxLoadMoreItem'
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

export const ListBoxLoadMoreItem: (props: ListBoxLoadMoreItemProps & { ref?: any }) => any =
	createLeafComponent(
		LoaderNode,
		// Third (item) parameter declared for the engine's `render.length === 3` guard.
		function ListBoxLoadingIndicator(
			props: ListBoxLoadMoreItemProps,
			ref: any,
			item?: Node<object>,
		): any {
			const slot = S('ListBoxLoadMoreItem');
			let state = useContext(ListStateContext)!;
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
					defaultClassName: 'react-aria-ListBoxLoadingIndicator',
					values: undefined,
				} as any,
				subSlot(slot, 'render'),
			);

			let optionProps = {
				// For Android talkback
				tabIndex: -1,
				// For now don't include aria-posinset and aria-setsize on loader since they aren't keyboard focusable
				// Arguably shouldn't include them ever since it might be confusing to the user to include the loaders as part of the
				// item count
			};

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
							...mergeProps(filterDOMProps(props, { global: true }), optionProps),
							...renderProps,
							// aria-selected isn't needed here since this option is not selectable.
							role: 'option',
							ref,
							children: renderProps.children,
						})
					: null,
			);
		},
	);
