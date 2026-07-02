// Ported from @radix-ui/react-popover (source:
// .radix-primitives/packages/react/popover/src/popover.tsx). A popper-positioned,
// dismissable panel: Trigger doubles as the Popper anchor (unless a custom Anchor is
// rendered), Portal + Presence mount Content into document.body, and Content composes
// FocusScope (trap/loop when modal) + DismissableLayer (Escape / outside interactions)
// on top of Popper.Content. Modal content hides the rest of the app from ATs
// (`aria-hidden`'s hideOthers) and locks body scroll (see scroll-lock.ts for the
// react-remove-scroll divergence note).
import { createElement, useCallback, useEffect, useRef, useState } from 'octane';
import { hideOthers } from 'aria-hidden';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { DismissableLayer } from './DismissableLayer';
import { FocusScope } from './FocusScope';
import { useFocusGuards } from './focus-guards';
import { S, subSlot } from './internal';
import * as PopperPrimitive from './Popper';
import { createPopperScope } from './Popper';
import { Portal as PortalPrimitive } from './Portal';
import { Presence } from './Presence';
import { Primitive } from './Primitive';
import { useScrollLock } from './scroll-lock';
import { useControllableState } from './useControllableState';
import { useId } from './useId';

const POPOVER_NAME = 'Popover';

const [createPopoverContext, createPopoverScope] = createContextScope(POPOVER_NAME, [
	createPopperScope,
]);
export { createPopoverScope };
const usePopperScope = createPopperScope();

interface PopoverContextValue {
	triggerRef: { current: HTMLElement | null };
	contentId: string;
	open: boolean;
	onOpenChange(open: boolean): void;
	onOpenToggle(): void;
	hasCustomAnchor: boolean;
	onCustomAnchorAdd(): void;
	onCustomAnchorRemove(): void;
	modal: boolean;
}

const [PopoverProvider, usePopoverContext] =
	createPopoverContext<PopoverContextValue>(POPOVER_NAME);

export function Root(props: any): any {
	const slot = S('Popover.Root');
	const {
		__scopePopover,
		children,
		open: openProp,
		defaultOpen,
		onOpenChange,
		modal = false,
	} = props ?? {};
	const popperScope = usePopperScope(__scopePopover, subSlot(slot, 'popper'));
	const triggerRef = useRef<HTMLElement | null>(null, subSlot(slot, 'trigger'));
	const [hasCustomAnchor, setHasCustomAnchor] = useState(false, subSlot(slot, 'anchor'));
	const [open, setOpen] = useControllableState<boolean>(
		{ prop: openProp, defaultProp: defaultOpen ?? false, onChange: onOpenChange },
		subSlot(slot, 'open'),
	);
	return createElement(PopperPrimitive.Root, {
		...popperScope,
		children: createElement(PopoverProvider, {
			scope: __scopePopover,
			contentId: useId(subSlot(slot, 'contentId')),
			triggerRef,
			open,
			onOpenChange: setOpen,
			onOpenToggle: useCallback(
				() => setOpen((prevOpen) => !prevOpen),
				[setOpen],
				subSlot(slot, 'toggle'),
			),
			hasCustomAnchor,
			onCustomAnchorAdd: useCallback(() => setHasCustomAnchor(true), [], subSlot(slot, 'add')),
			onCustomAnchorRemove: useCallback(
				() => setHasCustomAnchor(false),
				[],
				subSlot(slot, 'remove'),
			),
			modal,
			children,
		}),
	});
}

export function Anchor(props: any): any {
	const slot = S('Popover.Anchor');
	const { __scopePopover, ...anchorProps } = props ?? {};
	const context = usePopoverContext('PopoverAnchor', __scopePopover);
	const popperScope = usePopperScope(__scopePopover, subSlot(slot, 'popper'));
	const { onCustomAnchorAdd, onCustomAnchorRemove } = context;

	useEffect(
		() => {
			onCustomAnchorAdd();
			return () => onCustomAnchorRemove();
		},
		[onCustomAnchorAdd, onCustomAnchorRemove],
		subSlot(slot, 'e:custom'),
	);

	return createElement(PopperPrimitive.Anchor, { ...popperScope, ...anchorProps });
}

