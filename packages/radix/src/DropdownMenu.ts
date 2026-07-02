// Ported from @radix-ui/react-dropdown-menu (source:
// .radix-primitives/packages/react/dropdown-menu/src/dropdown-menu.tsx). A thin,
// button-triggered wrapper over the shared Menu primitive: Trigger toggles on
// pointer-down (left button, no ctrl) / Enter / Space / ArrowDown, Content re-namespaces
// the popper CSS vars and returns focus to the trigger on close (unless the close came
// from an outside interaction); everything else forwards straight into Menu.
import { createElement, useCallback, useRef } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { S, subSlot } from './internal';
import * as MenuPrimitive from './Menu';
import { createMenuScope } from './Menu';
import { Primitive } from './Primitive';
import { useControllableState } from './useControllableState';
import { useId } from './useId';

const DROPDOWN_MENU_NAME = 'DropdownMenu';

const [createDropdownMenuContext, createDropdownMenuScope] = createContextScope(
	DROPDOWN_MENU_NAME,
	[createMenuScope],
);
export { createDropdownMenuScope };
const useMenuScope = createMenuScope();

interface DropdownMenuContextValue {
	triggerId: string;
	triggerRef: { current: HTMLElement | null };
	contentId: string;
	open: boolean;
	onOpenChange(open: boolean): void;
	onOpenToggle(): void;
	modal: boolean;
}

const [DropdownMenuProvider, useDropdownMenuContext] =
	createDropdownMenuContext<DropdownMenuContextValue>(DROPDOWN_MENU_NAME);

export function Root(props: any): any {
	const slot = S('DropdownMenu.Root');
	const {
		__scopeDropdownMenu,
		children,
		dir,
		open: openProp,
		defaultOpen,
		onOpenChange,
		modal = true,
	} = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	const triggerRef = useRef<HTMLElement | null>(null, subSlot(slot, 'trigger'));
	const [open, setOpen] = useControllableState<boolean>(
		{ prop: openProp, defaultProp: defaultOpen ?? false, onChange: onOpenChange },
		subSlot(slot, 'open'),
	);

	return createElement(DropdownMenuProvider, {
		scope: __scopeDropdownMenu,
		triggerId: useId(subSlot(slot, 'triggerId')),
		triggerRef,
		contentId: useId(subSlot(slot, 'contentId')),
		open,
		onOpenChange: setOpen,
		onOpenToggle: useCallback(
			() => setOpen((prevOpen) => !prevOpen),
			[setOpen],
			subSlot(slot, 'toggle'),
		),
		modal,
		children: createElement(MenuPrimitive.Root, {
			...menuScope,
			open,
			onOpenChange: setOpen,
			dir,
			modal,
			children,
		}),
	});
}

export function Trigger(props: any): any {
	const slot = S('DropdownMenu.Trigger');
	const { __scopeDropdownMenu, disabled = false, ref: forwardedRef, ...triggerProps } = props ?? {};
	const context = useDropdownMenuContext('DropdownMenuTrigger', __scopeDropdownMenu);
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	const composedRefs = useComposedRefs(forwardedRef, context.triggerRef, subSlot(slot, 'refs'));
	return createElement(MenuPrimitive.Anchor, {
		asChild: true,
		...menuScope,
		children: createElement(Primitive.button, {
			type: 'button',
			id: context.triggerId,
			'aria-haspopup': 'menu',
			'aria-expanded': context.open,
			'aria-controls': context.open ? context.contentId : undefined,
			'data-state': context.open ? 'open' : 'closed',
			'data-disabled': disabled ? '' : undefined,
			disabled,
			...triggerProps,
			ref: composedRefs,
			onPointerDown: composeEventHandlers(props?.onPointerDown, (event: PointerEvent) => {
				// only call handler if it's the left button (mousedown gets triggered by all mouse
				// buttons) but not when the control key is pressed (avoiding MacOS right click)
				if (!disabled && event.button === 0 && event.ctrlKey === false) {
					context.onOpenToggle();
					// prevent trigger focusing when opening
					// this allows the content to be given focus without competition
					if (!context.open) event.preventDefault();
				}
			}),
			onKeyDown: composeEventHandlers(props?.onKeyDown, (event: KeyboardEvent) => {
				if (disabled) return;
				if (['Enter', ' '].includes(event.key)) context.onOpenToggle();
				if (event.key === 'ArrowDown') context.onOpenChange(true);
				// prevent keydown from scrolling window / first focused item to execute
				// that keydown (inadvertently closing the menu)
				if (['Enter', ' ', 'ArrowDown'].includes(event.key)) event.preventDefault();
			}),
		}),
	});
}

export function Portal(props: any): any {
	const slot = S('DropdownMenu.Portal');
	const { __scopeDropdownMenu, ...portalProps } = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Portal, { ...menuScope, ...portalProps });
}

