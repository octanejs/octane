// Ported from .base-ui/packages/react/src/utils/useAnchorPositioning.ts (v1.6.0), octane-adapted
// (slot-threaded). Provides standardized anchor positioning for popups: wraps the local Store-based
// `useFloating` (which itself wraps `@octanejs/floating-ui`'s `usePositionFloating`) and configures
// the offset/flip/shift/size/arrow/hide middleware exactly as Base UI does. Middleware factories and
// `@floating-ui/utils` helpers come from `@octanejs/floating-ui` / `@floating-ui/utils` — the same
// underlying `@floating-ui/dom` computation Base UI uses, so `positionerStyles` byte-match.
import { useState, useRef, useMemo, useEffect, useLayoutEffect } from 'octane';
import { getSide, getAlignment, getSideAxis, type Rect } from '@floating-ui/utils';
import { autoUpdate, flip, limitShift, offset, shift, size, arrow } from '@octanejs/floating-ui';

import { S, subSlot } from '../internal';
import { ownerDocument, ownerWindow } from './owner';
import { useValueAsRef } from './useValueAsRef';
import { useStableCallback } from './useStableCallback';
import { useDirection } from './DirectionContext';
import { useFloating } from './floating/useFloating';
import { hide } from './hideMiddleware';
import { DEFAULT_SIDES } from './adaptiveOriginMiddleware';

export type Side = 'top' | 'bottom' | 'left' | 'right' | 'inline-end' | 'inline-start';
export type Align = 'start' | 'center' | 'end';
export type Boundary = 'clipping-ancestors' | Element | Element[] | Rect;
export type OffsetFunction = (data: {
	side: Side;
	align: Align;
	anchor: { width: number; height: number };
	positioner: { width: number; height: number };
}) => number;

type PhysicalSide = 'top' | 'bottom' | 'left' | 'right';

function getLogicalSide(sideParam: Side, renderedSide: PhysicalSide, isRtl: boolean): Side {
	const isLogicalSideParam = sideParam === 'inline-start' || sideParam === 'inline-end';
	const logicalRight = isRtl ? 'inline-start' : 'inline-end';
	const logicalLeft = isRtl ? 'inline-end' : 'inline-start';
	return (
		{
			top: 'top',
			right: isLogicalSideParam ? logicalRight : 'right',
			bottom: 'bottom',
			left: isLogicalSideParam ? logicalLeft : 'left',
		} as Record<PhysicalSide, Side>
	)[renderedSide];
}

function getOffsetData(state: any, sideParam: Side, isRtl: boolean) {
	const { rects, placement } = state;
	const data = {
		side: getLogicalSide(sideParam, getSide(placement) as PhysicalSide, isRtl),
		align: getAlignment(placement) || 'center',
		anchor: { width: rects.reference.width, height: rects.reference.height },
		positioner: { width: rects.floating.width, height: rects.floating.height },
	} as const;
	return data;
}

export interface CollisionAvoidance {
	side?: 'flip' | 'shift' | 'none' | undefined;
	align?: 'flip' | 'shift' | 'none' | undefined;
	fallbackAxisSide?: 'start' | 'end' | 'none' | undefined;
}

export interface UseAnchorPositioningSharedParameters {
	anchor?: any;
	positionMethod?: 'absolute' | 'fixed' | undefined;
	side?: Side | undefined;
	sideOffset?: number | OffsetFunction | undefined;
	align?: Align | undefined;
	alignOffset?: number | OffsetFunction | undefined;
	collisionBoundary?: Boundary | undefined;
	collisionPadding?: any;
	sticky?: boolean | undefined;
	arrowPadding?: number | undefined;
	disableAnchorTracking?: boolean | undefined;
	collisionAvoidance?: CollisionAvoidance | undefined;
}

export interface UseAnchorPositioningParameters extends UseAnchorPositioningSharedParameters {
	keepMounted?: boolean | undefined;
	floatingRootContext?: any;
	mounted: boolean;
	disableAnchorTracking: boolean;
	nodeId?: string | undefined;
	adaptiveOrigin?: any;
	collisionAvoidance: CollisionAvoidance;
	shiftCrossAxis?: boolean | undefined;
	lazyFlip?: boolean | undefined;
	externalTree?: any;
	inline?: any;
}

