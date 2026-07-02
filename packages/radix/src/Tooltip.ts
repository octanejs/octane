// Ported from @radix-ui/react-tooltip (source:
// .radix-primitives/packages/react/tooltip/src/tooltip.tsx). Provider manages the shared
// delay/skip-delay state; Trigger is the Popper anchor (pointer-move opens after the
// delay, focus opens instantly, click/blur/pointer-down close); Content positions via
// Popper inside a DismissableLayer, closes when another tooltip opens or the trigger
// scrolls, and — unless `disableHoverableContent` — keeps itself open while the pointer
// travels the trigger→content convex-hull grace area. An a11y copy of the children
// renders in a VisuallyHidden `role=tooltip` (octane note: instead of Radix's `Slottable`
// split, the user children render inside a Fragment alongside the hidden copy).
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'octane';

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
import { useId } from './useId';
import * as VisuallyHiddenPrimitive from './VisuallyHidden';

type Point = { x: number; y: number };
type Polygon = Point[];

const [createTooltipContext, createTooltipScope] = createContextScope('Tooltip', [
	createPopperScope,
]);
export { createTooltipScope };
const usePopperScope = createPopperScope();

const DEFAULT_DELAY_DURATION = 700;
const TOOLTIP_OPEN = 'tooltip.open';

interface ProviderContextValue {
	isOpenDelayedRef: { current: boolean };
	delayDuration: number;
	onOpen(): void;
	onClose(): void;
	onPointerInTransitChange(inTransit: boolean): void;
	isPointerInTransitRef: { current: boolean };
	disableHoverableContent: boolean;
}
const [TooltipProviderContextProvider, useTooltipProviderContext] =
	createTooltipContext<ProviderContextValue>('TooltipProvider');

export function Provider(props: any): any {
	const slot = S('Tooltip.Provider');
	const {
		__scopeTooltip,
		delayDuration = DEFAULT_DELAY_DURATION,
		skipDelayDuration = 300,
		disableHoverableContent = false,
		children,
	} = props ?? {};
	const isOpenDelayedRef = useRef(true, subSlot(slot, 'delayed'));
	const isPointerInTransitRef = useRef(false, subSlot(slot, 'transit'));
	const skipDelayTimerRef = useRef(0, subSlot(slot, 'timer'));
	useEffect(
		() => {
			const skipDelayTimer = skipDelayTimerRef.current;
			return () => window.clearTimeout(skipDelayTimer);
		},
		[],
		subSlot(slot, 'e:cleanup'),
	);
	return createElement(TooltipProviderContextProvider, {
		scope: __scopeTooltip,
		isOpenDelayedRef,
		delayDuration,
		onOpen: useCallback(
			() => {
				if (skipDelayDuration <= 0) return;
				window.clearTimeout(skipDelayTimerRef.current);
				isOpenDelayedRef.current = false;
			},
			[skipDelayDuration],
			subSlot(slot, 'onOpen'),
		),
		onClose: useCallback(
			() => {
				if (skipDelayDuration <= 0) return;
				window.clearTimeout(skipDelayTimerRef.current);
				skipDelayTimerRef.current = window.setTimeout(
					() => (isOpenDelayedRef.current = true),
					skipDelayDuration,
				);
			},
			[skipDelayDuration],
			subSlot(slot, 'onClose'),
		),
		isPointerInTransitRef,
		onPointerInTransitChange: useCallback(
			(inTransit: boolean) => {
				isPointerInTransitRef.current = inTransit;
			},
			[],
			subSlot(slot, 'transitChange'),
		),
		disableHoverableContent,
		children,
	});
}

interface TooltipContextValue {
	contentId: string;
	open: boolean;
	stateAttribute: 'closed' | 'delayed-open' | 'instant-open';
	trigger: HTMLElement | null;
	onTriggerChange(trigger: HTMLElement | null): void;
	onTriggerEnter(): void;
	onTriggerLeave(): void;
	onOpen(): void;
	onClose(): void;
	disableHoverableContent: boolean;
}
const [TooltipContextProvider, useTooltipContext] =
	createTooltipContext<TooltipContextValue>('Tooltip');

