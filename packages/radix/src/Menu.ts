// Ported from @radix-ui/react-menu (source:
// .radix-primitives/packages/react/menu/src/menu.tsx). The shared menu primitive that
// DropdownMenu/ContextMenu/Menubar build on: a popper-positioned `role=menu` content
// composing FocusScope + DismissableLayer + RovingFocusGroup over a Collection of items,
// with typeahead, checkbox/radio items + indicators, and pointer-grace-area submenus
// (Sub/SubTrigger/SubContent). Radix's `RemoveScroll` wrapper is replaced by the
// useScrollLock hook (see scroll-lock.ts); everything else is ported 1:1.
import { createElement, useCallback, useEffect, useRef, useState } from 'octane';
import { hideOthers } from 'aria-hidden';

import { createCollection } from './collection';
import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { useDirection } from './direction';
import { DismissableLayer } from './DismissableLayer';
import { FocusScope } from './FocusScope';
import { useFocusGuards } from './focus-guards';
import { S, subSlot } from './internal';
import * as PopperPrimitive from './Popper';
import { createPopperScope } from './Popper';
import { Portal as PortalPrimitive } from './Portal';
import { Presence } from './Presence';
import { dispatchDiscreteCustomEvent, Primitive } from './Primitive';
import * as RovingFocusGroup from './RovingFocusGroup';
import { createRovingFocusGroupScope } from './RovingFocusGroup';
import { useScrollLock } from './scroll-lock';
import { useCallbackRef } from './use-callback-ref';
import { useId } from './useId';

type Direction = 'ltr' | 'rtl';

const SELECTION_KEYS = ['Enter', ' '];
const FIRST_KEYS = ['ArrowDown', 'PageUp', 'Home'];
const LAST_KEYS = ['ArrowUp', 'PageDown', 'End'];
const FIRST_LAST_KEYS = [...FIRST_KEYS, ...LAST_KEYS];
const SUB_OPEN_KEYS: Record<Direction, string[]> = {
	ltr: [...SELECTION_KEYS, 'ArrowRight'],
	rtl: [...SELECTION_KEYS, 'ArrowLeft'],
};
const SUB_CLOSE_KEYS: Record<Direction, string[]> = {
	ltr: ['ArrowLeft'],
	rtl: ['ArrowRight'],
};

const MENU_NAME = 'Menu';

const [Collection, useCollection, createCollectionScope] = createCollection(MENU_NAME);

const [createMenuContext, createMenuScope] = createContextScope(MENU_NAME, [
	createCollectionScope,
	createPopperScope,
	createRovingFocusGroupScope,
]);
export { createMenuScope };
const usePopperScope = createPopperScope();
const useRovingFocusGroupScope = createRovingFocusGroupScope();

interface MenuContextValue {
	open: boolean;
	onOpenChange(open: boolean): void;
	content: HTMLElement | null;
	onContentChange(content: HTMLElement | null): void;
}

const [MenuProvider, useMenuContext] = createMenuContext<MenuContextValue>(MENU_NAME);

interface MenuRootContextValue {
	onClose(): void;
	isUsingKeyboardRef: { current: boolean };
	dir: Direction;
	modal: boolean;
}

const [MenuRootProvider, useMenuRootContext] = createMenuContext<MenuRootContextValue>(MENU_NAME);

export function Root(props: any): any {
	const slot = S('Menu.Root');
	const { __scopeMenu, open = false, children, dir, onOpenChange, modal = true } = props ?? {};
	const popperScope = usePopperScope(__scopeMenu, subSlot(slot, 'popper'));
	const [content, setContent] = useState<HTMLElement | null>(null, subSlot(slot, 'content'));
	const isUsingKeyboardRef = useRef(false, subSlot(slot, 'keyboard'));
	const handleOpenChange = useCallbackRef(onOpenChange, subSlot(slot, 'openChange'));
	const direction = useDirection(dir);

	useEffect(
		() => {
			// Capture phase ensures we set the boolean before any side effects execute
			// in response to the key or pointer event as they might depend on this value.
			const handleKeyDown = (): void => {
				isUsingKeyboardRef.current = true;
				document.addEventListener('pointerdown', handlePointer, { capture: true, once: true });
				document.addEventListener('pointermove', handlePointer, { capture: true, once: true });
			};
			const handlePointer = (): boolean => (isUsingKeyboardRef.current = false);
			document.addEventListener('keydown', handleKeyDown, { capture: true });
			return () => {
				document.removeEventListener('keydown', handleKeyDown, { capture: true });
				document.removeEventListener('pointerdown', handlePointer, { capture: true });
				document.removeEventListener('pointermove', handlePointer, { capture: true });
			};
		},
		[],
		subSlot(slot, 'e:keyboard'),
	);

	// Close the menu (and any open submenus) when the window loses focus, e.g. when
	// switching to another browser tab or application (radix#3257).
	useEffect(
		() => {
			if (!open) return;
			const handleBlur = (): void => handleOpenChange(false);
			window.addEventListener('blur', handleBlur);
			return () => window.removeEventListener('blur', handleBlur);
		},
		[open, handleOpenChange],
		subSlot(slot, 'e:blur'),
	);

	return createElement(PopperPrimitive.Root, {
		...popperScope,
		children: createElement(MenuProvider, {
			scope: __scopeMenu,
			open,
			onOpenChange: handleOpenChange,
			content,
			onContentChange: setContent,
			children: createElement(MenuRootProvider, {
				scope: __scopeMenu,
				onClose: useCallback(
					() => handleOpenChange(false),
					[handleOpenChange],
					subSlot(slot, 'close'),
				),
				isUsingKeyboardRef,
				dir: direction,
				modal,
				children,
			}),
		}),
	});
}

