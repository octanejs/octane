// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/TagGroup.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded
// ref is `props.ref` (TagGroup passes it into `useContextProps` explicitly; Tag adapts its
// forwarded ref with `useObjectRef` exactly like upstream); the plain-`.ts` components use
// the S()/subSlot component-slot convention. The collection composes the Phase-4 engine:
// `CollectionBuilder`/`createLeafComponent` from `../collections/CollectionBuilder` and the
// renderer's `CollectionRoot` via `CollectionRendererContext`. Upstream's RAC-local
// `CollectionProps` import is our `ItemCollectionProps` (see ./Collection.ts). Explicit dep
// arrays are preserved verbatim.
import type { HoverEvents, Key, LinkDOMProps, Node, PressEvents } from '@react-types/shared';
import { createContext, createElement, useContext, useEffect, useRef } from 'octane';

import { ItemNode } from '../collections/BaseCollection';
import { CollectionBuilder, createLeafComponent } from '../collections/CollectionBuilder';
import { useFocusRing } from '../focus/useFocusRing';
// octane adaptation: the ported NATIVE-event handler bag (upstream: FocusEvents from
// '@react-types/shared', typed over React synthetic events).
import { type FocusEvents } from '../interactions/useFocus';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { type AriaTagGroupProps, useTagGroup } from '../tag/useTagGroup';
import { useTag } from '../tag/useTag';
import {
	type ListState,
	UNSTABLE_useFilteredListState,
	useListState,
} from '../stately/list/useListState';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { useObjectRef } from '../utils/useObjectRef';
import { SelectableCollectionContext, type SelectableCollectionContextValue } from './Autocomplete';
import { ButtonContext } from './Button';
import {
	Collection,
	CollectionRendererContext,
	DefaultCollectionRenderer,
	type ItemCollectionProps,
	type ItemRenderProps,
	usePersistedKeys,
} from './Collection';
import { LabelContext } from './Label';
import { ListStateContext } from './ListBox';
import { SelectionIndicatorContext } from './SelectionIndicator';
import { SharedElementTransition } from './SharedElementTransition';
import { TextContext } from './Text';
import {
	type ClassNameOrFunction,
	type ContextValue,
	dom,
	type DOMProps,
	type DOMRenderProps,
	Provider,
	type RenderProps,
	type SlotProps,
	type StyleRenderProps,
	useContextProps,
	useRenderProps,
	useSlot,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;
type RefObject<T> = { current: T };
type ReactNode = any;

export interface TagGroupProps
	extends
		Omit<
			AriaTagGroupProps<unknown>,
			'children' | 'items' | 'label' | 'description' | 'errorMessage' | 'keyboardDelegate'
		>,
		DOMProps,
		SlotProps,
		DOMRenderProps<'div', undefined>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-TagGroup'
	 */
	className?: string;
}

export interface TagListRenderProps {
	/**
	 * Whether the tag list has no items and should display its empty state.
	 *
	 * @selector [data-empty]
	 */
	isEmpty: boolean;
	/**
	 * Whether the tag list is currently focused.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the tag list is currently keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * State of the TagGroup.
	 */
	state: ListState<unknown>;
}

export interface TagListProps<T>
	extends
		Omit<ItemCollectionProps<T>, 'disabledKeys'>,
		StyleRenderProps<TagListRenderProps, 'div'>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-TagList'
	 */
	className?: ClassNameOrFunction<TagListRenderProps>;
	/** Provides content to display when there are no items in the tag list. */
	renderEmptyState?: (props: TagListRenderProps) => ReactNode;
}

export const TagGroupContext = createContext<ContextValue<TagGroupProps, HTMLDivElement>>(null);
export const TagListContext = createContext<ContextValue<TagListProps<any>, HTMLDivElement>>(null);

/**
 * A tag group is a focusable list of labels, categories, keywords, filters, or other items, with
 * support for keyboard navigation, selection, and removal.
 */
export function TagGroup(props: TagGroupProps): any {
	const slot = S('TagGroup');
	let ref: any;
	[props, ref] = useContextProps(props, (props as any).ref, TagGroupContext, subSlot(slot, 'ctx'));
	return createElement(ListStateContext.Provider, {
		value: null,
		children: createElement(CollectionBuilder, {
			content: props.children,
			children: (collection: any) =>
				createElement(TagGroupInner, { props, forwardedRef: ref, collection }),
		}),
	});
}