export interface UseAnchorPositioningReturnValue {
	positionerStyles: Record<string, any>;
	arrowStyles: Record<string, any>;
	arrowRef: { current: Element | null };
	arrowUncentered: boolean;
	side: Side;
	align: Align;
	physicalSide: PhysicalSide;
	anchorHidden: boolean;
	refs: any;
	context: any;
	isPositioned: boolean;
	update: () => void;
}

/**
 * Provides standardized anchor positioning behavior for floating elements. Wraps Floating UI's
 * `useFloating` hook.
 */
export function useAnchorPositioning(
	params: UseAnchorPositioningParameters,
	slotArg?: symbol | undefined,
): UseAnchorPositioningReturnValue {
	const slot = slotArg ?? S('useAnchorPositioning');
	const {
		// Public parameters
		anchor,
		positionMethod = 'absolute',
		side: sideParam = 'bottom',
		sideOffset = 0,
		align = 'center',
		alignOffset = 0,
		collisionBoundary,
		collisionPadding: collisionPaddingParam = 5,
		sticky = false,
		arrowPadding = 5,
		disableAnchorTracking = false,
		inline: inlineMiddleware,
		// Private parameters
		keepMounted = false,
		floatingRootContext,
		mounted,
		collisionAvoidance,
		shiftCrossAxis = false,
		nodeId,
		adaptiveOrigin,
		lazyFlip = false,
		externalTree,
	} = params;

	const [mountSide, setMountSide] = useState<PhysicalSide | null>(null, subSlot(slot, 'mountSide'));

	if (!mounted && mountSide !== null) {
		setMountSide(null);
	}

	const collisionAvoidanceSide = collisionAvoidance.side || 'flip';
	const collisionAvoidanceAlign = collisionAvoidance.align || 'flip';
	const collisionAvoidanceFallbackAxisSide = collisionAvoidance.fallbackAxisSide || 'end';

	const anchorFn = typeof anchor === 'function' ? anchor : undefined;
	const anchorFnCallback = useStableCallback(anchorFn, subSlot(slot, 'anchorFn'));
	const anchorDep = anchorFn ? anchorFnCallback : anchor;
	const anchorValueRef = useValueAsRef(anchor, subSlot(slot, 'anchorRef'));
	const mountedRef = useValueAsRef(mounted, subSlot(slot, 'mountedRef'));

	const direction = useDirection();
	const isRtl = direction === 'rtl';

	const side =
		mountSide ||
		(
			{
				top: 'top',
				right: 'right',
				bottom: 'bottom',
				left: 'left',
				'inline-end': isRtl ? 'left' : 'right',
				'inline-start': isRtl ? 'right' : 'left',
			} as Record<Side, PhysicalSide>
		)[sideParam];

	const placement = align === 'center' ? side : `${side}-${align}`;

	let collisionPadding = collisionPaddingParam as {
		top: number;
		right: number;
		bottom: number;
		left: number;
	};

	// Create a bias to the preferred side.
	const bias = 1;
	const biasTop = sideParam === 'bottom' ? bias : 0;
	const biasBottom = sideParam === 'top' ? bias : 0;
	const biasLeft = sideParam === 'right' ? bias : 0;
	const biasRight = sideParam === 'left' ? bias : 0;

	if (typeof collisionPadding === 'number') {
		collisionPadding = {
			top: collisionPadding + biasTop,
			right: collisionPadding + biasRight,
			bottom: collisionPadding + biasBottom,
			left: collisionPadding + biasLeft,
		};
	} else if (collisionPadding) {
		collisionPadding = {
			top: (collisionPadding.top || 0) + biasTop,
			right: (collisionPadding.right || 0) + biasRight,
			bottom: (collisionPadding.bottom || 0) + biasBottom,
			left: (collisionPadding.left || 0) + biasLeft,
		};
	}

	const commonCollisionProps = {
		boundary: collisionBoundary === 'clipping-ancestors' ? 'clippingAncestors' : collisionBoundary,
		padding: collisionPadding,
	} as const;

	const arrowRef = useRef<Element | null>(null, subSlot(slot, 'arrowRef'));

	// Keep these reactive if they're not functions
	const sideOffsetRef = useValueAsRef(sideOffset, subSlot(slot, 'sideOffsetRef'));
	const alignOffsetRef = useValueAsRef(alignOffset, subSlot(slot, 'alignOffsetRef'));
	const sideOffsetDep = typeof sideOffset !== 'function' ? sideOffset : 0;
	const alignOffsetDep = typeof alignOffset !== 'function' ? alignOffset : 0;

	const middleware: any[] = [];

	if (inlineMiddleware) {
		middleware.push(inlineMiddleware);
	}

	// @floating-ui/dom middleware factories take options only; Base UI's trailing deps arrays are a
	// @floating-ui/react-dom memoization affordance — @octanejs/floating-ui recomputes via deepEqual
	// on the middleware array instead, so the deps are dropped here. `sideOffsetDep`/`alignOffsetDep`
	// remain referenced below (in flip/shift config) to keep the reactive read explicit.
	void sideOffsetDep;
	void alignOffsetDep;

	middleware.push(
		offset((state: any) => {
			const data = getOffsetData(state, sideParam, isRtl);

			const sideAxis =
				typeof sideOffsetRef.current === 'function'
					? sideOffsetRef.current(data)
					: sideOffsetRef.current;
			const alignAxis =
				typeof alignOffsetRef.current === 'function'
					? alignOffsetRef.current(data)
					: alignOffsetRef.current;

			return {
				mainAxis: sideAxis,
				crossAxis: alignAxis,
				alignmentAxis: alignAxis,
			};
		}),
	);

	const shiftDisabled = collisionAvoidanceAlign === 'none' && collisionAvoidanceSide !== 'shift';
	const crossAxisShiftEnabled =
		!shiftDisabled && (sticky || shiftCrossAxis || collisionAvoidanceSide === 'shift');

	const flipMiddleware =
		collisionAvoidanceSide === 'none'
			? null
			: flip({
					...commonCollisionProps,
					padding: {
						top: collisionPadding.top + bias,
						right: collisionPadding.right + bias,
						bottom: collisionPadding.bottom + bias,
						left: collisionPadding.left + bias,
					},
					mainAxis: !shiftCrossAxis && collisionAvoidanceSide === 'flip',
					crossAxis: collisionAvoidanceAlign === 'flip' ? 'alignment' : false,
					fallbackAxisSideDirection: collisionAvoidanceFallbackAxisSide,
				});
	const shiftMiddleware = shiftDisabled
		? null
		: shift((data: any) => {
				const html = ownerDocument(data.elements.floating).documentElement;
				return {
					...commonCollisionProps,
					rootBoundary: shiftCrossAxis
						? { x: 0, y: 0, width: html.clientWidth, height: html.clientHeight }
						: undefined,
					mainAxis: collisionAvoidanceAlign !== 'none',
					crossAxis: crossAxisShiftEnabled,
					limiter:
						sticky || shiftCrossAxis
							? undefined
							: limitShift((limitData: any) => {
									if (!arrowRef.current) {
										return {};
									}
									const { width, height } = arrowRef.current.getBoundingClientRect();
									const sideAxis = getSideAxis(getSide(limitData.placement));
									const arrowSize = sideAxis === 'y' ? width : height;
									const offsetAmount =
										sideAxis === 'y'
											? collisionPadding.left + collisionPadding.right
											: collisionPadding.top + collisionPadding.bottom;
									return {
										offset: arrowSize / 2 + offsetAmount / 2,
									};
								}),
				};
			});

	// https://floating-ui.com/docs/flip#combining-with-shift
	if (
		collisionAvoidanceSide === 'shift' ||
		collisionAvoidanceAlign === 'shift' ||
		align === 'center'
	) {
		middleware.push(shiftMiddleware, flipMiddleware);
	} else {
		middleware.push(flipMiddleware, shiftMiddleware);
	}

	middleware.push(
		size({
			...commonCollisionProps,
			apply({ elements: { floating }, availableWidth, availableHeight, rects }: any) {
				if (!mountedRef.current) {
					return;
				}

				const floatingStyle = floating.style;
				floatingStyle.setProperty('--available-width', `${availableWidth}px`);
				floatingStyle.setProperty('--available-height', `${availableHeight}px`);

				const dpr = ownerWindow(floating).devicePixelRatio || 1;
				const { x, y, width, height } = rects.reference;
				const anchorWidth = (Math.round((x + width) * dpr) - Math.round(x * dpr)) / dpr;
				const anchorHeight = (Math.round((y + height) * dpr) - Math.round(y * dpr)) / dpr;

				floatingStyle.setProperty('--anchor-width', `${anchorWidth}px`);
				floatingStyle.setProperty('--anchor-height', `${anchorHeight}px`);
			},
		}),
		arrow((state: any) => ({
			element: arrowRef.current || ownerDocument(state.elements.floating).createElement('div'),
			padding: arrowPadding,
			offsetParent: 'floating',
		})),
		{
			name: 'transformOrigin',
			fn(state: any) {
				const { elements, middlewareData, placement: renderedPlacement, rects, y } = state;

				const currentRenderedSide = getSide(renderedPlacement);
				const currentRenderedAxis = getSideAxis(currentRenderedSide);
				const arrowEl = arrowRef.current;
				const arrowX = middlewareData.arrow?.x || 0;
				const arrowY = middlewareData.arrow?.y || 0;
				const arrowWidth = (arrowEl as any)?.clientWidth || 0;
				const arrowHeight = (arrowEl as any)?.clientHeight || 0;
				const transformX = arrowX + arrowWidth / 2;
				const transformY = arrowY + arrowHeight / 2;
				const shiftY = Math.abs(middlewareData.shift?.y || 0);
				const halfAnchorHeight = rects.reference.height / 2;
				const sideOffsetValue =
					typeof sideOffset === 'function'
						? sideOffset(getOffsetData(state, sideParam, isRtl))
						: sideOffset;
				const isOverlappingAnchor = shiftY > sideOffsetValue;

				const adjacentTransformOrigin = {
					top: `${transformX}px calc(100% + ${sideOffsetValue}px)`,
					bottom: `${transformX}px ${-sideOffsetValue}px`,
					left: `calc(100% + ${sideOffsetValue}px) ${transformY}px`,
					right: `${-sideOffsetValue}px ${transformY}px`,
				}[currentRenderedSide];
				const overlapTransformOrigin = `${transformX}px ${rects.reference.y + halfAnchorHeight - y}px`;

				elements.floating.style.setProperty(
					'--transform-origin',
					crossAxisShiftEnabled && currentRenderedAxis === 'y' && isOverlappingAnchor
						? overlapTransformOrigin
						: adjacentTransformOrigin,
				);

				return {};
			},
		},
		hide,
		adaptiveOrigin,
	);

	useLayoutEffect(
		() => {
			// Ensure positioning doesn't run initially for `keepMounted` elements that
			// aren't initially open.
			if (!mounted && floatingRootContext) {
				floatingRootContext.update({
					referenceElement: null,
					floatingElement: null,
					domReferenceElement: null,
					positionReference: null,
				});
			}
		},
		[mounted, floatingRootContext],
		subSlot(slot, 'e:reset'),
	);

	const autoUpdateOptions = useMemo(
		() => ({
			elementResize: !disableAnchorTracking && typeof ResizeObserver !== 'undefined',
			layoutShift: !disableAnchorTracking && typeof IntersectionObserver !== 'undefined',
		}),
		[disableAnchorTracking],
		subSlot(slot, 'm:auto'),
	);

	const {
		refs,
		elements,
		x,
		y,
		middlewareData,
		update,
		placement: renderedPlacement,
		context,
		isPositioned,
		floatingStyles: originalFloatingStyles,
	} = useFloating(
		{
			rootContext: floatingRootContext,
			open: keepMounted ? mounted : undefined,
			placement,
			middleware,
			strategy: positionMethod,
			whileElementsMounted: keepMounted
				? undefined
				: (...args: any[]) => (autoUpdate as any)(...args, autoUpdateOptions),
			nodeId,
			externalTree,
		},
		subSlot(slot, 'floating'),
	);

	const { sideX, sideY } = middlewareData.adaptiveOrigin || DEFAULT_SIDES;

	// Default to `fixed` when not positioned to prevent `autoFocus` scroll jumps.
	const resolvedPosition: 'absolute' | 'fixed' = isPositioned ? positionMethod : 'fixed';

	const floatingStyles = useMemo<Record<string, any>>(
		() => {
			const base: Record<string, any> = adaptiveOrigin
				? { position: resolvedPosition, [sideX]: x, [sideY]: y }
				: { position: resolvedPosition, ...originalFloatingStyles };
			if (!isPositioned) {
				base.opacity = 0;
			}
			return base;
		},
		[adaptiveOrigin, resolvedPosition, sideX, x, sideY, y, originalFloatingStyles, isPositioned],
		subSlot(slot, 'm:fs'),
	);

	const registeredPositionReferenceRef = useRef<any>(null, subSlot(slot, 'regPosRef'));

	useLayoutEffect(
		() => {
			if (!mounted) {
				return;
			}

			const anchorValue = anchorValueRef.current;
			const resolvedAnchor = typeof anchorValue === 'function' ? anchorValue() : anchorValue;
			const unwrappedElement =
				(isRef(resolvedAnchor) ? resolvedAnchor.current : resolvedAnchor) || null;
			const finalAnchor = unwrappedElement || null;

			if (finalAnchor !== registeredPositionReferenceRef.current) {
				refs.setPositionReference(finalAnchor);
				registeredPositionReferenceRef.current = finalAnchor;
			}
		},
		[mounted, refs, anchorDep, anchorValueRef],
		subSlot(slot, 'e:posref1'),
	);

	useEffect(
		() => {
			if (!mounted) {
				return;
			}

			const anchorValue = anchorValueRef.current;

			// Refs from parent components are set after useLayoutEffect runs and are available in useEffect.
			if (typeof anchorValue === 'function') {
				return;
			}

			if (isRef(anchorValue) && anchorValue.current !== registeredPositionReferenceRef.current) {
				refs.setPositionReference(anchorValue.current);
				registeredPositionReferenceRef.current = anchorValue.current;
			}
		},
		[mounted, refs, anchorDep, anchorValueRef],
		subSlot(slot, 'e:posref2'),
	);

	useEffect(
		() => {
			if (keepMounted && mounted && elements.reference && elements.floating) {
				return (autoUpdate as any)(
					elements.reference,
					elements.floating,
					update,
					autoUpdateOptions,
				);
			}
			return undefined;
		},
		[keepMounted, mounted, elements, update, autoUpdateOptions],
		subSlot(slot, 'e:auto'),
	);

	const renderedSide = getSide(renderedPlacement) as PhysicalSide;
	const logicalRenderedSide = getLogicalSide(sideParam, renderedSide, isRtl);
	const renderedAlign = (getAlignment(renderedPlacement) || 'center') as Align;
	const anchorHidden = Boolean(middlewareData.hide?.referenceHidden);

	// Locks the flip (makes it "sticky") so it doesn't prefer a given placement.
	useLayoutEffect(
		() => {
			if (lazyFlip && mounted && isPositioned) {
				setMountSide(renderedSide);
			}
		},
		[lazyFlip, mounted, isPositioned, renderedSide],
		subSlot(slot, 'e:lazyflip'),
	);

	const arrowStyles = useMemo(
		() => ({
			position: 'absolute' as const,
			top: middlewareData.arrow?.y,
			left: middlewareData.arrow?.x,
		}),
		[middlewareData.arrow],
		subSlot(slot, 'm:arrow'),
	);

	const arrowUncentered = middlewareData.arrow?.centerOffset !== 0;

	return useMemo(
		() => ({
			positionerStyles: floatingStyles,
			arrowStyles,
			arrowRef,
			arrowUncentered,
			side: logicalRenderedSide,
			align: renderedAlign,
			physicalSide: renderedSide,
			anchorHidden,
			refs,
			context,
			isPositioned,
			update,
		}),
		[
			floatingStyles,
			arrowStyles,
			arrowRef,
			arrowUncentered,
			logicalRenderedSide,
			renderedAlign,
			renderedSide,
			anchorHidden,
			refs,
			context,
			isPositioned,
			update,
		],
		subSlot(slot, 'm:ret'),
	);
}

function isRef(param: any): param is { current: any } {
	return param != null && 'current' in param;
}
