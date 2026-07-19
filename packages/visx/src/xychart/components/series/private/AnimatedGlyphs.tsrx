import type { AxisScale } from '@octanejs/visx/axis';
import { useMemo } from 'octane';
import type { FC } from 'react';
import type { OctaneNode } from 'octane';
import {
	useTransition as useSpringTransition,
	animated,
	to,
} from '../../../../internal/spring.tsrx';
import getScaleBaseline from '../../../utils/getScaleBaseline';
import type { GlyphProps, GlyphsProps } from '../../../types';
import { cleanColor, colorHasUrl } from '../../../utils/cleanColorString';

/** Memoized useTransition config */
export function useAnimatedGlyphsConfig<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>({
	xScale,
	yScale,
	horizontal,
}: {
	xScale: XScale;
	yScale: YScale;
	horizontal?: boolean;
}) {
	const xScaleBaseline = getScaleBaseline(xScale);
	const yScaleBaseline = getScaleBaseline(yScale);
	return useMemo(
		() => ({
			unique: true,
			from: ({ x, y, color }: GlyphProps<Datum>) => ({
				x: horizontal ? xScaleBaseline : x,
				y: horizontal ? y : yScaleBaseline,
				color: cleanColor(color),
				opacity: 0,
			}),
			leave: ({ x, y, color }: GlyphProps<Datum>) => ({
				x: horizontal ? xScaleBaseline : x,
				y: horizontal ? y : yScaleBaseline,
				color: cleanColor(color),
				opacity: 0,
			}),
			enter: ({ x, y, color }: GlyphProps<Datum>) => ({
				x,
				y,
				color: cleanColor(color),
				opacity: 1,
			}),
			update: ({ x, y, color }: GlyphProps<Datum>) => ({
				x,
				y,
				color: cleanColor(color),
				opacity: 1,
			}),
			keys: (glyph: GlyphProps<Datum>) => glyph.key,
		}),
		[xScaleBaseline, yScaleBaseline, horizontal],
	);
}

export default function AnimatedGlyphs<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>({
	renderGlyph,
	glyphs,
	horizontal,
	xScale,
	yScale,
	onBlur,
	onFocus,
	onPointerMove,
	onPointerOut,
	onPointerUp,
}: {
	// unanimated Glyph component
	// unanimated Glyph component
	// unanimated Glyph component
	// unanimated Glyph component
	renderGlyph: FC<GlyphProps<Datum>>;
} & GlyphsProps<XScale, YScale, Datum>) {
	const animatedGlyphs = useSpringTransition(glyphs, {
		...useAnimatedGlyphsConfig({ xScale, yScale, horizontal }),
	});

	return <>
		{/** @ts-expect-error x/y aren't in react-spring's CSSProperties */}
		{animatedGlyphs(
			({ x, y, color, opacity }, item, { key }) => <animated.g
				key={key}
				transform={to([x, y], (xVal, yVal) => `translate(${xVal}, ${yVal})`)}
				color={color}
				opacity={opacity}
			>
				{renderGlyph({
					key,
					datum: item.datum,
					index: item.index,
					x: 0,
					y: 0,
					size: item.size,
					// currentColor doesn't work with url-based colors (pattern, gradient)
					// otherwise currentColor allows us to animate the color of the <g /> element
					color: colorHasUrl(item.color) ? item.color : 'currentColor',
					onBlur,
					onFocus,
					onPointerMove,
					onPointerOut,
					onPointerUp,
				}) as OctaneNode}
			</animated.g>,
		)}
	</>;
}
