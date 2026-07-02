// Ported from @radix-ui/react-dialog. A modal (or non-modal) dialog: Trigger toggles the
// controllable `open`; Portal + Presence mount Overlay/Content into document.body;
// Content composes FocusScope (trap/loop + open/close autofocus) and DismissableLayer
// (Escape / pointer-down-outside / focus-outside → dismiss); modal content hides the rest
// of the app from ATs (`aria-hidden`'s hideOthers) and locks body scroll (see
// scroll-lock.ts for the react-remove-scroll divergence note).
import { Children, createElement, useCallback, useEffect, useRef } from 'octane';
import { hideOthers } from 'aria-hidden';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { DismissableLayer, useDismissableLayerSurface } from './DismissableLayer';
import { FocusScope } from './FocusScope';
import { useFocusGuards } from './focus-guards';
import { S, subSlot } from './internal';
import { Portal as PortalPrimitive } from './Portal';
import { Presence } from './Presence';
import { Primitive } from './Primitive';
import { useScrollLock } from './scroll-lock';
import { useControllableState } from './useControllableState';
import { useId } from './useId';

interface DialogContextValue {
	triggerRef: { current: HTMLElement | null };
	contentRef: { current: HTMLElement | null };
	contentId: string;
	titleId: string;
	descriptionId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onOpenToggle: () => void;
	modal: boolean;
}

export const [createDialogContext, createDialogScope] = createContextScope('Dialog');
const [DialogProvider, useDialogContext] = createDialogContext<DialogContextValue>('Dialog');
const [PortalProvider, usePortalContext] = createDialogContext<{ forceMount?: boolean }>(
	'DialogPortal',
	{ forceMount: undefined },
);

function getState(open?: boolean): 'open' | 'closed' {
	return open ? 'open' : 'closed';
}

export function Root(props: any): any {
	const slot = S('Dialog.Root');
	const {
		__scopeDialog,
		children,
		open: openProp,
		defaultOpen,
		onOpenChange,
		modal = true,
	} = props ?? {};
	const triggerRef = useRef<HTMLElement | null>(null, subSlot(slot, 'trigger'));
	const contentRef = useRef<HTMLElement | null>(null, subSlot(slot, 'content'));
	const [open, setOpen] = useControllableState<boolean>(
		{ prop: openProp, defaultProp: defaultOpen ?? false, onChange: onOpenChange },
		subSlot(slot, 'open'),
	);
	return createElement(DialogProvider, {
		scope: __scopeDialog,
		triggerRef,
		contentRef,
		contentId: useId(subSlot(slot, 'contentId')),
		titleId: useId(subSlot(slot, 'titleId')),
		descriptionId: useId(subSlot(slot, 'descriptionId')),
		open,
		onOpenChange: setOpen,
		onOpenToggle: useCallback(() => setOpen((prev) => !prev), [setOpen], subSlot(slot, 'toggle')),
		modal,
		children,
	});
}

export function Trigger(props: any): any {
	const slot = S('Dialog.Trigger');
	const { __scopeDialog, ref: forwardedRef, ...triggerProps } = props ?? {};
	const context = useDialogContext('DialogTrigger', __scopeDialog);
	const composedTriggerRef = useComposedRefs(
		forwardedRef,
		context.triggerRef,
		subSlot(slot, 'refs'),
	);
	return createElement(Primitive.button, {
		type: 'button',
		'aria-haspopup': 'dialog',
		'aria-expanded': context.open,
		'aria-controls': context.open ? context.contentId : undefined,
		'data-state': getState(context.open),
		...triggerProps,
		ref: composedTriggerRef,
		onClick: composeEventHandlers(props?.onClick, context.onOpenToggle),
	});
}

/**
 * Mounts its children into `container` (default document.body) through `Presence`.
 * Radix maps EACH child into its own `<Presence><Portal asChild>` pair. octane's
 * children-position JSX compiles to an opaque render function, which can't be
 * enumerated — pass children at a prop/value position (e.g.
 * `children={[<Overlay/>, <Content/>]}`) for the faithful per-child treatment; a
 * function child is wrapped as a single portal'd unit (one Presence, one Portal div).
 */
export function Portal(props: any): any {
	const { __scopeDialog, forceMount, children, container } = props ?? {};
	const context = useDialogContext('DialogPortal', __scopeDialog);
	const wrap = (child: any): any =>
		createElement(Presence, {
			present: forceMount || context.open,
			children: createElement(PortalPrimitive, { asChild: true, container, children: child }),
		});
	const mapped =
		typeof children === 'function'
			? createElement(Presence, {
					present: forceMount || context.open,
					children: createElement(PortalPrimitive, { container, children }),
				})
			: Children.map(children, wrap);
	return createElement(PortalProvider, { scope: __scopeDialog, forceMount, children: mapped });
}

export function Overlay(props: any): any {
	const portalContext = usePortalContext('DialogOverlay', props?.__scopeDialog);
	const { forceMount = portalContext.forceMount, ...overlayProps } = props ?? {};
	const context = useDialogContext('DialogOverlay', props?.__scopeDialog);
	return context.modal
		? createElement(Presence, {
				present: forceMount || context.open,
				children: createElement(OverlayImpl, overlayProps),
			})
		: null;
}

