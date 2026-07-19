// Ported from react-aria-components (source: .react-spectrum/packages/react-aria-components/src/Tabs.tsx).
// octane adaptations: `.tsx` → `.ts`, JSX → `createElement`; NO forwardRef — the forwarded ref
// is `props.ref` (Tabs passes it into `useContextProps` explicitly; TabList/TabPanels/TabPanel
// adapt theirs with `useObjectRef` exactly like upstream's forwarded refs); the plain-`.ts`
// components use the S()/subSlot component-slot convention. The collection composes the
// Phase-4 engine: `CollectionBuilder`/`createLeafComponent` from `../collections/
// CollectionBuilder`, `createHideableComponent` from `../collections/Hidden`, and the
// renderer's `CollectionRoot` via `CollectionRendererContext`. Upstream's RAC-local
// `CollectionProps` import is our `ItemCollectionProps` (see ./Collection.ts). Upstream's
// `inertValue` (React <19 string compat) collapses to the plain boolean — octane follows
// React 19 `inert` semantics. Explicit dep arrays are preserved verbatim.
import type {
	AriaLabelingProps,
	FocusEvents,
	HoverEvents,
	Collection as ICollection,
	Key,
	LinkDOMProps,
	Node,
	Orientation,
	PressEvents,
} from '@react-types/shared';
import { createContext, createElement, useContext, useMemo, useRef, useState } from 'octane';

import { CollectionNode } from '../collections/BaseCollection';
import { CollectionBuilder, createLeafComponent } from '../collections/CollectionBuilder';
import { createHideableComponent } from '../collections/Hidden';
import { useFocusRing } from '../focus/useFocusRing';
import { useHover } from '../interactions/useHover';
import { S, subSlot } from '../internal';
import { type TabListState, useTabListState } from '../stately/tabs/useTabListState';
import { useTab } from '../tabs/useTab';
import { type AriaTabListProps, useTabList } from '../tabs/useTabList';
import { type AriaTabPanelProps, useTabPanel } from '../tabs/useTabPanel';
import { useEnterAnimation, useExitAnimation } from '../utils/animation';
import { filterDOMProps } from '../utils/filterDOMProps';
import { mergeProps } from '../utils/mergeProps';
import { useLayoutEffect } from '../utils/useLayoutEffect';
import { useObjectRef } from '../utils/useObjectRef';
import {
	Collection,
	CollectionRendererContext,
	DefaultCollectionRenderer,
	type ItemCollectionProps,
	usePersistedKeys,
} from './Collection';
import { SelectionIndicatorContext } from './SelectionIndicator';
import { SharedElementTransition } from './SharedElementTransition';
import {
	type ClassNameOrFunction,
	type ContextValue,
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
	useSlottedContext,
} from './utils';

// octane adaptation: structural bag (upstream's `GlobalDOMAttributes` drags React handler types).
type GlobalDOMAttributes = Record<string, any>;
type RefObject<T> = { current: T };

export interface TabsProps
	extends
		Omit<AriaTabListProps<any>, 'items' | 'children'>,
		RenderProps<TabsRenderProps>,
		SlotProps,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Tabs'
	 */
	className?: ClassNameOrFunction<TabsRenderProps>;
}

export interface TabsRenderProps {
	/**
	 * The orientation of the tabs.
	 *
	 * @selector [data-orientation="horizontal | vertical"]
	 */
	orientation: Orientation;
}

export interface TabListProps<T>
	extends
		StyleRenderProps<TabListRenderProps>,
		AriaLabelingProps,
		Omit<ItemCollectionProps<T>, 'disabledKeys'>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-TabList'
	 */
	className?: ClassNameOrFunction<TabListRenderProps>;
}

export interface TabListRenderProps {
	/**
	 * The orientation of the tab list.
	 *
	 * @selector [data-orientation="horizontal | vertical"]
	 */
	orientation: Orientation;
	/**
	 * State of the tab list.
	 */
	state: TabListState<unknown>;
}

