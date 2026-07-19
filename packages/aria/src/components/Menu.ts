// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Menu.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement` (multi-child elements use the
// positional-children form); NO forwardRef — the forwarded ref is `props.ref`, passed into
// `useContextProps` explicitly; the plain-`.ts` components use the S()/subSlot component-slot
// convention. The collection composes the Phase-4 engine: `CollectionBuilder`/
// `createLeafComponent`/`createBranchComponent` from `../collections/CollectionBuilder`,
// `CollectionRoot`/`CollectionBranch` via `CollectionRendererContext`. Upstream's RAC-local
// `CollectionProps` import is our `ItemCollectionProps` (see ./Collection.ts). react-aria/
// react-stately private imports come from the binding's ported modules; React's element/ref
// types → structural aliases. Upstream's inline `useMenuTriggerState({})` fallback inside the
// Provider values array is hoisted to a local (octane hooks are slot-keyed, so the conditional
// call needs no rules-of-hooks escape comment; the defined/undefined stability assumption is
// upstream's).
import type {
	FocusEvents,
	FocusStrategy,
	HoverEvents,
	Key,
	LinkDOMProps,
	MultipleSelection,
	Node,
	PressEvents,
} from '@react-types/shared';
import { createContext, createElement, useContext, useMemo, useRef } from 'octane';

import { type AriaMenuProps, useMenu } from '../menu/useMenu';
import { useMenuItem } from '../menu/useMenuItem';
import { useMenuSection } from '../menu/useMenuSection';
import { useMenuTrigger } from '../menu/useMenuTrigger';
import { useSubmenuTrigger } from '../menu/useSubmenuTrigger';
import {
	BaseCollection,
	CollectionNode,
	ItemNode,
	SectionNode,
} from '../collections/BaseCollection';
import {
	CollectionBuilder,
	createBranchComponent,
	createLeafComponent,
} from '../collections/CollectionBuilder';
import { useIsHidden } from '../collections/Hidden';
import { FocusScope } from '../focus/FocusScope';
import { PressResponder } from '../interactions/PressResponder';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import {
	type MenuTriggerProps as BaseMenuTriggerProps,
	type RootMenuTriggerState,
	useMenuTriggerState,
} from '../stately/menu/useMenuTriggerState';
import { useSubmenuTriggerState } from '../stately/menu/useSubmenuTriggerState';
import { SelectionManager } from '../stately/selection/SelectionManager';
import type { MultipleSelectionState } from '../stately/selection/types';
import { useMultipleSelectionState } from '../stately/selection/useMultipleSelectionState';
import { type TreeState, useTreeState } from '../stately/tree/useTreeState';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { useObjectRef } from '../utils/useObjectRef';
import {
	FieldInputContext,
	SelectableCollectionContext,
	type SelectableCollectionContextValue,
} from './Autocomplete';
import {
	Collection,
	CollectionRendererContext,
	type ItemCollectionProps,
	type ItemRenderProps,
	SectionContext,
	type SectionProps,
	usePersistedKeys,
} from './Collection';
import { OverlayTriggerStateContext } from './Dialog';
import { HeaderContext } from './Header';
import { KeyboardContext } from './Keyboard';
import { PopoverContext } from './Popover';
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
	type StyleRenderProps,
	useContextProps,
	useRenderProps,
	useSlot,
	useSlottedContext,
} from './utils';

// octane adaptations: structural aliases for the React types upstream drags along.
type ReactNode = any;
type ReactElement = any;
type GlobalDOMAttributes = Record<string, any>;
type RefObject<T> = { current: T };

export const MenuContext = createContext<ContextValue<MenuProps<any>, HTMLDivElement>>(null);
export const MenuStateContext = createContext<TreeState<any> | null>(null);
export const RootMenuTriggerStateContext = createContext<RootMenuTriggerState | null>(null);
const SelectionManagerContext = createContext<SelectionManager | null>(null);

export interface MenuTriggerProps extends BaseMenuTriggerProps {
	children: ReactNode;
}