export function Content(props: any): any {
	const slot = S('DropdownMenu.Content');
	const { __scopeDropdownMenu, ...contentProps } = props ?? {};
	const context = useDropdownMenuContext('DropdownMenuContent', __scopeDropdownMenu);
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	const hasInteractedOutsideRef = useRef(false, subSlot(slot, 'interacted'));

	return createElement(MenuPrimitive.Content, {
		id: context.contentId,
		'aria-labelledby': context.triggerId,
		...menuScope,
		...contentProps,
		onCloseAutoFocus: composeEventHandlers(props?.onCloseAutoFocus, (event: Event) => {
			if (!hasInteractedOutsideRef.current) context.triggerRef.current?.focus();
			hasInteractedOutsideRef.current = false;
			// Always prevent auto focus because we either focus manually or want user agent focus
			event.preventDefault();
		}),
		onInteractOutside: composeEventHandlers(props?.onInteractOutside, (event: any) => {
			const originalEvent = event.detail.originalEvent as PointerEvent;
			const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
			const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
			if (!context.modal || isRightClick) hasInteractedOutsideRef.current = true;
		}),
		style: {
			...props?.style,
			// re-namespace exposed content custom properties
			'--radix-dropdown-menu-content-transform-origin': 'var(--radix-popper-transform-origin)',
			'--radix-dropdown-menu-content-available-width': 'var(--radix-popper-available-width)',
			'--radix-dropdown-menu-content-available-height': 'var(--radix-popper-available-height)',
			'--radix-dropdown-menu-trigger-width': 'var(--radix-popper-anchor-width)',
			'--radix-dropdown-menu-trigger-height': 'var(--radix-popper-anchor-height)',
		},
	});
}

export function Group(props: any): any {
	const slot = S('DropdownMenu.Group');
	const { __scopeDropdownMenu, ...groupProps } = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Group, { ...menuScope, ...groupProps });
}

export function Label(props: any): any {
	const slot = S('DropdownMenu.Label');
	const { __scopeDropdownMenu, ...labelProps } = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Label, { ...menuScope, ...labelProps });
}

export function Item(props: any): any {
	const slot = S('DropdownMenu.Item');
	const { __scopeDropdownMenu, ...itemProps } = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Item, { ...menuScope, ...itemProps });
}

export function CheckboxItem(props: any): any {
	const slot = S('DropdownMenu.CheckboxItem');
	const { __scopeDropdownMenu, ...checkboxItemProps } = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.CheckboxItem, { ...menuScope, ...checkboxItemProps });
}

export function RadioGroup(props: any): any {
	const slot = S('DropdownMenu.RadioGroup');
	const { __scopeDropdownMenu, ...radioGroupProps } = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.RadioGroup, { ...menuScope, ...radioGroupProps });
}

export function RadioItem(props: any): any {
	const slot = S('DropdownMenu.RadioItem');
	const { __scopeDropdownMenu, ...radioItemProps } = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.RadioItem, { ...menuScope, ...radioItemProps });
}

export function ItemIndicator(props: any): any {
	const slot = S('DropdownMenu.ItemIndicator');
	const { __scopeDropdownMenu, ...itemIndicatorProps } = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.ItemIndicator, { ...menuScope, ...itemIndicatorProps });
}

export function Separator(props: any): any {
	const slot = S('DropdownMenu.Separator');
	const { __scopeDropdownMenu, ...separatorProps } = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Separator, { ...menuScope, ...separatorProps });
}

export function Arrow(props: any): any {
	const slot = S('DropdownMenu.Arrow');
	const { __scopeDropdownMenu, ...arrowProps } = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.Arrow, { ...menuScope, ...arrowProps });
}

export function Sub(props: any): any {
	const slot = S('DropdownMenu.Sub');
	const { __scopeDropdownMenu, children, open: openProp, onOpenChange, defaultOpen } = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	const [open, setOpen] = useControllableState<boolean>(
		{ prop: openProp, defaultProp: defaultOpen ?? false, onChange: onOpenChange },
		subSlot(slot, 'open'),
	);

	return createElement(MenuPrimitive.Sub, { ...menuScope, open, onOpenChange: setOpen, children });
}

export function SubTrigger(props: any): any {
	const slot = S('DropdownMenu.SubTrigger');
	const { __scopeDropdownMenu, ...subTriggerProps } = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));
	return createElement(MenuPrimitive.SubTrigger, { ...menuScope, ...subTriggerProps });
}

export function SubContent(props: any): any {
	const slot = S('DropdownMenu.SubContent');
	const { __scopeDropdownMenu, ...subContentProps } = props ?? {};
	const menuScope = useMenuScope(__scopeDropdownMenu, subSlot(slot, 'menu'));

	return createElement(MenuPrimitive.SubContent, {
		...menuScope,
		...subContentProps,
		style: {
			...props?.style,
			// re-namespace exposed content custom properties
			'--radix-dropdown-menu-content-transform-origin': 'var(--radix-popper-transform-origin)',
			'--radix-dropdown-menu-content-available-width': 'var(--radix-popper-available-width)',
			'--radix-dropdown-menu-content-available-height': 'var(--radix-popper-available-height)',
			'--radix-dropdown-menu-trigger-width': 'var(--radix-popper-anchor-width)',
			'--radix-dropdown-menu-trigger-height': 'var(--radix-popper-anchor-height)',
		},
	});
}

export {
	Root as DropdownMenu,
	Trigger as DropdownMenuTrigger,
	Content as DropdownMenuContent,
	Item as DropdownMenuItem,
};