export function Trigger(props: any): any {
	const slot = S('Popover.Trigger');
	const { __scopePopover, ref: forwardedRef, ...triggerProps } = props ?? {};
	const context = usePopoverContext('PopoverTrigger', __scopePopover);
	const popperScope = usePopperScope(__scopePopover, subSlot(slot, 'popper'));
	const composedTriggerRef = useComposedRefs(
		forwardedRef,
		context.triggerRef,
		subSlot(slot, 'refs'),
	);

	const trigger = createElement(Primitive.button, {
		type: 'button',
		'aria-haspopup': 'dialog',
		'aria-expanded': context.open,
		'aria-controls': context.open ? context.contentId : undefined,
		'data-state': getState(context.open),
		...triggerProps,
		ref: composedTriggerRef,
		onClick: composeEventHandlers(props?.onClick, context.onOpenToggle),
	});

	return context.hasCustomAnchor
		? trigger
		: createElement(PopperPrimitive.Anchor, { asChild: true, ...popperScope, children: trigger });
}

const [PortalProvider, usePortalContext] = createPopoverContext<{ forceMount?: boolean }>(
	'PopoverPortal',
	{ forceMount: undefined },
);

/**
 * Mounts its children into `container` (default document.body) through `Presence`.
 * Unlike Dialog.Portal (which maps each child into its own Presence), Popover's
 * source wraps ALL children in a single Presence. octane children convention: pass
 * children at a prop/value position (`children={[<Content/>]}`); a function child
 * is portal'd as a single unit.
 */