export function MenuTrigger(props: MenuTriggerProps): any {
	const slot = S('MenuTrigger');
	let state = useMenuTriggerState(props, subSlot(slot, 'state'));
	let ref = useRef<HTMLButtonElement | null>(null, subSlot(slot, 'triggerRef'));
	let { menuTriggerProps, menuProps } = useMenuTrigger(
		{
			...props,
			type: 'menu',
		},
		state,
		ref,
		subSlot(slot, 'trigger'),
	);
	let scrollRef = useRef<HTMLElement | null>(null, subSlot(slot, 'scrollRef'));

	// If within a collection (e.g. Tabs), render nothing.
	// Not using createHideableComponent for this because that also creates a forwardRef.
	let isHidden = useIsHidden();
	if (isHidden) {
		return null;
	}

	return createElement(Provider, {
		values: [
			[MenuContext, { ...menuProps, ref: scrollRef }],
			[OverlayTriggerStateContext, state],
			[RootMenuTriggerStateContext, state],
			[
				PopoverContext,
				{
					trigger: 'MenuTrigger',
					triggerRef: ref,
					scrollRef,
					placement: 'bottom start',
					'aria-labelledby': (menuProps as any)['aria-labelledby'],
				},
			],
		] as any,
		children: createElement(PressResponder, {
			...menuTriggerProps,
			ref,
			isPressed: state.isOpen,
			children: props.children,
		}),
	});
}

export interface SubmenuTriggerProps {
	/**
	 * The contents of the SubmenuTrigger. The first child should be an Item (the trigger) and the
	 * second child should be the Popover (for the submenu).
	 */
	children: ReactElement[];
	/**
	 * The delay time in milliseconds for the submenu to appear after hovering over the trigger.
	 *
	 * @default 200
	 */
	delay?: number;
}

const SubmenuTriggerContext = createContext<{
	parentMenuRef: RefObject<HTMLElement | null>;
	shouldUseVirtualFocus?: boolean;
} | null>(null);

class SubmenuTriggerNode<T> extends CollectionNode<T> {
	static readonly type = 'submenutrigger';

	filter(
		collection: BaseCollection<T>,
		newCollection: BaseCollection<T>,
		filterFn: (textValue: string, node: Node<T>) => boolean,
	): CollectionNode<T> | null {
		let triggerNode = collection.getItem(this.firstChildKey!);
		if (triggerNode && filterFn(triggerNode.textValue, this)) {
			let clone = this.clone();
			newCollection.addDescendants(clone, collection);
			return clone;
		}

		return null;
	}
}

/**
 * A submenu trigger is used to wrap a submenu's trigger item and the submenu itself.
 *
 * @version alpha
 */
export const SubmenuTrigger: (props: SubmenuTriggerProps & { ref?: any }) => any =
	/*#__PURE__*/ createBranchComponent(
		SubmenuTriggerNode,
		(props: SubmenuTriggerProps, ref: any, item: Node<any>): any => {
			const slot = S('SubmenuTrigger');
			let { CollectionBranch } = useContext(CollectionRendererContext);
			let state = useContext(MenuStateContext)!;
			let rootMenuTriggerState = useContext(RootMenuTriggerStateContext)!;
			let submenuTriggerState = useSubmenuTriggerState(
				{ triggerKey: item.key },
				rootMenuTriggerState,
				subSlot(slot, 'state'),
			);
			let submenuRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'submenuRef'));
			let itemRef = useObjectRef<any>(ref, subSlot(slot, 'itemRef'));
			let { parentMenuRef, shouldUseVirtualFocus } = useContext(SubmenuTriggerContext)!;
			let { submenuTriggerProps, submenuProps, popoverProps } = useSubmenuTrigger(
				{
					parentMenuRef,
					submenuRef,
					delay: props.delay,
					shouldUseVirtualFocus,
				},
				submenuTriggerState,
				itemRef,
				subSlot(slot, 'trigger'),
			);

			return createElement(
				Provider,
				// octane adaptation: the two children arrive positionally below.
				{
					values: [
						[MenuItemContext, { ...submenuTriggerProps, onAction: undefined, ref: itemRef }],
						[
							MenuContext,
							{
								ref: submenuRef,
								...submenuProps,
							},
						],
						[OverlayTriggerStateContext, submenuTriggerState],
						[
							PopoverContext,
							{
								trigger: 'SubmenuTrigger',
								triggerRef: itemRef,
								placement: 'end top',
								'aria-labelledby': (submenuProps as any)['aria-labelledby'],
								...popoverProps,
							},
						],
					] as any,
				} as any,
				createElement(CollectionBranch, { collection: state.collection, parent: item }),
				props.children[1],
			);
		},
		(props) => props.children[0],
	);