export function Anchor(props: any): any {
	const slot = S('Menu.Anchor');
	const { __scopeMenu, ...anchorProps } = props ?? {};
	const popperScope = usePopperScope(__scopeMenu, subSlot(slot, 'popper'));
	return createElement(PopperPrimitive.Anchor, { ...popperScope, ...anchorProps });
}

const [PortalProvider, usePortalContext] = createMenuContext<{ forceMount?: boolean }>(
	'MenuPortal',
	{ forceMount: undefined },
);

/**
 * Mounts its children into `container` (default document.body) through `Presence`.
 * octane children convention: pass children at a prop/value position
 * (`children={[<Content/>]}`); a function child is portal'd as a single unit.
 */
export function Portal(props: any): any {
	const { __scopeMenu, forceMount, children, container } = props ?? {};
	const context = useMenuContext('MenuPortal', __scopeMenu);
	return createElement(PortalProvider, {
		scope: __scopeMenu,
		forceMount,
		children: createElement(Presence, {
			present: forceMount || context.open,
			children: createElement(PortalPrimitive, {
				asChild: typeof children !== 'function',
				container,
				children,
			}),
		}),
	});
}

const CONTENT_NAME = 'MenuContent';

interface MenuContentContextValue {
	onItemEnter(event: PointerEvent): void;
	onItemLeave(event: PointerEvent): void;
	onTriggerLeave(event: PointerEvent): void;
	searchRef: { current: string };
	pointerGraceTimerRef: { current: number };
	onPointerGraceIntentChange(intent: GraceIntent | null): void;
}
const [MenuContentProvider, useMenuContentContext] =
	createMenuContext<MenuContentContextValue>(CONTENT_NAME);

export function Content(props: any): any {
	const portalContext = usePortalContext(CONTENT_NAME, props?.__scopeMenu);
	const { forceMount = portalContext.forceMount, ...contentProps } = props ?? {};
	const context = useMenuContext(CONTENT_NAME, props?.__scopeMenu);
	const rootContext = useMenuRootContext(CONTENT_NAME, props?.__scopeMenu);

	return createElement(Collection.Provider, {
		scope: props?.__scopeMenu,
		children: createElement(Presence, {
			present: forceMount || context.open,
			children: createElement(Collection.Slot, {
				scope: props?.__scopeMenu,
				children: rootContext.modal
					? createElement(MenuRootContentModal, contentProps)
					: createElement(MenuRootContentNonModal, contentProps),
			}),
		}),
	});
}

function MenuRootContentModal(props: any): any {
	const slot = S('Menu.RootContentModal');
	const { ref: forwardedRef, ...rest } = props;
	const context = useMenuContext(CONTENT_NAME, props.__scopeMenu);
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(forwardedRef, ref, subSlot(slot, 'refs'));

	// Hide everything from ARIA except the `MenuContent`.
	useEffect(
		() => {
			const content = ref.current;
			if (content) return hideOthers(content);
		},
		[],
		subSlot(slot, 'e:hide'),
	);

	return createElement(MenuContentImpl, {
		...rest,
		__scopeMenu: props.__scopeMenu,
		ref: composedRefs,
		// we make sure we're not trapping once it's been closed
		// (closed !== unmounted when animating out)
		trapFocus: context.open,
		// make sure to only disable pointer events when open
		// this avoids blocking interactions while animating out
		disableOutsidePointerEvents: context.open,
		disableOutsideScroll: true,
		// When focus is trapped, a `focusout` event may still happen.
		// We make sure we don't trigger our `onDismiss` in such case.
		onFocusOutside: composeEventHandlers(
			props.onFocusOutside,
			(event: Event) => event.preventDefault(),
			{ checkForDefaultPrevented: false },
		),
		onDismiss: () => context.onOpenChange(false),
	});
}

function MenuRootContentNonModal(props: any): any {
	const context = useMenuContext(CONTENT_NAME, props.__scopeMenu);
	return createElement(MenuContentImpl, {
		...props,
		trapFocus: false,
		disableOutsidePointerEvents: false,
		disableOutsideScroll: false,
		onDismiss: () => context.onOpenChange(false),
	});
}