export function Portal(props: any): any {
	const { __scopePopover, forceMount, children, container } = props ?? {};
	const context = usePopoverContext('PopoverPortal', __scopePopover);
	return createElement(PortalProvider, {
		scope: __scopePopover,
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

export function Content(props: any): any {
	const portalContext = usePortalContext('PopoverContent', props?.__scopePopover);
	const { forceMount = portalContext.forceMount, ...contentProps } = props ?? {};
	const context = usePopoverContext('PopoverContent', props?.__scopePopover);
	return createElement(Presence, {
		present: forceMount || context.open,
		children: context.modal
			? createElement(ContentModal, contentProps)
			: createElement(ContentNonModal, contentProps),
	});
}

function ContentModal(props: any): any {
	const slot = S('Popover.ContentModal');
	const { ref: forwardedRef, ...rest } = props;
	const context = usePopoverContext('PopoverContent', props.__scopePopover);
	const contentRef = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(forwardedRef, contentRef, subSlot(slot, 'refs'));
	const isRightClickOutsideRef = useRef(false, subSlot(slot, 'rightClick'));

	// aria-hide everything except the content (better supported equivalent to aria-modal).
	useEffect(
		() => {
			const content = contentRef.current;
			if (content) return hideOthers(content);
		},
		[],
		subSlot(slot, 'e:hide'),
	);
	// Radix wraps modal content in `react-remove-scroll` (as a Slot — no wrapper DOM); the
	// octane equivalent is the useScrollLock hook (see scroll-lock.ts).
	useScrollLock(true, subSlot(slot, 'lock'));

	return createElement(ContentImpl, {
		...rest,
		__scopePopover: props.__scopePopover,
		ref: composedRefs,
		// We make sure we're not trapping once it's been closed
		// (closed !== unmounted when animating out).
		trapFocus: context.open,
		disableOutsidePointerEvents: true,
		onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event: Event) => {
			event.preventDefault();
			if (!isRightClickOutsideRef.current) context.triggerRef.current?.focus();
		}),
		onPointerDownOutside: composeEventHandlers(
			props.onPointerDownOutside,
			(event: any) => {
				const originalEvent = event.detail.originalEvent;
				const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
				const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
				isRightClickOutsideRef.current = isRightClick;
			},
			{ checkForDefaultPrevented: false },
		),
		// When focus is trapped, a `focusout` event may still happen —
		// make sure we don't trigger our `onDismiss` in such case.
		onFocusOutside: composeEventHandlers(
			props.onFocusOutside,
			(event: Event) => event.preventDefault(),
			{ checkForDefaultPrevented: false },
		),
	});
}

function ContentNonModal(props: any): any {
	const slot = S('Popover.ContentNonModal');
	const context = usePopoverContext('PopoverContent', props.__scopePopover);
	const hasInteractedOutsideRef = useRef(false, subSlot(slot, 'interacted'));
	const hasPointerDownOutsideRef = useRef(false, subSlot(slot, 'pointer'));

	return createElement(ContentImpl, {
		...props,
		trapFocus: false,
		disableOutsidePointerEvents: false,
		onCloseAutoFocus: (event: Event) => {
			props.onCloseAutoFocus?.(event);
			if (!event.defaultPrevented) {
				if (!hasInteractedOutsideRef.current) context.triggerRef.current?.focus();
				// Always prevent auto focus because we either focus manually or want user agent focus.
				event.preventDefault();
			}
			hasInteractedOutsideRef.current = false;
			hasPointerDownOutsideRef.current = false;
		},
		onInteractOutside: (event: any) => {
			props.onInteractOutside?.(event);
			if (!event.defaultPrevented) {
				hasInteractedOutsideRef.current = true;
				if (event.detail.originalEvent.type === 'pointerdown') {
					hasPointerDownOutsideRef.current = true;
				}
			}
			// Prevent dismissing when clicking the trigger. As the trigger is already
			// setup to close, without doing so it would close and immediately open.
			const target = event.target as HTMLElement;
			const targetIsTrigger = context.triggerRef.current?.contains(target);
			if (targetIsTrigger) event.preventDefault();
			// On Safari, if the trigger is inside a container with tabIndex={0}, clicking the
			// trigger gives a pointer-down outside on it and then a focus outside on the
			// container — ignore any focus outside after a pointer down outside.
			if (event.detail.originalEvent.type === 'focusin' && hasPointerDownOutsideRef.current) {
				event.preventDefault();
			}
		},
	});
}

function ContentImpl(props: any): any {
	const slot = S('Popover.ContentImpl');
	const {
		__scopePopover,
		trapFocus,
		onOpenAutoFocus,
		onCloseAutoFocus,
		disableOutsidePointerEvents,
		onEscapeKeyDown,
		onPointerDownOutside,
		onFocusOutside,
		onInteractOutside,
		...contentProps
	} = props;
	const context = usePopoverContext('PopoverContent', __scopePopover);
	const popperScope = usePopperScope(__scopePopover, subSlot(slot, 'popper'));

	// Make sure the whole tree has focus guards as our `Popover` may be
	// the last element in the DOM (because of the `Portal`).
	useFocusGuards(subSlot(slot, 'guards'));

	return createElement(FocusScope, {
		asChild: true,
		loop: true,
		trapped: trapFocus,
		onMountAutoFocus: onOpenAutoFocus,
		onUnmountAutoFocus: onCloseAutoFocus,
		children: createElement(DismissableLayer, {
			asChild: true,
			disableOutsidePointerEvents,
			onInteractOutside,
			onEscapeKeyDown,
			onPointerDownOutside,
			onFocusOutside,
			onDismiss: () => context.onOpenChange(false),
			deferPointerDownOutside: true,
			children: createElement(PopperPrimitive.Content, {
				'data-state': getState(context.open),
				role: 'dialog',
				id: context.contentId,
				...popperScope,
				...contentProps,
				style: {
					...contentProps.style,
					// re-namespace exposed content custom properties
					'--radix-popover-content-transform-origin': 'var(--radix-popper-transform-origin)',
					'--radix-popover-content-available-width': 'var(--radix-popper-available-width)',
					'--radix-popover-content-available-height': 'var(--radix-popper-available-height)',
					'--radix-popover-trigger-width': 'var(--radix-popper-anchor-width)',
					'--radix-popover-trigger-height': 'var(--radix-popper-anchor-height)',
				},
			}),
		}),
	});
}

export function Close(props: any): any {
	const { __scopePopover, ...closeProps } = props ?? {};
	const context = usePopoverContext('PopoverClose', __scopePopover);
	return createElement(Primitive.button, {
		type: 'button',
		...closeProps,
		onClick: composeEventHandlers(props?.onClick, () => context.onOpenChange(false)),
	});
}

export function Arrow(props: any): any {
	const slot = S('Popover.Arrow');
	const { __scopePopover, ...arrowProps } = props ?? {};
	const popperScope = usePopperScope(__scopePopover, subSlot(slot, 'popper'));
	return createElement(PopperPrimitive.Arrow, { ...popperScope, ...arrowProps });
}

function getState(open?: boolean): 'open' | 'closed' {
	return open ? 'open' : 'closed';
}

export { Root as Popover, Anchor as PopoverAnchor, Trigger as PopoverTrigger };