export interface TabProps
	extends
		Omit<RenderProps<TabRenderProps>, 'render'>,
		PossibleLinkDOMRenderProps<'div', TabRenderProps>,
		AriaLabelingProps,
		LinkDOMProps,
		HoverEvents,
		FocusEvents,
		PressEvents,
		Omit<GlobalDOMAttributes, 'onClick'> {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-Tab'
	 */
	className?: ClassNameOrFunction<TabRenderProps>;
	/** The unique id of the tab. */
	id?: Key;
	/** Whether the tab is disabled. */
	isDisabled?: boolean;
}

export interface TabRenderProps {
	/**
	 * Whether the tab is currently hovered with a mouse.
	 *
	 * @selector [data-hovered]
	 */
	isHovered: boolean;
	/**
	 * Whether the tab is currently in a pressed state.
	 *
	 * @selector [data-pressed]
	 */
	isPressed: boolean;
	/**
	 * Whether the tab is currently selected.
	 *
	 * @selector [data-selected]
	 */
	isSelected: boolean;
	/**
	 * Whether the tab is currently focused.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the tab is currently keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the tab is disabled.
	 *
	 * @selector [data-disabled]
	 */
	isDisabled: boolean;
}

export interface TabPanelProps
	extends AriaTabPanelProps, RenderProps<TabPanelRenderProps>, GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element. A function may be provided to compute the class based on component state.
	 *
	 * @default 'react-aria-TabPanel'
	 */
	className?: ClassNameOrFunction<TabPanelRenderProps>;
	/**
	 * Whether to mount the tab panel in the DOM even when it is not currently selected. Inactive tab
	 * panels are inert and cannot be interacted with. They must be styled appropriately so this is
	 * clear to the user visually.
	 *
	 * @default false
	 */
	shouldForceMount?: boolean;
}

export interface TabPanelRenderProps {
	/**
	 * Whether the tab panel is currently focused.
	 *
	 * @selector [data-focused]
	 */
	isFocused: boolean;
	/**
	 * Whether the tab panel is currently keyboard focused.
	 *
	 * @selector [data-focus-visible]
	 */
	isFocusVisible: boolean;
	/**
	 * Whether the tab panel is currently non-interactive. This occurs when the
	 * `shouldForceMount` prop is true, and the corresponding tab is not selected.
	 *
	 * @selector [data-inert]
	 */
	isInert: boolean;
	/**
	 * Whether the tab panel is currently entering. Use this to apply animations.
	 *
	 * @selector [data-entering]
	 */
	isEntering: boolean;
	/**
	 * Whether the tab panel is currently exiting. Use this to apply animations.
	 *
	 * @selector [data-exiting]
	 */
	isExiting: boolean;
	/**
	 * State of the tab list.
	 */
	state: TabListState<unknown>;
}

export const TabsContext = createContext<ContextValue<TabsProps, HTMLDivElement>>(null);
export const TabListStateContext = createContext<TabListState<any> | null>(null);

/**
 * Tabs organize content into multiple sections and allow users to navigate between them.
 */
export function Tabs(props: TabsProps): any {
	const slot = S('Tabs');
	let ref: any;
	[props, ref] = useContextProps(props, props.ref, TabsContext, subSlot(slot, 'ctx'));
	let { children, orientation = 'horizontal' } = props;
	children = useMemo(
		() =>
			typeof children === 'function' ? children({ orientation, defaultChildren: null }) : children,
		[children, orientation],
		subSlot(slot, 'children'),
	);

	return createElement(CollectionBuilder, {
		content: children,
		children: (collection: ICollection<Node<any>>) =>
			createElement(TabsInner, { props, collection, tabsRef: ref }),
	});
}

interface TabsInnerProps {
	props: TabsProps;
	collection: ICollection<Node<any>>;
	tabsRef: RefObject<HTMLDivElement | null>;
}

