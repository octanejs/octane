// Ported from @radix-ui/react-hover-card (source:
// .radix-primitives/packages/react/hover-card/src/hover-card.tsx). A link-preview card
// for sighted pointer users: Trigger (an anchor, doubling as the Popper anchor) opens
// after `openDelay` on pointer-enter/focus and closes after `closeDelay` on
// pointer-leave/blur — unless the user is selecting text in the card or has the pointer
// down on it. Content composes DismissableLayer over Popper.Content, contains text
// selection to the card while selecting, and removes its tabbables from the tab order.
import { createElement, useCallback, useEffect, useRef, useState } from 'octane';

import { composeEventHandlers } from './compose-event-handlers';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { DismissableLayer } from './DismissableLayer';
import { S, subSlot } from './internal';
import * as PopperPrimitive from './Popper';
import { createPopperScope } from './Popper';
import { Portal as PortalPrimitive } from './Portal';
import { Presence } from './Presence';
import { Primitive } from './Primitive';
import { useControllableState } from './useControllableState';

let originalBodyUserSelect: string;

const HOVERCARD_NAME = 'HoverCard';

const [createHoverCardContext, createHoverCardScope] = createContextScope(HOVERCARD_NAME, [
	createPopperScope,
]);
export { createHoverCardScope };
const usePopperScope = createPopperScope();

interface HoverCardContextValue {
	open: boolean;
	onOpenChange(open: boolean): void;
	onOpen(): void;
	onClose(): void;
	onDismiss(): void;
	hasSelectionRef: { current: boolean };
	isPointerDownOnContentRef: { current: boolean };
}

const [HoverCardProvider, useHoverCardContext] =
	createHoverCardContext<HoverCardContextValue>(HOVERCARD_NAME);

export function Root(props: any): any {
	const slot = S('HoverCard.Root');
	const {
		__scopeHoverCard,
		children,
		open: openProp,
		defaultOpen,
		onOpenChange,
		openDelay = 700,
		closeDelay = 300,
	} = props ?? {};
	const popperScope = usePopperScope(__scopeHoverCard, subSlot(slot, 'popper'));
	const openTimerRef = useRef(0, subSlot(slot, 'openTimer'));
	const closeTimerRef = useRef(0, subSlot(slot, 'closeTimer'));
	const hasSelectionRef = useRef(false, subSlot(slot, 'selection'));
	const isPointerDownOnContentRef = useRef(false, subSlot(slot, 'pointerDown'));

	const [open, setOpen] = useControllableState<boolean>(
		{ prop: openProp, defaultProp: defaultOpen ?? false, onChange: onOpenChange },
		subSlot(slot, 'open'),
	);

	const handleOpen = useCallback(
		() => {
			clearTimeout(closeTimerRef.current);
			openTimerRef.current = window.setTimeout(() => setOpen(true), openDelay);
		},
		[openDelay, setOpen],
		subSlot(slot, 'handleOpen'),
	);

	const handleClose = useCallback(
		() => {
			clearTimeout(openTimerRef.current);
			if (!hasSelectionRef.current && !isPointerDownOnContentRef.current) {
				closeTimerRef.current = window.setTimeout(() => setOpen(false), closeDelay);
			}
		},
		[closeDelay, setOpen],
		subSlot(slot, 'handleClose'),
	);

	const handleDismiss = useCallback(() => setOpen(false), [setOpen], subSlot(slot, 'dismiss'));

	// cleanup any queued state updates on unmount
	useEffect(
		() => {
			return () => {
				clearTimeout(openTimerRef.current);
				clearTimeout(closeTimerRef.current);
			};
		},
		[],
		subSlot(slot, 'e:cleanup'),
	);

	return createElement(HoverCardProvider, {
		scope: __scopeHoverCard,
		open,
		onOpenChange: setOpen,
		onOpen: handleOpen,
		onClose: handleClose,
		onDismiss: handleDismiss,
		hasSelectionRef,
		isPointerDownOnContentRef,
		children: createElement(PopperPrimitive.Root, { ...popperScope, children }),
	});
}

