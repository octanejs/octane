import type { AxisScale } from '@octanejs/visx/axis';
import { useCallback } from 'octane';
import type { FC } from 'react';
import type { GlyphProps, GlyphsProps } from '../../types';
import AnimatedGlyphs from './private/AnimatedGlyphs.tsrx';
import type { BaseGlyphSeriesProps } from './private/BaseGlyphSeries.tsrx';
import BaseGlyphSeries from './private/BaseGlyphSeries.tsrx';
import defaultRenderGlyph from './private/defaultRenderGlyph.tsrx';

export default function AnimatedGlyphSeries<
  XScale extends AxisScale,
  YScale extends AxisScale,
  Datum extends object,
>({
  renderGlyph = defaultRenderGlyph,
  ...props
}: Omit<BaseGlyphSeriesProps<XScale, YScale, Datum>, 'renderGlyphs'> & {
  renderGlyph?: FC<GlyphProps<Datum>>;
}) {
  const renderGlyphs = useCallback(
    (glyphsProps: GlyphsProps<XScale, YScale, Datum>) => (
      <AnimatedGlyphs {...glyphsProps} renderGlyph={renderGlyph} />
    ),
    [renderGlyph],
  );

  return <BaseGlyphSeries {...props} renderGlyphs={renderGlyphs} />;
}
