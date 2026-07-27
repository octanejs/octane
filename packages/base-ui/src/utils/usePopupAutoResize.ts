// Ported from .base-ui/packages/react/src/utils/usePopupAutoResize.ts (v1.6.0). Lets a popup resize
// to its content while keeping the change animatable: it measures the new content at `max-content`,
// pins the popup to its previous size, then animates to the new one on the next frame.
//
// octane adaptations: `useIsoLayoutEffect` → `useLayoutEffect`; every composed hook threads an
// explicit slot.
//
// SLOT: plain-`.ts` hook; the trailing arg is the caller's slot.
import { useLayoutEffect, useMemo, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';
import { NOOP, EMPTY_OBJECT } from './empty';
import { useAnimationFrame } from './useAnimationFrame';
import { useAnimationsFinished } from './useAnimationsFinished';
import { useStableCallback } from './useStableCallback';
import { getCssDimensions } from './getCssDimensions';
import type { Dimensions } from './getCssDimensions';
import type { Side } from './useAnchorPositioning';

export interface UsePopupAutoResizeParameters {
	/** Element to resize. */
	popupElement: HTMLElement | null;
	/** Positioner element (parent of the popup). */
	positionerElement: HTMLElement | null;
	/** Whether the popup is mounted. */
	mounted: boolean;
	/**
	 * Content that may change and trigger a resize. It doesn't have to be the actual content, just
	 * a value that changes when a resize is needed.
	 */
	content: unknown;
	/** Fired immediately before measuring the dimensions of the new content. */
	onMeasureLayout?: (() => void) | undefined;
	/**
	 * Fired after the new dimensions have been measured.
	 * @param previousDimensions Dimensions before the change, or `null` on the first measurement.
	 * @param newDimensions Newly measured dimensions.
	 */
	onMeasureLayoutComplete?:
		((previousDimensions: Dimensions | null, newDimensions: Dimensions) => void) | undefined;
	side: Side;
	direction: 'ltr' | 'rtl';
}

function overrideElementStyle(element: HTMLElement, property: string, value: string): () => void {
	const originalValue = element.style.getPropertyValue(property);
	element.style.setProperty(property, value);
	return () => {
		element.style.setProperty(property, originalValue);
	};
}

function applyElementStyles(element: HTMLElement, styles: Record<string, string>): () => void {
	const restorers: Array<() => void> = [];
	for (const [key, value] of Object.entries(styles)) {
		restorers.push(overrideElementStyle(element, key, value));
	}
	return restorers.length
		? () => {
				restorers.forEach((restore) => restore());
			}
		: NOOP;
}

function setPopupCssSize(popupElement: HTMLElement, size: Dimensions | 'auto'): void {
	const width = size === 'auto' ? 'auto' : `${size.width}px`;
	const height = size === 'auto' ? 'auto' : `${size.height}px`;
	popupElement.style.setProperty('--popup-width', width);
	popupElement.style.setProperty('--popup-height', height);
}

function setPositionerCssSize(
	positionerElement: HTMLElement,
	size: Dimensions | 'max-content',
): void {
	const width = size === 'max-content' ? 'max-content' : `${size.width}px`;
	const height = size === 'max-content' ? 'max-content' : `${size.height}px`;
	positionerElement.style.setProperty('--positioner-width', width);
	positionerElement.style.setProperty('--positioner-height', height);
}

export function usePopupAutoResize(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('usePopupAutoResize');
	const parameters = user[0] as UsePopupAutoResizeParameters;

	const {
		popupElement,
		positionerElement,
		content,
		mounted,
		onMeasureLayout: onMeasureLayoutParam,
		onMeasureLayoutComplete: onMeasureLayoutCompleteParam,
		side,
		direction,
	} = parameters;

	const runOnceAnimationsFinish = useAnimationsFinished(
		popupElement,
		true,
		false,
		subSlot(slot, 'anim'),
	);

	const animationFrame = useAnimationFrame(subSlot(slot, 'frame'));

	const committedDimensionsRef = useRef<Dimensions | null>(null, subSlot(slot, 'dims'));
	const isInitialRenderRef = useRef(true, subSlot(slot, 'init'));

	const restoreAnchoringStylesRef = useRef<() => void>(NOOP, subSlot(slot, 'restore'));

	const onMeasureLayout = useStableCallback(onMeasureLayoutParam, subSlot(slot, 'oml'));
	const onMeasureLayoutComplete = useStableCallback(
		onMeasureLayoutCompleteParam,
		subSlot(slot, 'omlc'),
	);

	const anchoringStyles = useMemo(
		() => {
			// Ensure the popup size transitions correctly when anchored to `bottom` (side=top) or
			// `right` (side=left).
			let isOriginSide = side === 'top';
			let isPhysicalLeft = side === 'left';
			if (direction === 'rtl') {
				isOriginSide = isOriginSide || side === 'inline-end';
				isPhysicalLeft = isPhysicalLeft || side === 'inline-end';
			} else {
				isOriginSide = isOriginSide || side === 'inline-start';
				isPhysicalLeft = isPhysicalLeft || side === 'inline-start';
			}

			return isOriginSide
				? ({
						position: 'absolute',
						[side === 'top' ? 'bottom' : 'top']: '0',
						[isPhysicalLeft ? 'right' : 'left']: '0',
					} as Record<string, string>)
				: (EMPTY_OBJECT as unknown as Record<string, string>);
		},
		[side, direction],
		subSlot(slot, 'anchoring'),
	);

	useLayoutEffect(
		() => {
			// Reset the state when the popup is closed.
			if (!mounted) {
				restoreAnchoringStylesRef.current = NOOP;
				isInitialRenderRef.current = true;
				committedDimensionsRef.current = null;
				return undefined;
			}

			if (!popupElement || !positionerElement) {
				return undefined;
			}

			restoreAnchoringStylesRef.current = applyElementStyles(popupElement, anchoringStyles);

			// Measure the rendered size to enable transitions.
			setPopupCssSize(popupElement, 'auto');

			const restorePopupPosition = overrideElementStyle(popupElement, 'position', 'static');
			const restorePopupTransform = overrideElementStyle(popupElement, 'transform', 'none');
			const restorePopupScale = overrideElementStyle(popupElement, 'scale', '1');
			const restorePositionerAvailableSize = applyElementStyles(positionerElement, {
				'--available-width': 'max-content',
				'--available-height': 'max-content',
			});

			function restoreMeasurementOverrides() {
				restorePopupPosition();
				restorePopupTransform();
				restorePositionerAvailableSize();
			}

			function restoreMeasurementOverridesIncludingScale() {
				restoreMeasurementOverrides();
				restorePopupScale();
			}

			onMeasureLayout?.();

			// Initial render (for each time the popup opens).
			if (isInitialRenderRef.current || committedDimensionsRef.current === null) {
				setPositionerCssSize(positionerElement, 'max-content');

				const dimensions = getCssDimensions(popupElement);

				committedDimensionsRef.current = dimensions;

				setPositionerCssSize(positionerElement, dimensions);
				restoreMeasurementOverridesIncludingScale();
				onMeasureLayoutComplete?.(null, dimensions);

				isInitialRenderRef.current = false;

				return () => {
					restoreAnchoringStylesRef.current();
					restoreAnchoringStylesRef.current = NOOP;
				};
			}

			// Subsequent renders while open (when `content` changes).
			setPositionerCssSize(positionerElement, 'max-content');

			const previousDimensions = committedDimensionsRef.current;
			const newDimensions = getCssDimensions(popupElement);

			// Commit immediately so future content changes have a stable previous size.
			committedDimensionsRef.current = newDimensions;

			setPopupCssSize(popupElement, previousDimensions);
			restoreMeasurementOverridesIncludingScale();
			onMeasureLayoutComplete?.(previousDimensions, newDimensions);

			setPositionerCssSize(positionerElement, newDimensions);

			const abortController = new AbortController();

			animationFrame.request(() => {
				setPopupCssSize(popupElement, newDimensions);

				runOnceAnimationsFinish(() => {
					popupElement.style.setProperty('--popup-width', 'auto');
					popupElement.style.setProperty('--popup-height', 'auto');
				}, abortController.signal);
			});

			return () => {
				abortController.abort();
				animationFrame.cancel();
				restoreAnchoringStylesRef.current();
				restoreAnchoringStylesRef.current = NOOP;
			};
		},
		[
			content,
			popupElement,
			positionerElement,
			runOnceAnimationsFinish,
			animationFrame,
			mounted,
			onMeasureLayout,
			onMeasureLayoutComplete,
			anchoringStyles,
		],
		subSlot(slot, 'l:resize'),
	);
}
