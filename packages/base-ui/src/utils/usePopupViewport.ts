// Ported from .base-ui/packages/react/src/utils/usePopupViewport.tsx (v1.6.0). Builds the morphing
// viewport containers for a popup that one of several triggers can open: while the content swaps,
// a DOM clone of the outgoing content is kept mounted alongside the incoming content so the change
// can be animated, and the popup auto-resizes between the two sizes.
//
// octane adaptations: `createElement` instead of JSX; `useIsoLayoutEffect` → `useLayoutEffect`;
// `ReactDOM.flushSync` → octane `flushSync`; every composed hook threads an explicit slot.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { createElement, Fragment, flushSync, useLayoutEffect, useRef, useState } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { inertValue } from './inertValue';
import { ownerDocument } from './owner';
import { useAnimationFrame } from './useAnimationFrame';
import { useAnimationsFinished } from './useAnimationsFinished';
import { usePreviousValue } from './usePreviousValue';
import { useStableCallback } from './useStableCallback';
import { usePopupAutoResize } from './usePopupAutoResize';
import { useDirection } from './DirectionContext';
import type { Dimensions } from './getCssDimensions';
import type { Side } from './useAnchorPositioning';

export interface PopupViewportCssVars {
	/** CSS variable name storing the popup width for the previous content snapshot. */
	popupWidth: string;
	/** CSS variable name storing the popup height for the previous content snapshot. */
	popupHeight: string;
}

export interface PopupViewportState {
	/** Direction from which the popup was activated, used for directional animations. */
	activationDirection: string | undefined;
	/** Whether the viewport is currently transitioning between contents. */
	transitioning: boolean;
}

export interface UsePopupViewportParameters {
	store: any;
	side: Side;
	cssVars: PopupViewportCssVars;
	children?: any;
}

export interface UsePopupViewportResult {
	children: any;
	state: PopupViewportState;
}

interface Offset {
	horizontal: number;
	vertical: number;
}

/**
 * Describes an offset as a "<horizontal> <vertical>" pair, treating small offsets as no movement.
 */
function getActivationDirection(offset: Offset | null): string | undefined {
	if (!offset) {
		return undefined;
	}
	return `${getValueWithTolerance(offset.horizontal, 5, 'right', 'left')} ${getValueWithTolerance(
		offset.vertical,
		5,
		'down',
		'up',
	)}`;
}

function getValueWithTolerance(
	value: number,
	tolerance: number,
	positiveLabel: string,
	negativeLabel: string,
): string {
	if (value > tolerance) {
		return positiveLabel;
	}
	if (value < -tolerance) {
		return negativeLabel;
	}
	return '';
}

/** Calculates the relative position between the centers of two elements. */
function calculateRelativePosition(from: Element, to: Element): Offset {
	const fromRect = from.getBoundingClientRect();
	const toRect = to.getBoundingClientRect();

	const fromCenter = {
		x: fromRect.left + fromRect.width / 2,
		y: fromRect.top + fromRect.height / 2,
	};
	const toCenter = { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 };

	return { horizontal: toCenter.x - fromCenter.x, vertical: toCenter.y - fromCenter.y };
}

/**
 * Returns a key that forces remounting content when triggers change or a payload is updated.
 */
function usePopupContentKey(
	activeTriggerId: string | null,
	payload: unknown,
	slot: symbol | undefined,
): string {
	const [contentKey, setContentKey] = useState(0, subSlot(slot, 'ck'));
	const previousActiveTriggerIdRef = useRef(activeTriggerId, subSlot(slot, 'prevId'));
	const previousPayloadRef = useRef(payload, subSlot(slot, 'prevPayload'));
	const pendingPayloadUpdateRef = useRef(false, subSlot(slot, 'pending'));

	useLayoutEffect(
		() => {
			// Compare against the last committed values to decide whether a new DOM subtree is needed.
			const previousActiveTriggerId = previousActiveTriggerIdRef.current;
			const previousPayload = previousPayloadRef.current;
			const triggerIdChanged = activeTriggerId !== previousActiveTriggerId;
			const payloadChanged = payload !== previousPayload;

			if (triggerIdChanged) {
				// Remount immediately on trigger change; remember if the payload hasn't caught up yet.
				setContentKey((k) => k + 1);
				pendingPayloadUpdateRef.current = !payloadChanged;
			} else if (pendingPayloadUpdateRef.current && payloadChanged) {
				// The payload arrived a render later, so remount once more to avoid reusing old nodes.
				setContentKey((k) => k + 1);
				pendingPayloadUpdateRef.current = false;
			}

			previousActiveTriggerIdRef.current = activeTriggerId;
			previousPayloadRef.current = payload;
		},
		[activeTriggerId, payload],
		subSlot(slot, 'l:key'),
	);

	return `${activeTriggerId ?? 'current'}-${contentKey}`;
}

