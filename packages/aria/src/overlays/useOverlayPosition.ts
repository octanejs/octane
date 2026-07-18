// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/overlays/useOverlayPosition.ts).
// octane adaptations: `DOMAttributes` is a local structural prop-bag alias (upstream's is typed
// over React's synthetic handlers); public-hook slot threading (splitSlot/subSlot) per the
// binding convention — the internal `useResize` helper also threads a slot; the explicit `deps`
// arrays are kept verbatim; string-indexed `overlay.style[key]` writes stay `any`.
import { calculatePosition, getRect, PositionResult } from './calculatePosition';
import type { RefObject } from '@react-types/shared';
import { getActiveElement, isFocusWithin } from '../utils/shadowdom/DOMFunctions';
import { useCallback, useEffect, useRef, useState } from 'octane';
import { useCloseOnScroll } from './useCloseOnScroll';
import { useLayoutEffect } from '../utils/useLayoutEffect';
import { useLocale } from '../i18n/I18nProvider';
import { useResizeObserver } from '../utils/useResizeObserver';

import { S, splitSlot, subSlot } from '../internal';

// octane adaptation: minimal structural DOMAttributes (upstream's drags React's synthetic
// handler types along).
type DOMAttributes = Record<string, any>;

export type Placement =
	| 'bottom'
	| 'bottom left'
	| 'bottom right'
	| 'bottom start'
	| 'bottom end'
	| 'top'
	| 'top left'
	| 'top right'
	| 'top start'
	| 'top end'
	| 'left'
	| 'left top'
	| 'left bottom'
	| 'start'
	| 'start top'
	| 'start bottom'
	| 'right'
	| 'right top'
	| 'right bottom'
	| 'end'
	| 'end top'
	| 'end bottom';

export type Axis = 'top' | 'bottom' | 'left' | 'right';
export type SizeAxis = 'width' | 'height';
export type PlacementAxis = Axis | 'center';

export interface PositionProps {
	/**
	 * The placement of the element with respect to its anchor element.
	 *
	 * @default 'bottom'
	 */
	placement?: Placement;
	/**
	 * The placement padding that should be applied between the element and its
	 * surrounding container.
	 *
	 * @default 12
	 */
	containerPadding?: number;
	/**
	 * The additional offset applied along the main axis between the element and its
	 * anchor element.
	 *
	 * @default 0
	 */
	offset?: number;
	/**
	 * The additional offset applied along the cross axis between the element and its
	 * anchor element.
	 *
	 * @default 0
	 */
	crossOffset?: number;
	/**
	 * Whether the element should flip its orientation (e.g. top to bottom or left to right) when
	 * there is insufficient room for it to render completely.
	 *
	 * @default true
	 */
	shouldFlip?: boolean;
	// /**
	//  * The element that should be used as the bounding container when calculating container offset
	//  * or whether it should flip.
	//  */
	// boundaryElement?: Element,
	/** Whether the element is rendered. */
	isOpen?: boolean;
}

export interface AriaPositionProps extends PositionProps {
	/**
	 * Cross size of the overlay arrow in pixels.
	 *
	 * @default 0
	 */
	arrowSize?: number;
	/**
	 * Element that that serves as the positioning boundary.
	 *
	 * @default document.body
	 */
	boundaryElement?: Element;
	/**
	 * The ref for the element which the overlay positions itself with respect to.
	 */
	targetRef: RefObject<Element | null>;
	/**
	 * The ref for the overlay element.
	 */
	overlayRef: RefObject<Element | null>;
	/**
	 * The ref for the arrow element.
	 */
	arrowRef?: RefObject<Element | null>;
	/**
	 * A ref for the scrollable region within the overlay.
	 *
	 * @default overlayRef
	 */
	scrollRef?: RefObject<Element | null>;
	/**
	 * Whether the overlay should update its position automatically.
	 *
	 * @default true
	 */
	shouldUpdatePosition?: boolean;
	/** Handler that is called when the overlay should close. */
	onClose?: (() => void) | null;
	/**
	 * The maxHeight specified for the overlay element.
	 * By default, it will take all space up to the current viewport height.
	 */
	maxHeight?: number;
	/**
	 * The minimum distance the arrow's edge should be from the edge of the overlay element.
	 *
	 * @default 0
	 */
	arrowBoundaryOffset?: number;
	/**
	 * Overrides the target element's bounding rectangle. Useful for positioning relative to
	 * a specific point such as the mouse cursor (e.g. context menus) or text selection.
	 *
	 * @default target.getBoundingClientRect()
	 * @param target - The target element.
	 */
	getTargetRect?: (target: Element) => DOMRect | null | undefined;
}