interface TagGroupInnerProps<T> {
	props: TagGroupProps & SelectableCollectionContextValue<T>;
	forwardedRef: RefObject<HTMLDivElement | null>;
	collection: any;
}

function TagGroupInner<T>({ props, forwardedRef: ref, collection }: TagGroupInnerProps<T>): any {
	const slot = S('TagGroupInner');
	let tagListRef = useRef<HTMLElement | null>(null, subSlot(slot, 'tagListRef'));
	// Extract the user provided id so it doesn't clash with the collection id provided by Autocomplete
	let { id, ...otherProps } = props;
	[otherProps, tagListRef] = useContextProps(
		otherProps,
		tagListRef as any,
		SelectableCollectionContext,
		subSlot(slot, 'ctx'),
	) as any;
	let { filter, shouldUseVirtualFocus: _shouldUseVirtualFocus, ...DOMCollectionProps } = otherProps;
	let [labelRef, label] = useSlot(
		!props['aria-label'] && !props['aria-labelledby'],
		subSlot(slot, 'label'),
	);
	let tagGroupState = useListState(
		{
			...DOMCollectionProps,
			children: undefined,
			collection,
		} as any,
		subSlot(slot, 'state'),
	);

	let filteredState = UNSTABLE_useFilteredListState(
		tagGroupState as ListState<T>,
		filter,
		subSlot(slot, 'filtered'),
	);

	// Prevent DOM props from going to two places.
	let domProps = filterDOMProps(otherProps, { global: true });
	let domPropOverrides = Object.fromEntries(
		Object.entries(domProps).map(([k, val]) => [k, k === 'id' ? val : undefined]),
	);
	let { gridProps, labelProps, descriptionProps, errorMessageProps } = useTagGroup(
		{
			...DOMCollectionProps,
			...domPropOverrides,
			label,
		} as any,
		filteredState,
		tagListRef,
		subSlot(slot, 'tagGroup'),
	);

	return createElement(dom.div, {
		render: props.render,
		...domProps,
		id,
		ref,
		slot: props.slot || undefined,
		className: props.className ?? 'react-aria-TagGroup',
		style: props.style,
		children: createElement(Provider, {
			values: [
				[LabelContext, { ...labelProps, elementType: 'span', ref: labelRef }],
				[TagListContext, { ...gridProps, ref: tagListRef as RefObject<HTMLDivElement> }],
				[ListStateContext, filteredState],
				[
					TextContext,
					{
						slots: {
							description: descriptionProps,
							errorMessage: errorMessageProps,
						},
					},
				],
			] as any,
			children: props.children,
		}),
	});
}

/**
 * A tag list is a container for tags within a TagGroup.
 */
export function TagList<T extends object>(props: TagListProps<T>): any {
	let state = useContext(ListStateContext);
	let { ref: forwardedRef, ...otherProps } = props as any;
	return state
		? createElement(TagListInner, { props: otherProps, forwardedRef })
		: createElement(Collection, otherProps);
}

interface TagListInnerProps<T> {
	props: TagListProps<T>;
	forwardedRef: RefObject<HTMLDivElement | null>;
}

function TagListInner<T>({ props, forwardedRef }: TagListInnerProps<T>): any {
	const slot = S('TagListInner');
	let state = useContext(ListStateContext)!;
	let { CollectionRoot } = useContext(CollectionRendererContext);
	let [gridProps, ref] = useContextProps(
		{} as any,
		forwardedRef as any,
		TagListContext,
		subSlot(slot, 'ctx'),
	);

	let { focusProps, isFocused, isFocusVisible } = useFocusRing(
		undefined,
		subSlot(slot, 'focusRing'),
	);
	let renderValues = {
		isEmpty: state.collection.size === 0,
		isFocused,
		isFocusVisible,
		state,
	};
	let renderProps = useRenderProps(
		{
			...props,
			children: undefined,
			defaultClassName: 'react-aria-TagList',
			values: renderValues,
		} as any,
		subSlot(slot, 'render'),
	);

	let persistedKeys = usePersistedKeys(
		state.selectionManager.focusedKey,
		subSlot(slot, 'persisted'),
	);
	let DOMProps = filterDOMProps(props, { global: true });

	return createElement(dom.div, {
		...mergeProps(DOMProps, renderProps, gridProps, focusProps),
		ref,
		'data-empty': state.collection.size === 0 || undefined,
		'data-focused': isFocused || undefined,
		'data-focus-visible': isFocusVisible || undefined,
		children: createElement(SharedElementTransition, {
			children:
				state.collection.size === 0 && props.renderEmptyState
					? props.renderEmptyState(renderValues)
					: createElement(CollectionRoot, {
							collection: state.collection,
							persistedKeys,
						}),
		}),
	});
}

