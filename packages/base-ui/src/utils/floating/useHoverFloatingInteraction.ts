// Ported from .base-ui/packages/react/src/floating-ui-react/hooks/useHoverFloatingInteraction.ts
// (v1.6.0). The popup side of open-on-hover: keeps the popup open while the cursor is inside it,
// closes it (after `closeDelay`) on leave, defers to the safe-polygon handler when one is active,
// and applies the pointer-events mutation that shields siblings while the cursor travels.
//
// octane adaptations: native events; `useIsoLayoutEffect` → `useLayoutEffect`; every composed hook
// threads an explicit slot.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useEffect, useLayoutEffect } from 'octane';

import { S, splitSlot, subSlot } from '../../internal';
import { addEventListener } from '../addEventListener';
import { mergeCleanups } from '../mergeCleanups';
import { ownerDocument } from '../owner';
import { useStableCallback } from '../useStableCallback';
import { useTimeout } from '../useTimeout';
import { isElement } from '../dom';
import { createChangeEventDetails, REASONS } from '../createChangeEventDetails';
import { useFloatingParentNodeId, useFloatingTree } from './FloatingTree';
import { contains, getTarget } from './element';
import { getNodeChildren } from './nodes';
import {
	applySafePolygonPointerEventsMutation,
	clearSafePolygonPointerEventsMutation,
	isInteractiveElement,
	useHoverInteractionSharedState,
} from './useHoverInteractionSharedState';
import {
	getDelay,
	isClickLikeOpenEvent as isClickLikeOpenEventShared,
	isHoverOpenEvent,
	isInsideEnabledTrigger,
} from './useHoverShared';

export interface UseHoverFloatingInteractionProps {
	/**
	 * Whether the hook is enabled, including all internal effects and event handlers.
	 * @default true
	 */
	enabled?: boolean | undefined;
	/**
	 * Waits for the specified time when the event listener runs before changing the `open` state.
	 * @default 0
	 */
	closeDelay?: number | (() => number) | undefined;
	/**
	 * Tree node id override for floating elements that participate in the tree without a
	 * `FloatingContext`, such as inline nested navigation menus.
	 */
	nodeId?: string | undefined;
}

