// Ported from @radix-ui/react-popper (source:
// .radix-primitives/packages/react/popper/src/popper.tsx). The positioning primitive
// behind Tooltip/Popover/HoverCard/Menu: Anchor registers the reference element, Content
// positions against it via Floating UI (offset/shift/flip/size/arrow/hide + Radix's
// transform-origin middleware, exposing the --radix-popper-* CSS vars), Arrow renders
// inside a positioning wrapper. `@floating-ui/react-dom`'s useFloating →
// `@octanejs/floating-ui`'s bare positioning core (`usePositionFloating`).
import {
	arrow as floatingUIarrow,
	autoUpdate,
	flip,
	hide,
	limitShift,
	offset,
	shift,
	size,
	usePositionFloating,
} from '@octanejs/floating-ui';
import {
	createElement,
	useCallback,
	useEffect,
	useEffectEvent,
	useLayoutEffect,
	useRef,
	useState,
} from 'octane';

import * as ArrowPrimitive from './Arrow';
import { useComposedRefs } from './compose-refs';
import { createContextScope } from './context';
import { S, subSlot } from './internal';
import { Primitive } from './Primitive';
import { useSize } from './use-size';

export const SIDE_OPTIONS = ['top', 'right', 'bottom', 'left'] as const;
export const ALIGN_OPTIONS = ['start', 'center', 'end'] as const;
type Side = (typeof SIDE_OPTIONS)[number];
type Align = (typeof ALIGN_OPTIONS)[number];

const [createPopperContext, createPopperScope] = createContextScope('Popper');
export { createPopperScope };

interface PopperContextValue {
	anchor: any;
	onAnchorChange(anchor: any): void;
	placementState: string | undefined;
	setPlacementState: (p: string | undefined) => void;
}
const [PopperProvider, usePopperContext] = createPopperContext<PopperContextValue>('Popper');

const [PopperContentProvider, useContentContext] = createPopperContext<{
	placedSide: Side;
	placedAlign: Align;
	onArrowChange(arrow: HTMLSpanElement | null): void;
	arrowX?: number;
	arrowY?: number;
	shouldHideArrow: boolean;
}>('PopperContent');

export function Root(props: any): any {
	const slot = S('Popper.Root');
	const { __scopePopper, children } = props ?? {};
	const [anchor, setAnchor] = useState<any>(null, subSlot(slot, 'anchor'));
	const [placementState, setPlacementState] = useState<string | undefined>(
		undefined,
		subSlot(slot, 'placement'),
	);
	return createElement(PopperProvider, {
		scope: __scopePopper,
		anchor,
		onAnchorChange: setAnchor,
		placementState,
		setPlacementState,
		children,
	});
}

export function Anchor(props: any): any {
	const slot = S('Popper.Anchor');
	const { __scopePopper, virtualRef, ref: forwardedRef, ...anchorProps } = props ?? {};
	const context = usePopperContext('PopperAnchor', __scopePopper);
	const ref = useRef<HTMLElement | null>(null, subSlot(slot, 'ref'));
	const onAnchorChange = context.onAnchorChange;

	// For DOM anchors, set the anchor from the callback ref (commit phase) rather than an
	// effect — mounting many Popper-based components at once must not cascade renders
	// (radix-ui/primitives#3858).
	const callbackRef = useCallback(
		(node: HTMLElement | null) => {
			ref.current = node;
			if (node) onAnchorChange(node);
		},
		[onAnchorChange],
		subSlot(slot, 'cb'),
	);
	const composedRefs = useComposedRefs(forwardedRef, callbackRef, subSlot(slot, 'refs'));

	const anchorRef = useRef<any>(null, subSlot(slot, 'virtual'));
	useEffect(
		() => {
			if (!virtualRef) return;
			const previousAnchor = anchorRef.current;
			anchorRef.current = virtualRef.current;
			if (previousAnchor !== anchorRef.current) {
				onAnchorChange(anchorRef.current);
			}
		},
		undefined,
		subSlot(slot, 'e:virtual'),
	);

	const sideAndAlign =
		context.placementState && getSideAndAlignFromPlacement(context.placementState);
	const placedSide = sideAndAlign ? sideAndAlign[0] : undefined;
	const placedAlign = sideAndAlign ? sideAndAlign[1] : undefined;

	return virtualRef
		? null
		: createElement(Primitive.div, {
				'data-radix-popper-side': placedSide,
				'data-radix-popper-align': placedAlign,
				...anchorProps,
				ref: composedRefs,
			});
}

