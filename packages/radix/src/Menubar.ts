// Ported from @radix-ui/react-menubar (source:
// .radix-primitives/packages/react/menubar/src/menubar.tsx). A visually persistent
// `role=menubar` composing the shared Menu primitive: a horizontal RovingFocusGroup of
// triggers (one tab stop, managed manually via `currentTabStopId` since triggers may
// never receive focus), where the menubar's `value` is the open menu's value. Triggers
// open on pointerdown / ArrowDown and toggle on Enter/Space; pointerenter switches menus
// while one is open; ArrowRight/ArrowLeft at the edges of an open menu's content move to
// the next/previous menu (dir-aware, loop-aware, skipping submenus); closing returns
// focus to the trigger unless the close came from an outside interaction.
//
// octane adaptations (all previously established in this package):
// - Plain `.ts` + `createElement` (no JSX); no forwardRef — `ref: forwardedRef` is
//   destructured from props and composed with useComposedRefs.
// - Explicit hook slots: per component `S('Menubar.X')` + a unique `subSlot(slot, tag)`
//   as every hook call's trailing arg (octane's auto-slotting pass only runs on
//   compiled .tsx/.tsrx).
// - Events are native delegated DOM events (onPointerDown/onPointerEnter/onKeyDown/
//   onFocus/onBlur map 1:1; the runtime handles enter/leave + focus/blur delegation).
// - `useControllableState`'s dev-only `caller` param is not ported (repo policy:
//   functional outcomes only).
// - Menu.Portal children convention: children passed at prop position
//   (`children={[<Content/>]}`), portal'd via `asChild` unless a function child.
import { createElement, useCallback, useEffect, useRef, useState } from 'octane';

import { createCollection } from './collection';
import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { useDirection } from './direction';
import { S, subSlot } from './internal';
import * as MenuPrimitive from './Menu';
import { createMenuScope } from './Menu';
import { Primitive } from './Primitive';
import * as RovingFocusGroup from './RovingFocusGroup';
import { createRovingFocusGroupScope } from './RovingFocusGroup';
import { useControllableState } from './useControllableState';
import { useId } from './useId';

type Direction = 'ltr' | 'rtl';

/* -------------------------------------------------------------------------------------------------
 * Menubar
 * -----------------------------------------------------------------------------------------------*/

const MENUBAR_NAME = 'Menubar';

const [Collection, useCollection, createCollectionScope] = createCollection(MENUBAR_NAME);

const [createMenubarContext, createMenubarScope] = createContextScope(MENUBAR_NAME, [
	createCollectionScope,
	createRovingFocusGroupScope,
]);
export { createMenubarScope };

const useMenuScope = createMenuScope();
const useRovingFocusGroupScope = createRovingFocusGroupScope();

interface MenubarContextValue {
	value: string;
	dir: Direction;
	loop: boolean;
	onMenuOpen(value: string): void;
	onMenuClose(): void;
	onMenuToggle(value: string): void;
}

const [MenubarContextProvider, useMenubarContext] =
	createMenubarContext<MenubarContextValue>(MENUBAR_NAME);