function MenuContentImpl(props: any): any {
	const slot = S('Menu.ContentImpl');
	const {
		__scopeMenu,
		ref: forwardedRef,
		loop = false,
		trapFocus,
		onOpenAutoFocus,
		onCloseAutoFocus,
		disableOutsidePointerEvents,
		onEntryFocus,
		onEscapeKeyDown,
		onPointerDownOutside,
		onFocusOutside,
		onInteractOutside,
		onDismiss,
		disableOutsideScroll,
		...contentProps
	} = props;
	const context = useMenuContext(CONTENT_NAME, __scopeMenu);
	const rootContext = useMenuRootContext(CONTENT_NAME, __scopeMenu);
	const popperScope = usePopperScope(__scopeMenu, subSlot(slot, 'popper'));
	const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeMenu, subSlot(slot, 'rfs'));
	const getItems = useCollection(__scopeMenu, subSlot(slot, 'items'));
	const [currentItemId, setCurrentItemId] = useState<string | null>(null, subSlot(slot, 'item'));
	const contentRef = useRef<HTMLElement | null>(null, subSlot(slot, 'content'));
	const composedRefs = useComposedRefs(
		forwardedRef,
		contentRef,
		context.onContentChange,
		subSlot(slot, 'refs'),
	);
	const timerRef = useRef(0, subSlot(slot, 'timer'));
	const searchRef = useRef('', subSlot(slot, 'search'));
	const pointerGraceTimerRef = useRef(0, subSlot(slot, 'graceTimer'));
	const pointerGraceIntentRef = useRef<GraceIntent | null>(null, subSlot(slot, 'graceIntent'));
	const pointerDirRef = useRef<Side>('right', subSlot(slot, 'pointerDir'));
	const lastPointerXRef = useRef(0, subSlot(slot, 'lastX'));

	// Radix wraps in `react-remove-scroll` when disableOutsideScroll; the octane
	// equivalent is the useScrollLock hook (see scroll-lock.ts).
	useScrollLock(!!disableOutsideScroll, subSlot(slot, 'lock'));

	const handleTypeaheadSearch = (key: string): void => {
		const search = searchRef.current + key;
		const items = getItems().filter((item: any) => !item.disabled);
		const currentItem = document.activeElement;
		const currentMatch = items.find((item: any) => item.ref.current === currentItem)?.textValue;
		const values = items.map((item: any) => item.textValue);
		const nextMatch = getNextMatch(values, search, currentMatch);
		const newItem = items.find((item: any) => item.textValue === nextMatch)?.ref.current;

		// Reset `searchRef` 1 second after it was last updated
		(function updateSearch(value: string) {
			searchRef.current = value;
			window.clearTimeout(timerRef.current);
			if (value !== '') timerRef.current = window.setTimeout(() => updateSearch(''), 1000);
		})(search);

		if (newItem) {
			// Imperative focus during keydown is risky so we defer it (React #20332).
			setTimeout(() => (newItem as HTMLElement).focus());
		}
	};

	useEffect(
		() => {
			return () => window.clearTimeout(timerRef.current);
		},
		[],
		subSlot(slot, 'e:timer'),
	);

	// Make sure the whole tree has focus guards as our `MenuContent` may be
	// the last element in the DOM (because of the `Portal`)
	useFocusGuards(subSlot(slot, 'guards'));

	const isPointerMovingToSubmenu = useCallback(
		(event: PointerEvent) => {
			const isMovingTowards = pointerDirRef.current === pointerGraceIntentRef.current?.side;
			return isMovingTowards && isPointerInGraceArea(event, pointerGraceIntentRef.current?.area);
		},
		[],
		subSlot(slot, 'movingToSub'),
	);

	return createElement(MenuContentProvider, {
		scope: __scopeMenu,
		searchRef,
		onItemEnter: useCallback(
			(event: PointerEvent) => {
				if (isPointerMovingToSubmenu(event)) event.preventDefault();
			},
			[isPointerMovingToSubmenu],
			subSlot(slot, 'itemEnter'),
		),
		onItemLeave: useCallback(
			(event: PointerEvent) => {
				if (isPointerMovingToSubmenu(event)) return;
				contentRef.current?.focus();
				setCurrentItemId(null);
			},
			[isPointerMovingToSubmenu],
			subSlot(slot, 'itemLeave'),
		),
		onTriggerLeave: useCallback(
			(event: PointerEvent) => {
				if (isPointerMovingToSubmenu(event)) event.preventDefault();
			},
			[isPointerMovingToSubmenu],
			subSlot(slot, 'triggerLeave'),
		),
		pointerGraceTimerRef,
		onPointerGraceIntentChange: useCallback(
			(intent: GraceIntent | null) => {
				pointerGraceIntentRef.current = intent;
			},
			[],
			subSlot(slot, 'graceChange'),
		),
		children: createElement(FocusScope, {
			asChild: true,
			trapped: trapFocus,
			onMountAutoFocus: composeEventHandlers(onOpenAutoFocus, (event: Event) => {
				// when opening, explicitly focus the content area only and leave
				// `onEntryFocus` in control of focusing first item
				event.preventDefault();
				contentRef.current?.focus({ preventScroll: true } as FocusOptions);
			}),
			onUnmountAutoFocus: onCloseAutoFocus,
			children: createElement(DismissableLayer, {
				asChild: true,
				disableOutsidePointerEvents,
				onEscapeKeyDown,
				onPointerDownOutside,
				onFocusOutside,
				onInteractOutside,
				onDismiss,
				children: createElement(RovingFocusGroup.Root, {
					asChild: true,
					...rovingFocusGroupScope,
					dir: rootContext.dir,
					orientation: 'vertical',
					loop,
					currentTabStopId: currentItemId,
					onCurrentTabStopIdChange: setCurrentItemId,
					onEntryFocus: composeEventHandlers(onEntryFocus, (event: Event) => {
						// only focus first item when using keyboard
						if (!rootContext.isUsingKeyboardRef.current) event.preventDefault();
					}),
					preventScrollOnEntryFocus: true,
					children: createElement(PopperPrimitive.Content, {
						role: 'menu',
						'aria-orientation': 'vertical',
						'data-state': getOpenState(context.open),
						'data-radix-menu-content': '',
						dir: rootContext.dir,
						...popperScope,
						...contentProps,
						ref: composedRefs,
						style: { outline: 'none', ...contentProps.style },
						onKeyDown: composeEventHandlers(contentProps.onKeyDown, (event: KeyboardEvent) => {
							// submenu key events bubble through portals. We only care about keys in this menu.
							const target = event.target as HTMLElement;
							const isKeyDownInside =
								target.closest('[data-radix-menu-content]') === event.currentTarget;
							const isModifierKey = event.ctrlKey || event.altKey || event.metaKey;
							const isCharacterKey = event.key.length === 1;
							if (isKeyDownInside) {
								// menus should not be navigated using tab key so we prevent it
								if (event.key === 'Tab') event.preventDefault();
								if (!isModifierKey && isCharacterKey) handleTypeaheadSearch(event.key);
							}
							// focus first/last item based on key pressed
							const content = contentRef.current;
							if (event.target !== content) return;
							if (!FIRST_LAST_KEYS.includes(event.key)) return;
							event.preventDefault();
							const items = getItems().filter((item: any) => !item.disabled);
							const candidateNodes = items.map((item: any) => item.ref.current!);
							if (LAST_KEYS.includes(event.key)) candidateNodes.reverse();
							focusFirst(candidateNodes);
						}),
						onBlur: composeEventHandlers(props.onBlur, (event: FocusEvent) => {
							// clear search buffer when leaving the menu
							if (!(event.currentTarget as HTMLElement).contains(event.target as Node)) {
								window.clearTimeout(timerRef.current);
								searchRef.current = '';
							}
						}),
						onPointerMove: composeEventHandlers(
							props.onPointerMove,
							whenMouse((event: PointerEvent) => {
								const target = event.target as HTMLElement;
								const pointerXHasChanged = lastPointerXRef.current !== event.clientX;

								// We don't use `event.movementX` for this check because Safari will
								// always return `0` on a pointer event.
								if ((event.currentTarget as HTMLElement).contains(target) && pointerXHasChanged) {
									const newDir = event.clientX > lastPointerXRef.current ? 'right' : 'left';
									pointerDirRef.current = newDir;
									lastPointerXRef.current = event.clientX;
								}
							}),
						),
					}),
				}),
			}),
		}),
	});
}