export interface MenuRenderProps {
	/**
	 * Whether the menu has no items and should display its empty state.
	 *
	 * @selector [data-empty]
	 */
	isEmpty: boolean;
}

export interface MenuProps<T>
	extends
		Omit<AriaMenuProps<T>, 'children'>,
		ItemCollectionProps<T>,
		StyleRenderProps<MenuRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Menu'
	 */
	className?: ClassNameOrFunction<MenuRenderProps>;
	/** Provides content to display when there are no items in the list. */
	renderEmptyState?: () => ReactNode;
	/** Whether the menu should close when the menu item is selected. */
	shouldCloseOnSelect?: boolean;
}

/**
 * A menu displays a list of actions or options that a user can choose.
 */
export function Menu<T>(props: MenuProps<T>): any {
	const slot = S('Menu');
	let ref: any;
	[props, ref] = useContextProps(props, (props as any).ref, MenuContext, subSlot(slot, 'ctx'));

	// Delay rendering the actual menu until we have the collection so that auto focus works properly.
	return createElement(CollectionBuilder, {
		content: createElement(Collection, props as any),
		children: (collection: BaseCollection<any>) =>
			createElement(MenuInner, { props, collection, menuRef: ref } as any),
	});
}

interface MenuInnerProps<T> {
	// For now we append filter and other autocomplete context props here for typescript, but eventually we can consider exposing these
	// as top level props for users to use with standalone Menus
	props: MenuProps<T> & {
		filter?: SelectableCollectionContextValue<object>['filter'];
		shouldUseVirtualFocus?: boolean;
	};
	collection: BaseCollection<any>;
	menuRef: RefObject<HTMLElement | null>;
}

function MenuInner<T>({ props, collection, menuRef }: MenuInnerProps<T>): any {
	const slot = S('MenuInner');
	let ref: any;
	[props, ref] = useContextProps(
		props as any,
		menuRef as any,
		SelectableCollectionContext as any,
		subSlot(slot, 'ctx'),
	);
	let { filter, ...autocompleteMenuProps } = props;
	let filteredCollection = useMemo(
		() => (filter ? collection.filter(filter) : collection),
		[collection, filter],
		subSlot(slot, 'filtered'),
	);
	let state = useTreeState(
		{
			...props,
			collection: filteredCollection,
			children: undefined,
		} as any,
		subSlot(slot, 'state'),
	);
	let triggerState = useContext(RootMenuTriggerStateContext);
	let { isVirtualized, CollectionRoot } = useContext(CollectionRendererContext);
	let { menuProps } = useMenu(
		{ ...props, isVirtualized, onClose: props.onClose || triggerState?.close } as any,
		state,
		ref,
		subSlot(slot, 'menu'),
	);
	let renderProps = useRenderProps(
		{
			...props,
			children: undefined,
			defaultClassName: 'react-aria-Menu',
			values: {
				isEmpty: state.collection.size === 0,
			},
		} as any,
		subSlot(slot, 'render'),
	);

	let emptyState: any = null;
	if (state.collection.size === 0 && props.renderEmptyState) {
		emptyState = createElement('div', {
			role: 'menuitem',
			style: { display: 'contents' },
			children: props.renderEmptyState(),
		});
	}

	let DOMProps = filterDOMProps(props, { global: true });

	// octane adaptation: hooks hoisted out of the createElement expressions below.
	let persistedKeys = usePersistedKeys(
		state.selectionManager.focusedKey,
		subSlot(slot, 'persisted'),
	);
	/* Ensure root MenuTriggerState is defined, in case Menu is rendered outside a MenuTrigger. */
	/* We assume the context can never change between defined and undefined. */
	let rootTriggerState = triggerState ?? useMenuTriggerState({}, subSlot(slot, 'rootTriggerState'));

	return createElement(FocusScope, {
		children: createElement(
			dom.div,
			{
				...mergeProps(DOMProps, renderProps, menuProps),
				ref,
				slot: props.slot || undefined,
				'data-empty': state.collection.size === 0 || undefined,
				onScroll: (props as any).onScroll,
			},
			createElement(Provider, {
				values: [
					[MenuStateContext, state],
					[SeparatorContext, { elementType: 'div' }],
					[SectionContext, { name: 'MenuSection', render: MenuSectionInner }],
					[
						SubmenuTriggerContext,
						{
							parentMenuRef: ref,
							shouldUseVirtualFocus: autocompleteMenuProps?.shouldUseVirtualFocus,
						},
					],
					[MenuItemContext, { shouldCloseOnSelect: props.shouldCloseOnSelect }],
					[SelectableCollectionContext, null],
					[FieldInputContext, null],
					[SelectionManagerContext, state.selectionManager],
					[RootMenuTriggerStateContext, rootTriggerState],
				] as any,
				children: createElement(SharedElementTransition, {
					children: createElement(CollectionRoot, {
						collection: state.collection,
						persistedKeys,
						scrollRef: ref,
					}),
				}),
			}),
			emptyState,
		),
	});
}