export function Root(props: any): any {
	const slot = S('Menubar.Root');
	const {
		__scopeMenubar,
		value: valueProp,
		onValueChange,
		defaultValue,
		loop = true,
		dir,
		ref: forwardedRef,
		...menubarProps
	} = props ?? {};
	const direction = useDirection(dir);
	const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeMenubar, subSlot(slot, 'rfs'));
	const [value, setValue] = useControllableState<string>(
		{ prop: valueProp, onChange: onValueChange, defaultProp: defaultValue ?? '' },
		subSlot(slot, 'value'),
	);

	// We need to manage tab stop id manually as `RovingFocusGroup` updates the stop
	// based on focus, and in some situations our triggers won't ever be given focus
	// (e.g. click to open and then outside to close)
	const [currentTabStopId, setCurrentTabStopId] = useState<string | null>(
		null,
		subSlot(slot, 'tabStop'),
	);

	return createElement(MenubarContextProvider, {
		scope: __scopeMenubar,
		value,
		onMenuOpen: useCallback(
			(value: string) => {
				setValue(value);
				setCurrentTabStopId(value);
			},
			[setValue],
			subSlot(slot, 'open'),
		),
		onMenuClose: useCallback(() => setValue(''), [setValue], subSlot(slot, 'close')),
		onMenuToggle: useCallback(
			(value: string) => {
				setValue((prevValue) => (prevValue ? '' : value));
				// `openMenuOpen` and `onMenuToggle` are called exclusively so we
				// need to update the id in either case.
				setCurrentTabStopId(value);
			},
			[setValue],
			subSlot(slot, 'toggle'),
		),
		dir: direction,
		loop,
		children: createElement(Collection.Provider, {
			scope: __scopeMenubar,
			children: createElement(Collection.Slot, {
				scope: __scopeMenubar,
				children: createElement(RovingFocusGroup.Root, {
					asChild: true,
					...rovingFocusGroupScope,
					orientation: 'horizontal',
					loop,
					dir: direction,
					currentTabStopId,
					onCurrentTabStopIdChange: setCurrentTabStopId,
					children: createElement(Primitive.div, {
						role: 'menubar',
						...menubarProps,
						ref: forwardedRef,
					}),
				}),
			}),
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * MenubarMenu
 * -----------------------------------------------------------------------------------------------*/

const MENU_NAME = 'MenubarMenu';

interface MenubarMenuContextValue {
	value: string;
	triggerId: string;
	triggerRef: { current: HTMLElement | null };
	contentId: string;
	wasKeyboardTriggerOpenRef: { current: boolean };
}

const [MenubarMenuProvider, useMenubarMenuContext] =
	createMenubarContext<MenubarMenuContextValue>(MENU_NAME);

export function Menu(props: any): any {
	const slot = S('Menubar.Menu');
	const { __scopeMenubar, value: valueProp, ...menuProps } = props ?? {};
	const autoValue = useId(subSlot(slot, 'autoValue'));
	// We need to provide an initial deterministic value as `useId` will return
	// empty string on the first render and we don't want to match our internal "closed" value.
	const value = valueProp || autoValue || 'LEGACY_REACT_AUTO_VALUE';
	const context = useMenubarContext(MENU_NAME, __scopeMenubar);
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	const triggerRef = useRef<HTMLElement | null>(null, subSlot(slot, 'triggerRef'));
	const wasKeyboardTriggerOpenRef = useRef(false, subSlot(slot, 'wasKeyboard'));
	const open = context.value === value;

	useEffect(
		() => {
			if (!open) wasKeyboardTriggerOpenRef.current = false;
		},
		[open],
		subSlot(slot, 'e:open'),
	);

	return createElement(MenubarMenuProvider, {
		scope: __scopeMenubar,
		value,
		triggerId: useId(subSlot(slot, 'triggerId')),
		triggerRef,
		contentId: useId(subSlot(slot, 'contentId')),
		wasKeyboardTriggerOpenRef,
		children: createElement(MenuPrimitive.Root, {
			...menuScope,
			open,
			onOpenChange: (open: boolean) => {
				// Menu only calls `onOpenChange` when dismissing so we
				// want to close our MenuBar based on the same events.
				if (!open) context.onMenuClose();
			},
			modal: false,
			dir: context.dir,
			...menuProps,
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * MenubarTrigger
 * -----------------------------------------------------------------------------------------------*/

const TRIGGER_NAME = 'MenubarTrigger';

export function Trigger(props: any): any {
	const slot = S('Menubar.Trigger');
	const { __scopeMenubar, disabled = false, ref: forwardedRef, ...triggerProps } = props ?? {};
	const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeMenubar, subSlot(slot, 'rfs'));
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	const context = useMenubarContext(TRIGGER_NAME, __scopeMenubar);
	const menuContext = useMenubarMenuContext(TRIGGER_NAME, __scopeMenubar);
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(
		forwardedRef,
		ref,
		menuContext.triggerRef,
		subSlot(slot, 'refs'),
	);
	const [isFocused, setIsFocused] = useState(false, subSlot(slot, 'focused'));
	const open = context.value === menuContext.value;

	return createElement(Collection.ItemSlot, {
		scope: __scopeMenubar,
		value: menuContext.value,
		disabled,
		children: createElement(RovingFocusGroup.Item, {
			asChild: true,
			...rovingFocusGroupScope,
			focusable: !disabled,
			tabStopId: menuContext.value,
			children: createElement(MenuPrimitive.Anchor, {
				asChild: true,
				...menuScope,
				children: createElement(Primitive.button, {
					type: 'button',
					role: 'menuitem',
					id: menuContext.triggerId,
					'aria-haspopup': 'menu',
					'aria-expanded': open,
					'aria-controls': open ? menuContext.contentId : undefined,
					'data-highlighted': isFocused ? '' : undefined,
					'data-state': open ? 'open' : 'closed',
					'data-disabled': disabled ? '' : undefined,
					disabled,
					...triggerProps,
					ref: composedRefs,
					onPointerDown: composeEventHandlers(props?.onPointerDown, (event: PointerEvent) => {
						// only call handler if it's the left button (mousedown gets triggered by all mouse
						// buttons) but not when the control key is pressed (avoiding MacOS right click)
						if (!disabled && event.button === 0 && event.ctrlKey === false) {
							context.onMenuOpen(menuContext.value);
							// prevent trigger focusing when opening
							// this allows the content to be given focus without competition
							if (!open) event.preventDefault();
						}
					}),
					onPointerEnter: composeEventHandlers(props?.onPointerEnter, () => {
						const menubarOpen = Boolean(context.value);
						if (menubarOpen && !open) {
							context.onMenuOpen(menuContext.value);
							ref.current?.focus();
						}
					}),
					onKeyDown: composeEventHandlers(props?.onKeyDown, (event: KeyboardEvent) => {
						if (disabled) return;
						if (['Enter', ' '].includes(event.key)) context.onMenuToggle(menuContext.value);
						if (event.key === 'ArrowDown') context.onMenuOpen(menuContext.value);
						// prevent keydown from scrolling window / first focused item to execute
						// that keydown (inadvertently closing the menu)
						if (['Enter', ' ', 'ArrowDown'].includes(event.key)) {
							menuContext.wasKeyboardTriggerOpenRef.current = true;
							event.preventDefault();
						}
					}),
					onFocus: composeEventHandlers(props?.onFocus, () => setIsFocused(true)),
					onBlur: composeEventHandlers(props?.onBlur, () => setIsFocused(false)),
				}),
			}),
		}),
	});
}

/* -------------------------------------------------------------------------------------------------
 * MenubarPortal
 * -----------------------------------------------------------------------------------------------*/

export function Portal(props: any): any {
	const slot = S('Menubar.Portal');
	const { __scopeMenubar, ...portalProps } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Portal, { ...menuScope, ...portalProps });
}

/* -------------------------------------------------------------------------------------------------
 * MenubarContent
 * -----------------------------------------------------------------------------------------------*/

const CONTENT_NAME = 'MenubarContent';

export function Content(props: any): any {
	const slot = S('Menubar.Content');
	const { __scopeMenubar, align = 'start', ref: forwardedRef, ...contentProps } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	const context = useMenubarContext(CONTENT_NAME, __scopeMenubar);
	const menuContext = useMenubarMenuContext(CONTENT_NAME, __scopeMenubar);
	const getItems = useCollection(__scopeMenubar, subSlot(slot, 'items'));
	const hasInteractedOutsideRef = useRef(false, subSlot(slot, 'interacted'));

	return createElement(MenuPrimitive.Content, {
		id: menuContext.contentId,
		'aria-labelledby': menuContext.triggerId,
		'data-radix-menubar-content': '',
		...menuScope,
		...contentProps,
		ref: forwardedRef,
		align,
		onCloseAutoFocus: composeEventHandlers(props?.onCloseAutoFocus, (event: Event) => {
			const menubarOpen = Boolean(context.value);
			if (!menubarOpen && !hasInteractedOutsideRef.current) {
				menuContext.triggerRef.current?.focus();
			}

			hasInteractedOutsideRef.current = false;
			// Always prevent auto focus because we either focus manually or want user agent focus
			event.preventDefault();
		}),
		onFocusOutside: composeEventHandlers(props?.onFocusOutside, (event: Event) => {
			const target = event.target as HTMLElement;
			const isMenubarTrigger = getItems().some((item: any) => item.ref.current?.contains(target));
			if (isMenubarTrigger) event.preventDefault();
		}),
		onInteractOutside: composeEventHandlers(props?.onInteractOutside, () => {
			hasInteractedOutsideRef.current = true;
		}),
		onEntryFocus: (event: Event) => {
			if (!menuContext.wasKeyboardTriggerOpenRef.current) event.preventDefault();
		},
		onKeyDown: composeEventHandlers(
			props?.onKeyDown,
			(event: KeyboardEvent) => {
				if (['ArrowRight', 'ArrowLeft'].includes(event.key)) {
					const target = event.target as HTMLElement;
					const targetIsSubTrigger = target.hasAttribute('data-radix-menubar-subtrigger');
					const isKeyDownInsideSubMenu =
						target.closest('[data-radix-menubar-content]') !== event.currentTarget;

					const prevMenuKey = context.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
					const isPrevKey = prevMenuKey === event.key;
					const isNextKey = !isPrevKey;

					// Prevent navigation when we're opening a submenu
					if (isNextKey && targetIsSubTrigger) return;
					// or we're inside a submenu and are moving backwards to close it
					if (isKeyDownInsideSubMenu && isPrevKey) return;

					const items = getItems().filter((item: any) => !item.disabled);
					let candidateValues = items.map((item: any) => item.value);
					if (isPrevKey) candidateValues.reverse();

					const currentIndex = candidateValues.indexOf(menuContext.value);

					candidateValues = context.loop
						? wrapArray(candidateValues, currentIndex + 1)
						: candidateValues.slice(currentIndex + 1);

					const [nextValue] = candidateValues;
					if (nextValue) context.onMenuOpen(nextValue);
				}
			},
			{ checkForDefaultPrevented: false },
		),
		style: {
			...props?.style,
			// re-namespace exposed content custom properties
			'--radix-menubar-content-transform-origin': 'var(--radix-popper-transform-origin)',
			'--radix-menubar-content-available-width': 'var(--radix-popper-available-width)',
			'--radix-menubar-content-available-height': 'var(--radix-popper-available-height)',
			'--radix-menubar-trigger-width': 'var(--radix-popper-anchor-width)',
			'--radix-menubar-trigger-height': 'var(--radix-popper-anchor-height)',
		},
	});
}

/* -------------------------------------------------------------------------------------------------
 * MenubarGroup
 * -----------------------------------------------------------------------------------------------*/

export function Group(props: any): any {
	const slot = S('Menubar.Group');
	const { __scopeMenubar, ...groupProps } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Group, { ...menuScope, ...groupProps });
}

/* -------------------------------------------------------------------------------------------------
 * MenubarLabel
 * -----------------------------------------------------------------------------------------------*/

export function Label(props: any): any {
	const slot = S('Menubar.Label');
	const { __scopeMenubar, ...labelProps } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Label, { ...menuScope, ...labelProps });
}

/* -------------------------------------------------------------------------------------------------
 * MenubarItem
 * -----------------------------------------------------------------------------------------------*/

export function Item(props: any): any {
	const slot = S('Menubar.Item');
	const { __scopeMenubar, ...itemProps } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Item, { ...menuScope, ...itemProps });
}

/* -------------------------------------------------------------------------------------------------
 * MenubarCheckboxItem
 * -----------------------------------------------------------------------------------------------*/

export function CheckboxItem(props: any): any {
	const slot = S('Menubar.CheckboxItem');
	const { __scopeMenubar, ...checkboxItemProps } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.CheckboxItem, { ...menuScope, ...checkboxItemProps });
}

/* -------------------------------------------------------------------------------------------------
 * MenubarRadioGroup
 * -----------------------------------------------------------------------------------------------*/

export function RadioGroup(props: any): any {
	const slot = S('Menubar.RadioGroup');
	const { __scopeMenubar, ...radioGroupProps } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.RadioGroup, { ...menuScope, ...radioGroupProps });
}

/* -------------------------------------------------------------------------------------------------
 * MenubarRadioItem
 * -----------------------------------------------------------------------------------------------*/

export function RadioItem(props: any): any {
	const slot = S('Menubar.RadioItem');
	const { __scopeMenubar, ...radioItemProps } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.RadioItem, { ...menuScope, ...radioItemProps });
}

/* -------------------------------------------------------------------------------------------------
 * MenubarItemIndicator
 * -----------------------------------------------------------------------------------------------*/

export function ItemIndicator(props: any): any {
	const slot = S('Menubar.ItemIndicator');
	const { __scopeMenubar, ...itemIndicatorProps } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.ItemIndicator, { ...menuScope, ...itemIndicatorProps });
}