export function Group(props: any): any {
	const { __scopeMenu, ...groupProps } = props ?? {};
	return createElement(Primitive.div, { role: 'group', ...groupProps });
}

export function Label(props: any): any {
	const { __scopeMenu, ...labelProps } = props ?? {};
	return createElement(Primitive.div, { ...labelProps });
}

const ITEM_NAME = 'MenuItem';
const ITEM_SELECT = 'menu.itemSelect';

export function Item(props: any): any {
	const slot = S('Menu.Item');
	const { disabled = false, onSelect, ref: forwardedRef, ...itemProps } = props ?? {};
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const rootContext = useMenuRootContext(ITEM_NAME, props?.__scopeMenu);
	const contentContext = useMenuContentContext(ITEM_NAME, props?.__scopeMenu);
	const composedRefs = useComposedRefs(forwardedRef, ref, subSlot(slot, 'refs'));
	const isPointerDownRef = useRef(false, subSlot(slot, 'pointerDown'));

	const handleSelect = (): void => {
		const menuItem = ref.current;
		if (!disabled && menuItem) {
			const itemSelectEvent = new CustomEvent(ITEM_SELECT, { bubbles: true, cancelable: true });
			menuItem.addEventListener(ITEM_SELECT, (event) => onSelect?.(event), { once: true });
			dispatchDiscreteCustomEvent(menuItem, itemSelectEvent);
			if (itemSelectEvent.defaultPrevented) {
				isPointerDownRef.current = false;
			} else {
				rootContext.onClose();
			}
		}
	};

	return createElement(MenuItemImpl, {
		...itemProps,
		__scopeMenu: props?.__scopeMenu,
		ref: composedRefs,
		disabled,
		onClick: composeEventHandlers(props?.onClick, handleSelect),
		onPointerDown: (event: PointerEvent) => {
			props?.onPointerDown?.(event);
			isPointerDownRef.current = true;
		},
		onPointerUp: composeEventHandlers(props?.onPointerUp, (event: PointerEvent) => {
			// Pointer down can move to a different menu item which should activate it on pointer up.
			// We dispatch a click for selection to allow composition with click based triggers and to
			// prevent Firefox from getting stuck in text selection mode when the menu closes.
			if (!isPointerDownRef.current) (event.currentTarget as HTMLElement)?.click();
		}),
		onKeyDown: composeEventHandlers(props?.onKeyDown, (event: KeyboardEvent) => {
			const isTypingAhead = contentContext.searchRef.current !== '';
			if (disabled || (isTypingAhead && event.key === ' ')) return;
			if (SELECTION_KEYS.includes(event.key)) {
				(event.currentTarget as HTMLElement).click();
				// We prevent default browser behaviour for selection keys as they should trigger
				// a selection only:
				// - prevents space from scrolling the page.
				// - if keydown causes focus to move, prevents keydown from firing on the new target.
				event.preventDefault();
			}
		}),
	});
}