function TabsInner({ props, tabsRef: ref, collection }: TabsInnerProps): any {
	const slot = S('TabsInner');
	let { orientation = 'horizontal' } = props;
	let state = useTabListState(
		{
			...props,
			collection,
			children: undefined,
		} as any,
		subSlot(slot, 'state'),
	);
	let { focusProps, isFocused, isFocusVisible } = useFocusRing(
		{ within: true },
		subSlot(slot, 'focusRing'),
	);
	let values = useMemo(
		() => ({
			orientation,
			isFocusWithin: isFocused,
			isFocusVisible,
		}),
		[orientation, isFocused, isFocusVisible],
		subSlot(slot, 'values'),
	);
	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-Tabs',
			values,
		} as any,
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });

	return createElement(dom.div, {
		...mergeProps(DOMProps, renderProps, focusProps),
		ref,
		slot: props.slot || undefined,
		'data-focused': isFocused || undefined,
		'data-orientation': orientation,
		'data-focus-visible': isFocusVisible || undefined,
		'data-disabled': state.isDisabled || undefined,
		children: createElement(Provider, {
			values: [
				[TabsContext, props],
				[TabListStateContext, state],
			] as any,
			children: renderProps.children,
		}),
	});
}

/**
 * A TabList is used within Tabs to group tabs that a user can switch between. The ids of the items
 * within the <TabList> must match up with a corresponding item inside the <TabPanels>.
 */
export function TabList<T extends object>(props: TabListProps<T>): any {
	let state = useContext(TabListStateContext);
	return state
		? createElement(TabListInner, { props, forwardedRef: (props as any).ref })
		: createElement(Collection, props as any);
}

interface TabListInnerProps<T> {
	props: TabListProps<T>;
	forwardedRef: any;
}

