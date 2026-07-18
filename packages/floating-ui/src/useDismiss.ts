// Ported from @floating-ui/react useDismiss — closes on escape / outside-press /
// ancestor-scroll. octane events are NATIVE (`event.nativeEvent` → `event`). The
// upstream `floating` free-variable in the scrollbar check is the intended
// `elements.floating`. NOTE: the `*Capture` handler keys are emitted as-is; octane
// has no capture-phase prop, so the inside-press optimisation degrades gracefully —
// the document-level `contains` check still prevents inside clicks from dismissing.
import {
	getComputedStyle,
	getParentNode,
	isElement,
	isHTMLElement,
	isLastTraversableNode,
	isWebKit,
} from '@floating-ui/utils/dom';
import { getOverflowAncestors } from '@floating-ui/dom';
import { useEffect, useMemo, useRef } from 'octane';

import { splitSlot, subSlot } from './internal';
import { useFloatingTree } from './tree';
import {
	contains,
	createAttribute,
	getDocument,
	getNodeChildren,
	getTarget,
	isEventTargetWithin,
	isReactEvent,
	isRootElement,
	useEffectEvent,
} from './utils';
import type { ElementProps, FloatingRootContext } from './types';

export interface UseDismissProps {
	/**
	 * Whether the Hook is enabled, including all internal Effects and event
	 * handlers.
	 * @default true
	 */
	enabled?: boolean;
	/**
	 * Whether to dismiss the floating element upon pressing the `esc` key.
	 * @default true
	 */
	escapeKey?: boolean;
	/**
	 * Whether to dismiss the floating element upon pressing the reference
	 * element. You likely want to ensure the `move` option in the `useHover()`
	 * Hook has been disabled when this is in use.
	 * @default false
	 */
	referencePress?: boolean;
	/**
	 * The type of event to use to determine a “press”.
	 * - `pointerdown` is eager on both mouse + touch input.
	 * - `mousedown` is eager on mouse input, but lazy on touch input.
	 * - `click` is lazy on both mouse + touch input.
	 * @default 'pointerdown'
	 */
	referencePressEvent?: 'pointerdown' | 'mousedown' | 'click';
	/**
	 * Whether to dismiss the floating element upon pressing outside of the
	 * floating element. Accepts a guard function to filter which presses count
	 * as outside (native `MouseEvent`).
	 * @default true
	 */
	outsidePress?: boolean | ((event: MouseEvent) => boolean);
	/**
	 * The type of event to use to determine an outside “press”.
	 * - `pointerdown` is eager on both mouse + touch input.
	 * - `mousedown` is eager on mouse input, but lazy on touch input.
	 * - `click` is lazy on both mouse + touch input.
	 * @default 'pointerdown'
	 */
	outsidePressEvent?: 'pointerdown' | 'mousedown' | 'click';
	/**
	 * Whether to dismiss the floating element upon scrolling an overflow
	 * ancestor.
	 * @default false
	 */
	ancestorScroll?: boolean;
	/**
	 * Determines whether event listeners bubble upwards through a tree of
	 * floating elements.
	 */
	bubbles?: boolean | { escapeKey?: boolean; outsidePress?: boolean };
	/**
	 * Determines whether to use capture phase event listeners.
	 */
	capture?: boolean | { escapeKey?: boolean; outsidePress?: boolean };
}

type PressHandlerKey = 'pointerdown' | 'mousedown' | 'click';

const bubbleHandlerKeys: Record<PressHandlerKey, string> = {
	pointerdown: 'onPointerDown',
	mousedown: 'onMouseDown',
	click: 'onClick',
};
const captureHandlerKeys: Record<PressHandlerKey, string> = {
	pointerdown: 'onPointerDownCapture',
	mousedown: 'onMouseDownCapture',
	click: 'onClickCapture',
};
const normalizeProp = (
	normalizable?: boolean | { escapeKey?: boolean; outsidePress?: boolean },
) => ({
	escapeKey: typeof normalizable === 'boolean' ? normalizable : (normalizable?.escapeKey ?? false),
	outsidePress:
		typeof normalizable === 'boolean' ? normalizable : (normalizable?.outsidePress ?? true),
});

/**
 * Closes the floating element when a dismissal is requested — by default, when
 * the user presses the `escape` key or outside of the floating element.
 * @see https://floating-ui.com/docs/useDismiss
 */
