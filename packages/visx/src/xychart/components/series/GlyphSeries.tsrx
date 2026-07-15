import type { AxisScale } from '@octanejs/visx/axis';
import { Fragment, useCallback } from 'octane';
import type { FC, ReactNode } from 'react';
import type { GlyphProps, GlyphsProps } from '../../types';
import type { BaseGlyphSeriesProps } from './private/BaseGlyphSeries.tsrx';
import BaseGlyphSeries from './private/BaseGlyphSeries.tsrx';
import defaultRenderGlyph from './private/defaultRenderGlyph.tsrx';

export default function GlyphSeries<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>({
	renderGlyph = defaultRenderGlyph,
	...props
}: Omit<BaseGlyphSeriesProps<XScale, YScale, Datum>, 'renderGlyphs'> & {
	renderGlyph?: FC<GlyphProps<Datum>>;
}) {
	const renderGlyphs = useCallback(
		({
			glyphs,
			onPointerMove,
			onPointerOut,
			onPointerUp,
			onFocus,
			onBlur,
		}: GlyphsProps<XScale, YScale, Datum>) => glyphs.map(
			(glyph) => <Fragment key={glyph.key}>
				{renderGlyph({
					...glyph,
					onPointerMove,
					onPointerOut,
					onPointerUp,
					onFocus,
					onBlur,
				}) as ReactNode}
			</Fragment>,
		),
		[renderGlyph],
	);
	return <BaseGlyphSeries {...props} renderGlyphs={renderGlyphs} />;
}