export function Trigger(props: any): any {
	const slot = S('HoverCard.Trigger');
	const { __scopeHoverCard, ...triggerProps } = props ?? {};
	const context = useHoverCardContext('HoverCardTrigger', __scopeHoverCard);
	const popperScope = usePopperScope(__scopeHoverCard, subSlot(slot, 'popper'));
	return createElement(PopperPrimitive.Anchor, {
		asChild: true,
		...popperScope,
		children: createElement(Primitive.a, {
			'data-state': context.open ? 'open' : 'closed',
			...triggerProps,
			onPointerEnter: composeEventHandlers(props?.onPointerEnter, excludeTouch(context.onOpen)),
			onPointerLeave: composeEventHandlers(props?.onPointerLeave, excludeTouch(context.onClose)),
			onFocus: composeEventHandlers(props?.onFocus, context.onOpen),
			onBlur: composeEventHandlers(props?.onBlur, context.onClose),
			// prevent focus event on touch devices
			onTouchStart: composeEventHandlers(props?.onTouchStart, (event: Event) =>
				event.preventDefault(),
			),
		}),
	});
}

const [PortalProvider, usePortalContext] = createHoverCardContext<{ forceMount?: boolean }>(
	'HoverCardPortal',
	{ forceMount: undefined },
);

/**
 * Mounts its children into `container` (default document.body) through `Presence`.
 * octane children convention: pass children at a prop/value position
 * (`children={[<Content/>]}`); a function child is portal'd as a single unit.
 */
