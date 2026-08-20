import { Fragment, useCallback, useContext, useMemo } from 'octane';
import type { ElementDescriptor } from 'octane';
import type { Octane } from 'octane/jsx-runtime';
import type { AxisScale } from '@octanejs/visx/axis';
import type { SeriesPoint } from 'd3-shape';
import type { StackPathConfig, AreaProps } from '@octanejs/visx/shape';
import { LinePath, Area, getFirstItem, getSecondItem } from '@octanejs/visx/shape';
import { coerceNumber } from '@octanejs/visx/scale';

import type {
	CombinedStackData,
	DataContextType,
	GlyphsProps,
	NearestDatumArgs,
	NearestDatumReturnType,
	SeriesProps,
} from '../../../types';
import type { SvgPathComponent } from '../../../types/svgPath';
import DataContext from '../../../context/DataContext.tsrx';
import type { BaseAreaSeriesProps } from './BaseAreaSeries.tsrx';
import { BaseGlyphSeries } from './BaseGlyphSeries.tsrx';
import useStackedData from '../../../hooks/useStackedData.tsrx';
import { getStackValue } from '../../../utils/combineBarStackData';
import isValidNumber from '../../../typeguards/isValidNumber';
import findNearestStackDatum from '../../../utils/findNearestStackDatum';
import { AREASTACK_EVENT_SOURCE, XYCHART_EVENT_SOURCE } from '../../../constants';
import type { SeriesEventsParams } from '../../../hooks/useSeriesEvents.tsrx';
import useSeriesEvents from '../../../hooks/useSeriesEvents.tsrx';
import defaultRenderGlyph from './defaultRenderGlyph.tsrx';
import getScaleBandwidth from '../../../utils/getScaleBandwidth';

type AreaStackChildProps<XScale extends AxisScale, YScale extends AxisScale, Datum extends object> =
	Omit<BaseAreaSeriesProps<XScale, YScale, Datum>, 'PathComponent' | 'curve'>;

type AreaStackDatum<XScale extends AxisScale, YScale extends AxisScale> =
	SeriesPoint<CombinedStackData<XScale, YScale>>;

export type BaseAreaStackProps<XScale extends AxisScale, YScale extends AxisScale, Datum extends object> =
	{
		/** `AreaSeries` elements, note we can't strictly enforce this with TS yet. */
		children: | ElementDescriptor<AreaStackChildProps<XScale, YScale, Datum>>
		| ElementDescriptor<AreaStackChildProps<XScale, YScale, Datum>>[];
		/** Rendered component which is passed path props by BaseAreaStack after processing. */
		PathComponent?: SvgPathComponent;
		/** Sets the curve factory (from @octanejs/visx/curve or d3-curve) for the line generator. Defaults to curveLinear. */
		curve?: AreaProps<Datum>['curve'];
		/** Whether to render a Line along value of the Area shape (area is fill only). */
		renderLine?: boolean;
	} & Pick<StackPathConfig<Datum, string>, | 'offset'
	| 'order'> & Pick<SeriesProps<XScale, YScale, Datum>, | 'onPointerMove'
	| 'onPointerOut'
	| 'onPointerUp'
	| 'onPointerDown'
	| 'onBlur'
	| 'onFocus'
	| 'enableEvents'>;

function identity<T>(value: T): T {
	return value;
}