export interface MenuSectionProps<T>
	extends
		SectionProps<T>,
		Omit<MultipleSelection, 'disabledKeys'>,
		DOMRenderProps<'section', undefined> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-MenuSection'
	 */
	className?: string;
	/** Whether the menu should close when the menu item is selected. */
	shouldCloseOnSelect?: boolean;
}

// A subclass of SelectionManager that forwards focus-related properties to the parent,
// but has its own local selection state.
class GroupSelectionManager extends SelectionManager {
	private parent: SelectionManager;

	constructor(parent: SelectionManager, state: MultipleSelectionState) {
		super(parent.collection, state);
		this.parent = parent;
	}

	get focusedKey() {
		return this.parent.focusedKey;
	}

	get isFocused() {
		return this.parent.isFocused;
	}

	setFocusedKey(key: Key | null, childFocusStrategy?: FocusStrategy): void {
		return this.parent.setFocusedKey(key, childFocusStrategy);
	}

	setFocused(isFocused: boolean): void {
		this.parent.setFocused(isFocused);
	}

	get childFocusStrategy() {
		return this.parent.childFocusStrategy;
	}
}

function MenuSectionInner<T>(
	props: MenuSectionProps<T>,
	ref: any,
	section: Node<T>,
	className = 'react-aria-MenuSection',
): any {
	const slot = S('MenuSectionInner');
	let state = useContext(MenuStateContext)!;
	let { CollectionBranch } = useContext(CollectionRendererContext);
	let [headingRef, heading] = useSlot(undefined, subSlot(slot, 'headingSlot'));
	let { headingProps, groupProps } = useMenuSection(
		{
			heading,
			'aria-label': section.props['aria-label'] ?? undefined,
		},
		subSlot(slot, 'section'),
	);
	let renderProps = useRenderProps(
		{
			...props,
			id: undefined,
			children: undefined,
			defaultClassName: className,
			className: section.props?.className,
			style: section.props?.style,
			values: undefined,
		} as any,
		subSlot(slot, 'render'),
	);

	let parent = useContext(SelectionManagerContext)!;
	let selectionState = useMultipleSelectionState(props, subSlot(slot, 'selectionState'));
	let manager =
		props.selectionMode != null ? new GroupSelectionManager(parent, selectionState) : parent;

	let closeOnSelect = useSlottedContext(MenuItemContext)?.shouldCloseOnSelect;

	let DOMProps = filterDOMProps(props as any, { global: true });
	delete DOMProps.id;

	return createElement(dom.section, {
		...mergeProps(DOMProps, renderProps, groupProps),
		ref,
		children: createElement(Provider, {
			values: [
				[HeaderContext, { ...headingProps, ref: headingRef }],
				[SelectionManagerContext, manager],
				[MenuItemContext, { shouldCloseOnSelect: props.shouldCloseOnSelect ?? closeOnSelect }],
			] as any,
			children: createElement(CollectionBranch, {
				collection: state.collection,
				parent: section,
			}),
		}),
	});
}

/**
 * A MenuSection represents a section within a Menu.
 */
export const MenuSection: <T extends object>(props: MenuSectionProps<T> & { ref?: any }) => any =
	/*#__PURE__*/ createBranchComponent(SectionNode, MenuSectionInner) as any;