export function Root(props: any): any {
	const slot = S('Tooltip.Root');
	const {
		__scopeTooltip,
		children,
		open: openProp,
		defaultOpen,
		onOpenChange,
		disableHoverableContent: disableHoverableContentProp,
		delayDuration: delayDurationProp,
	} = props ?? {};
	const providerContext = useTooltipProviderContext('Tooltip', __scopeTooltip);
	const popperScope = usePopperScope(__scopeTooltip, subSlot(slot, 'popper'));
	const [trigger, setTrigger] = useState<HTMLElement | null>(null, subSlot(slot, 'trigger'));
	const contentId = useId(subSlot(slot, 'id'));
	const openTimerRef = useRef(0, subSlot(slot, 'timer'));
	const disableHoverableContent =
		disableHoverableContentProp ?? providerContext.disableHoverableContent;
	const delayDuration = delayDurationProp ?? providerContext.delayDuration;
	const wasOpenDelayedRef = useRef(false, subSlot(slot, 'wasDelayed'));
	const [open, setOpen] = useControllableState<boolean>(
		{
			prop: openProp,
			defaultProp: defaultOpen ?? false,
			onChange: (isOpen: boolean) => {
				if (isOpen) {
					providerContext.onOpen();
					// as `onChange` is called within a lifecycle method we avoid
					// dispatching via `dispatchDiscreteCustomEvent`.
					document.dispatchEvent(new CustomEvent(TOOLTIP_OPEN));
				} else {
					providerContext.onClose();
				}
				onOpenChange?.(isOpen);
			},
		},
		subSlot(slot, 'open'),
	);
	const stateAttribute = useMemo(
		() => (open ? (wasOpenDelayedRef.current ? 'delayed-open' : 'instant-open') : 'closed'),
		[open],
		subSlot(slot, 'state'),
	) as TooltipContextValue['stateAttribute'];
	const handleOpen = useCallback(
		() => {
			window.clearTimeout(openTimerRef.current);
			openTimerRef.current = 0;
			wasOpenDelayedRef.current = false;
			setOpen(true);
		},
		[setOpen],
		subSlot(slot, 'handleOpen'),
	);
	const handleClose = useCallback(
		() => {
			window.clearTimeout(openTimerRef.current);
			openTimerRef.current = 0;
			setOpen(false);
		},
		[setOpen],
		subSlot(slot, 'handleClose'),
	);
	const handleDelayedOpen = useCallback(
		() => {
			window.clearTimeout(openTimerRef.current);
			openTimerRef.current = window.setTimeout(() => {
				wasOpenDelayedRef.current = true;
				setOpen(true);
				openTimerRef.current = 0;
			}, delayDuration);
		},
		[delayDuration, setOpen],
		subSlot(slot, 'delayedOpen'),
	);
	useEffect(
		() => {
			return () => {
				if (openTimerRef.current) {
					window.clearTimeout(openTimerRef.current);
					openTimerRef.current = 0;
				}
			};
		},
		[],
		subSlot(slot, 'e:timer'),
	);
	return createElement(PopperPrimitive.Root, {
		...popperScope,
		children: createElement(TooltipContextProvider, {
			scope: __scopeTooltip,
			contentId,
			open,
			stateAttribute,
			trigger,
			onTriggerChange: setTrigger,
			onTriggerEnter: useCallback(
				() => {
					if (providerContext.isOpenDelayedRef.current) handleDelayedOpen();
					else handleOpen();
				},
				[handleDelayedOpen, handleOpen],
				subSlot(slot, 'enter'),
			),
			onTriggerLeave: useCallback(
				() => {
					if (disableHoverableContent) {
						handleClose();
					} else {
						// Clear the timer in case the pointer leaves the trigger before the
						// tooltip is opened.
						window.clearTimeout(openTimerRef.current);
						openTimerRef.current = 0;
					}
				},
				[handleClose, disableHoverableContent],
				subSlot(slot, 'leave'),
			),
			onOpen: handleOpen,
			onClose: handleClose,
			disableHoverableContent,
			children,
		}),
	});
}