export function Content(props: any): any {
	const slot = S('Popper.Content');
	const {
		__scopePopper,
		side = 'bottom',
		sideOffset = 0,
		align = 'center',
		alignOffset = 0,
		arrowPadding = 0,
		avoidCollisions = true,
		collisionBoundary = [],
		collisionPadding: collisionPaddingProp = 0,
		sticky = 'partial',
		hideWhenDetached = false,
		updatePositionStrategy = 'optimized',
		onPlaced,
		ref: forwardedRef,
		...contentProps
	} = props ?? {};

	const context = usePopperContext('PopperContent', __scopePopper);

	const [content, setContent] = useState<HTMLDivElement | null>(null, subSlot(slot, 'content'));
	const composedRefs = useComposedRefs(forwardedRef, setContent, subSlot(slot, 'refs'));

	const [arrow, setArrow] = useState<HTMLSpanElement | null>(null, subSlot(slot, 'arrow'));
	const arrowSize = useSize(arrow, subSlot(slot, 'arrowSize'));
	const arrowWidth = arrowSize?.width ?? 0;
	const arrowHeight = arrowSize?.height ?? 0;

	const desiredPlacement = side + (align !== 'center' ? '-' + align : '');

	const collisionPadding =
		typeof collisionPaddingProp === 'number'
			? collisionPaddingProp
			: { top: 0, right: 0, bottom: 0, left: 0, ...collisionPaddingProp };

	const boundary = Array.isArray(collisionBoundary) ? collisionBoundary : [collisionBoundary];
	const hasExplicitBoundaries = boundary.length > 0;

	const detectOverflowOptions = {
		padding: collisionPadding,
		boundary: boundary.filter(isNotNull),
		// with `strategy: 'fixed'`, this is the only way to get it to respect boundaries
		altBoundary: hasExplicitBoundaries,
	};

	const { refs, floatingStyles, placement, isPositioned, middlewareData } = usePositionFloating([
		{
			// default to `fixed` strategy so users don't have to pick and we also avoid
			// focus scroll issues
			strategy: 'fixed',
			placement: desiredPlacement,
			whileElementsMounted: (...args: any[]) => {
				const cleanup = (autoUpdate as any)(...args, {
					animationFrame: updatePositionStrategy === 'always',
				});
				return cleanup;
			},
			elements: { reference: context.anchor },
			middleware: [
				offset({ mainAxis: sideOffset + arrowHeight, alignmentAxis: alignOffset }),
				avoidCollisions &&
					shift({
						mainAxis: true,
						crossAxis: false,
						limiter: sticky === 'partial' ? limitShift() : undefined,
						...detectOverflowOptions,
					}),
				avoidCollisions && flip({ ...detectOverflowOptions }),
				size({
					...detectOverflowOptions,
					apply: ({ elements, rects, availableWidth, availableHeight }: any) => {
						const { width: anchorWidth, height: anchorHeight } = rects.reference;
						const contentStyle = elements.floating.style;
						contentStyle.setProperty('--radix-popper-available-width', `${availableWidth}px`);
						contentStyle.setProperty('--radix-popper-available-height', `${availableHeight}px`);
						contentStyle.setProperty('--radix-popper-anchor-width', `${anchorWidth}px`);
						contentStyle.setProperty('--radix-popper-anchor-height', `${anchorHeight}px`);
					},
				}),
				arrow && floatingUIarrow({ element: arrow, padding: arrowPadding }),
				transformOrigin({ arrowWidth, arrowHeight }),
				hideWhenDetached &&
					hide({
						strategy: 'referenceHidden',
						...detectOverflowOptions,
						// `hide` detects whether the anchor is clipped — with no explicit
						// collisionBoundary fall back to Floating UI's default clipping
						// ancestors so an occluded submenu hides when its anchor scrolls out
						// of view (radix-ui/primitives#3237).
						boundary: hasExplicitBoundaries ? detectOverflowOptions.boundary : undefined,
					}),
			],
		},
		subSlot(slot, 'floating'),
	]);

	const setPlacementState = context.setPlacementState;
	useLayoutEffect(
		() => {
			setPlacementState(placement);
			return () => setPlacementState(undefined);
		},
		[placement],
		subSlot(slot, 'e:placement'),
	);

	const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);

	const handlePlaced = useEffectEvent(onPlaced ?? (() => {}), subSlot(slot, 'placed'));
	useLayoutEffect(
		() => {
			if (isPositioned) handlePlaced();
		},
		[isPositioned],
		subSlot(slot, 'e:placed'),
	);

	const arrowX = middlewareData.arrow?.x;
	const arrowY = middlewareData.arrow?.y;
	const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0;

	const [contentZIndex, setContentZIndex] = useState<string | undefined>(
		undefined,
		subSlot(slot, 'z'),
	);
	useLayoutEffect(
		() => {
			if (content) setContentZIndex(window.getComputedStyle(content).zIndex);
		},
		[content],
		subSlot(slot, 'e:z'),
	);

	return createElement('div', {
		ref: refs.setFloating,
		'data-radix-popper-content-wrapper': '',
		style: {
			...floatingStyles,
			// keep off the page when measuring
			transform: isPositioned ? floatingStyles.transform : 'translate(0, -200%)',
			minWidth: 'max-content',
			zIndex: contentZIndex,
			'--radix-popper-transform-origin': [
				middlewareData.transformOrigin?.x,
				middlewareData.transformOrigin?.y,
			].join(' '),
			// hide the content if using the hide middleware and should be hidden — set
			// visibility to hidden and disable pointer events so the UI behaves as if the
			// PopperContent isn't there at all
			...(middlewareData.hide?.referenceHidden && {
				visibility: 'hidden',
				pointerEvents: 'none',
			}),
		},
		// Floating UI internally calculates logical alignment based on the `dir` attribute
		// on the reference/floating node — add it here so it's computed when portalled too.
		dir: props?.dir,
		children: createElement(PopperContentProvider, {
			scope: __scopePopper,
			placedSide,
			placedAlign,
			onArrowChange: setArrow,
			arrowX,
			arrowY,
			shouldHideArrow: cannotCenterArrow,
			children: createElement(Primitive.div, {
				'data-side': placedSide,
				'data-align': placedAlign,
				...contentProps,
				ref: composedRefs,
				style: {
					...contentProps.style,
					// if the PopperContent hasn't been placed yet (not all measurements done)
					// prevent animations so they don't kick in referring to the wrong side
					animation: !isPositioned ? 'none' : undefined,
				},
			}),
		}),
	});
}