export interface PositionAria {
	/** Props for the overlay container element. */
	overlayProps: DOMAttributes;
	/** Props for the overlay tip arrow if any. */
	arrowProps: DOMAttributes;
	/** Placement of the overlay with respect to the overlay trigger. */
	placement: PlacementAxis | null;
	/** The origin of the target in the overlay's coordinate system. Useful for animations. */
	triggerAnchorPoint: { x: number; y: number } | null;
	/** Updates the position of the overlay. */
	updatePosition(): void;
}

interface ScrollAnchor {
	type: 'top' | 'bottom';
	offset: number;
}

let visualViewport = typeof document !== 'undefined' ? window.visualViewport : null;

/**
 * Handles positioning overlays like popovers and menus relative to a trigger
 * element, and updating the position when the window resizes.
 */
export function useOverlayPosition(props: AriaPositionProps): PositionAria;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useOverlayPosition(
	props: AriaPositionProps,
	slot: symbol | undefined,
): PositionAria;
export function useOverlayPosition(...args: any[]): PositionAria {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useOverlayPosition');
	const props = user[0] as AriaPositionProps;

	let { direction } = useLocale(subSlot(slot, 'locale'));
	let {
		arrowSize,
		targetRef,
		overlayRef,
		arrowRef,
		scrollRef = overlayRef,
		placement = 'bottom' as Placement,
		containerPadding = 12,
		shouldFlip = true,
		boundaryElement = typeof document !== 'undefined' ? document.body : null,
		offset = 0,
		crossOffset = 0,
		shouldUpdatePosition = true,
		isOpen = true,
		onClose,
		maxHeight,
		arrowBoundaryOffset = 0,
		getTargetRect,
	} = props;
	let [position, setPosition] = useState<PositionResult | null>(null, subSlot(slot, 'position'));

	let deps = [
		shouldUpdatePosition,
		placement,
		overlayRef.current,
		targetRef.current,
		arrowRef?.current,
		scrollRef.current,
		containerPadding,
		shouldFlip,
		boundaryElement,
		offset,
		crossOffset,
		isOpen,
		direction,
		maxHeight,
		arrowBoundaryOffset,
		arrowSize,
	];

	// Note, the position freezing breaks if body sizes itself dynamicly with the visual viewport but that might
	// just be a non-realistic use case
	// Upon opening a overlay, record the current visual viewport scale so we can freeze the overlay styles
	let lastScale = useRef(visualViewport?.scale, subSlot(slot, 'lastScale'));
	useEffect(
		() => {
			if (isOpen) {
				lastScale.current = visualViewport?.scale;
			}
		},
		[isOpen],
		subSlot(slot, 'scale'),
	);

	let updatePosition = useCallback(
		() => {
			if (
				shouldUpdatePosition === false ||
				!isOpen ||
				!overlayRef.current ||
				!targetRef.current ||
				!boundaryElement
			) {
				return;
			}

			if (visualViewport?.scale !== lastScale.current) {
				return;
			}

			// Determine a scroll anchor based on the focused element.
			// This stores the offset of the anchor element from the scroll container
			// so it can be restored after repositioning. This way if the overlay height
			// changes, the focused element appears to stay in the same position.
			let anchor: ScrollAnchor | null = null;
			if (scrollRef.current && isFocusWithin(scrollRef.current)) {
				let anchorRect = getActiveElement()?.getBoundingClientRect();
				let scrollRect = scrollRef.current.getBoundingClientRect();
				// Anchor from the top if the offset is in the top half of the scrollable element,
				// otherwise anchor from the bottom.
				anchor = {
					type: 'top',
					offset: (anchorRect?.top ?? 0) - scrollRect.top,
				};
				if (anchor.offset > scrollRect.height / 2) {
					anchor.type = 'bottom';
					anchor.offset = (anchorRect?.bottom ?? 0) - scrollRect.bottom;
				}
			}

			// Always reset the overlay's previous max height if not defined by the user so that we can compensate for
			// RAC collections populating after a second render and properly set a correct max height + positioning when it populates.
			let overlay = overlayRef.current as HTMLElement;
			if (!maxHeight && overlayRef.current) {
				overlay.style.top = '0px';
				overlay.style.bottom = '';
				overlay.style.maxHeight = (window.visualViewport?.height ?? window.innerHeight) + 'px';
			}

			let position = calculatePosition({
				placement: translateRTL(placement, direction),
				overlayNode: overlayRef.current,
				targetNode: targetRef.current,
				scrollNode: scrollRef.current || overlayRef.current,
				padding: containerPadding,
				shouldFlip,
				boundaryElement,
				offset,
				crossOffset,
				maxHeight,
				arrowSize: arrowSize ?? (arrowRef?.current ? getRect(arrowRef.current, true).width : 0),
				arrowBoundaryOffset,
				targetRect: getTargetRect?.(targetRef.current) as any,
			});

			if (!position.position) {
				return;
			}

			// Modify overlay styles directly so positioning happens immediately without the need of a second render
			// This is so we don't have to delay autoFocus scrolling or delay applying preventScroll for popovers
			overlay.style.top = '';
			overlay.style.bottom = '';
			overlay.style.left = '';
			overlay.style.right = '';

			Object.keys(position.position).forEach(
				(key) => ((overlay.style as any)[key] = (position.position as any)![key] + 'px'),
			);
			overlay.style.maxHeight = position.maxHeight != null ? position.maxHeight + 'px' : '';

			// Restore scroll position relative to anchor element.
			let activeElement = getActiveElement();
			if (anchor && activeElement && scrollRef.current) {
				let anchorRect = activeElement.getBoundingClientRect();
				let scrollRect = scrollRef.current.getBoundingClientRect();
				let newOffset = (anchorRect as any)[anchor.type] - (scrollRect as any)[anchor.type];
				scrollRef.current.scrollTop += newOffset - anchor.offset;
			}

			// Trigger a set state for a second render anyway for arrow positioning
			setPosition(position);
			// eslint-disable-next-line react-hooks/exhaustive-deps
		},
		deps,
		subSlot(slot, 'updatePosition'),
	);

	// Update position when anything changes
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useLayoutEffect(updatePosition, deps, subSlot(slot, 'layout'));

	// Update position on window resize
	useResize(updatePosition, subSlot(slot, 'resize'));

	// Update position when the overlay changes size (might need to flip).
	useResizeObserver(
		{
			ref: overlayRef,
			onResize: updatePosition,
		},
		subSlot(slot, 'overlayResize'),
	);

	// Update position when the target changes size (might need to flip).
	useResizeObserver(
		{
			ref: targetRef,
			onResize: updatePosition,
		},
		subSlot(slot, 'targetResize'),
	);

	// Reposition the overlay and do not close on scroll while the visual viewport is resizing.
	// This will ensure that overlays adjust their positioning when the iOS virtual keyboard appears.
	let isResizing = useRef(false, subSlot(slot, 'isResizing'));
	useLayoutEffect(
		() => {
			let timeout: ReturnType<typeof setTimeout>;
			let onResize = () => {
				isResizing.current = true;
				clearTimeout(timeout);

				timeout = setTimeout(() => {
					isResizing.current = false;
				}, 500);

				updatePosition();
			};

			// Only reposition the overlay if a scroll event happens immediately as a result of resize (aka the virtual keyboard has appears)
			// We don't want to reposition the overlay if the user has pinch zoomed in and is scrolling the viewport around.
			let onScroll = () => {
				if (isResizing.current) {
					onResize();
				}
			};

			visualViewport?.addEventListener('resize', onResize);
			visualViewport?.addEventListener('scroll', onScroll);
			return () => {
				visualViewport?.removeEventListener('resize', onResize);
				visualViewport?.removeEventListener('scroll', onScroll);
			};
		},
		[updatePosition],
		subSlot(slot, 'viewport'),
	);

	let close = useCallback(
		() => {
			if (!isResizing.current) {
				onClose?.();
			}
		},
		[onClose, isResizing],
		subSlot(slot, 'close'),
	);

	// When scrolling a parent scrollable region of the trigger (other than the body),
	// we hide the popover. Otherwise, its position would be incorrect.
	useCloseOnScroll(
		{
			triggerRef: targetRef,
			isOpen,
			onClose: onClose && close,
		},
		subSlot(slot, 'closeOnScroll'),
	);

	return {
		overlayProps: {
			style: {
				position: position ? 'absolute' : 'fixed',
				top: !position ? 0 : undefined,
				left: !position ? 0 : undefined,
				zIndex: 100000, // should match the z-index in ModalTrigger
				...position?.position,
				maxHeight: position?.maxHeight ?? '100vh',
			},
		},
		placement: position?.placement ?? null,
		triggerAnchorPoint: position?.triggerAnchorPoint ?? null,
		arrowProps: {
			'aria-hidden': 'true',
			role: 'presentation',
			style: {
				left: position?.arrowOffsetLeft,
				top: position?.arrowOffsetTop,
			},
		},
		updatePosition,
	};
}

function useResize(onResize: () => void, slot: symbol | undefined) {
	useLayoutEffect(
		() => {
			window.addEventListener('resize', onResize, false);
			return () => {
				window.removeEventListener('resize', onResize, false);
			};
		},
		[onResize],
		subSlot(slot, 'resize'),
	);
}

function translateRTL(position: string, direction: string) {
	if (direction === 'rtl') {
		return position.replace('start', 'right').replace('end', 'left') as Placement;
	}
	return position.replace('start', 'left').replace('end', 'right') as Placement;
}
