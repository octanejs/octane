// Ported from @radix-ui/react-context-menu (source:
// .radix-primitives/packages/react/context-menu/src/context-menu.tsx). A right-click /
// long-press wrapper over the shared Menu primitive: Trigger renders a virtual Popper
// anchor pinned to the pointer position (contextmenu event, or a 700ms touch/pen long
// press) and Content force-positions side=right/align=start from that point. The
// dev-only "open before interaction" console.warn is not ported (repo policy: port
// functional outcomes only).
import { createElement, useCallback, useEffect, useRef } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { createContextScope } from './context';
import { S, subSlot } from './internal';
import * as MenuPrimitive from './Menu';
import { createMenuScope } from './Menu';
import { Primitive } from './Primitive';
import { useControllableState } from './useControllableState';

type Point = { x: number; y: number };

const CONTEXT_MENU_NAME = 'ContextMenu';

const [createContextMenuContext, createContextMenuScope] = createContextScope(CONTEXT_MENU_NAME, [
	createMenuScope,
]);
export { createContextMenuScope };
const useMenuScope = createMenuScope();

interface ContextMenuContextValue {
	open: boolean;
	onOpenChange(open: boolean): void;
	modal: boolean;
	hasInteractedRef: { current: boolean };
}

const [ContextMenuProvider, useContextMenuContext] =
	createContextMenuContext<ContextMenuContextValue>(CONTEXT_MENU_NAME);

export function Root(props: any): any {
	const slot = S('ContextMenu.Root');
	const {
		__scopeContextMenu,
		children,
		onOpenChange,
		open: openProp,
		dir,
		modal = true,
	} = props ?? {};
	const hasInteractedRef = useRef(false, subSlot(slot, 'interacted'));
	const [open, setOpen] = useControllableState<boolean>(
		{ prop: openProp, defaultProp: false, onChange: onOpenChange },
		subSlot(slot, 'open'),
	);
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));

	return createElement(ContextMenuProvider, {
		scope: __scopeContextMenu,
		open,
		onOpenChange: setOpen,
		modal,
		hasInteractedRef,
		children: createElement(MenuPrimitive.Root, {
			...menuScope,
			dir,
			open,
			onOpenChange: setOpen,
			modal,
			children,
		}),
	});
}

export function Trigger(props: any): any {
	const slot = S('ContextMenu.Trigger');
	const { __scopeContextMenu, disabled = false, ref: forwardedRef, ...triggerProps } = props ?? {};
	const context = useContextMenuContext('ContextMenuTrigger', __scopeContextMenu);
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	const pointRef = useRef<Point>({ x: 0, y: 0 }, subSlot(slot, 'point'));
	const virtualRef = useRef(
		{
			getBoundingClientRect: () => DOMRect.fromRect({ width: 0, height: 0, ...pointRef.current }),
		},
		subSlot(slot, 'virtual'),
	);
	const longPressTimerRef = useRef(0, subSlot(slot, 'timer'));
	const clearLongPress = useCallback(
		() => window.clearTimeout(longPressTimerRef.current),
		[],
		subSlot(slot, 'clear'),
	);
	const handleOpen = (event: MouseEvent | PointerEvent): void => {
		context.hasInteractedRef.current = true;
		pointRef.current = { x: event.clientX, y: event.clientY };
		context.onOpenChange(true);
	};

	useEffect(() => clearLongPress, [clearLongPress], subSlot(slot, 'e:clear'));
	useEffect(
		() => void (disabled && clearLongPress()),
		[disabled, clearLongPress],
		subSlot(slot, 'e:disabled'),
	);

	return [
		createElement(MenuPrimitive.Anchor, { key: 'anchor', ...menuScope, virtualRef }),
		createElement(Primitive.span, {
			key: 'trigger',
			'data-state': context.open ? 'open' : 'closed',
			'data-disabled': disabled ? '' : undefined,
			...triggerProps,
			ref: forwardedRef,
			// prevent iOS context menu from appearing
			style: { WebkitTouchCallout: 'none', ...props?.style },
			// if trigger is disabled, enable the native Context Menu
			onContextMenu: disabled
				? props?.onContextMenu
				: composeEventHandlers(props?.onContextMenu, (event: MouseEvent) => {
						// clearing the long press here because some platforms already support
						// long press to trigger a `contextmenu` event
						clearLongPress();
						handleOpen(event);
						event.preventDefault();
					}),
			onPointerDown: disabled
				? props?.onPointerDown
				: composeEventHandlers(
						props?.onPointerDown,
						whenTouchOrPen((event: PointerEvent) => {
							// clear the long press here in case there's multiple touch points
							clearLongPress();
							if (context.open) {
								context.onOpenChange(false);
							}
							longPressTimerRef.current = window.setTimeout(() => handleOpen(event), 700);
						}),
					),
			onPointerMove: disabled
				? props?.onPointerMove
				: composeEventHandlers(props?.onPointerMove, whenTouchOrPen(clearLongPress)),
			onPointerCancel: disabled
				? props?.onPointerCancel
				: composeEventHandlers(props?.onPointerCancel, whenTouchOrPen(clearLongPress)),
			onPointerUp: disabled
				? props?.onPointerUp
				: composeEventHandlers(props?.onPointerUp, whenTouchOrPen(clearLongPress)),
		}),
	];
}

export function Portal(props: any): any {
	const slot = S('ContextMenu.Portal');
	const { __scopeContextMenu, ...portalProps } = props ?? {};
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Portal, { ...menuScope, ...portalProps });
}

