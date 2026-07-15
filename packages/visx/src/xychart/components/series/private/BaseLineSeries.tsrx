import { Fragment, useContext, useCallback, useMemo, useEffect } from 'octane';
import type { FC, SVGProps } from 'react';
import type { LinePathProps } from '@octanejs/visx/shape';
import { LinePath } from '@octanejs/visx/shape';
import type { AxisScale } from '@octanejs/visx/axis';
import DataContext from '../../../context/DataContext.tsrx';
import type { DataContextType, GlyphsProps, SeriesProps } from '../../../types';
import getScaledValueFactory from '../../../utils/getScaledValueFactory';
import isValidNumber from '../../../typeguards/isValidNumber';
import { LINESERIES_EVENT_SOURCE, XYCHART_EVENT_SOURCE } from '../../../constants';
import { BaseGlyphSeries } from './BaseGlyphSeries.tsrx';
import defaultRenderGlyph from './defaultRenderGlyph.tsrx';
import useSeriesEvents from '../../../hooks/useSeriesEvents.tsrx';

export type BaseLineSeriesProps<XScale extends AxisScale, YScale extends AxisScale, Datum extends object> =
	SeriesProps<XScale, YScale, Datum> & {
		/** Rendered component which is passed path props by BaseLineSeries after processing. */
		PathComponent?: FC<Omit<SVGProps<SVGPathElement>, 'ref'>> | 'path';
		/** Sets the curve factory (from @octanejs/visx/curve or d3-curve) for the line generator. Defaults to curveLinear. */
		curve?: LinePathProps<Datum>['curve'];
		/** Given a datakey, returns its color. Falls back to theme color if unspecified or if a null-ish value is returned. */
		colorAccessor?: (dataKey: string) => string | undefined | null;
	} & Omit<SVGProps<SVGPathElement>, 'x' | 'y' | 'x0' | 'x1' | 'y0' | 'y1' | 'ref'>;

function BaseLineSeries<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>({
	colorAccessor,
	curve,
	data,
	dataKey,
	onBlur,
	onFocus,
	onPointerMove,
	onPointerOut,
	onPointerUp,
	onPointerDown,
	enableEvents = true,
	xAccessor,
	xScale,
	yAccessor,
	yScale,
	PathComponent = 'path',
	...lineProps
}: BaseLineSeriesProps<XScale, YScale, Datum> & Pick<DataContextType<XScale, YScale, Datum>, | 'xScale'
| 'yScale'>) {
	const { colorScale, theme } = useContext(DataContext);
	const getScaledX = useMemo(() => getScaledValueFactory(xScale, xAccessor), [xScale, xAccessor]);
	const getScaledY = useMemo(() => getScaledValueFactory(yScale, yAccessor), [yScale, yAccessor]);
	const isDefined = useCallback(
		(d: Datum) => isValidNumber(xScale(xAccessor(d))) && isValidNumber(yScale(yAccessor(d))),
		[xScale, xAccessor, yScale, yAccessor],
	);
	const color = colorScale?.(dataKey) ?? theme?.colors?.[0] ?? '#222';

	const ownEventSourceKey = `${LINESERIES_EVENT_SOURCE}-${dataKey}`;
	const eventEmitters = useSeriesEvents<XScale, YScale, Datum>({
		dataKey,
		enableEvents,
		onBlur,
		onFocus,
		onPointerMove,
		onPointerOut,
		onPointerUp,
		onPointerDown,
		source: ownEventSourceKey,
		allowedSources: [XYCHART_EVENT_SOURCE, ownEventSourceKey],
	});

	// render invisible glyphs for focusing if onFocus/onBlur are defined
	const captureFocusEvents = Boolean(onFocus || onBlur);
	const renderGlyphs = useCallback(
		({ glyphs }: GlyphsProps<XScale, YScale, Datum>) => captureFocusEvents
			? glyphs.map(
					(glyph) => <Fragment key={glyph.key}>{defaultRenderGlyph({
						...glyph,
						color: 'transparent',
						onFocus: eventEmitters.onFocus,
						onBlur: eventEmitters.onBlur,
					})}</Fragment>,
				)
			: null,
		[captureFocusEvents, eventEmitters.onFocus, eventEmitters.onBlur],
	);

	return <>
		<LinePath x={getScaledX} y={getScaledY} defined={isDefined} curve={curve} {...lineProps}>
			{({ path }) =>
				<PathComponent
					stroke={colorAccessor?.(dataKey) ?? color}
					strokeWidth={2}
					fill="transparent"
					strokeLinecap="round"
					{...lineProps}
					d={path(data) || ''}
					{...eventEmitters}
				/>}
		</LinePath>
		{captureFocusEvents &&
			<BaseGlyphSeries
				dataKey={dataKey}
				data={data}
				xAccessor={xAccessor}
				yAccessor={yAccessor}
				xScale={xScale}
				yScale={yScale}
				renderGlyphs={renderGlyphs}
			/>}
	</>;
}

export default function BaseBaseLineSeriesWithRegisteredData<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>(props: BaseLineSeriesProps<XScale, YScale, Datum>) {
	const { dataKey, data, xAccessor, yAccessor } = props;
	const { xScale, yScale, dataRegistry } = useContext(
		DataContext,
	) as unknown as DataContextType<XScale, YScale, Datum>;

	useEffect(() => {
		if (dataRegistry) dataRegistry.registerData({ key: dataKey, data, xAccessor, yAccessor });
		return () => dataRegistry?.unregisterData(dataKey);
	}, [dataRegistry, dataKey, data, xAccessor, yAccessor]);

	const registryEntry = dataRegistry?.get(dataKey);

	// Explicit domains let wrapped series render before their registration effect.
	if (!xScale || !yScale) return null;

	// otherwise pass props + over-write data/accessors
	return <BaseLineSeries
		{...props}
		xScale={xScale}
		yScale={yScale}
		data={registryEntry?.data ?? data}
		xAccessor={registryEntry?.xAccessor ?? xAccessor}
		yAccessor={registryEntry?.yAccessor ?? yAccessor}
	/>;
}