function MenuItemImpl(props: any): any {
	const slot = S('Menu.ItemImpl');
	const { __scopeMenu, disabled = false, textValue, ref: forwardedRef, ...itemProps } = props;
	const contentContext = useMenuContentContext(ITEM_NAME, __scopeMenu);
	const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeMenu, subSlot(slot, 'rfs'));
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(forwardedRef, ref, subSlot(slot, 'refs'));
	const [isFocused, setIsFocused] = useState(false, subSlot(slot, 'focused'));

	// get the item's `.textContent` as default strategy for typeahead `textValue`
	const [textContent, setTextContent] = useState('', subSlot(slot, 'text'));
	useEffect(
		() => {
			const menuItem = ref.current;
			if (menuItem) {
				setTextContent((menuItem.textContent ?? '').trim());
			}
		},
		[itemProps.children],
		subSlot(slot, 'e:text'),
	);

	return createElement(Collection.ItemSlot, {
		scope: __scopeMenu,
		disabled,
		textValue: textValue ?? textContent,
		children: createElement(RovingFocusGroup.Item, {
			asChild: true,
			...rovingFocusGroupScope,
			focusable: !disabled,
			children: createElement(Primitive.div, {
				role: 'menuitem',
				'data-highlighted': isFocused ? '' : undefined,
				'aria-disabled': disabled || undefined,
				'data-disabled': disabled ? '' : undefined,
				...itemProps,
				ref: composedRefs,
				/**
				 * We focus items on `pointerMove` to achieve the following:
				 *
				 * - Mouse over an item (it focuses)
				 * - Leave mouse where it is and use keyboard to focus a different item
				 * - Wiggle mouse without it leaving previously focused item
				 * - Previously focused item should re-focus
				 *
				 * If we used `mouseOver`/`mouseEnter` it would not re-focus when the mouse
				 * wiggles. This is to match native menu implementation.
				 */
				onPointerMove: composeEventHandlers(
					props.onPointerMove,
					whenMouse((event: PointerEvent) => {
						if (disabled) {
							contentContext.onItemLeave(event);
						} else {
							contentContext.onItemEnter(event);
							if (!event.defaultPrevented) {
								const item = event.currentTarget as HTMLElement;
								item.focus({ preventScroll: true } as FocusOptions);
							}
						}
					}),
				),
				onPointerLeave: composeEventHandlers(
					props.onPointerLeave,
					whenMouse((event: PointerEvent) => contentContext.onItemLeave(event)),
				),
				onFocus: composeEventHandlers(props.onFocus, () => setIsFocused(true)),
				onBlur: composeEventHandlers(props.onBlur, () => setIsFocused(false)),
			}),
		}),
	});
}

type CheckedState = boolean | 'indeterminate';

export function CheckboxItem(props: any): any {
	const { checked = false, onCheckedChange, ...checkboxItemProps } = props ?? {};
	return createElement(ItemIndicatorProvider, {
		scope: props?.__scopeMenu,
		checked,
		children: createElement(Item, {
			role: 'menuitemcheckbox',
			'aria-checked': isIndeterminate(checked) ? 'mixed' : checked,
			...checkboxItemProps,
			'data-state': getCheckedState(checked),
			onSelect: composeEventHandlers(
				checkboxItemProps.onSelect,
				() => onCheckedChange?.(isIndeterminate(checked) ? true : !checked),
				{ checkForDefaultPrevented: false },
			),
		}),
	});
}

const [RadioGroupProvider, useRadioGroupContext] = createMenuContext<{
	value?: string;
	onValueChange?: (value: string) => void;
}>('MenuRadioGroup', { value: undefined, onValueChange: () => {} });

export function RadioGroup(props: any): any {
	const slot = S('Menu.RadioGroup');
	const { value, onValueChange, ...groupProps } = props ?? {};
	const handleValueChange = useCallbackRef(onValueChange, subSlot(slot, 'change'));
	return createElement(RadioGroupProvider, {
		scope: props?.__scopeMenu,
		value,
		onValueChange: handleValueChange,
		children: createElement(Group, groupProps),
	});
}