/* -------------------------------------------------------------------------------------------------
 * MenubarSeparator
 * -----------------------------------------------------------------------------------------------*/

export function Separator(props: any): any {
	const slot = S('Menubar.Separator');
	const { __scopeMenubar, ...separatorProps } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Separator, { ...menuScope, ...separatorProps });
}

/* -------------------------------------------------------------------------------------------------
 * MenubarArrow
 * -----------------------------------------------------------------------------------------------*/

export function Arrow(props: any): any {
	const slot = S('Menubar.Arrow');
	const { __scopeMenubar, ...arrowProps } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Arrow, { ...menuScope, ...arrowProps });
}

/* -------------------------------------------------------------------------------------------------
 * MenubarSub
 * -----------------------------------------------------------------------------------------------*/

export function Sub(props: any): any {
	const slot = S('Menubar.Sub');
	const { __scopeMenubar, children, open: openProp, onOpenChange, defaultOpen } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	const [open, setOpen] = useControllableState<boolean>(
		{ prop: openProp, defaultProp: defaultOpen ?? false, onChange: onOpenChange },
		subSlot(slot, 'open'),
	);

	return createElement(MenuPrimitive.Sub, { ...menuScope, open, onOpenChange: setOpen, children });
}

/* -------------------------------------------------------------------------------------------------
 * MenubarSubTrigger
 * -----------------------------------------------------------------------------------------------*/