function BaseAreaStack<XScale extends AxisScale, YScale extends AxisScale, Datum extends object>({
	PathComponent = 'path',
	children,
	curve,
	enableEvents = true,
	offset,
	onBlur,
	onFocus,
	onPointerMove,
	onPointerOut,
	onPointerUp,
	onPointerDown,
	order,
	renderLine = true,
}: BaseAreaStackProps<XScale, YScale, Datum>) {
	const { colorScale, dataRegistry, horizontal, xScale, yScale, theme } = useContext(
		DataContext,
	) as unknown as DataContextType<XScale, YScale, AreaStackDatum<XScale, YScale>>;

	const { dataKeys, seriesChildren, stackedData } = useStackedData<
		XScale,
		YScale,
		Datum,
		BaseAreaSeriesProps<XScale, YScale, Datum>
	>({
		children,
		order,
		offset,
	});

	// accessor functions for the stack generator
	const accessors = useMemo(() => {
		const xOffset = getScaleBandwidth(xScale) / 2;
		const yOffset = getScaleBandwidth(yScale) / 2;

		return horizontal
			? {
					y: (d: AreaStackDatum<XScale, YScale>) => (coerceNumber(yScale(getStackValue(d.data))) ??
						0) +
						yOffset,
					x0: (d: AreaStackDatum<XScale, YScale>) => (coerceNumber(xScale(getFirstItem(d))) ?? 0) +
						xOffset,
					x1: (d: AreaStackDatum<XScale, YScale>) => (coerceNumber(xScale(getSecondItem(d))) ?? 0) +
						xOffset,
					defined: (d: AreaStackDatum<XScale, YScale>) =>
						isValidNumber(yScale(getStackValue(d.data))) && isValidNumber(xScale(getSecondItem(d))),
				}
			: {
					x: (d: AreaStackDatum<XScale, YScale>) => (coerceNumber(xScale(getStackValue(d.data))) ??
						0) +
						xOffset,
					y0: (d: AreaStackDatum<XScale, YScale>) => (coerceNumber(yScale(getFirstItem(d))) ?? 0) +
						yOffset,
					y1: (d: AreaStackDatum<XScale, YScale>) => (coerceNumber(yScale(getSecondItem(d))) ?? 0) +
						yOffset,
					defined: (d: AreaStackDatum<XScale, YScale>) =>
						isValidNumber(xScale(getStackValue(d.data))) && isValidNumber(yScale(getSecondItem(d))),
				};
	}, [xScale, yScale, horizontal]);

	// pull out all area + line props for each dataKey
	const stacks = useMemo(
		() => stackedData.map((stack, stackIndex) => {
			const areaSeries: ElementDescriptor<BaseAreaSeriesProps<XScale, YScale, Datum>> | undefined =
				seriesChildren.find((child) => child.props.dataKey === stack.key);
			const {
				data,
				dataKey,
				xAccessor,
				yAccessor,
				curve: _,
				PathComponent: __,
				lineProps,
				renderLine: ___,
				...svgPathProps
			} = areaSeries?.props || {};

			const areaProps: Octane.SVGProps<SVGPathElement> = {
				fill: colorScale?.(stack.key) ?? theme?.colors?.[0] ?? '#222',
				...svgPathProps,
			};

			return {
				key: `${stackIndex}-${stack.key}`,
				accessors,
				data: stack,
				areaProps,
				lineProps,
			};
		}),
		[stackedData, accessors, colorScale, seriesChildren, theme],
	);

	// custom logic to find the nearest AreaStackDatum (context) and return the original Datum (props)
	const findNearestDatum = useCallback(
		(params: NearestDatumArgs<XScale, YScale, AreaStackDatum<XScale, YScale>>): NearestDatumReturnType<Datum> => {
			const childData = seriesChildren.find(
				(child) => child.props.dataKey === params.dataKey,
			)?.props?.data;
			return childData ? findNearestStackDatum(params, childData, horizontal) : null;
		},
		[seriesChildren, horizontal],
	);

	const ownEventSourceKey = `${AREASTACK_EVENT_SOURCE}-${dataKeys.join('-')}`;
	const eventEmitters = useSeriesEvents<XScale, YScale, Datum>({
		dataKey: dataKeys,
		enableEvents,
		findNearestDatum: findNearestDatum as unknown as SeriesEventsParams<
			XScale,
			YScale,
			Datum
		>['findNearestDatum'],
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
		({ glyphs }: GlyphsProps<XScale, YScale, AreaStackDatum<XScale, YScale>>) => captureFocusEvents
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

	// if scales and data are not available in the registry, bail
	if (dataKeys.some((key) => dataRegistry.get(key) == null) || !xScale || !yScale || !colorScale) {
		return null;
	}
	const areaNodes = stacks.map(function (stack) {
		function renderAreaPath(args: { path: (data: typeof stack.data) => string | null }) {
			return (
				<PathComponent
					className="visx-area"
					stroke="transparent"
					d={args.path(stack.data) || ''}
					{...stack.areaProps}
					{...eventEmitters}
				/>
			);
		}
		return (
			<Area key={stack.key} curve={curve} {...stack.accessors}>
				{renderAreaPath}
			</Area>
		);
	});

	return <g className="visx-area-stack">
		{areaNodes}
		{renderLine &&
			stacks.map(
				(stack) => <LinePath
					key={`line-${stack.key}`}
					// note: this currently doesn't work well for offset=wiggle
					// because it only draws a single line. with two lines you
					// get overlap across stacks :/
					x={stack.accessors.x || stack.accessors.x1}
					y={stack.accessors.y || stack.accessors.y1}
					defined={stack.accessors.defined}
					curve={curve}
					{...stack.lineProps}
				>
					{({ path }) =>
						<PathComponent
							className="visx-line"
							fill="transparent"
							stroke={stack.areaProps.fill}
							strokeWidth={2}
							pointerEvents="none"
							{...stack.lineProps}
							d={path(stack.data) || ''}
						/>}
				</LinePath>,
			)}
		{captureFocusEvents && stacks.map((_, i) => {
				// render in reverse stack order tab to top-values first
				const stack: (typeof stacks)[number] = stacks[stacks.length - i - 1];
				return <BaseGlyphSeries
					key={`glyphs-${stack.key}`}
					dataKey={stack.key}
					data={stack.data}
					xAccessor={stack.accessors.x || stack.accessors.x1}
					yAccessor={stack.accessors.y || stack.accessors.y1}
					xScale={identity as unknown as XScale}
					yScale={identity as unknown as YScale}
					renderGlyphs={renderGlyphs}
				/>;
			})}
	</g>;
}

export default BaseAreaStack