export function RadioItem(props: any): any {
	const { value, ...radioItemProps } = props ?? {};
	const context = useRadioGroupContext('MenuRadioItem', props?.__scopeMenu);
	const checked = value === context.value;
	return createElement(ItemIndicatorProvider, {
		scope: props?.__scopeMenu,
		checked,
		children: createElement(Item, {
			role: 'menuitemradio',
			'aria-checked': checked,
			...radioItemProps,
			'data-state': getCheckedState(checked),
			onSelect: composeEventHandlers(
				radioItemProps.onSelect,
				() => context.onValueChange?.(value),
				{ checkForDefaultPrevented: false },
			),
		}),
	});
}

const [ItemIndicatorProvider, useItemIndicatorContext] = createMenuContext<{
	checked: CheckedState;
}>('MenuItemIndicator', { checked: false });

export function ItemIndicator(props: any): any {
	const { __scopeMenu, forceMount, ...itemIndicatorProps } = props ?? {};
	const indicatorContext = useItemIndicatorContext('MenuItemIndicator', __scopeMenu);
	return createElement(Presence, {
		present:
			forceMount || isIndeterminate(indicatorContext.checked) || indicatorContext.checked === true,
		children: createElement(Primitive.span, {
			...itemIndicatorProps,
			'data-state': getCheckedState(indicatorContext.checked),
		}),
	});
}

export function Separator(props: any): any {
	const { __scopeMenu, ...separatorProps } = props ?? {};
	return createElement(Primitive.div, {
		role: 'separator',
		'aria-orientation': 'horizontal',
		...separatorProps,
	});
}

export function Arrow(props: any): any {
	const slot = S('Menu.Arrow');
	const { __scopeMenu, ...arrowProps } = props ?? {};
	const popperScope = usePopperScope(__scopeMenu, subSlot(slot, 'popper'));
	return createElement(PopperPrimitive.Arrow, { ...popperScope, ...arrowProps });
}

const SUB_NAME = 'MenuSub';

interface MenuSubContextValue {
	contentId: string;
	triggerId: string;
	trigger: HTMLElement | null;
	onTriggerChange(trigger: HTMLElement | null): void;
}

const [MenuSubProvider, useMenuSubContext] = createMenuContext<MenuSubContextValue>(SUB_NAME);

export function Sub(props: any): any {
	const slot = S('Menu.Sub');
	const { __scopeMenu, children, open = false, onOpenChange } = props ?? {};
	const parentMenuContext = useMenuContext(SUB_NAME, __scopeMenu);
	const popperScope = usePopperScope(__scopeMenu, subSlot(slot, 'popper'));
	const [trigger, setTrigger] = useState<HTMLElement | null>(null, subSlot(slot, 'trigger'));
	const [content, setContent] = useState<HTMLElement | null>(null, subSlot(slot, 'content'));
	const handleOpenChange = useCallbackRef(onOpenChange, subSlot(slot, 'openChange'));

	// Prevent the parent menu from reopening with open submenus.
	useEffect(
		() => {
			if (parentMenuContext.open === false) handleOpenChange(false);
			return () => handleOpenChange(false);
		},
		[parentMenuContext.open, handleOpenChange],
		subSlot(slot, 'e:parent'),
	);

	return createElement(PopperPrimitive.Root, {
		...popperScope,
		children: createElement(MenuProvider, {
			scope: __scopeMenu,
			open,
			onOpenChange: handleOpenChange,
			content,
			onContentChange: setContent,
			children: createElement(MenuSubProvider, {
				scope: __scopeMenu,
				contentId: useId(subSlot(slot, 'contentId')),
				triggerId: useId(subSlot(slot, 'triggerId')),
				trigger,
				onTriggerChange: setTrigger,
				children,
			}),
		}),
	});
}

const SUB_TRIGGER_NAME = 'MenuSubTrigger';

