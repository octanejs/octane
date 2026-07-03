// Ported from @radix-ui/react-navigation-menu (source:
// .radix-primitives/packages/react/navigation-menu/src/navigation-menu.tsx). A site
// navigation menu rendered INLINE — a `<nav>` with a list of triggers, per-item Content
// (composing DismissableLayer + a per-content FocusGroup), an optional shared Viewport
// that hosts the active content (content is proxied into it via ViewportContentMounter),
// and an Indicator portal'd into the list's indicator track. Features: delayed open on
// pointer move (`delayDuration`) with a skip-delay window (`skipDelayDuration`), a fixed
// 150ms close-intent timer, direction-aware `data-motion` attributes (`from-start`/
// `from-end`/`to-start`/`to-end`) computed from item order, arrow-key focus navigation
// between triggers/links (FocusGroup collections), tab-order proxying between trigger and
// content via a VisuallyHidden focus proxy, and `--radix-navigation-menu-viewport-
// width/height` CSS vars measured from the active content.
//
// octane adaptations (established across the other ports):
// - No forwardRef: `ref: forwardedRef` is destructured from props and composed with
//   `useComposedRefs`.
// - Fragments (`<>…</>`) → keyed arrays (see Trigger; conditional entries are dropped
//   rather than `null`-padded since every element is keyed).
// - `ReactDOM.createPortal` (Indicator → indicator track) → octane's
//   `createPortal`-as-a-value.
// - Events are NATIVE delegated DOM events: `whenMouse` reads the native
//   `PointerEvent.pointerType`, the focus proxy's `onFocus` reads the native
//   `FocusEvent.relatedTarget`, and `event.currentTarget` is the delegated target.
// - Explicit hook slots (S/subSlot) — plain-`.ts` components skip the compiler's
//   auto-slotting pass.
// - `useResizeObserver` gets the `typeof ResizeObserver === 'undefined'` guard (like
//   use-size.ts) for jsdom; there the initial observation a real ResizeObserver would
//   deliver on `observe()` is delivered on a 0-timeout instead (deferred like the rAF
//   path), so the indicator/viewport still receive their first measurement.
//
// - React's IMPLICIT same-element bailout, expressed explicitly where octane can:
//   the provider renders its children through a `memo()` pass-through (`MemoChildren`)
//   so identity-stable user children skip provider-state re-renders while consumers of
//   the CHANGED context refresh (octane's memo bail + per-context lazy propagation).
//   Two residual adaptations where octane's subtree re-rendering still differs from
//   React's implicit bail: (a) the source's standalone `ViewportContentMounter` is
//   inlined into Content (see the note there) and (b) `onViewportContentChange` bails
//   on shallow-equal registration data — both converge exactly where React does, with
//   identical observable registrations. See docs/react-parity-migration-plan.md.
// - `useResizeObserver` uses `useEffectEvent` (insertion-effect sync) instead of the
//   source's `useCallbackRef` (passive-effect sync): octane's passives are post-paint,
//   so a layout effect (or a timer it schedules) could observe a one-render-stale
//   closure; useEffectEvent is always current before layout effects run (and matches
//   the direction modern Radix is migrating anyway).
// - The FocusGroup collection is created under the name `NavigationMenuFocusGroup`
//   (the source reuses `NavigationMenu` for both collections, which makes the two
//   collections' scope keys collide when a `createNavigationMenuScope` scope is used;
//   distinct names keep them separate — identical behavior in the unscoped case).
// - `useControllableState`'s dev-only `caller` option is not ported (repo policy:
//   functional outcomes only).
import {
	createElement,
	createPortal,
	memo,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'octane';

import { createCollection } from './collection';
import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { useDirection } from './direction';
import { DismissableLayer } from './DismissableLayer';
import { S, subSlot } from './internal';
import { useEffectEvent } from './use-effect-event';
import { Presence } from './Presence';
import { dispatchDiscreteCustomEvent, Primitive } from './Primitive';
import { useCallbackRef } from './use-callback-ref';
import { usePrevious } from './use-previous';
import { useControllableState } from './useControllableState';
import { useId } from './useId';
import { VisuallyHidden } from './VisuallyHidden';

type Orientation = 'vertical' | 'horizontal';
type Direction = 'ltr' | 'rtl';

/* -------------------------------------------------------------------------------------------------
 * NavigationMenu
 * -----------------------------------------------------------------------------------------------*/

const NAVIGATION_MENU_NAME = 'NavigationMenu';

const [Collection, useCollection, createCollectionScope] = createCollection(NAVIGATION_MENU_NAME);

const [FocusGroupCollection, useFocusGroupCollection, createFocusGroupCollectionScope] =
	createCollection(NAVIGATION_MENU_NAME + 'FocusGroup');

const [createNavigationMenuContext, createNavigationMenuScope] = createContextScope(
	NAVIGATION_MENU_NAME,
	[createCollectionScope, createFocusGroupCollectionScope],
);
export { createNavigationMenuScope };

type ContentData = { ref?: any } & Record<string, any>;

interface NavigationMenuContextValue {
	isRootMenu: boolean;
	value: string;
	previousValue: string;
	baseId: string;
	dir: Direction;
	orientation: Orientation;
	rootNavigationMenu: HTMLElement | null;
	indicatorTrack: HTMLDivElement | null;
	onIndicatorTrackChange(indicatorTrack: HTMLDivElement | null): void;
	viewport: HTMLElement | null;
	onViewportChange(viewport: HTMLElement | null): void;
	onViewportContentChange(contentValue: string, contentData: ContentData): void;
	onViewportContentRemove(contentValue: string): void;
	onTriggerEnter(itemValue: string): void;
	onTriggerLeave(): void;
	onContentEnter(): void;
	onContentLeave(): void;
	onItemSelect(itemValue: string): void;
	onItemDismiss(): void;
}

const [NavigationMenuProviderImpl, useNavigationMenuContext] =
	createNavigationMenuContext<NavigationMenuContextValue>(NAVIGATION_MENU_NAME);

const [ViewportContentProvider, useViewportContentContext] = createNavigationMenuContext<{
	items: Map<string, ContentData>;
}>(NAVIGATION_MENU_NAME);

export function Root(props: any): any {
	const slot = S('NavigationMenu.Root');
	const {
		__scopeNavigationMenu,
		value: valueProp,
		onValueChange,
		defaultValue,
		delayDuration = 200,
		skipDelayDuration = 300,
		orientation = 'horizontal',
		dir,
		ref: forwardedRef,
		...navigationMenuProps
	} = props ?? {};
	const [navigationMenu, setNavigationMenu] = useState<HTMLElement | null>(
		null,
		subSlot(slot, 'nav'),
	);
	const composedRef = useComposedRefs(forwardedRef, setNavigationMenu, subSlot(slot, 'refs'));
	const direction = useDirection(dir);
	const openTimerRef = useRef(0, subSlot(slot, 'openTimer'));
	const closeTimerRef = useRef(0, subSlot(slot, 'closeTimer'));
	const skipDelayTimerRef = useRef(0, subSlot(slot, 'skipTimer'));
	const [isOpenDelayed, setIsOpenDelayed] = useState(true, subSlot(slot, 'delayed'));
	const [value, setValue] = useControllableState<string>(
		{
			prop: valueProp,
			onChange: (value: string) => {
				const isOpen = value !== '';
				const hasSkipDelayDuration = skipDelayDuration > 0;

				if (isOpen) {
					window.clearTimeout(skipDelayTimerRef.current);
					if (hasSkipDelayDuration) setIsOpenDelayed(false);
				} else {
					window.clearTimeout(skipDelayTimerRef.current);
					skipDelayTimerRef.current = window.setTimeout(
						() => setIsOpenDelayed(true),
						skipDelayDuration,
					);
				}

				onValueChange?.(value);
			},
			defaultProp: defaultValue ?? '',
		},
		subSlot(slot, 'value'),
	);

	const startCloseTimer = useCallback(
		() => {
			window.clearTimeout(closeTimerRef.current);
			closeTimerRef.current = window.setTimeout(() => setValue(''), 150);
		},
		[setValue],
		subSlot(slot, 'closeTimerCb'),
	);

	const handleOpen = useCallback(
		(itemValue: string) => {
			window.clearTimeout(closeTimerRef.current);
			setValue(itemValue);
		},
		[setValue],
		subSlot(slot, 'open'),
	);

	const handleDelayedOpen = useCallback(
		(itemValue: string) => {
			const isOpenItem = value === itemValue;
			if (isOpenItem) {
				// If the item is already open (e.g. we're transitioning from the content to the
				// trigger) then we want to clear the close timer immediately.
				window.clearTimeout(closeTimerRef.current);
			} else {
				openTimerRef.current = window.setTimeout(() => {
					window.clearTimeout(closeTimerRef.current);
					setValue(itemValue);
				}, delayDuration);
			}
		},
		[value, setValue, delayDuration],
		subSlot(slot, 'delayedOpen'),
	);

	useEffect(
		() => {
			return () => {
				window.clearTimeout(openTimerRef.current);
				window.clearTimeout(closeTimerRef.current);
				window.clearTimeout(skipDelayTimerRef.current);
			};
		},
		[],
		subSlot(slot, 'e:timers'),
	);

	return createElement(NavigationMenuProvider, {
		scope: __scopeNavigationMenu,
		isRootMenu: true,
		value,
		dir: direction,
		orientation,
		rootNavigationMenu: navigationMenu,
		onTriggerEnter: (itemValue: string) => {
			window.clearTimeout(openTimerRef.current);
			if (isOpenDelayed) handleDelayedOpen(itemValue);
			else handleOpen(itemValue);
		},
		onTriggerLeave: () => {
			window.clearTimeout(openTimerRef.current);
			startCloseTimer();
		},
		onContentEnter: () => window.clearTimeout(closeTimerRef.current),
		onContentLeave: startCloseTimer,
		onItemSelect: (itemValue: string) => {
			setValue((prevValue) => (prevValue === itemValue ? '' : itemValue));
		},
		onItemDismiss: () => setValue(''),
		children: createElement(Primitive.nav, {
			'aria-label': 'Main',
			'data-orientation': orientation,
			dir: direction,
			...navigationMenuProps,
			ref: composedRef,
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * NavigationMenuSub
 * -----------------------------------------------------------------------------------------------*/

const SUB_NAME = 'NavigationMenuSub';

export function Sub(props: any): any {
	const slot = S('NavigationMenu.Sub');
	const {
		__scopeNavigationMenu,
		value: valueProp,
		onValueChange,
		defaultValue,
		orientation = 'horizontal',
		ref: forwardedRef,
		...subProps
	} = props ?? {};
	const context = useNavigationMenuContext(SUB_NAME, __scopeNavigationMenu);
	const [value, setValue] = useControllableState<string>(
		{
			prop: valueProp,
			onChange: onValueChange,
			defaultProp: defaultValue ?? '',
		},
		subSlot(slot, 'value'),
	);

	return createElement(NavigationMenuProvider, {
		scope: __scopeNavigationMenu,
		isRootMenu: false,
		value,
		dir: context.dir,
		orientation,
		rootNavigationMenu: context.rootNavigationMenu,
		onTriggerEnter: (itemValue: string) => setValue(itemValue),
		onItemSelect: (itemValue: string) => setValue(itemValue),
		onItemDismiss: () => setValue(''),
		children: createElement(Primitive.div, {
			'data-orientation': orientation,
			...subProps,
			ref: forwardedRef,
		}),
	});
}

/* -----------------------------------------------------------------------------------------------*/

// React parity: the provider subtree bails on identity-stable children while context
// consumers refresh per-context (see the file header). memo() rides octane's existing
// bail + refreshContextConsumers machinery.
const MemoChildren = memo(function MemoChildren(props: any) {
	return props.children;
});

function NavigationMenuProvider(props: any): any {
	const slot = S('NavigationMenu.Provider');
	const {
		scope,
		isRootMenu,
		rootNavigationMenu,
		dir,
		orientation,
		children,
		value,
		onItemSelect,
		onItemDismiss,
		onTriggerEnter,
		onTriggerLeave,
		onContentEnter,
		onContentLeave,
	} = props;
	const [viewport, setViewport] = useState<HTMLElement | null>(null, subSlot(slot, 'viewport'));
	const [viewportContent, setViewportContent] = useState<Map<string, ContentData>>(
		new Map(),
		subSlot(slot, 'content'),
	);
	const [indicatorTrack, setIndicatorTrack] = useState<HTMLDivElement | null>(
		null,
		subSlot(slot, 'track'),
	);

	return createElement(NavigationMenuProviderImpl, {
		scope,
		isRootMenu,
		rootNavigationMenu,
		value,
		previousValue: usePrevious(value, subSlot(slot, 'prev')),
		baseId: useId(subSlot(slot, 'id')),
		dir,
		orientation,
		viewport,
		onViewportChange: setViewport,
		indicatorTrack,
		onIndicatorTrackChange: setIndicatorTrack,
		onTriggerEnter: useCallbackRef(onTriggerEnter, subSlot(slot, 'triggerEnter')),
		onTriggerLeave: useCallbackRef(onTriggerLeave, subSlot(slot, 'triggerLeave')),
		onContentEnter: useCallbackRef(onContentEnter, subSlot(slot, 'contentEnter')),
		onContentLeave: useCallbackRef(onContentLeave, subSlot(slot, 'contentLeave')),
		onItemSelect: useCallbackRef(onItemSelect, subSlot(slot, 'itemSelect')),
		onItemDismiss: useCallbackRef(onItemDismiss, subSlot(slot, 'itemDismiss')),
		onViewportContentChange: useCallback(
			(contentValue: string, contentData: ContentData) => {
				setViewportContent((prevContent) => {
					// octane adaptation (documented, see file header): convergence bail. Even
					// with the MemoChildren element bail, octane's subtree re-rendering plus
					// the Presence/viewport interplay lets the register cascade oscillate
					// (Content's return flips Presence ⟷ ViewportContentMounter as
					// `context.viewport` detaches/re-attaches mid-cascade) — React's implicit
					// same-element bailout stops the cycle one level deeper than memo() can
					// express here. The registered data's values are identity-stable across
					// these cascades, so a shallow-equality bail converges exactly where
					// React does, with identical observable registrations.
					const prevData = prevContent.get(contentValue);
					if (prevData && shallowEqual(prevData, contentData)) return prevContent;
					prevContent.set(contentValue, contentData);
					return new Map(prevContent);
				});
			},
			[],
			subSlot(slot, 'vcChange'),
		),
		onViewportContentRemove: useCallback(
			(contentValue: string) => {
				setViewportContent((prevContent) => {
					if (!prevContent.has(contentValue)) return prevContent;
					prevContent.delete(contentValue);
					return new Map(prevContent);
				});
			},
			[],
			subSlot(slot, 'vcRemove'),
		),
		children: createElement(Collection.Provider, {
			scope,
			children: createElement(ViewportContentProvider, {
				scope,
				items: viewportContent,
				children: createElement(MemoChildren, { children }),
			}),
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * NavigationMenuList
 * -----------------------------------------------------------------------------------------------*/

const LIST_NAME = 'NavigationMenuList';

export function List(props: any): any {
	const { __scopeNavigationMenu, ref: forwardedRef, ...listProps } = props ?? {};
	const context = useNavigationMenuContext(LIST_NAME, __scopeNavigationMenu);

	const list = createElement(Primitive.ul, {
		'data-orientation': context.orientation,
		...listProps,
		ref: forwardedRef,
	});

	return createElement(Primitive.div, {
		style: { position: 'relative' },
		ref: context.onIndicatorTrackChange,
		children: createElement(Collection.Slot, {
			scope: __scopeNavigationMenu,
			children: context.isRootMenu
				? createElement(FocusGroup, { asChild: true, children: list })
				: list,
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * NavigationMenuItem
 * -----------------------------------------------------------------------------------------------*/

const ITEM_NAME = 'NavigationMenuItem';

interface NavigationMenuItemContextValue {
	value: string;
	triggerRef: { current: HTMLElement | null };
	contentRef: { current: HTMLElement | null };
	focusProxyRef: { current: HTMLElement | null };
	wasEscapeCloseRef: { current: boolean };
	onEntryKeyDown(): void;
	onFocusProxyEnter(side: 'start' | 'end'): void;
	onRootContentClose(): void;
	onContentFocusOutside(): void;
}

const [NavigationMenuItemContextProvider, useNavigationMenuItemContext] =
	createNavigationMenuContext<NavigationMenuItemContextValue>(ITEM_NAME);

export function Item(props: any): any {
	const slot = S('NavigationMenu.Item');
	const { __scopeNavigationMenu, value: valueProp, ref: forwardedRef, ...itemProps } = props ?? {};
	const autoValue = useId(subSlot(slot, 'id'));
	// We need to provide an initial deterministic value as `useId` will return
	// empty string on the first render and we don't want to match our internal "closed" value.
	const value = valueProp || autoValue || 'LEGACY_REACT_AUTO_VALUE';
	const contentRef = useRef<HTMLElement | null>(null, subSlot(slot, 'content'));
	const triggerRef = useRef<HTMLElement | null>(null, subSlot(slot, 'trigger'));
	const focusProxyRef = useRef<HTMLElement | null>(null, subSlot(slot, 'proxy'));
	const restoreContentTabOrderRef = useRef<() => void>(() => {}, subSlot(slot, 'restore'));
	const wasEscapeCloseRef = useRef(false, subSlot(slot, 'escape'));

	const handleContentEntry = useCallback(
		(side = 'start') => {
			if (contentRef.current) {
				restoreContentTabOrderRef.current();
				const candidates = getTabbableCandidates(contentRef.current);
				if (candidates.length) focusFirst(side === 'start' ? candidates : candidates.reverse());
			}
		},
		[],
		subSlot(slot, 'entry'),
	);

	const handleContentExit = useCallback(
		() => {
			if (contentRef.current) {
				const candidates = getTabbableCandidates(contentRef.current);
				if (candidates.length) restoreContentTabOrderRef.current = removeFromTabOrder(candidates);
			}
		},
		[],
		subSlot(slot, 'exit'),
	);

	return createElement(NavigationMenuItemContextProvider, {
		scope: __scopeNavigationMenu,
		value,
		triggerRef,
		contentRef,
		focusProxyRef,
		wasEscapeCloseRef,
		onEntryKeyDown: handleContentEntry,
		onFocusProxyEnter: handleContentEntry,
		onRootContentClose: handleContentExit,
		onContentFocusOutside: handleContentExit,
		children: createElement(Primitive.li, { ...itemProps, ref: forwardedRef }),
	});
}

/* -------------------------------------------------------------------------------------------------
 * NavigationMenuTrigger
 * -----------------------------------------------------------------------------------------------*/

const TRIGGER_NAME = 'NavigationMenuTrigger';

export function Trigger(props: any): any {
	const slot = S('NavigationMenu.Trigger');
	const { __scopeNavigationMenu, disabled, ref: forwardedRef, ...triggerProps } = props ?? {};
	const context = useNavigationMenuContext(TRIGGER_NAME, props?.__scopeNavigationMenu);
	const itemContext = useNavigationMenuItemContext(TRIGGER_NAME, props?.__scopeNavigationMenu);
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(
		ref,
		itemContext.triggerRef,
		forwardedRef,
		subSlot(slot, 'refs'),
	);
	const triggerId = makeTriggerId(context.baseId, itemContext.value);
	const contentId = makeContentId(context.baseId, itemContext.value);
	const hasPointerMoveOpenedRef = useRef(false, subSlot(slot, 'moveOpened'));
	const wasClickCloseRef = useRef(false, subSlot(slot, 'clickClose'));
	const open = itemContext.value === context.value;

	// Source is a fragment; octane: keyed array.
	return [
		createElement(Collection.ItemSlot, {
			key: 'trigger',
			scope: __scopeNavigationMenu,
			value: itemContext.value,
			children: createElement(FocusGroupItem, {
				asChild: true,
				children: createElement(Primitive.button, {
					id: triggerId,
					disabled,
					'data-disabled': disabled ? '' : undefined,
					'data-state': getOpenState(open),
					'aria-expanded': open,
					'aria-controls': open ? contentId : undefined,
					...triggerProps,
					ref: composedRefs,
					onPointerEnter: composeEventHandlers(props?.onPointerEnter, () => {
						wasClickCloseRef.current = false;
						itemContext.wasEscapeCloseRef.current = false;
					}),
					onPointerMove: composeEventHandlers(
						props?.onPointerMove,
						whenMouse(() => {
							if (
								disabled ||
								wasClickCloseRef.current ||
								itemContext.wasEscapeCloseRef.current ||
								hasPointerMoveOpenedRef.current
							)
								return;
							context.onTriggerEnter(itemContext.value);
							hasPointerMoveOpenedRef.current = true;
						}),
					),
					onPointerLeave: composeEventHandlers(
						props?.onPointerLeave,
						whenMouse(() => {
							if (disabled) return;
							context.onTriggerLeave();
							hasPointerMoveOpenedRef.current = false;
						}),
					),
					onClick: composeEventHandlers(props?.onClick, () => {
						context.onItemSelect(itemContext.value);
						wasClickCloseRef.current = open;
					}),
					onKeyDown: composeEventHandlers(props?.onKeyDown, (event: KeyboardEvent) => {
						const verticalEntryKey = context.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
						const entryKey = { horizontal: 'ArrowDown', vertical: verticalEntryKey }[
							context.orientation
						];
						if (open && event.key === entryKey) {
							itemContext.onEntryKeyDown();
							// Prevent FocusGroupItem from handling the event
							event.preventDefault();
						}
					}),
				}),
			}),
		}),

		// Proxy tab order between trigger and content
		open
			? createElement(VisuallyHidden, {
					key: 'proxy',
					'aria-hidden': true,
					tabIndex: 0,
					ref: itemContext.focusProxyRef,
					onFocus: (event: FocusEvent) => {
						const content = itemContext.contentRef.current;
						const prevFocusedElement = event.relatedTarget as HTMLElement | null;
						const wasTriggerFocused = prevFocusedElement === ref.current;
						const wasFocusFromContent = content?.contains(prevFocusedElement);

						if (wasTriggerFocused || !wasFocusFromContent) {
							itemContext.onFocusProxyEnter(wasTriggerFocused ? 'start' : 'end');
						}
					},
				})
			: null,

		// Restructure a11y tree to make content accessible to screen reader when using the viewport
		open && context.viewport
			? createElement('span', { key: 'owns', 'aria-owns': contentId })
			: null,
		// The conditional slots are dropped (not `null`-padded): every element is keyed, so
		// octane reconciles by key and doesn't warn about unkeyed array holes.
	].filter(Boolean);
}

/* -------------------------------------------------------------------------------------------------
 * NavigationMenuLink
 * -----------------------------------------------------------------------------------------------*/

const LINK_SELECT = 'navigationMenu.linkSelect';

export function Link(props: any): any {
	const { __scopeNavigationMenu, active, onSelect, ref: forwardedRef, ...linkProps } = props ?? {};

	return createElement(FocusGroupItem, {
		asChild: true,
		children: createElement(Primitive.a, {
			'data-active': active ? '' : undefined,
			'aria-current': active ? 'page' : undefined,
			...linkProps,
			ref: forwardedRef,
			onClick: composeEventHandlers(
				props?.onClick,
				(event: MouseEvent) => {
					const target = event.target as HTMLElement;
					const linkSelectEvent = new CustomEvent(LINK_SELECT, {
						bubbles: true,
						cancelable: true,
					});
					target.addEventListener(LINK_SELECT, (event) => onSelect?.(event), { once: true });
					dispatchDiscreteCustomEvent(target, linkSelectEvent);

					if (!linkSelectEvent.defaultPrevented && !event.metaKey) {
						const rootContentDismissEvent = new CustomEvent(ROOT_CONTENT_DISMISS, {
							bubbles: true,
							cancelable: true,
						});
						dispatchDiscreteCustomEvent(target, rootContentDismissEvent);
					}
				},
				{ checkForDefaultPrevented: false },
			),
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * NavigationMenuIndicator
 * -----------------------------------------------------------------------------------------------*/

const INDICATOR_NAME = 'NavigationMenuIndicator';

export function Indicator(props: any): any {
	const { forceMount, ...indicatorProps } = props ?? {};
	const context = useNavigationMenuContext(INDICATOR_NAME, props?.__scopeNavigationMenu);
	const isVisible = Boolean(context.value);

	// React's ReactDOM.createPortal → octane's createPortal-as-a-value.
	return context.indicatorTrack
		? createPortal(
				createElement(Presence, {
					present: forceMount || isVisible,
					children: createElement(NavigationMenuIndicatorImpl, { ...indicatorProps }),
				}),
				context.indicatorTrack,
			)
		: null;
}

function NavigationMenuIndicatorImpl(props: any): any {
	const slot = S('NavigationMenu.IndicatorImpl');
	const { __scopeNavigationMenu, ref: forwardedRef, ...indicatorProps } = props ?? {};
	const context = useNavigationMenuContext(INDICATOR_NAME, __scopeNavigationMenu);
	const getItems = useCollection(__scopeNavigationMenu, subSlot(slot, 'items'));
	const [activeTrigger, setActiveTrigger] = useState<HTMLElement | null>(
		null,
		subSlot(slot, 'active'),
	);
	const [position, setPosition] = useState<{ size: number; offset: number } | null>(
		null,
		subSlot(slot, 'position'),
	);
	const isHorizontal = context.orientation === 'horizontal';
	const isVisible = Boolean(context.value);

	useEffect(
		() => {
			const items = getItems();
			const triggerNode = items.find((item: any) => item.value === context.value)?.ref.current;
			if (triggerNode) setActiveTrigger(triggerNode);
		},
		[getItems, context.value],
		subSlot(slot, 'e:active'),
	);

	/**
	 * Update position when the indicator or parent track size changes
	 */
	const handlePositionChange = (): void => {
		if (activeTrigger) {
			setPosition({
				size: isHorizontal ? activeTrigger.offsetWidth : activeTrigger.offsetHeight,
				offset: isHorizontal ? activeTrigger.offsetLeft : activeTrigger.offsetTop,
			});
		}
	};
	useResizeObserver(activeTrigger, handlePositionChange, subSlot(slot, 'ro:trigger'));
	useResizeObserver(context.indicatorTrack, handlePositionChange, subSlot(slot, 'ro:track'));

	// We need to wait for the indicator position to be available before rendering to
	// snap immediately into position rather than transitioning from initial
	return position
		? createElement(Primitive.div, {
				'aria-hidden': true,
				'data-state': isVisible ? 'visible' : 'hidden',
				'data-orientation': context.orientation,
				...indicatorProps,
				ref: forwardedRef,
				style: {
					position: 'absolute',
					...(isHorizontal
						? {
								left: 0,
								width: position.size + 'px',
								transform: `translateX(${position.offset}px)`,
							}
						: {
								top: 0,
								height: position.size + 'px',
								transform: `translateY(${position.offset}px)`,
							}),
					...indicatorProps.style,
				},
			})
		: null;
}

/* -------------------------------------------------------------------------------------------------
 * NavigationMenuContent
 * -----------------------------------------------------------------------------------------------*/

const CONTENT_NAME = 'NavigationMenuContent';

export function Content(props: any): any {
	const slot = S('NavigationMenu.Content');
	const { forceMount, ref: forwardedRef, ...contentProps } = props ?? {};
	const context = useNavigationMenuContext(CONTENT_NAME, props?.__scopeNavigationMenu);
	const itemContext = useNavigationMenuItemContext(CONTENT_NAME, props?.__scopeNavigationMenu);
	const composedRefs = useComposedRefs(itemContext.contentRef, forwardedRef, subSlot(slot, 'refs'));
	const open = itemContext.value === context.value;

	const commonProps = {
		value: itemContext.value,
		triggerRef: itemContext.triggerRef,
		focusProxyRef: itemContext.focusProxyRef,
		wasEscapeCloseRef: itemContext.wasEscapeCloseRef,
		onContentFocusOutside: itemContext.onContentFocusOutside,
		onRootContentClose: itemContext.onRootContentClose,
		...contentProps,
	};

	// octane adaptation (documented, see file header): the source's standalone
	// `ViewportContentMounter` (:808-828) is INLINED — its two layout effects run in
	// Content (a stable instance) behind octane's conditional-hooks capability, keyed
	// on `inViewport` so flipping out of viewport mode unregisters exactly when the
	// source's mounter would unmount. The remove effect is ordered BEFORE the register
	// effect so a false→true transition registers last.
	const inViewport = Boolean(context.viewport);
	const { onViewportContentChange, onViewportContentRemove } = context;
	const contentData: ContentData = { forceMount, ...commonProps, ref: composedRefs };

	useLayoutEffect(
		() => {
			return () => onViewportContentRemove(contentData.value);
		},
		[inViewport, contentData.value, onViewportContentRemove],
		subSlot(slot, 'e:vcRemove'),
	);

	useLayoutEffect(
		() => {
			if (inViewport) onViewportContentChange(contentData.value, contentData);
		},
		[inViewport, contentData, onViewportContentChange],
		subSlot(slot, 'e:vcChange'),
	);

	if (!inViewport) {
		return createElement(Presence, {
			present: forceMount || open,
			children: createElement(NavigationMenuContentImpl, {
				'data-state': getOpenState(open),
				...commonProps,
				ref: composedRefs,
				onPointerEnter: composeEventHandlers(props?.onPointerEnter, context.onContentEnter),
				onPointerLeave: composeEventHandlers(
					props?.onPointerLeave,
					whenMouse(context.onContentLeave),
				),
				style: {
					// Prevent interaction when animating out
					pointerEvents: !open && context.isRootMenu ? 'none' : undefined,
					...commonProps.style,
				},
			}),
		});
	}
	// Content is proxied into the viewport.
	return null;
}

/* -----------------------------------------------------------------------------------------------*/

const ROOT_CONTENT_DISMISS = 'navigationMenu.rootContentDismiss';

function shallowEqual(a: Record<string, any>, b: Record<string, any>): boolean {
	const ka = Object.keys(a);
	const kb = Object.keys(b);
	if (ka.length !== kb.length) return false;
	for (const k of ka) {
		if (!Object.is(a[k], b[k])) return false;
	}
	return true;
}

type MotionAttribute = 'to-start' | 'to-end' | 'from-start' | 'from-end';

function NavigationMenuContentImpl(props: any): any {
	const slot = S('NavigationMenu.ContentImpl');
	const {
		__scopeNavigationMenu,
		value,
		triggerRef,
		focusProxyRef,
		wasEscapeCloseRef,
		onRootContentClose,
		onContentFocusOutside,
		ref: forwardedRef,
		...contentProps
	} = props ?? {};
	const context = useNavigationMenuContext(CONTENT_NAME, __scopeNavigationMenu);
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(ref, forwardedRef, subSlot(slot, 'refs'));
	const triggerId = makeTriggerId(context.baseId, value);
	const contentId = makeContentId(context.baseId, value);
	const getItems = useCollection(__scopeNavigationMenu, subSlot(slot, 'items'));
	const prevMotionAttributeRef = useRef<MotionAttribute | null>(null, subSlot(slot, 'prevMotion'));

	const { onItemDismiss } = context;

	useEffect(
		() => {
			const content = ref.current;

			// Bubble dismiss to the root content node and focus its trigger
			if (context.isRootMenu && content) {
				const handleClose = (): void => {
					onItemDismiss();
					onRootContentClose();
					if (content.contains(document.activeElement)) triggerRef.current?.focus();
				};
				content.addEventListener(ROOT_CONTENT_DISMISS, handleClose);
				return () => content.removeEventListener(ROOT_CONTENT_DISMISS, handleClose);
			}
		},
		[context.isRootMenu, value, triggerRef, onItemDismiss, onRootContentClose],
		subSlot(slot, 'e:dismiss'),
	);

	const motionAttribute = useMemo(
		() => {
			const items = getItems();
			const values = items.map((item: any) => item.value);
			if (context.dir === 'rtl') values.reverse();
			const index = values.indexOf(context.value);
			const prevIndex = values.indexOf(context.previousValue);
			const isSelected = value === context.value;
			const wasSelected = prevIndex === values.indexOf(value);

			// We only want to update selected and the last selected content
			// this avoids animations being interrupted outside of that range
			if (!isSelected && !wasSelected) return prevMotionAttributeRef.current;

			const attribute = (() => {
				// Don't provide a direction on the initial open
				if (index !== prevIndex) {
					// If we're moving to this item from another
					if (isSelected && prevIndex !== -1) return index > prevIndex ? 'from-end' : 'from-start';
					// If we're leaving this item for another
					if (wasSelected && index !== -1) return index > prevIndex ? 'to-start' : 'to-end';
				}
				// Otherwise we're entering from closed or leaving the list
				// entirely and should not animate in any direction
				return null;
			})() as MotionAttribute | null;

			prevMotionAttributeRef.current = attribute;
			return attribute;
		},
		[context.previousValue, context.value, context.dir, getItems, value],
		subSlot(slot, 'm:motion'),
	);

	return createElement(FocusGroup, {
		asChild: true,
		children: createElement(DismissableLayer, {
			id: contentId,
			'aria-labelledby': triggerId,
			'data-motion': motionAttribute,
			'data-orientation': context.orientation,
			...contentProps,
			ref: composedRefs,
			disableOutsidePointerEvents: false,
			onDismiss: () => {
				const rootContentDismissEvent = new Event(ROOT_CONTENT_DISMISS, {
					bubbles: true,
					cancelable: true,
				});
				ref.current?.dispatchEvent(rootContentDismissEvent);
			},
			onFocusOutside: composeEventHandlers(props?.onFocusOutside, (event: any) => {
				onContentFocusOutside();
				const target = event.target as HTMLElement;
				// Only dismiss content when focus moves outside of the menu
				if (context.rootNavigationMenu?.contains(target)) event.preventDefault();
			}),
			onPointerDownOutside: composeEventHandlers(props?.onPointerDownOutside, (event: any) => {
				const target = event.target as HTMLElement;
				const isTrigger = getItems().some((item: any) => item.ref.current?.contains(target));
				const isRootViewport = context.isRootMenu && context.viewport?.contains(target);
				if (isTrigger || isRootViewport || !context.isRootMenu) event.preventDefault();
			}),
			onKeyDown: composeEventHandlers(props?.onKeyDown, (event: KeyboardEvent) => {
				const isMetaKey = event.altKey || event.ctrlKey || event.metaKey;
				const isTabKey = event.key === 'Tab' && !isMetaKey;
				if (isTabKey) {
					const candidates = getTabbableCandidates(event.currentTarget as HTMLElement);
					const focusedElement = document.activeElement;
					const index = candidates.findIndex((candidate) => candidate === focusedElement);
					const isMovingBackwards = event.shiftKey;
					const nextCandidates = isMovingBackwards
						? candidates.slice(0, index).reverse()
						: candidates.slice(index + 1, candidates.length);

					if (focusFirst(nextCandidates)) {
						// prevent browser tab keydown because we've handled focus
						event.preventDefault();
					} else {
						// If we can't focus that means we're at the edges
						// so focus the proxy and let browser handle
						// tab/shift+tab keypress on the proxy instead
						focusProxyRef.current?.focus();
					}
				}
			}),
			onEscapeKeyDown: composeEventHandlers(props?.onEscapeKeyDown, (_event: Event) => {
				// prevent the dropdown from reopening
				// after the escape key has been pressed
				wasEscapeCloseRef.current = true;
			}),
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * NavigationMenuViewport
 * -----------------------------------------------------------------------------------------------*/

const VIEWPORT_NAME = 'NavigationMenuViewport';

export function Viewport(props: any): any {
	const { forceMount, ...viewportProps } = props ?? {};
	const context = useNavigationMenuContext(VIEWPORT_NAME, props?.__scopeNavigationMenu);
	const open = Boolean(context.value);

	return createElement(Presence, {
		present: forceMount || open,
		children: createElement(NavigationMenuViewportImpl, { ...viewportProps }),
	});
}

/* -----------------------------------------------------------------------------------------------*/

function NavigationMenuViewportImpl(props: any): any {
	const slot = S('NavigationMenu.ViewportImpl');
	const { __scopeNavigationMenu, children, ref: forwardedRef, ...viewportImplProps } = props ?? {};
	const context = useNavigationMenuContext(VIEWPORT_NAME, __scopeNavigationMenu);
	const composedRefs = useComposedRefs(
		forwardedRef,
		context.onViewportChange,
		subSlot(slot, 'refs'),
	);
	const viewportContentContext = useViewportContentContext(
		CONTENT_NAME,
		props?.__scopeNavigationMenu,
	);
	const [size, setSize] = useState<{ width: number; height: number } | null>(
		null,
		subSlot(slot, 'size'),
	);
	const [content, setContent] = useState<HTMLElement | null>(null, subSlot(slot, 'content'));
	const viewportWidth = size ? size?.width + 'px' : undefined;
	const viewportHeight = size ? size?.height + 'px' : undefined;
	const open = Boolean(context.value);
	// We persist the last active content value as the viewport may be animating out
	// and we want the content to remain mounted for the lifecycle of the viewport.
	const activeContentValue = open ? context.value : context.previousValue;

	/**
	 * Update viewport size to match the active content node.
	 * We prefer offset dimensions over `getBoundingClientRect` as the latter respects CSS transform.
	 * For example, if content animates in from `scale(0.5)` the dimensions would be anything
	 * from `0.5` to `1` of the intended size.
	 */
	const handleSizeChange = (): void => {
		if (content) setSize({ width: content.offsetWidth, height: content.offsetHeight });
	};
	useResizeObserver(content, handleSizeChange, subSlot(slot, 'ro:content'));

	return createElement(Primitive.div, {
		'data-state': getOpenState(open),
		'data-orientation': context.orientation,
		...viewportImplProps,
		ref: composedRefs,
		style: {
			// Prevent interaction when animating out
			pointerEvents: !open && context.isRootMenu ? 'none' : undefined,
			'--radix-navigation-menu-viewport-width': viewportWidth,
			'--radix-navigation-menu-viewport-height': viewportHeight,
			...viewportImplProps.style,
		},
		onPointerEnter: composeEventHandlers(props?.onPointerEnter, context.onContentEnter),
		onPointerLeave: composeEventHandlers(props?.onPointerLeave, whenMouse(context.onContentLeave)),
		children: Array.from(viewportContentContext.items).map(
			([value, { ref, forceMount, ...props }]) => {
				const isActive = activeContentValue === value;
				return createElement(Presence, {
					key: value,
					present: forceMount || isActive,
					children: createElement(NavigationMenuViewportItem, {
						...props,
						contentRef: ref,
						isActive,
						onActiveContentChange: setContent,
					}),
				});
			},
		),
	});
}

/* -----------------------------------------------------------------------------------------------*/

function NavigationMenuViewportItem(props: any): any {
	const slot = S('NavigationMenu.ViewportItem');
	const { contentRef, isActive, onActiveContentChange, ...itemProps } = props ?? {};
	const handleContentChange = useCallback(
		(node: HTMLElement | null) => {
			// We only want to update the stored node when another is available
			// as we need to smoothly transition between them.
			if (isActive && node) {
				onActiveContentChange(node);
			}
		},
		[isActive, onActiveContentChange],
		subSlot(slot, 'change'),
	);
	const composedRefs = useComposedRefs(contentRef, handleContentChange, subSlot(slot, 'refs'));
	return createElement(NavigationMenuContentImpl, { ...itemProps, ref: composedRefs });
}

/* -----------------------------------------------------------------------------------------------*/

const FOCUS_GROUP_NAME = 'FocusGroup';

function FocusGroup(props: any): any {
	const { __scopeNavigationMenu, ...groupProps } = props ?? {};
	const context = useNavigationMenuContext(FOCUS_GROUP_NAME, __scopeNavigationMenu);

	return createElement(FocusGroupCollection.Provider, {
		scope: __scopeNavigationMenu,
		children: createElement(FocusGroupCollection.Slot, {
			scope: __scopeNavigationMenu,
			children: createElement(Primitive.div, { dir: context.dir, ...groupProps }),
		}),
	});
}

/* -----------------------------------------------------------------------------------------------*/

const ARROW_KEYS = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown'];
const FOCUS_GROUP_ITEM_NAME = 'FocusGroupItem';

function FocusGroupItem(props: any): any {
	const slot = S('NavigationMenu.FocusGroupItem');
	const { __scopeNavigationMenu, ...groupProps } = props ?? {};
	const getItems = useFocusGroupCollection(__scopeNavigationMenu, subSlot(slot, 'items'));
	const context = useNavigationMenuContext(FOCUS_GROUP_ITEM_NAME, __scopeNavigationMenu);

	return createElement(FocusGroupCollection.ItemSlot, {
		scope: __scopeNavigationMenu,
		children: createElement(Primitive.button, {
			...groupProps,
			onKeyDown: composeEventHandlers(props?.onKeyDown, (event: KeyboardEvent) => {
				const isFocusNavigationKey = ['Home', 'End', ...ARROW_KEYS].includes(event.key);
				if (isFocusNavigationKey) {
					let candidateNodes = getItems().map((item: any) => item.ref.current!);
					const prevItemKey = context.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
					const prevKeys = [prevItemKey, 'ArrowUp', 'End'];
					if (prevKeys.includes(event.key)) candidateNodes.reverse();
					if (ARROW_KEYS.includes(event.key)) {
						const currentIndex = candidateNodes.indexOf(event.currentTarget as HTMLElement);
						candidateNodes = candidateNodes.slice(currentIndex + 1);
					}
					/**
					 * Imperative focus during keydown is risky so we prevent React's batching updates
					 * to avoid potential bugs. See: https://github.com/facebook/react/issues/20332
					 */
					setTimeout(() => focusFirst(candidateNodes));

					// Prevent page scroll while navigating
					event.preventDefault();
				}
			}),
		}),
	});
}

/**
 * Returns a list of potential tabbable candidates.
 *
 * NOTE: This is only a close approximation. For example it doesn't take into account cases like when
 * elements are not visible. This cannot be worked out easily by just reading a property, but rather
 * necessitate runtime knowledge (computed styles, etc). We deal with these cases separately.
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
 * Credit: https://github.com/discord/focus-layers/blob/master/src/util/wrapFocus.tsx#L1
 */
function getTabbableCandidates(container: HTMLElement): HTMLElement[] {
	const nodes: HTMLElement[] = [];
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
		acceptNode: (node: any) => {
			const isHiddenInput = node.tagName === 'INPUT' && node.type === 'hidden';
			if (node.disabled || node.hidden || isHiddenInput) return NodeFilter.FILTER_SKIP;
			// `.tabIndex` is not the same as the `tabindex` attribute. It works on the
			// runtime's understanding of tabbability, so this automatically accounts
			// for any kind of element that could be tabbed to.
			return node.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
		},
	});
	while (walker.nextNode()) nodes.push(walker.currentNode as HTMLElement);
	// we do not take into account the order of nodes with positive `tabIndex` as it
	// hinders accessibility to have tab order different from visual order.
	return nodes;
}

function focusFirst(candidates: HTMLElement[]): boolean {
	const previouslyFocusedElement = document.activeElement;
	return candidates.some((candidate) => {
		// if focus is already where we want to go, we don't want to keep going through the candidates
		if (candidate === previouslyFocusedElement) return true;
		candidate.focus();
		return document.activeElement !== previouslyFocusedElement;
	});
}

function removeFromTabOrder(candidates: HTMLElement[]): () => void {
	candidates.forEach((candidate) => {
		candidate.dataset.tabindex = candidate.getAttribute('tabindex') || '';
		candidate.setAttribute('tabindex', '-1');
	});
	return () => {
		candidates.forEach((candidate) => {
			const prevTabIndex = candidate.dataset.tabindex as string;
			candidate.setAttribute('tabindex', prevTabIndex);
		});
	};
}

function useResizeObserver(
	element: HTMLElement | null,
	onResize: () => void,
	slot: symbol | undefined,
): void {
	// The source's `useCallbackRef(onResize)` syncs from a PASSIVE effect; octane's
	// passives are post-paint, so the layout effect below (or a timer it schedules)
	// could observe a one-render-stale closure. useEffectEvent syncs in an INSERTION
	// effect — always current before layout effects run (see the file header).
	const handleResize = useEffectEvent(onResize, subSlot(slot, 'cb'));
	useLayoutEffect(
		() => {
			let rAF = 0;
			if (element) {
				// jsdom guard (like use-size.ts): no ResizeObserver — still deliver the initial
				// observation a real ResizeObserver would fire on `observe()`. Deferred (like
				// the rAF below) so `handleResize` reads the post-commit callback.
				if (typeof ResizeObserver === 'undefined') {
					const timer = window.setTimeout(handleResize, 0);
					return () => window.clearTimeout(timer);
				}
				/**
				 * Resize Observer will throw an often benign error that says `ResizeObserver loop
				 * completed with undelivered notifications`. This means that ResizeObserver was not
				 * able to deliver all observations within a single animation frame, so we use
				 * `requestAnimationFrame` to ensure we don't deliver unnecessary observations.
				 * Further reading: https://github.com/WICG/resize-observer/issues/38
				 */
				const resizeObserver = new ResizeObserver(() => {
					cancelAnimationFrame(rAF);
					rAF = window.requestAnimationFrame(handleResize);
				});
				resizeObserver.observe(element);
				return () => {
					window.cancelAnimationFrame(rAF);
					resizeObserver.unobserve(element);
				};
			}
		},
		[element, handleResize],
		subSlot(slot, 'e'),
	);
}

function getOpenState(open: boolean): 'open' | 'closed' {
	return open ? 'open' : 'closed';
}

function makeTriggerId(baseId: string, value: string): string {
	return `${baseId}-trigger-${value}`;
}

function makeContentId(baseId: string, value: string): string {
	return `${baseId}-content-${value}`;
}

function whenMouse(handler: (event: PointerEvent) => void): (event: PointerEvent) => void {
	return (event) => (event.pointerType === 'mouse' ? handler(event) : undefined);
}

/* -----------------------------------------------------------------------------------------------*/

export {
	Root as NavigationMenu,
	Sub as NavigationMenuSub,
	List as NavigationMenuList,
	Item as NavigationMenuItem,
	Trigger as NavigationMenuTrigger,
	Link as NavigationMenuLink,
	Indicator as NavigationMenuIndicator,
	Content as NavigationMenuContent,
	Viewport as NavigationMenuViewport,
};
