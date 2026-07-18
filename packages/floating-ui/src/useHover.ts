// Ported from @floating-ui/react useHover — opens on hover (like CSS :hover),
// with optional safePolygon close handling. Mouse listeners are bound directly to
// the DOM (native), so octane's delegation isn't involved. `event.nativeEvent` →
// `event`.
import { isElement } from '@floating-ui/utils/dom';
import { useCallback, useEffect, useMemo, useRef } from 'octane';

import { splitSlot, subSlot } from './internal';
import { useFloatingParentNodeId, useFloatingTree } from './tree';
import {
	clearTimeoutIfSet,
	contains,
	createAttribute,
	getDelay,
	getDocument,
	isMouseLikePointerType,
	useEffectEvent,
	useLatestRef,
	useModernLayoutEffect,
} from './utils';
import type {
	Delay,
	ElementProps,
	FloatingRootContext,
	HandleClose,
	OpenChangeReason,
} from './types';

export interface UseHoverProps {
	/**
	 * Whether the Hook is enabled, including all internal Effects and event
	 * handlers.
	 * @default true
	 */
	enabled?: boolean;
	/**
	 * Accepts an event handler that runs on `mousemove` to control when the
	 * floating element closes once the cursor leaves the reference element.
	 * @default null
	 */
	handleClose?: HandleClose | null;
	/**
	 * Waits until the user’s cursor is at “rest” over the reference element
	 * before changing the `open` state.
	 * @default 0
	 */
	restMs?: number | (() => number);
	/**
	 * Waits for the specified time when the event listener runs before changing
	 * the `open` state.
	 * @default 0
	 */
	delay?: Delay | (() => Delay);
	/**
	 * Whether the logic only runs for mouse input, ignoring touch input.
	 * Note: due to a bug with Linux Chrome, "pen" inputs are considered "mouse".
	 * @default false
	 */
	mouseOnly?: boolean;
	/**
	 * Whether moving the cursor over the floating element will open it, without a
	 * regular hover event required.
	 * @default true
	 */
	move?: boolean;
}

const safePolygonIdentifier = createAttribute('safe-polygon');

function getRestMs(value: number | (() => number)): number {
	if (typeof value === 'function') {
		return value();
	}
	return value;
}

/**
 * Opens the floating element while hovering over the reference element, like
 * CSS `:hover`.
 * @see https://floating-ui.com/docs/useHover
 */