function TabListInner<T extends object>({ props, forwardedRef }: TabListInnerProps<T>): any {
	const slot = S('TabListInner');
	let state = useContext(TabListStateContext)!;
	let { CollectionRoot } = useContext(CollectionRendererContext);
	let { orientation = 'horizontal', keyboardActivation = 'automatic' } =
		useSlottedContext(TabsContext)!;
	let objectRef = useObjectRef<HTMLDivElement>(forwardedRef, subSlot(slot, 'objectRef'));

	let { tabListProps } = useTabList(
		{
			...props,
			orientation,
			keyboardActivation,
		} as any,
		state,
		objectRef,
		subSlot(slot, 'tabList'),
	);

	let renderProps = useRenderProps(
		{
			...props,
			children: null,
			defaultClassName: 'react-aria-TabList',
			values: {
				orientation,
				state,
			},
		} as any,
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(props, { global: true });
	delete DOMProps.id;

	let persistedKeys = usePersistedKeys(
		state.selectionManager.focusedKey,
		subSlot(slot, 'persisted'),
	);

	return createElement(dom.div, {
		...mergeProps(DOMProps, renderProps, tabListProps),
		ref: objectRef,
		'data-orientation': orientation || undefined,
		children: createElement(SharedElementTransition, {
			children: createElement(CollectionRoot, {
				collection: state.collection,
				persistedKeys,
			}),
		}),
	});
}

class TabItemNode extends CollectionNode<unknown> {
	static readonly type = 'item';
}

/**
 * A Tab provides a title for an individual item within a TabList.
 */
export const Tab: (props: TabProps & { ref?: any }) => any = createLeafComponent(
	TabItemNode,
	// The third (item) parameter is declared so `render.length === 3` keeps the
	// engine's "cannot be rendered outside a collection" guard; it is always
	// provided when rendered from a collection node.
	(props: TabProps, forwardedRef: any, item?: Node<unknown>): any => {
		const slot = S('Tab');
		let state = useContext(TabListStateContext)!;
		let ref = useObjectRef<any>(forwardedRef, subSlot(slot, 'objectRef'));
		let { tabProps, isSelected, isDisabled, isPressed } = useTab(
			{ key: item!.key, ...props },
			state,
			ref,
			subSlot(slot, 'tab'),
		);
		let { focusProps, isFocused, isFocusVisible } = useFocusRing(
			undefined,
			subSlot(slot, 'focusRing'),
		);
		let { hoverProps, isHovered } = useHover(
			{
				isDisabled,
				onHoverStart: props.onHoverStart,
				onHoverEnd: props.onHoverEnd,
				onHoverChange: props.onHoverChange,
			},
			subSlot(slot, 'hover'),
		);

		let renderProps = useRenderProps<TabRenderProps, any>(
			{
				...props,
				id: undefined,
				children: item!.rendered,
				defaultClassName: 'react-aria-Tab',
				values: {
					isSelected,
					isDisabled,
					isFocused,
					isFocusVisible,
					isPressed,
					isHovered,
				},
			} as any,
			subSlot(slot, 'render'),
		);

		let ElementType = item!.props.href ? dom.a : dom.div;
		let DOMProps = filterDOMProps(props as any, { global: true });
		delete DOMProps.id;
		delete DOMProps.onClick;

		return createElement(ElementType, {
			...mergeProps(DOMProps, renderProps, tabProps, focusProps, hoverProps),
			ref,
			'data-selected': isSelected || undefined,
			'data-disabled': isDisabled || undefined,
			'data-focused': isFocused || undefined,
			'data-focus-visible': isFocusVisible || undefined,
			'data-pressed': isPressed || undefined,
			'data-hovered': isHovered || undefined,
			children: createElement(SelectionIndicatorContext.Provider, {
				value: { isSelected },
				children: renderProps.children,
			}),
		});
	},
);

export interface TabPanelsProps<T>
	extends
		Omit<ItemCollectionProps<T>, 'disabledKeys'>,
		StyleProps,
		DOMRenderProps<'div', undefined>,
		GlobalDOMAttributes {
	/**
	 * The CSS [className](https://developer.mozilla.org/en-US/docs/Web/API/Element/className) for the
	 * element.
	 *
	 * @default 'react-aria-TabPanels'
	 */
	className?: string;
}

/**
 * Groups multiple `<TabPanel>` elements, and provides CSS variables for animated transitions.
 */
export const TabPanels: <T extends object>(props: TabPanelsProps<T> & { ref?: any }) => any =
	createHideableComponent(function TabPanels(props: TabPanelsProps<any>, forwardedRef: any): any {
		const slot = S('TabPanels');
		let state = useContext(TabListStateContext)!;
		let ref = useObjectRef<HTMLDivElement>(forwardedRef, subSlot(slot, 'objectRef'));

		let selectedKeyRef = useRef(state.selectedKey, subSlot(slot, 'selectedKey'));
		let prevSize = useRef<DOMRect | null>(null, subSlot(slot, 'prevSize'));
		let hasTransition = useRef<boolean | null>(null, subSlot(slot, 'hasTransition'));
		useLayoutEffect(
			() => {
				let el = ref.current;
				if (!el) {
					return;
				}

				if (hasTransition.current == null) {
					hasTransition.current = /width|height|block-size|inline-size|all/.test(
						window.getComputedStyle(el).transition,
					);
				}

				if (
					hasTransition.current &&
					selectedKeyRef.current != null &&
					selectedKeyRef.current !== state.selectedKey
				) {
					// Measure auto size.
					el.style.setProperty('--tab-panel-width', 'auto');
					el.style.setProperty('--tab-panel-height', 'auto');
					let { width, height } = el.getBoundingClientRect();

					if (
						prevSize.current &&
						(prevSize.current.width !== width || prevSize.current.height !== height)
					) {
						// Revert to previous size.
						el.style.setProperty('--tab-panel-width', prevSize.current.width + 'px');
						el.style.setProperty('--tab-panel-height', prevSize.current.height + 'px');

						// Force style re-calculation to trigger animations.
						window.getComputedStyle(el).height;

						// Animate to current pixel size.
						el.style.setProperty('--tab-panel-width', width + 'px');
						el.style.setProperty('--tab-panel-height', height + 'px');

						// When animations complete, revert back to auto size.
						Promise.all(el.getAnimations().map((a) => a.finished))
							.then(() => {
								el.style.setProperty('--tab-panel-width', 'auto');
								el.style.setProperty('--tab-panel-height', 'auto');
							})
							.catch(() => {});
					}
				}

				selectedKeyRef.current = state.selectedKey;
			},
			[ref, state.selectedKey],
			subSlot(slot, 'measure'),
		);

		// Store previous size before DOM updates occur.
		// This breaks the rules of hooks because there is no effect that runs _before_ DOM updates.
		if (
			state.selectedKey != null &&
			state.selectedKey !== selectedKeyRef.current &&
			ref.current &&
			hasTransition.current
		) {
			prevSize.current = ref.current.getBoundingClientRect();
		}

		let DOMProps = filterDOMProps(props, { labelable: true, global: true });
		delete DOMProps.id;

		return createElement(dom.div, {
			render: props.render,
			...DOMProps,
			ref,
			style: props.style,
			className: props.className || 'react-aria-TabPanels',
			children: createElement(Collection, props as any),
		});
	});

/**
 * A TabPanel provides the content for a tab.
 */
export const TabPanel: (props: TabPanelProps & { ref?: any }) => any = createHideableComponent(
	function TabPanel(props: TabPanelProps, forwardedRef: any): any {
		const slot = S('TabPanel');
		const state = useContext(TabListStateContext)!;
		let ref = useObjectRef<HTMLDivElement>(forwardedRef, subSlot(slot, 'objectRef'));

		// Track if the tab panel was initially selected on mount (after extra render to populate the collection).
		// In this case, we don't want to trigger animations.
		let isSelected = state.selectedKey === props.id;
		let [isInitiallySelected, setInitiallySelected] = useState<boolean | null>(
			state.selectedKey != null ? isSelected : null,
			subSlot(slot, 'initiallySelected'),
		);
		if (isInitiallySelected == null && state.selectedKey != null) {
			setInitiallySelected(isSelected);
		} else if (!isSelected && isInitiallySelected) {
			setInitiallySelected(false);
		}

		let isExiting = useExitAnimation(ref, isSelected, subSlot(slot, 'exit'));
		if (!isSelected && !props.shouldForceMount && !isExiting) {
			return null;
		}

		return createElement(TabPanelInner, {
			...props,
			tabPanelRef: ref,
			isInitiallySelected: isInitiallySelected || false,
			isExiting,
		});
	},
);

function TabPanelInner(
	props: TabPanelProps & {
		tabPanelRef: RefObject<HTMLDivElement | null>;
		isInitiallySelected: boolean;
		isExiting: boolean;
	},
): any {
	const slot = S('TabPanelInner');
	let state = useContext(TabListStateContext)!;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let { id, tabPanelRef: ref, isInitiallySelected, isExiting, ...otherProps } = props;
	let { tabPanelProps } = useTabPanel(props, state, ref, subSlot(slot, 'tabPanel'));
	let { focusProps, isFocused, isFocusVisible } = useFocusRing(
		undefined,
		subSlot(slot, 'focusRing'),
	);

	let isSelected = state.selectedKey === props.id;
	let isEntering =
		useEnterAnimation(ref, undefined, subSlot(slot, 'enter')) && !isInitiallySelected;
	let renderProps = useRenderProps(
		{
			...props,
			defaultClassName: 'react-aria-TabPanel',
			values: {
				isFocused,
				isFocusVisible,
				// octane adaptation: upstream `inertValue` is React <19 string compat; octane
				// follows React 19 boolean `inert` semantics.
				isInert: !isSelected,
				isEntering,
				isExiting,
				state,
			},
		} as any,
		subSlot(slot, 'render'),
	);

	let DOMProps = filterDOMProps(otherProps, { global: true });
	delete DOMProps.id;

	let domProps = isSelected
		? mergeProps(DOMProps, tabPanelProps, focusProps, renderProps)
		: mergeProps(DOMProps, renderProps);

	return createElement(dom.div, {
		...domProps,
		ref,
		'data-focused': isFocused || undefined,
		'data-focus-visible': isFocusVisible || undefined,
		inert: !isSelected || (props as any).inert || undefined,
		'data-inert': !isSelected ? 'true' : undefined,
		'data-entering': isEntering || undefined,
		'data-exiting': isExiting || undefined,
		children: createElement(Provider, {
			values: [
				[TabsContext, null],
				[TabListStateContext, null],
			] as any,
			children: createElement(CollectionRendererContext.Provider, {
				value: DefaultCollectionRenderer,
				children: renderProps.children,
			}),
		}),
	});
}