function OverlayImpl(props: any): any {
	const slot = S('Dialog.OverlayImpl');
	const { __scopeDialog, ref: forwardedRef, ...overlayProps } = props;
	const context = useDialogContext('DialogOverlay', __scopeDialog);
	// The overlay is the dialog's own dismiss affordance — pressing it dismisses even if
	// something stops propagation (see DismissableLayer.dismissableSurfaces).
	const registerDismissableSurface = useDismissableLayerSurface(subSlot(slot, 'surface'));
	const composedRefs = useComposedRefs(
		forwardedRef,
		registerDismissableSurface,
		subSlot(slot, 'refs'),
	);
	// Radix wraps the overlay in `react-remove-scroll` (as a Slot — no wrapper DOM); the
	// octane equivalent is the useScrollLock hook (see scroll-lock.ts).
	useScrollLock(context.open, subSlot(slot, 'lock'));
	return createElement(Primitive.div, {
		'data-state': getState(context.open),
		...overlayProps,
		ref: composedRefs,
		// Make sure `Content` is scrollable even when it doesn't live inside `RemoveScroll`
		// ie. when `Overlay` and `Content` are siblings.
		style: { pointerEvents: 'auto', ...overlayProps.style },
	});
}

export function Content(props: any): any {
	const portalContext = usePortalContext('DialogContent', props?.__scopeDialog);
	const { forceMount = portalContext.forceMount, ...contentProps } = props ?? {};
	const context = useDialogContext('DialogContent', props?.__scopeDialog);
	return createElement(Presence, {
		present: forceMount || context.open,
		children: context.modal
			? createElement(ContentModal, contentProps)
			: createElement(ContentNonModal, contentProps),
	});
}

function ContentModal(props: any): any {
	const slot = S('Dialog.ContentModal');
	const { ref: forwardedRef, ...rest } = props;
	const context = useDialogContext('DialogContent', props.__scopeDialog);
	const contentRef = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(
		forwardedRef,
		context.contentRef,
		contentRef,
		subSlot(slot, 'refs'),
	);
	// Hide everything else from ATs while the modal is open.
	useEffect(
		() => {
			const content = contentRef.current;
			if (content) return hideOthers(content);
		},
		[],
		subSlot(slot, 'e:hide'),
	);
	return createElement(ContentImpl, {
		...rest,
		__scopeDialog: props.__scopeDialog,
		ref: composedRefs,
		trapFocus: context.open,
		disableOutsidePointerEvents: context.open,
		onCloseAutoFocus: composeEventHandlers(props.onCloseAutoFocus, (event: Event) => {
			event.preventDefault();
			context.triggerRef.current?.focus();
		}),
		onPointerDownOutside: composeEventHandlers(props.onPointerDownOutside, (event: any) => {
			const originalEvent = event.detail.originalEvent;
			const ctrlLeftClick = originalEvent.button === 0 && originalEvent.ctrlKey === true;
			const isRightClick = originalEvent.button === 2 || ctrlLeftClick;
			// Prevent dismissing when clicking the trigger — it's what opened the dialog.
			if (isRightClick) event.preventDefault();
		}),
		// When focus is trapped, a `focusout` event may still happen — prevent dismissing.
		onFocusOutside: composeEventHandlers(props.onFocusOutside, (event: Event) =>
			event.preventDefault(),
		),
	});
}

function ContentNonModal(props: any): any {
	const slot = S('Dialog.ContentNonModal');
	const context = useDialogContext('DialogContent', props.__scopeDialog);
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
				// Always prevent auto-focus because we either focus manually or want user agent focus.
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
			// Prevent dismissing when clicking the trigger — it's what opened the dialog.
			const target = event.target as HTMLElement;
			const targetIsTrigger = context.triggerRef.current?.contains(target);
			if (targetIsTrigger) event.preventDefault();
			// On Safari, if the trigger is inside a container with tabIndex={0}, clicking
			// the trigger would blur the open dialog (focusin outside) — prevent that too.
			if (event.detail.originalEvent.type === 'focusin' && hasPointerDownOutsideRef.current) {
				event.preventDefault();
			}
		},
	});
}

function ContentImpl(props: any): any {
	const slot = S('Dialog.ContentImpl');
	const { __scopeDialog, trapFocus, onOpenAutoFocus, onCloseAutoFocus, ...contentProps } = props;
	const context = useDialogContext('DialogContent', __scopeDialog);
	// Make sure the whole tree has focus guards as our `Dialog` will be the last element
	// in the DOM (because of the `Portal`).
	useFocusGuards(subSlot(slot, 'guards'));
	// FocusScope renders `asChild` (Radix parity): its tabIndex/onKeyDown/ref merge onto
	// the DismissableLayer's element via Slot — no wrapper div in the DOM.
	return createElement(FocusScope, {
		asChild: true,
		loop: true,
		trapped: trapFocus,
		onMountAutoFocus: onOpenAutoFocus,
		onUnmountAutoFocus: onCloseAutoFocus,
		children: createElement(DismissableLayer, {
			role: 'dialog',
			id: context.contentId,
			'aria-describedby': context.descriptionId,
			'aria-labelledby': context.titleId,
			'data-state': getState(context.open),
			...contentProps,
			deferPointerDownOutside: true,
			onDismiss: () => context.onOpenChange(false),
		}),
	});
}

export function Title(props: any): any {
	const { __scopeDialog, ...titleProps } = props ?? {};
	const context = useDialogContext('DialogTitle', __scopeDialog);
	return createElement(Primitive.h2, { id: context.titleId, ...titleProps });
}

export function Description(props: any): any {
	const { __scopeDialog, ...descriptionProps } = props ?? {};
	const context = useDialogContext('DialogDescription', __scopeDialog);
	return createElement(Primitive.p, { id: context.descriptionId, ...descriptionProps });
}

export function Close(props: any): any {
	const { __scopeDialog, ...closeProps } = props ?? {};
	const context = useDialogContext('DialogClose', __scopeDialog);
	return createElement(Primitive.button, {
		type: 'button',
		...closeProps,
		onClick: composeEventHandlers(props?.onClick, () => context.onOpenChange(false)),
	});
}

export { Root as Dialog };
