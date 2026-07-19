// Ported from @floating-ui/react FloatingArrow — the SVG arrow for a floating
// element. Now possible because octane's de-opt path namespaces `<svg>` subtrees.
// `.ts` component via createElement; React forwardRef → props.ref. Unlike React JSX
// (which maps `strokeWidth`→`stroke-width`), octane's de-opt setAttribute uses names
// verbatim, so SVG presentation attributes are written kebab-case here.
import { getComputedStyle } from '@floating-ui/utils/dom';
import { createElement, useState } from 'octane';
import type { OctaneNode } from 'octane';

import { S } from './internal';
import { useId } from './useId';
import { useModernLayoutEffect, type CSSProperties } from './utils';
import type { FloatingContext, MutableRefObject, RefCallback } from './types';

// Upstream extends `React.ComponentPropsWithRef<'svg'>`. The port declares its
// OWN props strictly and leaves the remaining SVG attributes open (`unknown`
// index) so prop bags typed against other libraries' SVG surfaces (e.g.
// React's synthetic-event `SVGProps`) remain spreadable; the rest is forwarded
// verbatim to the `<svg>` element.
export interface FloatingArrowProps {
	/**
	 * The floating context.
	 */
	context: Omit<FloatingContext, 'refs'> & { refs: any };
	/**
	 * Width of the arrow.
	 * @default 14
	 */
	width?: number;
	/**
	 * Height of the arrow.
	 * @default 7
	 */
	height?: number;
	/**
	 * The corner radius (rounding) of the arrow tip.
	 * @default 0 (sharp)
	 */
	tipRadius?: number;
	/**
	 * Forces a static offset over dynamic positioning under a certain condition.
	 * If the shift() middleware causes the popover to shift, this value will be
	 * ignored.
	 */
	staticOffset?: string | number | null;
	/**
	 * Custom path string.
	 */
	d?: string;
	/**
	 * Stroke (border) color of the arrow.
	 */
	stroke?: string;
	/**
	 * Stroke (border) width of the arrow.
	 */
	strokeWidth?: number;
	/** Object-form styles merged over the arrow's own positioning styles. */
	style?: CSSProperties;
	/** Ref-as-prop (octane has no forwardRef). */
	ref?: MutableRefObject<SVGSVGElement | null> | RefCallback<SVGSVGElement> | null;
	/** Remaining SVG attributes/handlers, forwarded to the `<svg>` element. */
	[key: string]: unknown;
}

/**
 * Renders a pointing arrow triangle.
 * @see https://floating-ui.com/docs/FloatingArrow
 */
export function FloatingArrow(props: FloatingArrowProps): OctaneNode {
	const ref = props.ref;
	const context = props.context;
	const placement = context.placement;
	const floating = context.elements.floating;
	const arrow = context.middlewareData.arrow;
	const shift = context.middlewareData.shift;

	const width = props.width ?? 14;
	const height = props.height ?? 7;
	const tipRadius = props.tipRadius ?? 0;
	const strokeWidth = props.strokeWidth ?? 0;
	const staticOffset = props.staticOffset;
	const stroke = props.stroke;
	const d = props.d;
	const { transform, ...restStyle } = props.style ?? {};
	const {
		context: _c,
		width: _w,
		height: _h,
		tipRadius: _t,
		strokeWidth: _s,
		staticOffset: _so,
		stroke: _st,
		d: _d,
		style: _sty,
		ref: _r,
		...rest
	} = props;

	const clipPathId = useId(S('FloatingArrow:id'));
	const [isRTL, setIsRTL] = useState(false, S('FloatingArrow:rtl'));

	useModernLayoutEffect(
		() => {
			if (!floating) return;
			const rtl = getComputedStyle(floating).direction === 'rtl';
			if (rtl) {
				setIsRTL(true);
			}
		},
		[floating],
		S('FloatingArrow:eff'),
	);

	if (!floating) {
		return null;
	}

	const [side, alignment] = placement.split('-');
	const isVerticalSide = side === 'top' || side === 'bottom';
	let computedStaticOffset = staticOffset;
	if (
		(isVerticalSide && shift != null && shift.x) ||
		(!isVerticalSide && shift != null && shift.y)
	) {
		computedStaticOffset = null;
	}

	const computedStrokeWidth = strokeWidth * 2;
	const halfStrokeWidth = computedStrokeWidth / 2;
	const svgX = (width / 2) * (tipRadius / -8 + 1);
	const svgY = ((height / 2) * tipRadius) / 4;
	const isCustomShape = !!d;
	const yOffsetProp = computedStaticOffset && alignment === 'end' ? 'bottom' : 'top';
	let xOffsetProp = computedStaticOffset && alignment === 'end' ? 'right' : 'left';
	if (computedStaticOffset && isRTL) {
		xOffsetProp = alignment === 'end' ? 'left' : 'right';
	}
	const arrowX = arrow?.x != null ? computedStaticOffset || arrow.x : '';
	const arrowY = arrow?.y != null ? computedStaticOffset || arrow.y : '';
	const dValue =
		d ||
		'M0,0' +
			(' H' + width) +
			(' L' + (width - svgX) + ',' + (height - svgY)) +
			(' Q' + width / 2 + ',' + height + ' ' + svgX + ',' + (height - svgY)) +
			' Z';
	const rotation = (
		{
			top: isCustomShape ? 'rotate(180deg)' : '',
			left: isCustomShape ? 'rotate(90deg)' : 'rotate(-90deg)',
			bottom: isCustomShape ? '' : 'rotate(180deg)',
			right: isCustomShape ? 'rotate(-90deg)' : 'rotate(90deg)',
		} as Record<string, string>
	)[side];

	return createElement(
		'svg',
		{
			...rest,
			'aria-hidden': true,
			ref,
			width: isCustomShape ? width : width + computedStrokeWidth,
			height: width,
			viewBox: '0 0 ' + width + ' ' + (height > width ? height : width),
			style: {
				position: 'absolute',
				pointerEvents: 'none',
				[xOffsetProp]: arrowX,
				[yOffsetProp]: arrowY,
				[side]:
					isVerticalSide || isCustomShape
						? '100%'
						: 'calc(100% - ' + computedStrokeWidth / 2 + 'px)',
				transform: [rotation, transform].filter((t) => !!t).join(' '),
				...restStyle,
			},
		},
		computedStrokeWidth > 0 &&
			createElement('path', {
				'clip-path': 'url(#' + clipPathId + ')',
				fill: 'none',
				stroke,
				'stroke-width': computedStrokeWidth + (d ? 0 : 1),
				d: dValue,
			}),
		createElement('path', {
			stroke: computedStrokeWidth && !d ? rest.fill : 'none',
			d: dValue,
		}),
		createElement(
			'clipPath',
			{ id: clipPathId },
			createElement('rect', {
				x: -halfStrokeWidth,
				y: halfStrokeWidth * (isCustomShape ? -1 : 1),
				width: width + computedStrokeWidth,
				height: width,
			}),
		),
	);
}