export function SubTrigger(props: any): any {
	const slot = S('Menu.SubTrigger');
	const context = useMenuContext(SUB_TRIGGER_NAME, props?.__scopeMenu);
	const rootContext = useMenuRootContext(SUB_TRIGGER_NAME, props?.__scopeMenu);
	const subContext = useMenuSubContext(SUB_TRIGGER_NAME, props?.__scopeMenu);
	const contentContext = useMenuContentContext(SUB_TRIGGER_NAME, props?.__scopeMenu);
	const openTimerRef = useRef<number | null>(null, subSlot(slot, 'openTimer'));
	const { pointerGraceTimerRef, onPointerGraceIntentChange } = contentContext;
	const scope = { __scopeMenu: props?.__scopeMenu };

	const clearOpenTimer = useCallback(
		() => {
			if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
			openTimerRef.current = null;
		},
		[],
		subSlot(slot, 'clear'),
	);

	useEffect(() => clearOpenTimer, [clearOpenTimer], subSlot(slot, 'e:clear'));

	useEffect(
		() => {
			const pointerGraceTimer = pointerGraceTimerRef.current;
			return () => {
				window.clearTimeout(pointerGraceTimer);
				onPointerGraceIntentChange(null);
			};
		},
		[pointerGraceTimerRef, onPointerGraceIntentChange],
		subSlot(slot, 'e:grace'),
	);

	const composedRefs = useComposedRefs(
		props?.ref,
		subContext.onTriggerChange,
		subSlot(slot, 'refs'),
	);

	return createElement(Anchor, {
		asChild: true,
		...scope,
		children: createElement(MenuItemImpl, {
			id: subContext.triggerId,
			'aria-haspopup': 'menu',
			'aria-expanded': context.open,
			'aria-controls': context.open ? subContext.contentId : undefined,
			'data-state': getOpenState(context.open),
			...props,
			ref: composedRefs,
			// This is redundant for mouse users but we cannot determine pointer type from
			// click event and we cannot use pointerup event (see git history for reasons why)
			onClick: (event: MouseEvent) => {
				props?.onClick?.(event);
				if (props?.disabled || event.defaultPrevented) return;
				// We manually focus because iOS Safari doesn't always focus on click (e.g.
				// buttons) and we rely heavily on `onFocusOutside` for submenus to close when
				// switching between separate submenus.
				(event.currentTarget as HTMLElement).focus();
				if (!context.open) context.onOpenChange(true);
			},
			onPointerMove: composeEventHandlers(
				props?.onPointerMove,
				whenMouse((event: PointerEvent) => {
					contentContext.onItemEnter(event);
					if (event.defaultPrevented) return;
					if (!props?.disabled && !context.open && !openTimerRef.current) {
						contentContext.onPointerGraceIntentChange(null);
						openTimerRef.current = window.setTimeout(() => {
							context.onOpenChange(true);
							clearOpenTimer();
						}, 100);
					}
				}),
			),
			onPointerLeave: composeEventHandlers(
				props?.onPointerLeave,
				whenMouse((event: PointerEvent) => {
					clearOpenTimer();

					const contentRect = context.content?.getBoundingClientRect();
					if (contentRect) {
						// Radix keys the grace polygon off the content's placed side.
						const side = (context.content?.dataset.side as Side) ?? 'right';
						const rightSide = side === 'right';
						const bleed = rightSide ? -5 : +5;
						const contentNearEdge = contentRect[rightSide ? 'left' : 'right'];
						const contentFarEdge = contentRect[rightSide ? 'right' : 'left'];

						contentContext.onPointerGraceIntentChange({
							area: [
								// Apply a bleed on clientX to ensure that our exit point is
								// consistently within polygon bounds
								{ x: event.clientX + bleed, y: event.clientY },
								{ x: contentNearEdge, y: contentRect.top },
								{ x: contentFarEdge, y: contentRect.top },
								{ x: contentFarEdge, y: contentRect.bottom },
								{ x: contentNearEdge, y: contentRect.bottom },
							],
							side,
						});

						window.clearTimeout(pointerGraceTimerRef.current);
						pointerGraceTimerRef.current = window.setTimeout(
							() => contentContext.onPointerGraceIntentChange(null),
							300,
						);
					} else {
						contentContext.onTriggerLeave(event);
						if (event.defaultPrevented) return;

						// There's 100ms where the user may leave an item before the submenu was opened.
						contentContext.onPointerGraceIntentChange(null);
					}
				}),
			),
			onKeyDown: composeEventHandlers(props?.onKeyDown, (event: KeyboardEvent) => {
				const isTypingAhead = contentContext.searchRef.current !== '';
				if (props?.disabled || (isTypingAhead && event.key === ' ')) return;
				if (SUB_OPEN_KEYS[rootContext.dir].includes(event.key)) {
					context.onOpenChange(true);
					// The trigger may hold focus if opened via pointer interaction
					// so we ensure content is given focus again when switching to keyboard.
					context.content?.focus();
					// prevent window from scrolling
					event.preventDefault();
				}
			}),
		}),
	});
}

const SUB_CONTENT_NAME = 'MenuSubContent';

export function SubContent(props: any): any {
	const slot = S('Menu.SubContent');
	const portalContext = usePortalContext(CONTENT_NAME, props?.__scopeMenu);
	const {
		forceMount = portalContext.forceMount,
		align = 'start',
		ref: forwardedRef,
		...subContentProps
	} = props ?? {};
	const context = useMenuContext(CONTENT_NAME, props?.__scopeMenu);
	const rootContext = useMenuRootContext(CONTENT_NAME, props?.__scopeMenu);
	const subContext = useMenuSubContext(SUB_CONTENT_NAME, props?.__scopeMenu);
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(forwardedRef, ref, subSlot(slot, 'refs'));
	return createElement(Collection.Provider, {
		scope: props?.__scopeMenu,
		children: createElement(Presence, {
			present: forceMount || context.open,
			children: createElement(Collection.Slot, {
				scope: props?.__scopeMenu,
				children: createElement(MenuContentImpl, {
					id: subContext.contentId,
					'aria-labelledby': subContext.triggerId,
					...subContentProps,
					__scopeMenu: props?.__scopeMenu,
					ref: composedRefs,
					align,
					side: rootContext.dir === 'rtl' ? 'left' : 'right',
					disableOutsidePointerEvents: false,
					disableOutsideScroll: false,
					trapFocus: false,
					onOpenAutoFocus: (event: Event) => {
						// when opening a submenu, focus content for keyboard users only
						if (rootContext.isUsingKeyboardRef.current) ref.current?.focus();
						event.preventDefault();
					},
					// The menu might close because of focusing another menu item in the parent
					// menu. We don't want it to refocus the trigger in that case so we handle
					// trigger focus ourselves.
					onCloseAutoFocus: (event: Event) => event.preventDefault(),
					onFocusOutside: composeEventHandlers(props?.onFocusOutside, (event: any) => {
						// We prevent closing when the trigger is focused to avoid triggering a
						// re-open animation on pointer interaction.
						if (event.target !== subContext.trigger) context.onOpenChange(false);
					}),
					onEscapeKeyDown: composeEventHandlers(props?.onEscapeKeyDown, (event: Event) => {
						rootContext.onClose();
						// ensure pressing escape in submenu doesn't escape full screen mode
						event.preventDefault();
					}),
					onKeyDown: composeEventHandlers(props?.onKeyDown, (event: KeyboardEvent) => {
						// Submenu key events bubble through portals. We only care about keys in this menu.
						const isKeyDownInside = (event.currentTarget as HTMLElement).contains(
							event.target as HTMLElement,
						);
						const isCloseKey = SUB_CLOSE_KEYS[rootContext.dir].includes(event.key);
						if (isKeyDownInside && isCloseKey) {
							context.onOpenChange(false);
							// We focus manually because we prevented it in `onCloseAutoFocus`
							subContext.trigger?.focus();
							// prevent window from scrolling
							event.preventDefault();
						}
					}),
				}),
			}),
		}),
	});
}