export function SubTrigger(props: any): any {
	const slot = S('Menubar.SubTrigger');
	const { __scopeMenubar, ...subTriggerProps } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.SubTrigger, {
		'data-radix-menubar-subtrigger': '',
		...menuScope,
		...subTriggerProps,
	});
}

/* -------------------------------------------------------------------------------------------------
 * MenubarSubContent
 * -----------------------------------------------------------------------------------------------*/

export function SubContent(props: any): any {
	const slot = S('Menubar.SubContent');
	const { __scopeMenubar, ...subContentProps } = props ?? {};
	const menuScope = useMenuScope(__scopeMenubar, subSlot(slot, 'menu'));

	return createElement(MenuPrimitive.SubContent, {
		...menuScope,
		'data-radix-menubar-content': '',
		...subContentProps,
		style: {
			...props?.style,
			// re-namespace exposed content custom properties
			'--radix-menubar-content-transform-origin': 'var(--radix-popper-transform-origin)',
			'--radix-menubar-content-available-width': 'var(--radix-popper-available-width)',
			'--radix-menubar-content-available-height': 'var(--radix-popper-available-height)',
			'--radix-menubar-trigger-width': 'var(--radix-popper-anchor-width)',
			'--radix-menubar-trigger-height': 'var(--radix-popper-anchor-height)',
		},
	});
}

/* -----------------------------------------------------------------------------------------------*/

/**
 * Wraps an array around itself at a given start index
 * Example: `wrapArray(['a', 'b', 'c', 'd'], 2) === ['c', 'd', 'a', 'b']`
 */
function wrapArray<T>(array: T[], startIndex: number): T[] {
	return array.map((_, index) => array[(startIndex + index) % array.length]);
}

export {
	Root as Menubar,
	Menu as MenubarMenu,
	Trigger as MenubarTrigger,
	Portal as MenubarPortal,
	Content as MenubarContent,
	Group as MenubarGroup,
	Label as MenubarLabel,
	Item as MenubarItem,
	CheckboxItem as MenubarCheckboxItem,
	RadioGroup as MenubarRadioGroup,
	RadioItem as MenubarRadioItem,
	ItemIndicator as MenubarItemIndicator,
	Separator as MenubarSeparator,
	Arrow as MenubarArrow,
	Sub as MenubarSub,
	SubTrigger as MenubarSubTrigger,
	SubContent as MenubarSubContent,
};