const OPPOSITE_SIDE: Record<Side, Side> = {
	top: 'bottom',
	right: 'left',
	bottom: 'top',
	left: 'right',
};

export function Arrow(props: any): any {
	const { __scopePopper, ...arrowProps } = props ?? {};
	const contentContext = useContentContext('PopperArrow', __scopePopper);
	const baseSide = OPPOSITE_SIDE[contentContext.placedSide];
	// The extra span wrapper is required because ResizeObserver reports SVG bounding
	// boxes (the largest path), not layout size.
	return createElement('span', {
		ref: contentContext.onArrowChange,
		style: {
			position: 'absolute',
			left: contentContext.arrowX,
			top: contentContext.arrowY,
			[baseSide]: 0,
			transformOrigin: {
				top: '',
				right: '0 0',
				bottom: 'center 0',
				left: '100% 0',
			}[contentContext.placedSide],
			transform: {
				top: 'translateY(100%)',
				right: 'translateY(50%) rotate(90deg) translateX(-50%)',
				bottom: `rotate(180deg)`,
				left: 'translateY(50%) rotate(-90deg) translateX(50%)',
			}[contentContext.placedSide],
			visibility: contentContext.shouldHideArrow ? 'hidden' : undefined,
		},
		children: createElement(ArrowPrimitive.Root, {
			...arrowProps,
			style: {
				...arrowProps.style,
				// ensures the element can be measured correctly (mostly for if SVG)
				display: 'block',
			},
		}),
	});
}

function isNotNull<T>(value: T | null): value is T {
	return value !== null;
}

const transformOrigin = (options: { arrowWidth: number; arrowHeight: number }): any => ({
	name: 'transformOrigin',
	options,
	fn(data: any) {
		const { placement, rects, middlewareData } = data;

		const cannotCenterArrow = middlewareData.arrow?.centerOffset !== 0;
		const isArrowHidden = cannotCenterArrow;
		const arrowWidth = isArrowHidden ? 0 : options.arrowWidth;
		const arrowHeight = isArrowHidden ? 0 : options.arrowHeight;

		const [placedSide, placedAlign] = getSideAndAlignFromPlacement(placement);
		const noArrowAlign = { start: '0%', center: '50%', end: '100%' }[placedAlign] as string;

		const arrowXCenter = (middlewareData.arrow?.x ?? 0) + arrowWidth / 2;
		const arrowYCenter = (middlewareData.arrow?.y ?? 0) + arrowHeight / 2;

		let x = '';
		let y = '';
		if (placedSide === 'bottom') {
			x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
			y = `${-arrowHeight}px`;
		} else if (placedSide === 'top') {
			x = isArrowHidden ? noArrowAlign : `${arrowXCenter}px`;
			y = `${rects.floating.height + arrowHeight}px`;
		} else if (placedSide === 'right') {
			x = `${-arrowHeight}px`;
			y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
		} else if (placedSide === 'left') {
			x = `${rects.floating.width + arrowHeight}px`;
			y = isArrowHidden ? noArrowAlign : `${arrowYCenter}px`;
		}
		return { data: { x, y } };
	},
});

function getSideAndAlignFromPlacement(placement: string): [Side, Align] {
	const [side, align = 'center'] = placement.split('-');
	return [side as Side, align as Align];
}

export { Root as Popper, Anchor as PopperAnchor, Content as PopperContent, Arrow as PopperArrow };