export function useHover(
	context: FloatingRootContext,
	props?: UseHoverProps,
	slot?: symbol,
): ElementProps;
export function useHover(...args: any[]): ElementProps {
	const [user, slot] = splitSlot(args);
	const context = user[0] as FloatingRootContext;
	const props = (user[1] as UseHoverProps) ?? {};

	const open = context.open;
	const onOpenChange = context.onOpenChange;
	const dataRef = context.dataRef;
	const events = context.events;
	const elements = context.elements;

	const enabled = props.enabled ?? true;
	const delay = props.delay ?? 0;
	const handleClose = props.handleClose ?? null;
	const mouseOnly = props.mouseOnly ?? false;
	const restMs = props.restMs ?? 0;
	const move = props.move ?? true;

	const tree = useFloatingTree();
	const parentId = useFloatingParentNodeId();
	const handleCloseRef = useLatestRef(handleClose, subSlot(slot, 'hc'));
	const delayRef = useLatestRef(delay, subSlot(slot, 'delay'));
	const openRef = useLatestRef(open, subSlot(slot, 'open'));
	const restMsRef = useLatestRef(restMs, subSlot(slot, 'restms'));

	const pointerTypeRef = useRef<string | undefined>(undefined, subSlot(slot, 'ptype'));
	const timeoutRef = useRef(-1, subSlot(slot, 'timeout'));
	const handlerRef = useRef<((event: MouseEvent) => void) | undefined>(
		undefined,
		subSlot(slot, 'handler'),
	);
	const restTimeoutRef = useRef(-1, subSlot(slot, 'resttimeout'));
	const blockMouseMoveRef = useRef(true, subSlot(slot, 'block'));
	const performedPointerEventsMutationRef = useRef(false, subSlot(slot, 'ppem'));
	const unbindMouseMoveRef = useRef<() => void>(() => {}, subSlot(slot, 'unbind'));
	const restTimeoutPendingRef = useRef(false, subSlot(slot, 'rtp'));

	const isHoverOpen = useEffectEvent(
		() => {
			const type = dataRef.current.openEvent?.type;
			return type?.includes('mouse') && type !== 'mousedown';
		},
		subSlot(slot, 'ishover'),
	);

	useEffect(
		() => {
			if (!enabled) return;
			function onOpenChangeLocal(_ref: any) {
				const { open: o } = _ref;
				if (!o) {
					clearTimeoutIfSet(timeoutRef);
					clearTimeoutIfSet(restTimeoutRef);
					blockMouseMoveRef.current = true;
					restTimeoutPendingRef.current = false;
				}
			}
			events.on('openchange', onOpenChangeLocal);
			return () => {
				events.off('openchange', onOpenChangeLocal);
			};
		},
		[enabled, events],
		subSlot(slot, 'e:oc'),
	);

	useEffect(
		() => {
			if (!enabled) return;
			if (!handleCloseRef.current) return;
			if (!open) return;
			function onLeave(event: MouseEvent) {
				if (isHoverOpen()) {
					onOpenChange(false, event, 'hover');
				}
			}
			const html = getDocument(elements.floating).documentElement;
			html.addEventListener('mouseleave', onLeave);
			return () => {
				html.removeEventListener('mouseleave', onLeave);
			};
		},
		[elements.floating, open, onOpenChange, enabled, handleCloseRef, isHoverOpen],
		subSlot(slot, 'e:leave'),
	);

	const closeWithDelay = useCallback(
		(event: Event, runElseBranch = true, reason: OpenChangeReason = 'hover') => {
			const closeDelay = getDelay(delayRef.current, 'close', pointerTypeRef.current);
			if (closeDelay && !handlerRef.current) {
				clearTimeoutIfSet(timeoutRef);
				timeoutRef.current = window.setTimeout(
					() => onOpenChange(false, event, reason),
					closeDelay,
				);
			} else if (runElseBranch) {
				clearTimeoutIfSet(timeoutRef);
				onOpenChange(false, event, reason);
			}
		},
		[delayRef, onOpenChange],
		subSlot(slot, 'cwd'),
	);

	const cleanupMouseMoveHandler = useEffectEvent(
		() => {
			unbindMouseMoveRef.current();
			handlerRef.current = undefined;
		},
		subSlot(slot, 'cleanupmm'),
	);

	const clearPointerEvents = useEffectEvent(
		() => {
			if (performedPointerEventsMutationRef.current) {
				const body = getDocument(elements.floating).body;
				body.style.pointerEvents = '';
				body.removeAttribute(safePolygonIdentifier);
				performedPointerEventsMutationRef.current = false;
			}
		},
		subSlot(slot, 'clearpe'),
	);

	const isClickLikeOpenEvent = useEffectEvent(
		() => {
			return dataRef.current.openEvent
				? ['click', 'mousedown'].includes(dataRef.current.openEvent.type)
				: false;
		},
		subSlot(slot, 'isclick'),
	);

	useEffect(
		() => {
			if (!enabled) return;
			function onReferenceMouseEnter(event: MouseEvent) {
				clearTimeoutIfSet(timeoutRef);
				blockMouseMoveRef.current = false;
				if (
					(mouseOnly && !isMouseLikePointerType(pointerTypeRef.current)) ||
					(getRestMs(restMsRef.current) > 0 && !getDelay(delayRef.current, 'open'))
				) {
					return;
				}
				const openDelay = getDelay(delayRef.current, 'open', pointerTypeRef.current);
				if (openDelay) {
					timeoutRef.current = window.setTimeout(() => {
						if (!openRef.current) {
							onOpenChange(true, event, 'hover');
						}
					}, openDelay);
				} else if (!open) {
					onOpenChange(true, event, 'hover');
				}
			}
			function onReferenceMouseLeave(event: MouseEvent) {
				if (isClickLikeOpenEvent()) {
					clearPointerEvents();
					return;
				}
				unbindMouseMoveRef.current();
				const doc = getDocument(elements.floating);
				clearTimeoutIfSet(restTimeoutRef);
				restTimeoutPendingRef.current = false;
				if (handleCloseRef.current && dataRef.current.floatingContext) {
					if (!open) {
						clearTimeoutIfSet(timeoutRef);
					}
					handlerRef.current = handleCloseRef.current({
						...dataRef.current.floatingContext,
						tree,
						x: event.clientX,
						y: event.clientY,
						onClose() {
							clearPointerEvents();
							cleanupMouseMoveHandler();
							if (!isClickLikeOpenEvent()) {
								closeWithDelay(event, true, 'safe-polygon');
							}
						},
					});
					const handler = handlerRef.current;
					doc.addEventListener('mousemove', handler);
					unbindMouseMoveRef.current = () => {
						doc.removeEventListener('mousemove', handler);
					};
					return;
				}
				const shouldClose =
					pointerTypeRef.current === 'touch'
						? !contains(elements.floating, event.relatedTarget as Element | null)
						: true;
				if (shouldClose) {
					closeWithDelay(event);
				}
			}
			function onScrollMouseLeave(event: MouseEvent) {
				if (isClickLikeOpenEvent()) return;
				if (!dataRef.current.floatingContext) return;
				handleCloseRef.current?.({
					...dataRef.current.floatingContext,
					tree,
					x: event.clientX,
					y: event.clientY,
					onClose() {
						clearPointerEvents();
						cleanupMouseMoveHandler();
						if (!isClickLikeOpenEvent()) {
							closeWithDelay(event);
						}
					},
				})(event);
			}
			function onFloatingMouseEnter() {
				clearTimeoutIfSet(timeoutRef);
			}
			function onFloatingMouseLeave(event: MouseEvent) {
				if (!isClickLikeOpenEvent()) {
					closeWithDelay(event, false);
				}
			}
			if (isElement(elements.domReference)) {
				// lib.dom's `ElementEventMap` lacks mouse events; these listeners are
				// registered on a plain Element, so go through the generic overload.
				const reference = elements.domReference as HTMLElement;
				const floating = elements.floating;
				if (open) {
					reference.addEventListener('mouseleave', onScrollMouseLeave);
				}
				if (move) {
					reference.addEventListener('mousemove', onReferenceMouseEnter, { once: true });
				}
				reference.addEventListener('mouseenter', onReferenceMouseEnter);
				reference.addEventListener('mouseleave', onReferenceMouseLeave);
				if (floating) {
					floating.addEventListener('mouseleave', onScrollMouseLeave);
					floating.addEventListener('mouseenter', onFloatingMouseEnter);
					floating.addEventListener('mouseleave', onFloatingMouseLeave);
				}
				return () => {
					if (open) {
						reference.removeEventListener('mouseleave', onScrollMouseLeave);
					}
					if (move) {
						reference.removeEventListener('mousemove', onReferenceMouseEnter);
					}
					reference.removeEventListener('mouseenter', onReferenceMouseEnter);
					reference.removeEventListener('mouseleave', onReferenceMouseLeave);
					if (floating) {
						floating.removeEventListener('mouseleave', onScrollMouseLeave);
						floating.removeEventListener('mouseenter', onFloatingMouseEnter);
						floating.removeEventListener('mouseleave', onFloatingMouseLeave);
					}
				};
			}
		},
		[
			elements,
			enabled,
			context,
			mouseOnly,
			move,
			closeWithDelay,
			cleanupMouseMoveHandler,
			clearPointerEvents,
			onOpenChange,
			open,
			openRef,
			tree,
			delayRef,
			handleCloseRef,
			dataRef,
			isClickLikeOpenEvent,
			restMsRef,
		],
		subSlot(slot, 'e:refevents'),
	);

	useModernLayoutEffect(
		() => {
			if (!enabled) return;
			if (open && handleCloseRef.current?.__options?.blockPointerEvents && isHoverOpen()) {
				performedPointerEventsMutationRef.current = true;
				const floatingEl = elements.floating;
				if (isElement(elements.domReference) && floatingEl) {
					const body = getDocument(elements.floating).body;
					body.setAttribute(safePolygonIdentifier, '');
					const ref = elements.domReference as HTMLElement;
					const parentFloating = tree?.nodesRef.current.find((node: any) => node.id === parentId)
						?.context?.elements.floating;
					if (parentFloating) {
						parentFloating.style.pointerEvents = '';
					}
					body.style.pointerEvents = 'none';
					ref.style.pointerEvents = 'auto';
					floatingEl.style.pointerEvents = 'auto';
					return () => {
						body.style.pointerEvents = '';
						ref.style.pointerEvents = '';
						floatingEl.style.pointerEvents = '';
					};
				}
			}
		},
		[enabled, open, parentId, elements, tree, handleCloseRef, isHoverOpen],
		subSlot(slot, 'e:blockpe'),
	);

	useModernLayoutEffect(
		() => {
			if (!open) {
				pointerTypeRef.current = undefined;
				restTimeoutPendingRef.current = false;
				cleanupMouseMoveHandler();
				clearPointerEvents();
			}
		},
		[open, cleanupMouseMoveHandler, clearPointerEvents],
		subSlot(slot, 'e:reset'),
	);

	useEffect(
		() => {
			return () => {
				cleanupMouseMoveHandler();
				clearTimeoutIfSet(timeoutRef);
				clearTimeoutIfSet(restTimeoutRef);
				clearPointerEvents();
			};
		},
		[enabled, elements.domReference, cleanupMouseMoveHandler, clearPointerEvents],
		subSlot(slot, 'e:cleanup'),
	);

	const reference = useMemo(
		() => {
			function setPointerRef(event: PointerEvent) {
				pointerTypeRef.current = event.pointerType;
			}
			return {
				onPointerDown: setPointerRef,
				onPointerEnter: setPointerRef,
				onMouseMove(event: MouseEvent) {
					function handleMouseMove() {
						if (!blockMouseMoveRef.current && !openRef.current) {
							onOpenChange(true, event, 'hover');
						}
					}
					if (mouseOnly && !isMouseLikePointerType(pointerTypeRef.current)) {
						return;
					}
					if (open || getRestMs(restMsRef.current) === 0) {
						return;
					}
					if (restTimeoutPendingRef.current && event.movementX ** 2 + event.movementY ** 2 < 2) {
						return;
					}
					clearTimeoutIfSet(restTimeoutRef);
					if (pointerTypeRef.current === 'touch') {
						handleMouseMove();
					} else {
						restTimeoutPendingRef.current = true;
						restTimeoutRef.current = window.setTimeout(
							handleMouseMove,
							getRestMs(restMsRef.current),
						);
					}
				},
			};
		},
		[mouseOnly, onOpenChange, open, openRef, restMsRef],
		subSlot(slot, 'm:ref'),
	);

	return useMemo<ElementProps>(
		() => (enabled ? { reference } : {}),
		[enabled, reference],
		subSlot(slot, 'm:ret'),
	);
}