export interface TagRenderProps extends Omit<
	ItemRenderProps,
	'allowsDragging' | 'isDragging' | 'isDropTarget'
> {
	/**
	 * Whether the tag group allows items to be removed.
	 *
	 * @selector [data-allows-removing]
	 */
	allowsRemoving: boolean;
}

export interface TagProps
	extends
		RenderProps<TagRenderProps, 'div'>,
		LinkDOMProps,
		HoverEvents,
		FocusEvents<HTMLDivElement>,
		PressEvents,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Tag'
	 */
	className?: ClassNameOrFunction<TagRenderProps>;
	/** A unique id for the tag. */
	id?: Key;
	/**
	 * A string representation of the tags's contents, used for accessibility.
	 * Required if children is not a plain text string.
	 */
	textValue?: string;
	/** Whether the tag is disabled. */
	isDisabled?: boolean;
	/**
	 * Handler that is called when a user performs an action on the item. The exact user event depends
	 * on the collection's `selectionBehavior` prop and the interaction modality.
	 */
	onAction?: () => void;
}

/**
 * A Tag is an individual item within a TagList.
 */
export const Tag: (props: TagProps & { ref?: any }) => any = /*#__PURE__*/ createLeafComponent(
	ItemNode,
	// The third (item) parameter is declared so `render.length === 3` keeps the
	// engine's "cannot be rendered outside a collection" guard; it is always
	// provided when rendered from a collection node.
	function Tag(props: TagProps, forwardedRef: any, item?: Node<unknown>): any {
		const slot = S('Tag');
		let state = useContext(ListStateContext)!;
		let ref = useObjectRef<HTMLDivElement>(forwardedRef, subSlot(slot, 'objectRef'));
		let { focusProps, isFocusVisible } = useFocusRing(
			{ within: false },
			subSlot(slot, 'focusRing'),
		);
		let { rowProps, gridCellProps, removeButtonProps, ...states } = useTag(
			{ item: item! },
			state,
			ref,
			subSlot(slot, 'tag'),
		);

		let { hoverProps, isHovered } = useHover(
			{
				isDisabled: !states.allowsSelection && !states.hasAction,
				onHoverStart: item!.props.onHoverStart,
				onHoverChange: item!.props.onHoverChange,
				onHoverEnd: item!.props.onHoverEnd,
			},
			subSlot(slot, 'hover'),
		);

		let renderProps = useRenderProps(
			{
				...props,
				id: undefined,
				children: item!.rendered,
				defaultClassName: 'react-aria-Tag',
				values: {
					...states,
					isFocusVisible,
					isHovered,
					selectionMode: state.selectionManager.selectionMode,
					selectionBehavior: state.selectionManager.selectionBehavior,
				},
			} as any,
			subSlot(slot, 'render'),
		);

		useEffect(
			() => {
				if (!item!.textValue && process.env.NODE_ENV !== 'production') {
					console.warn(
						'A `textValue` prop is required for <Tag> elements with non-plain text children for accessibility.',
					);
				}
			},
			[item!.textValue],
			subSlot(slot, 'textValueWarn'),
		);

		let DOMProps = filterDOMProps(props as any, { global: true });
		delete DOMProps.id;
		delete DOMProps.onClick;

		return createElement(dom.div, {
			ref,
			...mergeProps(DOMProps, renderProps, rowProps, focusProps, hoverProps),
			'data-selected': states.isSelected || undefined,
			'data-disabled': states.isDisabled || undefined,
			'data-hovered': isHovered || undefined,
			'data-focused': states.isFocused || undefined,
			'data-focus-visible': isFocusVisible || undefined,
			'data-pressed': states.isPressed || undefined,
			'data-allows-removing': states.allowsRemoving || undefined,
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
							ButtonContext,
							{
								slots: {
									remove: removeButtonProps,
								},
							},
						],
						[CollectionRendererContext, DefaultCollectionRenderer],
						[SelectionIndicatorContext, { isSelected: states.isSelected }],
					] as any,
					children: renderProps.children,
				}),
			}),
		});
	},
);
