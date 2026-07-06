// Ported from .base-ui/packages/react/src/floating-ui-react/hooks/useDismiss.ts (v1.6.0), octane-
// adapted: reads the FloatingRootStore (`store.useState`/`select`/`setOpen`/`context`); native
// events (no `.nativeEvent`); every hook threads an explicit slot. Returns `{ reference, floating,
// trigger }` prop bags. Closes the popup on Escape / outside press (with the full intentional/sloppy
// press-type + touch + nested-tree logic).
import { useRef, useEffect, useMemo } from 'octane';
import {
	getComputedStyle,
	getParentNode,
	isElement,
	isHTMLElement,
	isLastTraversableNode,
	isShadowRoot,
} from '@floating-ui/utils/dom';

import { subSlot } from '../../internal';
import { addEventListener } from '../addEventListener';
import { mergeCleanups } from '../mergeCleanups';
import { ownerDocument } from '../owner';
import { useStableCallback } from '../useStableCallback';
import { Timeout, useTimeout } from '../useTimeout';
import { platform } from '../platform';
import { useFloatingTree } from './FloatingTree';
import type { FloatingTreeStore } from './FloatingTreeStore';
import type { ElementProps, FloatingContext, FloatingRootContext } from './types';
import { createChangeEventDetails, REASONS } from '../createChangeEventDetails';
import { createAttribute } from './createAttribute';
import { contains, getTarget, isEventTargetWithin, isRootElement } from './element';
import { isReactEvent } from './event';
import { getNodeChildren } from './nodes';

type PressType = 'intentional' | 'sloppy';

function alwaysFalse() {
	return false;
}

export function normalizeProp(
	normalizable?: boolean | { escapeKey?: boolean | undefined; outsidePress?: boolean | undefined },
) {
	return {
		escapeKey:
			typeof normalizable === 'boolean' ? normalizable : (normalizable?.escapeKey ?? false),
		outsidePress:
			typeof normalizable === 'boolean' ? normalizable : (normalizable?.outsidePress ?? true),
	};
}

export interface UseDismissProps {
	enabled?: boolean | undefined;
	escapeKey?: boolean | undefined;
	referencePress?: (() => boolean) | undefined;
	outsidePress?: boolean | ((event: MouseEvent | TouchEvent) => boolean) | undefined;
	outsidePressEvent?:
		| PressType
		| { mouse: PressType; touch: PressType }
		| (() => PressType | { mouse: PressType; touch: PressType })
		| undefined;
	bubbles?:
		| boolean
		| { escapeKey?: boolean | undefined; outsidePress?: boolean | undefined }
		| undefined;
	externalTree?: FloatingTreeStore | undefined;
}