export function Trigger(props: any): any {
	const slot = S('Tooltip.Trigger');
	const { __scopeTooltip, ref: forwardedRef, ...triggerProps } = props ?? {};
	const context = useTooltipContext('TooltipTrigger', __scopeTooltip);
	const providerContext = useTooltipProviderContext('TooltipTrigger', __scopeTooltip);
	const popperScope = usePopperScope(__scopeTooltip, subSlot(slot, 'popper'));
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(
		forwardedRef,
		ref,
		context.onTriggerChange,
		subSlot(slot, 'refs'),
	);
	const isPointerDownRef = useRef(false, subSlot(slot, 'down'));
	const hasPointerMoveOpenedRef = useRef(false, subSlot(slot, 'moved'));
	const handlePointerUp = useCallback(
		() => (isPointerDownRef.current = false),
		[],
		subSlot(slot, 'up'),
	);
	useEffect(
		() => {
			return () => document.removeEventListener('pointerup', handlePointerUp);
		},
		[],
		subSlot(slot, 'e:up'),
	);
	return createElement(PopperPrimitive.Anchor, {
		asChild: true,
		...popperScope,
		// We purposefully avoid adding `type=button` here because tooltip triggers are
		// also commonly anchors, where the `type` attribute signifies MIME type.
		children: createElement(Primitive.button, {
			'aria-describedby': context.open ? context.contentId : undefined,
			'data-state': context.stateAttribute,
			...triggerProps,
			ref: composedRefs,
			onPointerMove: composeEventHandlers(props?.onPointerMove, (event: PointerEvent) => {
				if (event.pointerType === 'touch') return;
				if (!hasPointerMoveOpenedRef.current && !providerContext.isPointerInTransitRef.current) {
					context.onTriggerEnter();
					hasPointerMoveOpenedRef.current = true;
				}
			}),
			onPointerLeave: composeEventHandlers(props?.onPointerLeave, () => {
				context.onTriggerLeave();
				hasPointerMoveOpenedRef.current = false;
			}),
			onPointerDown: composeEventHandlers(props?.onPointerDown, () => {
				if (context.open) context.onClose();
				isPointerDownRef.current = true;
				document.addEventListener('pointerup', handlePointerUp, { once: true });
			}),
			onFocus: composeEventHandlers(props?.onFocus, () => {
				if (!isPointerDownRef.current) context.onOpen();
			}),
			onBlur: composeEventHandlers(props?.onBlur, context.onClose),
			onClick: composeEventHandlers(props?.onClick, context.onClose),
		}),
	});
}

const [PortalProvider, usePortalContext] = createTooltipContext<{ forceMount?: boolean }>(
	'TooltipPortal',
	{ forceMount: undefined },
);