export interface MenuItemRenderProps extends ItemRenderProps {
	/**
	 * Whether the item has a submenu.
	 *
	 * @selector [data-has-submenu]
	 */
	hasSubmenu: boolean;
	/**
	 * Whether the item's submenu is open.
	 *
	 * @selector [data-open]
	 */
	isOpen: boolean;
}

export interface MenuItemProps<T = object>
	extends
		Omit<RenderProps<MenuItemRenderProps>, 'render'>,
		PossibleLinkDOMRenderProps<'div', MenuItemRenderProps>,
		LinkDOMProps,
		HoverEvents,
		FocusEvents,
		PressEvents,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-MenuItem'
	 */
	className?: ClassNameOrFunction<MenuItemRenderProps>;
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
	/** Handler that is called when the item is selected. */
	onAction?: () => void;
	/** Whether the menu should close when the menu item is selected. */
	shouldCloseOnSelect?: boolean;
}

const MenuItemContext = createContext<ContextValue<MenuItemProps, HTMLDivElement>>(null);

/**
 * A MenuItem represents an individual action in a Menu.
 */
export const MenuItem: <T extends object = object>(props: MenuItemProps<T> & { ref?: any }) => any =
	/*#__PURE__*/ createLeafComponent(
		ItemNode,
		// The third (item) parameter is declared so `render.length === 3` keeps the
		// engine's "cannot be rendered outside a collection" guard; it is always
		// provided when rendered from a collection node.
		function MenuItem<T>(props: MenuItemProps<T>, forwardedRef: any, item?: Node<T>): any {
			const slot = S('MenuItem');
			[props, forwardedRef] = useContextProps(
				props,
				forwardedRef,
				MenuItemContext as any,
				subSlot(slot, 'ctx'),
			);
			let id = useSlottedContext(MenuItemContext)?.id as string;
			let state = useContext(MenuStateContext)!;
			let ref = useObjectRef<any>(forwardedRef, subSlot(slot, 'objectRef'));
			let selectionManager = useContext(SelectionManagerContext)!;
			let { isVirtualized } = useContext(CollectionRendererContext);
			let { menuItemProps, labelProps, descriptionProps, keyboardShortcutProps, ...states } =
				useMenuItem(
					{
						...props,
						id,
						key: item!.key,
						selectionManager,
						isVirtualized: isVirtualized,
					} as any,
					state,
					ref,
					subSlot(slot, 'item'),
				);

			let { hoverProps, isHovered } = useHover(
				{
					isDisabled: states.isDisabled,
				},
				subSlot(slot, 'hover'),
			);
			let renderProps = useRenderProps<MenuItemRenderProps, any>(
				{
					...props,
					id: undefined,
					children: item!.rendered,
					defaultClassName: 'react-aria-MenuItem',
					values: {
						...states,
						isHovered,
						isFocusVisible: states.isFocusVisible,
						selectionMode: selectionManager.selectionMode,
						selectionBehavior: selectionManager.selectionBehavior,
						hasSubmenu: !!(props as any)['aria-haspopup'],
						isOpen: (props as any)['aria-expanded'] === 'true',
					},
				} as any,
				subSlot(slot, 'render'),
			);

			let ElementType = (props as any).href ? dom.a : dom.div;
			let DOMProps = filterDOMProps(props as any, { global: true });
			delete DOMProps.id;
			delete DOMProps.onClick;

			return createElement(ElementType, {
				...mergeProps(DOMProps, renderProps, menuItemProps, hoverProps),
				ref,
				'data-disabled': states.isDisabled || undefined,
				'data-hovered': isHovered || undefined,
				'data-focused': states.isFocused || undefined,
				'data-focus-visible': states.isFocusVisible || undefined,
				'data-pressed': states.isPressed || undefined,
				'data-selected': states.isSelected || undefined,
				'data-selection-mode':
					selectionManager.selectionMode === 'none' ? undefined : selectionManager.selectionMode,
				'data-has-submenu': !!(props as any)['aria-haspopup'] || undefined,
				'data-open': (props as any)['aria-expanded'] === 'true' || undefined,
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
						[KeyboardContext, keyboardShortcutProps],
						[SelectionIndicatorContext, { isSelected: states.isSelected }],
					] as any,
					children: renderProps.children,
				}),
			});
		},
	) as any;