export function usePopupViewport(...args: any[]): UsePopupViewportResult {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('usePopupViewport');
	const parameters = user[0] as UsePopupViewportParameters;

	const { store, side, cssVars, children } = parameters;

	const direction = useDirection();

	const activeTrigger = store.useState('activeTriggerElement', subSlot(slot, 's:trigger'));
	const activeTriggerId = store.useState('activeTriggerId', subSlot(slot, 's:triggerId'));
	const open = store.useState('open', subSlot(slot, 's:open'));
	const payload = store.useState('payload', subSlot(slot, 's:payload'));
	const mounted = store.useState('mounted', subSlot(slot, 's:mounted'));
	const popupElement = store.useState('popupElement', subSlot(slot, 's:popup'));
	const positionerElement = store.useState('positionerElement', subSlot(slot, 's:positioner'));

	const previousActiveTrigger = usePreviousValue<Element | null>(
		open ? activeTrigger : null,
		subSlot(slot, 'prevTrigger'),
	);
	// Remount current content on trigger changes (and once more when the payload lags) to avoid DOM
	// reuse flashes.
	const currentContentKey = usePopupContentKey(
		activeTriggerId,
		payload,
		subSlot(slot, 'contentKey'),
	);

	const capturedNodeRef = useRef<HTMLElement | null>(null, subSlot(slot, 'captured'));
	const [previousContentNode, setPreviousContentNode] = useState<HTMLElement | null>(
		null,
		subSlot(slot, 'prevNode'),
	);

	const [newTriggerOffset, setNewTriggerOffset] = useState<Offset | null>(
		null,
		subSlot(slot, 'offset'),
	);

	const currentContainerRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'curRef'));
	const previousContainerRef = useRef<HTMLDivElement | null>(null, subSlot(slot, 'prevRef'));

	const onAnimationsFinished = useAnimationsFinished(
		currentContainerRef,
		true,
		false,
		subSlot(slot, 'anim'),
	);
	const cleanupFrame = useAnimationFrame(subSlot(slot, 'frame'));

	const [previousContentDimensions, setPreviousContentDimensions] = useState<Dimensions | null>(
		null,
		subSlot(slot, 'prevDims'),
	);

	const [showStartingStyleAttribute, setShowStartingStyleAttribute] = useState(
		false,
		subSlot(slot, 'starting'),
	);

	useLayoutEffect(
		() => {
			store.set('hasViewport', true);
			return () => {
				store.set('hasViewport', false);
			};
		},
		[store],
		subSlot(slot, 'l:hasViewport'),
	);

	const handleMeasureLayout = useStableCallback(
		() => {
			currentContainerRef.current?.style.setProperty('animation', 'none');
			currentContainerRef.current?.style.setProperty('transition', 'none');
			previousContainerRef.current?.style.setProperty('display', 'none');
		},
		subSlot(slot, 'hml'),
	);

	const handleMeasureLayoutComplete = useStableCallback(
		(previousDimensions: Dimensions | null) => {
			currentContainerRef.current?.style.removeProperty('animation');
			currentContainerRef.current?.style.removeProperty('transition');
			previousContainerRef.current?.style.removeProperty('display');

			if (previousDimensions) {
				setPreviousContentDimensions(previousDimensions);
			}
		},
		subSlot(slot, 'hmlc'),
	);

	const lastHandledTriggerRef = useRef<Element | null>(null, subSlot(slot, 'lastTrigger'));

	useLayoutEffect(
		() => {
			if (!open || !mounted) {
				lastHandledTriggerRef.current = null;
			}
		},
		[open, mounted],
		subSlot(slot, 'l:resetTrigger'),
	);

	useLayoutEffect(
		() => {
			// When the trigger changes, promote the captured clone to state so both the new and old
			// content render together.
			if (
				activeTrigger &&
				previousActiveTrigger &&
				activeTrigger !== previousActiveTrigger &&
				lastHandledTriggerRef.current !== activeTrigger &&
				capturedNodeRef.current
			) {
				setPreviousContentNode(capturedNodeRef.current);
				setShowStartingStyleAttribute(true);

				// The relative position between the previous and new trigger drives the directional
				// animation.
				setNewTriggerOffset(calculateRelativePosition(previousActiveTrigger, activeTrigger));

				cleanupFrame.request(() => {
					flushSync(() => {
						setShowStartingStyleAttribute(false);
					});
					onAnimationsFinished(() => {
						setPreviousContentNode(null);
						setPreviousContentDimensions(null);
						capturedNodeRef.current = null;
					});
				});

				lastHandledTriggerRef.current = activeTrigger;
			}
		},
		[activeTrigger, previousActiveTrigger, previousContentNode, onAnimationsFinished, cleanupFrame],
		subSlot(slot, 'l:transition'),
	);

	// Capture a clone of the current content subtree on every render. Previous *nodes* can't be kept
	// (they may be stateful), so a DOM clone provides the visual continuity. Capturing every render
	// means rapid trigger switches always snapshot the latest committed content.
	useLayoutEffect(
		() => {
			const source = currentContainerRef.current;
			if (!source) {
				return;
			}

			const wrapper = ownerDocument(source).createElement('div');
			for (const child of Array.from(source.childNodes)) {
				wrapper.appendChild(child.cloneNode(true));
			}

			capturedNodeRef.current = wrapper;
		},
		undefined,
		subSlot(slot, 'l:capture'),
	);

	const isTransitioning = previousContentNode != null;
	let childrenToRender: any;
	if (!isTransitioning) {
		childrenToRender = createElement('div', {
			'data-current': true,
			ref: currentContainerRef,
			key: currentContentKey,
			children,
		});
	} else {
		childrenToRender = createElement(Fragment, {
			children: [
				createElement('div', {
					'data-previous': true,
					inert: inertValue(true),
					ref: previousContainerRef,
					style: {
						...(previousContentDimensions
							? {
									[cssVars.popupWidth]: `${previousContentDimensions.width}px`,
									[cssVars.popupHeight]: `${previousContentDimensions.height}px`,
								}
							: null),
						position: 'absolute',
					},
					key: 'previous',
					'data-ending-style': showStartingStyleAttribute ? undefined : '',
				}),
				createElement('div', {
					'data-current': true,
					ref: currentContainerRef,
					key: currentContentKey,
					'data-starting-style': showStartingStyleAttribute ? '' : undefined,
					children,
				}),
			],
		});
	}

	// Populate the previous container imperatively with the cloned children.
	useLayoutEffect(
		() => {
			const container = previousContainerRef.current;
			if (!container || !previousContentNode) {
				return;
			}
			container.replaceChildren(...Array.from(previousContentNode.childNodes));
		},
		[previousContentNode],
		subSlot(slot, 'l:populate'),
	);

	usePopupAutoResize(
		{
			popupElement,
			positionerElement,
			mounted,
			content: payload,
			onMeasureLayout: handleMeasureLayout,
			onMeasureLayoutComplete: handleMeasureLayoutComplete,
			side,
			direction,
		},
		subSlot(slot, 'resize'),
	);

	const state: PopupViewportState = {
		activationDirection: getActivationDirection(newTriggerOffset),
		transitioning: isTransitioning,
	};

	return { children: childrenToRender, state };
}