export function useDismiss(
	context: FloatingRootContext,
	props?: UseDismissProps,
	slot?: symbol,
): ElementProps;
export function useDismiss(...args: any[]): ElementProps {
	const [user, slot] = splitSlot(args);
	const context = user[0] as FloatingRootContext;
	const props = (user[1] as UseDismissProps) ?? {};

	const open = context.open;
	const onOpenChange = context.onOpenChange;
	const elements = context.elements;
	const dataRef = context.dataRef;

	const enabled = props.enabled ?? true;
	const escapeKey = props.escapeKey ?? true;
	const unstableOutsidePress = props.outsidePress ?? true;
	const outsidePressEvent = props.outsidePressEvent ?? 'pointerdown';
	const referencePress = props.referencePress ?? false;
	const referencePressEvent = props.referencePressEvent ?? 'pointerdown';
	const ancestorScroll = props.ancestorScroll ?? false;
	const bubbles = props.bubbles;
	const capture = props.capture;

	const tree = useFloatingTree();
	const outsidePressFn = useEffectEvent(
		typeof unstableOutsidePress === 'function' ? unstableOutsidePress : () => false,
		subSlot(slot, 'opfn'),
	);
	const outsidePress =
		typeof unstableOutsidePress === 'function' ? outsidePressFn : unstableOutsidePress;
	const endedOrStartedInsideRef = useRef(false, subSlot(slot, 'eosi'));
	const { escapeKey: escapeKeyBubbles, outsidePress: outsidePressBubbles } = normalizeProp(bubbles);
	const { escapeKey: escapeKeyCapture, outsidePress: outsidePressCapture } = normalizeProp(capture);
	const isComposingRef = useRef(false, subSlot(slot, 'comp'));

	const closeOnEscapeKeyDown = useEffectEvent(
		(event: KeyboardEvent) => {
			if (!open || !enabled || !escapeKey || event.key !== 'Escape') {
				return;
			}
			if (isComposingRef.current) {
				return;
			}
			const nodeId = dataRef.current.floatingContext?.nodeId;
			const children = tree ? getNodeChildren(tree.nodesRef.current, nodeId) : [];
			if (!escapeKeyBubbles) {
				event.stopPropagation();
				if (children.length > 0) {
					let shouldDismiss = true;
					children.forEach((child: any) => {
						if (child.context?.open && !child.context.dataRef.current.__escapeKeyBubbles) {
							shouldDismiss = false;
							return;
						}
					});
					if (!shouldDismiss) {
						return;
					}
				}
			}
			onOpenChange(false, isReactEvent(event) ? (event as any).nativeEvent : event, 'escape-key');
		},
		subSlot(slot, 'esc'),
	);

	const closeOnEscapeKeyDownCapture = useEffectEvent(
		(event: KeyboardEvent) => {
			const callback = () => {
				closeOnEscapeKeyDown(event);
				getTarget(event)?.removeEventListener('keydown', callback);
			};
			getTarget(event)?.addEventListener('keydown', callback);
		},
		subSlot(slot, 'escc'),
	);

	const closeOnPressOutside = useEffectEvent(
		(event: MouseEvent) => {
			const insideReactTree = dataRef.current.insideReactTree;
			dataRef.current.insideReactTree = false;

			const endedOrStartedInside = endedOrStartedInsideRef.current;
			endedOrStartedInsideRef.current = false;
			if (outsidePressEvent === 'click' && endedOrStartedInside) {
				return;
			}
			if (insideReactTree) {
				return;
			}
			if (typeof outsidePress === 'function' && !outsidePress(event)) {
				return;
			}
			const target = getTarget(event);
			const inertSelector = '[' + createAttribute('inert') + ']';
			const markers = getDocument(elements.floating).querySelectorAll(inertSelector);
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
				!isRootElement(target as Element) &&
				!contains(target as any, elements.floating) &&
				Array.from(markers).every((marker) => !contains(targetRootAncestor as any, marker as any))
			) {
				return;
			}

			if (isHTMLElement(target) && elements.floating) {
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
						? (event as any).offsetX <= target.offsetWidth - target.clientWidth
						: (event as any).offsetX > target.clientWidth);
				const pressedHorizontalScrollbar =
					canScrollX && (event as any).offsetY > target.clientHeight;
				if (pressedVerticalScrollbar || pressedHorizontalScrollbar) {
					return;
				}
			}

			const nodeId = dataRef.current.floatingContext?.nodeId;
			const targetIsInsideChildren =
				tree &&
				getNodeChildren(tree.nodesRef.current, nodeId).some((node: any) =>
					isEventTargetWithin(event, node.context?.elements.floating),
				);
			if (
				isEventTargetWithin(event, elements.floating) ||
				isEventTargetWithin(event, elements.domReference) ||
				targetIsInsideChildren
			) {
				return;
			}
			const children = tree ? getNodeChildren(tree.nodesRef.current, nodeId) : [];
			if (children.length > 0) {
				let shouldDismiss = true;
				children.forEach((child: any) => {
					if (child.context?.open && !child.context.dataRef.current.__outsidePressBubbles) {
						shouldDismiss = false;
						return;
					}
				});
				if (!shouldDismiss) {
					return;
				}
			}
			onOpenChange(false, event, 'outside-press');
		},
		subSlot(slot, 'press'),
	);

	const closeOnPressOutsideCapture = useEffectEvent(
		(event: MouseEvent) => {
			const callback = () => {
				closeOnPressOutside(event);
				getTarget(event)?.removeEventListener(outsidePressEvent, callback);
			};
			getTarget(event)?.addEventListener(outsidePressEvent, callback);
		},
		subSlot(slot, 'pressc'),
	);

	useEffect(
		() => {
			if (!open || !enabled) {
				return;
			}
			dataRef.current.__escapeKeyBubbles = escapeKeyBubbles;
			dataRef.current.__outsidePressBubbles = outsidePressBubbles;
			let compositionTimeout = -1;
			function onScroll(event: any) {
				onOpenChange(false, event, 'ancestor-scroll');
			}
			function handleCompositionStart() {
				window.clearTimeout(compositionTimeout);
				isComposingRef.current = true;
			}
			function handleCompositionEnd() {
				compositionTimeout = window.setTimeout(
					() => {
						isComposingRef.current = false;
					},
					isWebKit() ? 5 : 0,
				);
			}
			const doc = getDocument(elements.floating);
			if (escapeKey) {
				doc.addEventListener(
					'keydown',
					escapeKeyCapture ? closeOnEscapeKeyDownCapture : closeOnEscapeKeyDown,
					escapeKeyCapture,
				);
				doc.addEventListener('compositionstart', handleCompositionStart);
				doc.addEventListener('compositionend', handleCompositionEnd);
			}
			outsidePress &&
				doc.addEventListener(
					outsidePressEvent,
					outsidePressCapture ? closeOnPressOutsideCapture : closeOnPressOutside,
					outsidePressCapture,
				);
			let ancestors: any[] = [];
			if (ancestorScroll) {
				if (isElement(elements.domReference)) {
					ancestors = getOverflowAncestors(elements.domReference);
				}
				if (isElement(elements.floating)) {
					ancestors = ancestors.concat(getOverflowAncestors(elements.floating));
				}
				if (
					!isElement(elements.reference) &&
					elements.reference &&
					elements.reference.contextElement
				) {
					ancestors = ancestors.concat(getOverflowAncestors(elements.reference.contextElement));
				}
			}
			ancestors = ancestors.filter((ancestor) => ancestor !== doc.defaultView?.visualViewport);
			ancestors.forEach((ancestor) => {
				ancestor.addEventListener('scroll', onScroll, { passive: true });
			});
			return () => {
				if (escapeKey) {
					doc.removeEventListener(
						'keydown',
						escapeKeyCapture ? closeOnEscapeKeyDownCapture : closeOnEscapeKeyDown,
						escapeKeyCapture,
					);
					doc.removeEventListener('compositionstart', handleCompositionStart);
					doc.removeEventListener('compositionend', handleCompositionEnd);
				}
				outsidePress &&
					doc.removeEventListener(
						outsidePressEvent,
						outsidePressCapture ? closeOnPressOutsideCapture : closeOnPressOutside,
						outsidePressCapture,
					);
				ancestors.forEach((ancestor) => {
					ancestor.removeEventListener('scroll', onScroll);
				});
				window.clearTimeout(compositionTimeout);
			};
		},
		[
			dataRef,
			elements,
			escapeKey,
			outsidePress,
			outsidePressEvent,
			open,
			onOpenChange,
			ancestorScroll,
			enabled,
			escapeKeyBubbles,
			outsidePressBubbles,
			closeOnEscapeKeyDown,
			escapeKeyCapture,
			closeOnEscapeKeyDownCapture,
			closeOnPressOutside,
			outsidePressCapture,
			closeOnPressOutsideCapture,
		],
		subSlot(slot, 'e:listeners'),
	);

	useEffect(
		() => {
			dataRef.current.insideReactTree = false;
		},
		[dataRef, outsidePress, outsidePressEvent],
		subSlot(slot, 'e:reset'),
	);

	const reference = useMemo(
		() => ({
			onKeyDown: closeOnEscapeKeyDown,
			...(referencePress && {
				[bubbleHandlerKeys[referencePressEvent]]: (event: any) => {
					onOpenChange(false, event, 'reference-press');
				},
				...(referencePressEvent !== 'click' && {
					onClick(event: any) {
						onOpenChange(false, event, 'reference-press');
					},
				}),
			}),
		}),
		[closeOnEscapeKeyDown, onOpenChange, referencePress, referencePressEvent],
		subSlot(slot, 'm:ref'),
	);

	const floating = useMemo(
		() => {
			function setMouseDownOrUpInside(event: any) {
				if (event.button !== 0) {
					return;
				}
				endedOrStartedInsideRef.current = true;
			}
			return {
				onKeyDown: closeOnEscapeKeyDown,
				onMouseDown: setMouseDownOrUpInside,
				onMouseUp: setMouseDownOrUpInside,
				[captureHandlerKeys[outsidePressEvent]]: () => {
					dataRef.current.insideReactTree = true;
				},
			};
		},
		[closeOnEscapeKeyDown, outsidePressEvent, dataRef],
		subSlot(slot, 'm:flo'),
	);

	return useMemo<ElementProps>(
		() => (enabled ? { reference, floating } : {}),
		[enabled, reference, floating],
		subSlot(slot, 'm:ret'),
	);
}