export function Portal(props: any): any {
	const { __scopeHoverCard, forceMount, children, container } = props ?? {};
	const context = useHoverCardContext('HoverCardPortal', __scopeHoverCard);
	return createElement(PortalProvider, {
		scope: __scopeHoverCard,
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
	const portalContext = usePortalContext('HoverCardContent', props?.__scopeHoverCard);
	const { forceMount = portalContext.forceMount, ...contentProps } = props ?? {};
	const context = useHoverCardContext('HoverCardContent', props?.__scopeHoverCard);
	return createElement(Presence, {
		present: forceMount || context.open,
		children: createElement(ContentImpl, {
			'data-state': context.open ? 'open' : 'closed',
			...contentProps,
			onPointerEnter: composeEventHandlers(props?.onPointerEnter, excludeTouch(context.onOpen)),
			onPointerLeave: composeEventHandlers(props?.onPointerLeave, excludeTouch(context.onClose)),
		}),
	});
}

function ContentImpl(props: any): any {
	const slot = S('HoverCard.ContentImpl');
	const {
		__scopeHoverCard,
		ref: forwardedRef,
		onEscapeKeyDown,
		onPointerDownOutside,
		onFocusOutside,
		onInteractOutside,
		...contentProps
	} = props;
	const context = useHoverCardContext('HoverCardContent', __scopeHoverCard);
	const popperScope = usePopperScope(__scopeHoverCard, subSlot(slot, 'popper'));
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(forwardedRef, ref, subSlot(slot, 'refs'));
	const [containSelection, setContainSelection] = useState(false, subSlot(slot, 'contain'));

	useEffect(
		() => {
			if (containSelection) {
				const body = document.body;
				// Safari requires prefix
				originalBodyUserSelect = body.style.userSelect || (body.style as any).webkitUserSelect;
				body.style.userSelect = 'none';
				(body.style as any).webkitUserSelect = 'none';
				return () => {
					body.style.userSelect = originalBodyUserSelect;
					(body.style as any).webkitUserSelect = originalBodyUserSelect;
				};
			}
		},
		[containSelection],
		subSlot(slot, 'e:selection'),
	);

	useEffect(
		() => {
			if (ref.current) {
				const handlePointerUp = (): void => {
					setContainSelection(false);
					context.isPointerDownOnContentRef.current = false;
					// Delay a frame to ensure we always access the latest selection
					setTimeout(() => {
						const hasSelection = document.getSelection()?.toString() !== '';
						if (hasSelection) context.hasSelectionRef.current = true;
					});
				};
				document.addEventListener('pointerup', handlePointerUp);
				return () => {
					document.removeEventListener('pointerup', handlePointerUp);
					context.hasSelectionRef.current = false;
					context.isPointerDownOnContentRef.current = false;
				};
			}
		},
		[context.isPointerDownOnContentRef, context.hasSelectionRef],
		subSlot(slot, 'e:pointerup'),
	);

	// Remove the card's tabbables from the tab order (runs after every render —
	// no deps, matching Radix).
	useEffect(
		() => {
			if (ref.current) {
				const tabbables = getTabbableNodes(ref.current);
				tabbables.forEach((tabbable) => tabbable.setAttribute('tabindex', '-1'));
			}
		},
		undefined,
		subSlot(slot, 'e:tabbables'),
	);

	return createElement(DismissableLayer, {
		asChild: true,
		disableOutsidePointerEvents: false,
		onInteractOutside,
		onEscapeKeyDown,
		onPointerDownOutside,
		onFocusOutside: composeEventHandlers(onFocusOutside, (event: Event) => {
			event.preventDefault();
		}),
		onDismiss: context.onDismiss,
		children: createElement(PopperPrimitive.Content, {
			...popperScope,
			...contentProps,
			onPointerDown: composeEventHandlers(contentProps.onPointerDown, (event: PointerEvent) => {
				// Contain selection to current layer
				if ((event.currentTarget as HTMLElement).contains(event.target as HTMLElement)) {
					setContainSelection(true);
				}
				context.hasSelectionRef.current = false;
				context.isPointerDownOnContentRef.current = true;
			}),
			ref: composedRefs,
			style: {
				...contentProps.style,
				userSelect: containSelection ? 'text' : undefined,
				// Safari requires prefix
				WebkitUserSelect: containSelection ? 'text' : undefined,
				// re-namespace exposed content custom properties
				'--radix-hover-card-content-transform-origin': 'var(--radix-popper-transform-origin)',
				'--radix-hover-card-content-available-width': 'var(--radix-popper-available-width)',
				'--radix-hover-card-content-available-height': 'var(--radix-popper-available-height)',
				'--radix-hover-card-trigger-width': 'var(--radix-popper-anchor-width)',
				'--radix-hover-card-trigger-height': 'var(--radix-popper-anchor-height)',
			},
		}),
	});
}

export function Arrow(props: any): any {
	const slot = S('HoverCard.Arrow');
	const { __scopeHoverCard, ...arrowProps } = props ?? {};
	const popperScope = usePopperScope(__scopeHoverCard, subSlot(slot, 'popper'));
	return createElement(PopperPrimitive.Arrow, { ...popperScope, ...arrowProps });
}

function excludeTouch(eventHandler: () => void): (event: PointerEvent) => void {
	return (event: PointerEvent) => (event.pointerType === 'touch' ? undefined : eventHandler());
}

/**
 * Returns a list of nodes that can be in the tab sequence.
 * @see: https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker
 */
function getTabbableNodes(container: HTMLElement): HTMLElement[] {
	const nodes: HTMLElement[] = [];
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
		acceptNode: (node: any) => {
			// `.tabIndex` is not the same as the `tabindex` attribute. It works on the
			// runtime's understanding of tabbability, so this automatically accounts
			// for any kind of element that could be tabbed to.
			return node.tabIndex >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
		},
	});
	while (walker.nextNode()) nodes.push(walker.currentNode as HTMLElement);
	return nodes;
}

export { Root as HoverCard, Trigger as HoverCardTrigger, Content as HoverCardContent };