export function Portal(props: any): any {
	const { __scopeTooltip, forceMount, children, container } = props ?? {};
	const context = useTooltipContext('TooltipPortal', __scopeTooltip);
	return createElement(PortalProvider, {
		scope: __scopeTooltip,
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
	const portalContext = usePortalContext('TooltipContent', props?.__scopeTooltip);
	const { forceMount = portalContext.forceMount, side = 'top', ...contentProps } = props ?? {};
	const context = useTooltipContext('TooltipContent', props?.__scopeTooltip);
	return createElement(Presence, {
		present: forceMount || context.open,
		children: context.disableHoverableContent
			? createElement(ContentImpl, { side, ...contentProps })
			: createElement(ContentHoverable, { side, ...contentProps }),
	});
}

function ContentHoverable(props: any): any {
	const slot = S('Tooltip.ContentHoverable');
	const { ref: forwardedRef, ...rest } = props;
	const context = useTooltipContext('TooltipContent', props.__scopeTooltip);
	const providerContext = useTooltipProviderContext('TooltipContent', props.__scopeTooltip);
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const composedRefs = useComposedRefs(forwardedRef, ref, subSlot(slot, 'refs'));
	const [pointerGraceArea, setPointerGraceArea] = useState<Polygon | null>(
		null,
		subSlot(slot, 'grace'),
	);
	const { trigger, onClose } = context;
	const content = ref.current;
	const { onPointerInTransitChange } = providerContext;

	const handleRemoveGraceArea = useCallback(
		() => {
			setPointerGraceArea(null);
			onPointerInTransitChange(false);
		},
		[onPointerInTransitChange],
		subSlot(slot, 'remove'),
	);
	const handleCreateGraceArea = useCallback(
		(event: PointerEvent, hoverTarget: HTMLElement) => {
			const currentTarget = event.currentTarget as HTMLElement;
			const exitPoint = { x: event.clientX, y: event.clientY };
			const exitSide = getExitSideFromRect(exitPoint, currentTarget.getBoundingClientRect());
			const paddedExitPoints = getPaddedExitPoints(exitPoint, exitSide);
			const hoverTargetPoints = getPointsFromRect(hoverTarget.getBoundingClientRect());
			const graceArea = getHull([...paddedExitPoints, ...hoverTargetPoints]);
			setPointerGraceArea(graceArea);
			onPointerInTransitChange(true);
		},
		[onPointerInTransitChange],
		subSlot(slot, 'create'),
	);

	useEffect(
		() => {
			return () => handleRemoveGraceArea();
		},
		[handleRemoveGraceArea],
		subSlot(slot, 'e:cleanup'),
	);

	useEffect(
		() => {
			if (trigger && content) {
				const handleTriggerLeave = (event: PointerEvent): void =>
					handleCreateGraceArea(event, content);
				const handleContentLeave = (event: PointerEvent): void =>
					handleCreateGraceArea(event, trigger);
				trigger.addEventListener('pointerleave', handleTriggerLeave);
				content.addEventListener('pointerleave', handleContentLeave);
				return () => {
					trigger.removeEventListener('pointerleave', handleTriggerLeave);
					content.removeEventListener('pointerleave', handleContentLeave);
				};
			}
		},
		[trigger, content, handleCreateGraceArea],
		subSlot(slot, 'e:leave'),
	);

	useEffect(
		() => {
			if (pointerGraceArea) {
				const handleTrackPointerGrace = (event: PointerEvent): void => {
					const target = event.target as HTMLElement;
					const pointerPosition = { x: event.clientX, y: event.clientY };
					const hasEnteredTarget = trigger?.contains(target) || content?.contains(target);
					const isPointerOutsideGraceArea = !isPointInPolygon(pointerPosition, pointerGraceArea);
					if (hasEnteredTarget) {
						handleRemoveGraceArea();
					} else if (isPointerOutsideGraceArea) {
						handleRemoveGraceArea();
						onClose();
					}
				};
				document.addEventListener('pointermove', handleTrackPointerGrace);
				return () => document.removeEventListener('pointermove', handleTrackPointerGrace);
			}
		},
		[trigger, content, pointerGraceArea, onClose, handleRemoveGraceArea],
		subSlot(slot, 'e:track'),
	);

	return createElement(ContentImpl, {
		...rest,
		__scopeTooltip: props.__scopeTooltip,
		ref: composedRefs,
	});
}

const [VisuallyHiddenContentContextProvider, useVisuallyHiddenContentContext] =
	createTooltipContext<{ isInside: boolean }>('Tooltip', { isInside: false });

function ContentImpl(props: any): any {
	const slot = S('Tooltip.ContentImpl');
	const {
		__scopeTooltip,
		children,
		'aria-label': ariaLabel,
		onEscapeKeyDown,
		onPointerDownOutside,
		...contentProps
	} = props;
	const context = useTooltipContext('TooltipContent', __scopeTooltip);
	const popperScope = usePopperScope(__scopeTooltip, subSlot(slot, 'popper'));
	const { onClose } = context;

	// Close this tooltip if another one opens.
	useEffect(
		() => {
			document.addEventListener(TOOLTIP_OPEN, onClose);
			return () => document.removeEventListener(TOOLTIP_OPEN, onClose);
		},
		[onClose],
		subSlot(slot, 'e:open'),
	);
	// Close the tooltip if the trigger is scrolled.
	useEffect(
		() => {
			if (context.trigger) {
				const handleScroll = (event: Event): void => {
					if (event.target instanceof Node && event.target.contains(context.trigger)) {
						onClose();
					}
				};
				window.addEventListener('scroll', handleScroll, { capture: true });
				return () => window.removeEventListener('scroll', handleScroll, { capture: true });
			}
		},
		[context.trigger, onClose],
		subSlot(slot, 'e:scroll'),
	);

	return createElement(DismissableLayer, {
		asChild: true,
		disableOutsidePointerEvents: false,
		onEscapeKeyDown,
		onPointerDownOutside,
		onFocusOutside: (event: Event) => event.preventDefault(),
		onDismiss: onClose,
		children: createElement(PopperPrimitive.Content, {
			'data-state': context.stateAttribute,
			...popperScope,
			...contentProps,
			style: {
				...contentProps.style,
				// re-namespace exposed content custom properties
				'--radix-tooltip-content-transform-origin': 'var(--radix-popper-transform-origin)',
				'--radix-tooltip-content-available-width': 'var(--radix-popper-available-width)',
				'--radix-tooltip-content-available-height': 'var(--radix-popper-available-height)',
				'--radix-tooltip-trigger-width': 'var(--radix-popper-anchor-width)',
				'--radix-tooltip-trigger-height': 'var(--radix-popper-anchor-height)',
			},
			children: [
				// octane: the user children render through a pass-through host (Radix uses
				// `Slottable` purely for asChild-splitting, which octane handles via props).
				createElement(ChildrenHost, { key: 'c', children }),
				createElement(VisuallyHiddenContentContextProvider, {
					key: 'vh',
					scope: __scopeTooltip,
					isInside: true,
					children: createElement(VisuallyHiddenPrimitive.Root, {
						id: context.contentId,
						role: 'tooltip',
						children: ariaLabel || children,
					}),
				}),
			],
		}),
	});
}

export function Arrow(props: any): any {
	const slot = S('Tooltip.Arrow');
	const { __scopeTooltip, ...arrowProps } = props ?? {};
	const popperScope = usePopperScope(__scopeTooltip, subSlot(slot, 'popper'));
	const visuallyHiddenContentContext = useVisuallyHiddenContentContext(
		'TooltipArrow',
		__scopeTooltip,
	);
	// If the arrow is inside the VisuallyHidden a11y copy, don't render it at all —
	// the duplicate would break arrow positioning.
	return visuallyHiddenContentContext.isInside
		? null
		: createElement(PopperPrimitive.Arrow, { ...popperScope, ...arrowProps });
}

// Pass-through: renders its children (function or descriptor) as-is.
function ChildrenHost(props: any): any {
	return props.children;
}

/* ----------------------------- grace-area geometry ----------------------------- */

function getExitSideFromRect(point: Point, rect: DOMRect): 'top' | 'bottom' | 'left' | 'right' {
	const top = Math.abs(rect.top - point.y);
	const bottom = Math.abs(rect.bottom - point.y);
	const right = Math.abs(rect.right - point.x);
	const left = Math.abs(rect.left - point.x);
	switch (Math.min(top, bottom, right, left)) {
		case left:
			return 'left';
		case right:
			return 'right';
		case top:
			return 'top';
		case bottom:
			return 'bottom';
		default:
			throw new Error('unreachable');
	}
}

function getPaddedExitPoints(exitPoint: Point, exitSide: string, padding = 5): Point[] {
	const paddedExitPoints: Point[] = [];
	switch (exitSide) {
		case 'top':
			paddedExitPoints.push(
				{ x: exitPoint.x - padding, y: exitPoint.y + padding },
				{ x: exitPoint.x + padding, y: exitPoint.y + padding },
			);
			break;
		case 'bottom':
			paddedExitPoints.push(
				{ x: exitPoint.x - padding, y: exitPoint.y - padding },
				{ x: exitPoint.x + padding, y: exitPoint.y - padding },
			);
			break;
		case 'left':
			paddedExitPoints.push(
				{ x: exitPoint.x + padding, y: exitPoint.y - padding },
				{ x: exitPoint.x + padding, y: exitPoint.y + padding },
			);
			break;
		case 'right':
			paddedExitPoints.push(
				{ x: exitPoint.x - padding, y: exitPoint.y - padding },
				{ x: exitPoint.x - padding, y: exitPoint.y + padding },
			);
			break;
	}
	return paddedExitPoints;
}

function getPointsFromRect(rect: DOMRect): Point[] {
	const { top, right, bottom, left } = rect;
	return [
		{ x: left, y: top },
		{ x: right, y: top },
		{ x: right, y: bottom },
		{ x: left, y: bottom },
	];
}

// Determine if a point is inside of a polygon (github.com/substack/point-in-polygon).
function isPointInPolygon(point: Point, polygon: Polygon): boolean {
	const { x, y } = point;
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i]!.x;
		const yi = polygon[i]!.y;
		const xj = polygon[j]!.x;
		const yj = polygon[j]!.y;
		const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
		if (intersect) inside = !inside;
	}
	return inside;
}