function getOpenState(open: boolean): 'open' | 'closed' {
	return open ? 'open' : 'closed';
}

function isIndeterminate(checked?: CheckedState): checked is 'indeterminate' {
	return checked === 'indeterminate';
}

function getCheckedState(checked: CheckedState): string {
	return isIndeterminate(checked) ? 'indeterminate' : checked ? 'checked' : 'unchecked';
}

function focusFirst(candidates: HTMLElement[]): void {
	const PREVIOUSLY_FOCUSED_ELEMENT = document.activeElement;
	for (const candidate of candidates) {
		// if focus is already where we want to go, we don't want to keep going through the candidates
		if (candidate === PREVIOUSLY_FOCUSED_ELEMENT) return;
		candidate.focus();
		if (document.activeElement !== PREVIOUSLY_FOCUSED_ELEMENT) return;
	}
}

/**
 * Wraps an array around itself at a given start index
 * Example: `wrapArray(['a', 'b', 'c', 'd'], 2) === ['c', 'd', 'a', 'b']`
 */
function wrapArray<T>(array: T[], startIndex: number): T[] {
	return array.map<T>((_, index) => array[(startIndex + index) % array.length]!);
}

/**
 * This is the "meat" of the typeahead matching logic. It takes in all the values,
 * the search and the current match, and returns the next match (or `undefined`).
 *
 * We normalize the search because if a user has repeatedly pressed a character,
 * we want the exact same behavior as if we only had that one character
 * (ie. cycle through options starting with that character)
 *
 * We also reorder the values by wrapping the array around the current match.
 * This is so we always look forward from the current match, and picking the first
 * match will always be the correct one.
 *
 * Finally, if the normalized search is exactly one character, we exclude the
 * current match from the values because otherwise it would be the first to match always
 * and focus would never move. This is as opposed to the regular case, where we
 * don't want focus to move if the current match still matches.
 */
function getNextMatch(values: string[], search: string, currentMatch?: string): string | undefined {
	const isRepeated = search.length > 1 && Array.from(search).every((char) => char === search[0]);
	const normalizedSearch = isRepeated ? search[0]! : search;
	const currentMatchIndex = currentMatch ? values.indexOf(currentMatch) : -1;
	let wrappedValues = wrapArray(values, Math.max(currentMatchIndex, 0));
	const excludeCurrentMatch = normalizedSearch.length === 1;
	if (excludeCurrentMatch) wrappedValues = wrappedValues.filter((v) => v !== currentMatch);
	const nextMatch = wrappedValues.find((value) =>
		value.toLowerCase().startsWith(normalizedSearch.toLowerCase()),
	);
	return nextMatch !== currentMatch ? nextMatch : undefined;
}

type Point = { x: number; y: number };
type Polygon = Point[];
type Side = 'left' | 'right';
type GraceIntent = { area: Polygon; side: Side };

// Determine if a point is inside of a polygon.
// Based on https://github.com/substack/point-in-polygon
function isPointInPolygon(point: Point, polygon: Polygon): boolean {
	const { x, y } = point;
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const ii = polygon[i]!;
		const jj = polygon[j]!;
		const xi = ii.x;
		const yi = ii.y;
		const xj = jj.x;
		const yj = jj.y;

		// prettier-ignore
		const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
		if (intersect) inside = !inside;
	}

	return inside;
}

function isPointerInGraceArea(event: PointerEvent, area?: Polygon): boolean {
	if (!area) return false;
	const cursorPos = { x: event.clientX, y: event.clientY };
	return isPointInPolygon(cursorPos, area);
}

function whenMouse(handler: (event: PointerEvent) => void): (event: PointerEvent) => void {
	return (event) => (event.pointerType === 'mouse' ? handler(event) : undefined);
}

export { Root as Menu, Anchor as MenuAnchor, Content as MenuContent, Item as MenuItem };