export function useDismiss(
	context: FloatingRootContext | FloatingContext,
	props: UseDismissProps,
	slot: symbol | undefined,
): ElementProps {
	const {
		enabled = true,
		escapeKey = true,
		outsidePress: outsidePressProp = true,
		outsidePressEvent = 'sloppy',
		referencePress = alwaysFalse,
		bubbles,
		externalTree,
	} = props;

	const store = (context && 'rootStore' in context ? context.rootStore : context) as any;

	const open = store.useState('open', subSlot(slot, 'open'));
	const floatingElement = store.useState('floatingElement', subSlot(slot, 'fel'));
	const { dataRef } = store.context;

	const tree = useFloatingTree(externalTree);
	const outsidePressFn = useStableCallback(
		typeof outsidePressProp === 'function' ? outsidePressProp : () => false,
		subSlot(slot, 'opf'),
	);
	const outsidePress = typeof outsidePressProp === 'function' ? outsidePressFn : outsidePressProp;
	const outsidePressEnabled = outsidePress !== false;
	const getOutsidePressEventProp = useStableCallback(
		() => outsidePressEvent,
		subSlot(slot, 'gope'),
	);

	const { escapeKey: escapeKeyBubbles, outsidePress: outsidePressBubbles } = normalizeProp(bubbles);

	const pressStartedInsideRef = useRef(false, subSlot(slot, 'psi'));
	const pressStartPreventedRef = useRef(false, subSlot(slot, 'psp'));
	const suppressNextOutsideClickRef = useRef(false, subSlot(slot, 'snoc'));
	const isComposingRef = useRef(false, subSlot(slot, 'ic'));
	const currentPointerTypeRef = useRef<string>('', subSlot(slot, 'cpt'));

	const touchStateRef = useRef<{
		startTime: number;
		startX: number;
		startY: number;
		dismissOnTouchEnd: boolean;
		dismissOnMouseDown: boolean;
	} | null>(null, subSlot(slot, 'ts'));

	const cancelDismissOnEndTimeout = useTimeout(subSlot(slot, 'cdet'));
	const clearInsideReactTreeTimeout = useTimeout(subSlot(slot, 'cirt'));

	const clearInsideReactTree = useStableCallback(
		() => {
			clearInsideReactTreeTimeout.clear();
			dataRef.current.insideReactTree = false;
		},
		subSlot(slot, 'cir'),
	);

	const hasBlockingChild = useStableCallback(
		(bubbleKey: '__escapeKeyBubbles' | '__outsidePressBubbles') => {
			const nodeId = dataRef.current.floatingContext?.nodeId;
			const children = tree ? getNodeChildren(tree.nodesRef.current, nodeId) : [];
			return children.some(
				(child) => child.context?.open && !child.context.dataRef.current[bubbleKey],
			);
		},
		subSlot(slot, 'hbc'),
	);

	const isEventWithinOwnElements = useStableCallback(
		(event: Event) => {
			return (
				isEventTargetWithin(event, store.select('floatingElement')) ||
				isEventTargetWithin(event, store.select('domReferenceElement'))
			);
		},
		subSlot(slot, 'iewoe'),
	);

	const closeOnReferencePress = useStableCallback(
		(event: any) => {
			if (!referencePress()) {
				return;
			}
			store.setOpen(false, createChangeEventDetails(REASONS.triggerPress, event));
		},
		subSlot(slot, 'corp'),
	);

	const closeOnEscapeKeyDown = useStableCallback(
		(event: any) => {
			if (!open || !enabled || !escapeKey || event.key !== 'Escape') {
				return;
			}
			if (isComposingRef.current) {
				return;
			}
			if (!escapeKeyBubbles && hasBlockingChild('__escapeKeyBubbles')) {
				return;
			}
			const native = isReactEvent(event) ? event.nativeEvent : event;
			const eventDetails = createChangeEventDetails(REASONS.escapeKey, native);
			store.setOpen(false, eventDetails);
			if (!eventDetails.isCanceled) {
				event.preventDefault();
			}
			if (!escapeKeyBubbles && !eventDetails.isPropagationAllowed) {
				event.stopPropagation();
			}
		},
		subSlot(slot, 'coekd'),
	);

	const markInsideReactTree = useStableCallback(
		() => {
			dataRef.current.insideReactTree = true;
			clearInsideReactTreeTimeout.start(0, clearInsideReactTree);
		},
		subSlot(slot, 'mirt'),
	);

	const markPressStartedInsideReactTree = useStableCallback(
		(event: any) => {
			if (!open || !enabled || event.button !== 0) {
				return;
			}
			const target = getTarget(event) as Element | null;
			if (!contains(store.select('floatingElement'), target)) {
				return;
			}
			if (!pressStartedInsideRef.current) {
				pressStartedInsideRef.current = true;
				pressStartPreventedRef.current = false;
			}
		},
		subSlot(slot, 'mpsirt'),
	);

	const markInsidePressStartPrevented = useStableCallback(
		(event: any) => {
			if (!open || !enabled) {
				return;
			}
			if (!event.defaultPrevented) {
				return;
			}
			if (pressStartedInsideRef.current) {
				pressStartPreventedRef.current = true;
			}
		},
		subSlot(slot, 'mipsp'),
	);

	useEffect(
		() => {
			if (!open || !enabled) {
				return undefined;
			}

			dataRef.current.__escapeKeyBubbles = escapeKeyBubbles;
			dataRef.current.__outsidePressBubbles = outsidePressBubbles;

			const compositionTimeout = new Timeout();
			const preventedPressSuppressionTimeout = new Timeout();

			function handleCompositionStart() {
				compositionTimeout.clear();
				isComposingRef.current = true;
			}

			function handleCompositionEnd() {
				compositionTimeout.start(platform.engine.webkit ? 5 : 0, () => {
					isComposingRef.current = false;
				});
			}

			function suppressImmediateOutsideClickAfterPreventedStart() {
				suppressNextOutsideClickRef.current = true;
				preventedPressSuppressionTimeout.start(0, () => {
					suppressNextOutsideClickRef.current = false;
				});
			}

			function resetPressStartState() {
				pressStartedInsideRef.current = false;
				pressStartPreventedRef.current = false;
			}

			function getOutsidePressEvent(): PressType {
				const type = currentPointerTypeRef.current as 'pen' | 'mouse' | 'touch' | '';
				const computedType = type === 'pen' || !type ? 'mouse' : type;
				const outsidePressEventValue = getOutsidePressEventProp();
				const resolved =
					typeof outsidePressEventValue === 'function'
						? outsidePressEventValue()
						: outsidePressEventValue;
				if (typeof resolved === 'string') {
					return resolved as PressType;
				}
				return (resolved as { mouse: PressType; touch: PressType })[computedType];
			}

			function shouldIgnoreEvent(event: Event) {
				const computedOutsidePressEvent = getOutsidePressEvent();
				return (
					(computedOutsidePressEvent === 'intentional' && event.type !== 'click') ||
					(computedOutsidePressEvent === 'sloppy' && event.type === 'click')
				);
			}

			function isEventWithinFloatingTree(event: Event) {
				const nodeId = dataRef.current.floatingContext?.nodeId;
				const targetIsInsideChildren =
					tree &&
					getNodeChildren(tree.nodesRef.current, nodeId).some((node) =>
						isEventTargetWithin(event, node.context?.elements.floating),
					);
				return isEventWithinOwnElements(event) || targetIsInsideChildren;
			}

			function closeOnPressOutside(event: MouseEvent | PointerEvent | TouchEvent) {
				if (shouldIgnoreEvent(event)) {
					if (event.type !== 'click' && !isEventWithinOwnElements(event)) {
						preventedPressSuppressionTimeout.clear();
						suppressNextOutsideClickRef.current = false;
					}
					clearInsideReactTree();
					return;
				}

				if (dataRef.current.insideReactTree) {
					clearInsideReactTree();
					return;
				}

				const target = getTarget(event);
				const inertSelector = `[${createAttribute('inert')}]`;
				const targetRoot = isElement(target) ? target.getRootNode() : null;
				const markers = Array.from(
					(isShadowRoot(targetRoot)
						? targetRoot
						: ownerDocument(store.select('floatingElement'))
					).querySelectorAll(inertSelector),
				);

				const triggers = store.context.triggerElements;

				if (
					target &&
					(triggers.hasElement(target as Element) ||
						triggers.hasMatchingElement((trigger: Element) => contains(trigger, target as Element)))
				) {
					return;
				}

				let targetRootAncestor = isElement(target) ? target : null;
				while (targetRootAncestor && !isLastTraversableNode(targetRootAncestor)) {
					const nextParent = getParentNode(targetRootAncestor);
					if (isLastTraversableNode(nextParent) || !isElement(nextParent)) {
						break;
					}
					targetRootAncestor = nextParent;
				}

				if (
					markers.length &&
					isElement(target) &&
					!isRootElement(target) &&
					!contains(target, store.select('floatingElement')) &&
					markers.every((marker) => !contains(targetRootAncestor, marker))
				) {
					return;
				}

				if (isHTMLElement(target) && !('touches' in event)) {
					const lastTraversableNode = isLastTraversableNode(target);
					const style = getComputedStyle(target);
					const scrollRe = /auto|scroll/;
					const isScrollableX = lastTraversableNode || scrollRe.test(style.overflowX);
					const isScrollableY = lastTraversableNode || scrollRe.test(style.overflowY);
					const canScrollX =
						isScrollableX && target.clientWidth > 0 && target.scrollWidth > target.clientWidth;
					const canScrollY =
						isScrollableY && target.clientHeight > 0 && target.scrollHeight > target.clientHeight;
					const isRTL = style.direction === 'rtl';
					const pressedVerticalScrollbar =
						canScrollY &&
						(isRTL
							? (event as MouseEvent).offsetX <= target.offsetWidth - target.clientWidth
							: (event as MouseEvent).offsetX > target.clientWidth);
					const pressedHorizontalScrollbar =
						canScrollX && (event as MouseEvent).offsetY > target.clientHeight;
					if (pressedVerticalScrollbar || pressedHorizontalScrollbar) {
						return;
					}
				}

				if (isEventWithinFloatingTree(event)) {
					return;
				}

				if (getOutsidePressEvent() === 'intentional' && suppressNextOutsideClickRef.current) {
					preventedPressSuppressionTimeout.clear();
					suppressNextOutsideClickRef.current = false;
					return;
				}

				if (typeof outsidePress === 'function' && !outsidePress(event)) {
					return;
				}

				if (hasBlockingChild('__outsidePressBubbles')) {
					return;
				}

				store.setOpen(false, createChangeEventDetails(REASONS.outsidePress, event));
				clearInsideReactTree();
			}

			function handlePointerDown(event: PointerEvent) {
				if (
					getOutsidePressEvent() !== 'sloppy' ||
					event.pointerType === 'touch' ||
					!store.select('open') ||
					!enabled ||
					isEventWithinOwnElements(event)
				) {
					return;
				}
				closeOnPressOutside(event);
			}

			function handleTouchStart(event: TouchEvent) {
				if (
					getOutsidePressEvent() !== 'sloppy' ||
					!store.select('open') ||
					!enabled ||
					isEventWithinOwnElements(event)
				) {
					return;
				}
				const touch = event.touches[0];
				if (touch) {
					touchStateRef.current = {
						startTime: Date.now(),
						startX: touch.clientX,
						startY: touch.clientY,
						dismissOnTouchEnd: false,
						dismissOnMouseDown: true,
					};
					cancelDismissOnEndTimeout.start(1000, () => {
						if (touchStateRef.current) {
							touchStateRef.current.dismissOnTouchEnd = false;
							touchStateRef.current.dismissOnMouseDown = false;
						}
					});
				}
			}

			function addTargetEventListenerOnce<EventType extends Event>(
				event: EventType,
				listener: (event: EventType) => void,
			) {
				const target = getTarget(event);
				if (!target) {
					return;
				}
				const unsubscribe = addEventListener(target as any, event.type, () => {
					listener(event);
					unsubscribe();
				});
			}

			function handleTouchStartCapture(event: TouchEvent) {
				currentPointerTypeRef.current = 'touch';
				addTargetEventListenerOnce(event, handleTouchStart);
			}

			function closeOnPressOutsideCapture(event: PointerEvent | MouseEvent) {
				cancelDismissOnEndTimeout.clear();
				if (event.type === 'pointerdown') {
					currentPointerTypeRef.current = (event as PointerEvent).pointerType;
				}
				if (
					event.type === 'mousedown' &&
					touchStateRef.current &&
					!touchStateRef.current.dismissOnMouseDown
				) {
					return;
				}
				addTargetEventListenerOnce(event, (targetEvent) => {
					if (targetEvent.type === 'pointerdown') {
						handlePointerDown(targetEvent as PointerEvent);
					} else {
						closeOnPressOutside(targetEvent as MouseEvent);
					}
				});
			}

			function handlePressEndCapture(event: PointerEvent | MouseEvent) {
				if (!pressStartedInsideRef.current) {
					return;
				}
				const pressStartedInsideDefaultPrevented = pressStartPreventedRef.current;
				resetPressStartState();
				if (getOutsidePressEvent() !== 'intentional') {
					return;
				}
				if (event.type === 'pointercancel') {
					if (pressStartedInsideDefaultPrevented) {
						suppressImmediateOutsideClickAfterPreventedStart();
					}
					return;
				}
				if (isEventWithinFloatingTree(event)) {
					return;
				}
				if (pressStartedInsideDefaultPrevented) {
					suppressImmediateOutsideClickAfterPreventedStart();
					return;
				}
				if (typeof outsidePress === 'function' && !outsidePress(event as MouseEvent)) {
					return;
				}
				preventedPressSuppressionTimeout.clear();
				suppressNextOutsideClickRef.current = true;
				clearInsideReactTree();
			}

			function handleTouchMove(event: TouchEvent) {
				if (
					getOutsidePressEvent() !== 'sloppy' ||
					!touchStateRef.current ||
					isEventWithinOwnElements(event)
				) {
					return;
				}
				const touch = event.touches[0];
				if (!touch) {
					return;
				}
				const deltaX = Math.abs(touch.clientX - touchStateRef.current.startX);
				const deltaY = Math.abs(touch.clientY - touchStateRef.current.startY);
				const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
				if (distance > 5) {
					touchStateRef.current.dismissOnTouchEnd = true;
				}
				if (distance > 10) {
					closeOnPressOutside(event);
					cancelDismissOnEndTimeout.clear();
					touchStateRef.current = null;
				}
			}

			function handleTouchMoveCapture(event: TouchEvent) {
				addTargetEventListenerOnce(event, handleTouchMove);
			}

			function handleTouchEnd(event: TouchEvent) {
				if (
					getOutsidePressEvent() !== 'sloppy' ||
					!touchStateRef.current ||
					isEventWithinOwnElements(event)
				) {
					return;
				}
				if (touchStateRef.current.dismissOnTouchEnd) {
					closeOnPressOutside(event);
				}
				cancelDismissOnEndTimeout.clear();
				touchStateRef.current = null;
			}

			function handleTouchEndCapture(event: TouchEvent) {
				addTargetEventListenerOnce(event, handleTouchEnd);
			}

			const doc = ownerDocument(floatingElement);
			const unsubscribe = mergeCleanups(
				escapeKey &&
					mergeCleanups(
						addEventListener(doc, 'keydown', closeOnEscapeKeyDown as EventListener),
						addEventListener(doc, 'compositionstart', handleCompositionStart),
						addEventListener(doc, 'compositionend', handleCompositionEnd),
					),
				outsidePressEnabled &&
					mergeCleanups(
						addEventListener(doc, 'click', closeOnPressOutsideCapture as EventListener, true),
						addEventListener(doc, 'pointerdown', closeOnPressOutsideCapture as EventListener, true),
						addEventListener(doc, 'pointerup', handlePressEndCapture as EventListener, true),
						addEventListener(doc, 'pointercancel', handlePressEndCapture as EventListener, true),
						addEventListener(doc, 'mousedown', closeOnPressOutsideCapture as EventListener, true),
						addEventListener(doc, 'mouseup', handlePressEndCapture as EventListener, true),
						addEventListener(doc, 'touchstart', handleTouchStartCapture as EventListener, true),
						addEventListener(doc, 'touchmove', handleTouchMoveCapture as EventListener, true),
						addEventListener(doc, 'touchend', handleTouchEndCapture as EventListener, true),
					),
			);

			return () => {
				unsubscribe();
				compositionTimeout.clear();
				preventedPressSuppressionTimeout.clear();
				resetPressStartState();
				suppressNextOutsideClickRef.current = false;
			};
		},
		[
			dataRef,
			floatingElement,
			escapeKey,
			outsidePressEnabled,
			outsidePress,
			open,
			enabled,
			escapeKeyBubbles,
			outsidePressBubbles,
			closeOnEscapeKeyDown,
			clearInsideReactTree,
			getOutsidePressEventProp,
			hasBlockingChild,
			isEventWithinOwnElements,
			tree,
			store,
			cancelDismissOnEndTimeout,
		],
		subSlot(slot, 'e:main'),
	);

	useEffect(clearInsideReactTree, [outsidePress, clearInsideReactTree], subSlot(slot, 'e:cir'));

	const reference: ElementProps['reference'] = useMemo(
		() => ({
			onKeyDown: closeOnEscapeKeyDown,
			onPointerDown: closeOnReferencePress,
			onClick: closeOnReferencePress,
		}),
		[closeOnEscapeKeyDown, closeOnReferencePress],
		subSlot(slot, 'ref'),
	);

	const floating: ElementProps['floating'] = useMemo(
		() => ({
			onKeyDown: closeOnEscapeKeyDown,
			onPointerDown: markInsidePressStartPrevented,
			onMouseDown: markInsidePressStartPrevented,
			onClickCapture: markInsideReactTree,
			onMouseDownCapture(event: any) {
				markInsideReactTree();
				markPressStartedInsideReactTree(event);
			},
			onPointerDownCapture(event: any) {
				markInsideReactTree();
				markPressStartedInsideReactTree(event);
			},
			onMouseUpCapture: markInsideReactTree,
			onTouchEndCapture: markInsideReactTree,
			onTouchMoveCapture: markInsideReactTree,
		}),
		[
			closeOnEscapeKeyDown,
			markInsideReactTree,
			markPressStartedInsideReactTree,
			markInsidePressStartPrevented,
		],
		subSlot(slot, 'floating'),
	);

	return useMemo(
		() => (enabled ? { reference, floating, trigger: reference } : {}),
		[enabled, reference, floating],
		subSlot(slot, 'out'),
	);
}