// Convex hull (nayuki.io/page/convex-hull-algorithm).
function getHull<P extends Point>(points: ReadonlyArray<P>): P[] {
	const newPoints: P[] = points.slice();
	newPoints.sort((a: Point, b: Point) => {
		if (a.x < b.x) return -1;
		else if (a.x > b.x) return +1;
		else if (a.y < b.y) return -1;
		else if (a.y > b.y) return +1;
		else return 0;
	});
	return getHullPresorted(newPoints);
}

// Convex hull of pre-sorted points, O(n).
function getHullPresorted<P extends Point>(points: ReadonlyArray<P>): P[] {
	if (points.length <= 1) return points.slice();
	const upperHull: P[] = [];
	for (let i = 0; i < points.length; i++) {
		const p = points[i]!;
		while (upperHull.length >= 2) {
			const q = upperHull[upperHull.length - 1]!;
			const r = upperHull[upperHull.length - 2]!;
			if ((q.x - r.x) * (p.y - r.y) >= (q.y - r.y) * (p.x - r.x)) upperHull.pop();
			else break;
		}
		upperHull.push(p);
	}
	upperHull.pop();
	const lowerHull: P[] = [];
	for (let i = points.length - 1; i >= 0; i--) {
		const p = points[i]!;
		while (lowerHull.length >= 2) {
			const q = lowerHull[lowerHull.length - 1]!;
			const r = lowerHull[lowerHull.length - 2]!;
			if ((q.x - r.x) * (p.y - r.y) >= (q.y - r.y) * (p.x - r.x)) lowerHull.pop();
			else break;
		}
		lowerHull.push(p);
	}
	lowerHull.pop();
	if (
		upperHull.length === 1 &&
		lowerHull.length === 1 &&
		upperHull[0]!.x === lowerHull[0]!.x &&
		upperHull[0]!.y === lowerHull[0]!.y
	) {
		return upperHull;
	}
	return upperHull.concat(lowerHull);
}

export { Root as Tooltip, Provider as TooltipProvider };