export function useHoverFloatingInteraction(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useHoverFloatingInteraction');
	const context = user[0] as any;
	const parameters = (user[1] as UseHoverFloatingInteractionProps) ?? {};

	const { enabled = true, closeDelay: closeDelayProp = 0, nodeId: nodeIdProp } = parameters;

	const store = context != null && 'rootStore' in context ? context.rootStore : context;

	const open = store.useState('open', subSlot(slot, 's:open'));
	const floatingElement = store.useState('floatingElement', subSlot(slot, 's:floating'));
	const domReferenceElement = store.useState('domReferenceElement', subSlot(slot, 's:ref'));
	const dataRef = store.context.dataRef;

	const tree = useFloatingTree();
	const parentId = useFloatingParentNodeId();
	const instance = useHoverInteractionSharedState(store, subSlot(slot, 'shared'));

	const childClosedTimeout = useTimeout(subSlot(slot, 'cct'));

	const isClickLikeOpenEvent = useStableCallback(
		() => {
			return isClickLikeOpenEventShared(dataRef.current.openEvent?.type, instance.interactedInside);
		},
		subSlot(slot, 'iclo'),
	);

	const isHoverOpen = useStableCallback(
		() => {
			return isHoverOpenEvent(dataRef.current.openEvent?.type);
		},
		subSlot(slot, 'iho'),
	);

	const clearPointerEvents = useStableCallback(
		() => {
			clearSafePolygonPointerEventsMutation(instance);
		},
		subSlot(slot, 'cpe'),
	);

	useLayoutEffect(
		() => {
			if (!open) {
				instance.pointerType = undefined;
				instance.restTimeoutPending = false;
				instance.interactedInside = false;
				clearPointerEvents();
			}
		},
		[open, instance, clearPointerEvents],
		subSlot(slot, 'l:reset'),
	);

	useEffect(
		() => {
			return clearPointerEvents;
		},
		[clearPointerEvents],
		subSlot(slot, 'e:cpe'),
	);

	useLayoutEffect(
		() => {
			if (!enabled) {
				return undefined;
			}

			if (
				open &&
				instance.handleCloseOptions?.blockPointerEvents &&
				isHoverOpen() &&
				isElement(domReferenceElement) &&
				floatingElement
			) {
				const ref = domReferenceElement as HTMLElement | SVGSVGElement;
				const floatingEl = floatingElement as HTMLElement;
				const doc = ownerDocument(floatingElement as Element);

				const parentFloating = tree?.nodesRef.current.find((node: any) => node.id === parentId)
					?.context?.elements.floating as HTMLElement | null;

				if (parentFloating) {
					parentFloating.style.pointerEvents = '';
				}

				// A keep-mounted submenu can appear in the tree before it opens, so a cached scope or
				// parent lookup may resolve to the submenu itself. That would not shield sibling items
				// in the parent menu.
				const cachedScopeElement =
					instance.pointerEventsScopeElement !== floatingEl
						? instance.pointerEventsScopeElement
						: null;
				const parentScopeElement = parentFloating !== floatingEl ? parentFloating : null;
				const scopeElement =
					instance.handleCloseOptions?.getScope?.() ??
					cachedScopeElement ??
					parentScopeElement ??
					(ref.closest('[data-rootownerid]') as HTMLElement | SVGSVGElement | null) ??
					doc.body;

				applySafePolygonPointerEventsMutation(instance, {
					scopeElement,
					referenceElement: ref,
					floatingElement: floatingEl,
				});

				return () => {
					clearPointerEvents();
				};
			}

			return undefined;
		},
		[
			enabled,
			open,
			domReferenceElement,
			floatingElement,
			instance,
			isHoverOpen,
			tree,
			parentId,
			clearPointerEvents,
		],
		subSlot(slot, 'l:blockPointer'),
	);

	useEffect(
		() => {
			if (!enabled) {
				return undefined;
			}

			function hasParentChildren() {
				return !!(tree && parentId && getNodeChildren(tree.nodesRef.current, parentId).length > 0);
			}

			function closeWithDelay(event: MouseEvent) {
				const closeDelay = getDelay(closeDelayProp, 'close', instance.pointerType);
				const close = () => {
					store.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
					tree?.events.emit('floating.closed', event);
				};

				if (closeDelay) {
					instance.openChangeTimeout.start(closeDelay, close);
				} else {
					instance.openChangeTimeout.clear();
					close();
				}
			}

			function handleInteractInside(event: PointerEvent) {
				const target = getTarget(event) as Element | null;
				if (!isInteractiveElement(target)) {
					instance.interactedInside = false;
					return;
				}
				instance.interactedInside = target?.closest('[aria-haspopup]') != null;
			}

			function onFloatingMouseEnter() {
				instance.openChangeTimeout.clear();
				childClosedTimeout.clear();
				tree?.events.off('floating.closed', onNodeClosed);
				clearPointerEvents();
			}

			function onFloatingMouseLeave(event: MouseEvent) {
				if (hasParentChildren() && tree) {
					tree.events.on('floating.closed', onNodeClosed);
					return;
				}

				// Leaving toward another trigger of the same popup just moves it; don't close.
				if (isInsideEnabledTrigger(event.relatedTarget, store.context.triggerElements)) {
					return;
				}

				const currentNodeId = dataRef.current.floatingContext?.nodeId ?? nodeIdProp;
				const relatedTarget = event.relatedTarget;
				const isMovingIntoDescendantFloating =
					tree &&
					currentNodeId &&
					isElement(relatedTarget) &&
					getNodeChildren(tree.nodesRef.current, currentNodeId, false).some((node: any) =>
						contains(node.context?.elements.floating, relatedTarget as Element),
					);

				if (isMovingIntoDescendantFloating) {
					return;
				}

				// If the safePolygon handler is active, let it handle the close logic.
				if (instance.handler) {
					instance.handler(event);
					return;
				}

				clearPointerEvents();
				if (isHoverOpen() && !isClickLikeOpenEvent()) {
					closeWithDelay(event);
				}
			}

			function onNodeClosed(event: MouseEvent) {
				if (!tree || !parentId || hasParentChildren()) {
					return;
				}
				// Allow the mouseenter event to fire in case the child closed because the mouse moved
				// into the parent.
				childClosedTimeout.start(0, () => {
					tree.events.off('floating.closed', onNodeClosed);
					store.setOpen(false, createChangeEventDetails(REASONS.triggerHover, event));
					tree.events.emit('floating.closed', event);
				});
			}

			const floating = floatingElement as HTMLElement | null;
			return mergeCleanups(
				floating && addEventListener(floating, 'mouseenter', onFloatingMouseEnter as EventListener),
				floating && addEventListener(floating, 'mouseleave', onFloatingMouseLeave as EventListener),
				floating &&
					addEventListener(floating, 'pointerdown', handleInteractInside as EventListener, true),
				() => {
					tree?.events.off('floating.closed', onNodeClosed);
				},
			);
		},
		[
			enabled,
			floatingElement,
			store,
			dataRef,
			closeDelayProp,
			nodeIdProp,
			isHoverOpen,
			isClickLikeOpenEvent,
			clearPointerEvents,
			instance,
			tree,
			parentId,
			childClosedTimeout,
		],
		subSlot(slot, 'e:listeners'),
	);
}