export function Content(props: any): any {
	const slot = S('ContextMenu.Content');
	const { __scopeContextMenu, ...contentProps } = props ?? {};
	const context = useContextMenuContext('ContextMenuContent', __scopeContextMenu);
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	const hasInteractedOutsideRef = useRef(false, subSlot(slot, 'outside'));

	return createElement(MenuPrimitive.Content, {
		...menuScope,
		...contentProps,
		side: 'right',
		sideOffset: 2,
		align: 'start',
		onCloseAutoFocus: (event: Event) => {
			props?.onCloseAutoFocus?.(event);
			if (!event.defaultPrevented && hasInteractedOutsideRef.current) {
				event.preventDefault();
			}
			hasInteractedOutsideRef.current = false;
		},
		onInteractOutside: (event: any) => {
			props?.onInteractOutside?.(event);
			if (!event.defaultPrevented && !context.modal) hasInteractedOutsideRef.current = true;
		},
		style: {
			...props?.style,
			// re-namespace exposed content custom properties
			'--radix-context-menu-content-transform-origin': 'var(--radix-popper-transform-origin)',
			'--radix-context-menu-content-available-width': 'var(--radix-popper-available-width)',
			'--radix-context-menu-content-available-height': 'var(--radix-popper-available-height)',
			'--radix-context-menu-trigger-width': 'var(--radix-popper-anchor-width)',
			'--radix-context-menu-trigger-height': 'var(--radix-popper-anchor-height)',
		},
	});
}

export function Group(props: any): any {
	const slot = S('ContextMenu.Group');
	const { __scopeContextMenu, ...groupProps } = props ?? {};
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Group, { ...menuScope, ...groupProps });
}

export function Label(props: any): any {
	const slot = S('ContextMenu.Label');
	const { __scopeContextMenu, ...labelProps } = props ?? {};
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Label, { ...menuScope, ...labelProps });
}

export function Item(props: any): any {
	const slot = S('ContextMenu.Item');
	const { __scopeContextMenu, ...itemProps } = props ?? {};
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Item, { ...menuScope, ...itemProps });
}

export function CheckboxItem(props: any): any {
	const slot = S('ContextMenu.CheckboxItem');
	const { __scopeContextMenu, ...checkboxItemProps } = props ?? {};
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.CheckboxItem, { ...menuScope, ...checkboxItemProps });
}

export function RadioGroup(props: any): any {
	const slot = S('ContextMenu.RadioGroup');
	const { __scopeContextMenu, ...radioGroupProps } = props ?? {};
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.RadioGroup, { ...menuScope, ...radioGroupProps });
}

export function RadioItem(props: any): any {
	const slot = S('ContextMenu.RadioItem');
	const { __scopeContextMenu, ...radioItemProps } = props ?? {};
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.RadioItem, { ...menuScope, ...radioItemProps });
}

export function ItemIndicator(props: any): any {
	const slot = S('ContextMenu.ItemIndicator');
	const { __scopeContextMenu, ...itemIndicatorProps } = props ?? {};
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.ItemIndicator, { ...menuScope, ...itemIndicatorProps });
}

export function Separator(props: any): any {
	const slot = S('ContextMenu.Separator');
	const { __scopeContextMenu, ...separatorProps } = props ?? {};
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Separator, { ...menuScope, ...separatorProps });
}

export function Arrow(props: any): any {
	const slot = S('ContextMenu.Arrow');
	const { __scopeContextMenu, ...arrowProps } = props ?? {};
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Arrow, { ...menuScope, ...arrowProps });
}

export function Sub(props: any): any {
	const slot = S('ContextMenu.Sub');
	const { __scopeContextMenu, children, onOpenChange, open: openProp, defaultOpen } = props ?? {};
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	const [open, setOpen] = useControllableState<boolean>(
		{ prop: openProp, defaultProp: defaultOpen ?? false, onChange: onOpenChange },
		subSlot(slot, 'open'),
	);

	return createElement(MenuPrimitive.Sub, { ...menuScope, open, onOpenChange: setOpen, children });
}

export function SubTrigger(props: any): any {
	const slot = S('ContextMenu.SubTrigger');
	const { __scopeContextMenu, ...triggerItemProps } = props ?? {};
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.SubTrigger, { ...menuScope, ...triggerItemProps });
}

export function SubContent(props: any): any {
	const slot = S('ContextMenu.SubContent');
	const { __scopeContextMenu, ...subContentProps } = props ?? {};
	const menuScope = useMenuScope(__scopeContextMenu, subSlot(slot, 'menu'));

	return createElement(MenuPrimitive.SubContent, {
		...menuScope,
		...subContentProps,
		style: {
			...props?.style,
			// re-namespace exposed content custom properties
			'--radix-context-menu-content-transform-origin': 'var(--radix-popper-transform-origin)',
			'--radix-context-menu-content-available-width': 'var(--radix-popper-available-width)',
			'--radix-context-menu-content-available-height': 'var(--radix-popper-available-height)',
			'--radix-context-menu-trigger-width': 'var(--radix-popper-anchor-width)',
			'--radix-context-menu-trigger-height': 'var(--radix-popper-anchor-height)',
		},
	});
}

function whenTouchOrPen(handler: (event: PointerEvent) => void): (event: PointerEvent) => void {
	return (event) => (event.pointerType !== 'mouse' ? handler(event) : undefined);
}

export {
	Root as ContextMenu,
	Trigger as ContextMenuTrigger,
	Content as ContextMenuContent,
	Item as ContextMenuItem,
};
