// Port of cartesian/Line.tsx — the line graphical item: redux registration,
// store-computed points, the draw-in curve, dots, labels, active points.
// `computeLinePoints` stays here (vendored lineSelectors imports it through
// cartesian/Line.ts).
import { memo, useCallback, useMemo, useRef } from 'octane';
import { clsx } from 'clsx';
import { Layer } from '../container/Layer.tsrx';
import { LineDrawShape } from './LineDrawShape.tsrx';
import { useAnimatedLineLength } from './useAnimatedLineLength.ts';
import {
	CartesianLabelListContextProvider,
	LabelListFromLabelProp,
} from '../component/LabelList.tsrx';
import { interpolate, isNullish, noop } from '../util/DataUtils';
import { isClipDot } from '../util/ReactUtils.ts';
import { getCateCoordinateOfLine, getTooltipNameProp, getValueByDataKey } from '../util/ChartUtils';
import { ActivePoints } from '../component/ActivePoints.tsrx';
import { SetTooltipEntrySettings } from '../state/SetTooltipEntrySettings';
import { SetErrorBarContext } from '../context/ErrorBarContext.tsrx';
import { GraphicalItemClipPath, useNeedsClip } from './GraphicalItemClipPath.tsrx';
import { useChartLayout } from '../context/chartLayoutContext.ts';
import { useIsPanorama } from '../context/PanoramaContext.ts';
import { selectLinePoints } from '../state/selectors/lineSelectors';
import { useAppSelector } from '../state/hooks';
import { SetLegendPayload } from '../state/SetLegendPayload';
import { AnimatedItems, useAnimationCallbacks } from '../animation/AnimatedItems.tsrx';
import { matchByIndex } from '../animation/matchBy';
import { resolveDefaultProps } from '../util/resolveDefaultProps';
import { usePlotArea } from '../hooks';
import { RegisterGraphicalItemId } from '../context/RegisterGraphicalItemId.tsrx';
import { SetCartesianGraphicalItem } from '../state/SetGraphicalItem';
import { svgPropertiesNoEvents } from '../util/svgPropertiesNoEvents';
import { svgPropertiesAndEvents } from '../util/svgPropertiesAndEvents.ts';
import { getRadiusAndStrokeWidthFromDot } from '../util/getRadiusAndStrokeWidthFromDot';
import { Shape } from '../util/ActiveShapeUtils.tsrx';
import { ZIndexLayer } from '../zIndex/ZIndexLayer.tsrx';
import { DefaultZIndexes } from '../zIndex/DefaultZIndexes';
import { propsAreEqual } from '../util/propsAreEqual';
import { Dots } from '../component/Dots.tsrx';

function getTotalLength(mainCurve) {
	try {
		return mainCurve && mainCurve.getTotalLength && mainCurve.getTotalLength() || 0;
	} catch {
		return 0;
	}
}

/**
 * Average x-shift between matched pairs — the overall direction/magnitude of
 * data movement, used to extrapolate enter/exit positions.
 */
function averageShift(items) {
	let total = 0;
	let count = 0;
	for (const item of items) {
		if (item.status === 'matched' && item.prev.x != null && item.next.x != null) {
			total += item.next.x - item.prev.x;
			count++;
		}
	}
	return count > 0 ? total / count : 0;
}

const defaultLineAnimateItems = (items, animationElapsedTime) => {
	if (items == null) {
		// First render: return empty, stroke-dasharray handles the reveal
		return [];
	}
	// At animationElapsedTime=1 return only the non-removed items
	if (animationElapsedTime === 1) {
		return items.flatMap((item) => (item.status === 'removed' ? [] : [item.next]));
	}
	const shift = averageShift(items);
	const result = [];
	for (const item of items) {
		if (item.status === 'matched') {
			result.push({
				...item.next,
				x: interpolate(item.prev.x, item.next.x, animationElapsedTime),
				y: interpolate(item.prev.y, item.next.y, animationElapsedTime),
			});
		} else if (item.status === 'added') {
			if (item.next.x != null) {
				// Extrapolate entry position: the point starts where it "would have been"
				const entryX = item.next.x - shift;
				result.push({
					...item.next,
					x: interpolate(entryX, item.next.x, animationElapsedTime),
					y: item.next.y,
				});
			} else {
				result.push(item.next);
			}
		} else if (item.status === 'removed') {
			if (item.prev.x != null) {
				const exitX = item.prev.x + shift;
				result.push({
					...item.prev,
					x: interpolate(item.prev.x, exitX, animationElapsedTime),
					y: item.prev.y,
				});
			}
			// else: removed items are simply dropped
		}
	}
	return result;
};

export const defaultLineProps = {
	activeDot: true,
	animateNewValues: true,
	animationBegin: 0,
	animationDuration: 1500,
	animationEasing: 'ease',
	animationInterpolateFn: defaultLineAnimateItems,
	animationMatchBy: matchByIndex,
	connectNulls: false,
	dot: true,
	fill: '#fff',
	hide: false,
	isAnimationActive: 'auto',
	label: false,
	legendType: 'line',
	shape: LineDrawShape,
	stroke: '#3182bd',
	strokeWidth: 1,
	xAxisId: 0,
	yAxisId: 0,
	zIndex: DefaultZIndexes.line,
	type: 'linear',
};

const computeLegendPayloadFromAreaData = (props) => {
	const { dataKey, name, stroke, legendType, hide } = props;
	return [
		{
			inactive: hide,
			dataKey,
			type: legendType,
			color: stroke,
			value: getTooltipNameProp(name, dataKey),
			payload: props,
		},
	];
};

const SetLineTooltipEntrySettings = memo((props) => {
	const {
		dataKey,
		data,
		stroke,
		strokeWidth,
		fill,
		name,
		hide,
		unit,
		formatter,
		tooltipType,
		id,
	} = props;
	const tooltipEntrySettings = {
		dataDefinedOnItem: data,
		getPosition: noop,
		settings: {
			stroke,
			strokeWidth,
			fill,
			dataKey,
			nameKey: undefined,
			name: getTooltipNameProp(name, dataKey),
			hide,
			type: tooltipType,
			color: stroke,
			unit,
			formatter,
			graphicalItemId: id,
		},
	};
	return <SetTooltipEntrySettings tooltipEntrySettings={tooltipEntrySettings} />;
});

function LineDotsWrapper(props) {
	const { clipPathId, points } = props;
	const { dot, dataKey, needClip } = props.props;
	// Exclude ID so it isn't duplicated across every dot.
	const { id, ...propsWithoutId } = props.props;
	const lineProps = svgPropertiesNoEvents(propsWithoutId);
	return <Dots
		points={points}
		dot={dot}
		className="recharts-line-dots"
		dotClassName="recharts-line-dot"
		dataKey={dataKey}
		baseProps={lineProps}
		needClip={needClip}
		clipPathId={clipPathId}
	/>;
}

function LineLabelListProvider(props) @{
	const { showLabels, children, points } = props;
	const labelListEntries = useMemo(() => {
		return points?.map((point) => {
			const viewBox = {
				x: point.x ?? 0,
				y: point.y ?? 0,
				width: 0,
				lowerWidth: 0,
				upperWidth: 0,
				height: 0,
			};
			return {
				...viewBox,
				value: point.value,
				payload: point.payload,
				viewBox,
				parentViewBox: undefined,
				fill: undefined,
			};
		});
	}, [points]);
	<CartesianLabelListContextProvider
		value={showLabels ? labelListEntries : undefined}
	>{children}</CartesianLabelListContextProvider>
}

function StaticCurve(staticCurveProps) {
	const {
		clipPathId,
		pathRef,
		points,
		props,
		animationElapsedTime,
		isAnimating,
		isEntrance,
		visibleLength,
	} = staticCurveProps;
	const { type, layout, connectNulls, needClip, shape, strokeDasharray, ...others } = props;
	const curveProps = {
		...svgPropertiesAndEvents(others),
		fill: 'none',
		className: 'recharts-line-curve',
		clipPath: needClip ? 'url(#clipPath-' + clipPathId + ')' : undefined,
		points,
		type,
		layout,
		connectNulls,
		strokeDasharray: strokeDasharray ?? props.strokeDasharray,
		pathRef,
		animationElapsedTime,
		isAnimating,
		isEntrance: props.animateNewValues ? isEntrance : false,
		visibleLength,
	};
	return <>
		{points?.length > 1 &&
			<Shape option={shape} DefaultShape={defaultLineProps.shape} shapeProps={curveProps} />}
		<LineDotsWrapper points={points} clipPathId={clipPathId} props={props} />
	</>;
}

function CurveWithAnimation(curveWithAnimationProps) {
	const { clipPathId, props, pathRef, previousPointsRef } = curveWithAnimationProps;
	const {
		points,
		isAnimationActive,
		animationBegin,
		animationDuration,
		animationEasing,
		animationMatchBy,
		animationInterpolateFn,
		layout,
	} = props;
	const totalLength = getTotalLength(pathRef.current);
	const { isAnimating, handleAnimationStart, handleAnimationEnd } = useAnimationCallbacks(
		props.onAnimationStart,
		props.onAnimationEnd,
	);
	const showLabels = !isAnimating;
	const getVisibleLength = useAnimatedLineLength(points);
	// Don't update previousPointsRef before the SVG path is measured.
	const shouldUpdatePreviousRef = useCallback(
		(animationElapsedTime) => animationElapsedTime > 0 && totalLength > 0,
		[totalLength],
	);
	return <LineLabelListProvider points={points} showLabels={showLabels}>
		{props.children}
		<AnimatedItems
			animationInput={points}
			animationIdPrefix="recharts-line-"
			items={points}
			previousItemsRef={previousPointsRef}
			isAnimationActive={isAnimationActive}
			animationBegin={animationBegin}
			animationDuration={animationDuration}
			animationEasing={animationEasing}
			onAnimationStart={handleAnimationStart}
			onAnimationEnd={handleAnimationEnd}
			animationInterpolateFn={animationInterpolateFn}
			animationMatchBy={animationMatchBy}
			shouldUpdatePreviousRef={shouldUpdatePreviousRef}
			layout={layout}
		>
			{(stepData, animationElapsedTime, isEntrance) => {
				const animationActive = isAnimating || animationElapsedTime < 1;
				const visibleLength =
					animationActive ? getVisibleLength(animationElapsedTime, totalLength) : null;
				return <StaticCurve
					props={props}
					points={stepData}
					clipPathId={clipPathId}
					pathRef={pathRef}
					animationElapsedTime={animationElapsedTime}
					isAnimating={animationActive}
					isEntrance={isEntrance}
					visibleLength={visibleLength}
				/>;
			}}
		</AnimatedItems>
		<LabelListFromLabelProp label={props.label} />
	</LineLabelListProvider>;
}

function RenderCurve(props) {
	const { clipPathId } = props;
	const previousPointsRef = useRef(null);
	const pathRef = useRef(null);
	return <CurveWithAnimation
		props={props.props}
		clipPathId={clipPathId}
		previousPointsRef={previousPointsRef}
		pathRef={pathRef}
	/>;
}

const errorBarDataPointFormatter = (dataPoint, dataKey) => {
	return {
		x: dataPoint.x ?? undefined,
		y: dataPoint.y ?? undefined,
		value: dataPoint.value,
		// getValueByDataKey does not validate the output type
		errorVal: getValueByDataKey(dataPoint.payload, dataKey),
	};
};

function LineWithState(props) @{
	const {
		hide,
		dot,
		points,
		className,
		xAxisId,
		yAxisId,
		top,
		left,
		width,
		height,
		id,
		needClip,
		zIndex,
	} = props;
	if (hide) {
		return null;
	}
	const layerClass = clsx('recharts-line', className);
	const clipPathId = id;
	const { r, strokeWidth } = getRadiusAndStrokeWidthFromDot(dot);
	const clipDot = isClipDot(dot);
	const dotSize = r * 2 + strokeWidth;
	const activePointsClipPath = needClip
		? 'url(#clipPath-' + (clipDot ? '' : 'dots-') + clipPathId + ')'
		: undefined;
	// Hoisted out of the JSX below: @tsrx/core mis-parses `/` division inside an
	// attribute of a NESTED element within a directive block (reads it as `/>`).
	const dotsClipX = left - dotSize / 2;
	const dotsClipY = top - dotSize / 2;
	const dotsClipWidth = width + dotSize;
	const dotsClipHeight = height + dotSize;
	<>
		<ZIndexLayer zIndex={zIndex}>
			<Layer className={layerClass}>
				@if (needClip) {
					<defs>
						<GraphicalItemClipPath clipPathId={clipPathId} xAxisId={xAxisId} yAxisId={yAxisId} />
						@if (!clipDot) {
							<clipPath id={'clipPath-dots-' + clipPathId}>
								<rect x={dotsClipX} y={dotsClipY} width={dotsClipWidth} height={dotsClipHeight} />
							</clipPath>
						}
					</defs>
				}
				<SetErrorBarContext
					xAxisId={xAxisId}
					yAxisId={yAxisId}
					data={points}
					dataPointFormatter={errorBarDataPointFormatter}
					errorBarOffset={0}
				>
					<RenderCurve props={props} clipPathId={clipPathId} />
				</SetErrorBarContext>
			</Layer>
		</ZIndexLayer>
		<ActivePoints
			activeDot={props.activeDot}
			points={points}
			mainColor={props.stroke}
			itemDataKey={props.dataKey}
			clipPath={activePointsClipPath}
		/>
	</>
}

function LineImpl(props) {
	const {
		activeDot,
		animateNewValues,
		animationBegin,
		animationDuration,
		animationEasing,
		connectNulls,
		dot,
		hide,
		isAnimationActive,
		label,
		legendType,
		xAxisId,
		yAxisId,
		id,
		...everythingElse
	} = resolveDefaultProps(props, defaultLineProps);
	const { needClip } = useNeedsClip(xAxisId, yAxisId);
	const plotArea = usePlotArea();
	const layout = useChartLayout();
	const isPanorama = useIsPanorama();
	const points = useAppSelector(
		(state) => selectLinePoints(state, xAxisId, yAxisId, isPanorama, id),
	);
	if (layout !== 'horizontal' && layout !== 'vertical' || points == null || plotArea == null) {
		// Cannot render Line in an unsupported layout
		return null;
	}
	const { height, width, x: left, y: top } = plotArea;
	return <LineWithState
		{...everythingElse}
		id={id}
		connectNulls={connectNulls}
		dot={dot}
		activeDot={activeDot}
		animateNewValues={animateNewValues}
		animationBegin={animationBegin}
		animationDuration={animationDuration}
		animationEasing={animationEasing}
		isAnimationActive={isAnimationActive}
		hide={hide}
		label={label}
		legendType={legendType}
		xAxisId={xAxisId}
		yAxisId={yAxisId}
		points={points}
		layout={layout}
		height={height}
		width={width}
		left={left}
		top={top}
		needClip={needClip}
	/>;
}

export function computeLinePoints({
	layout,
	xAxis,
	yAxis,
	xAxisTicks,
	yAxisTicks,
	dataKey,
	bandSize,
	displayedData,
}) {
	return displayedData.map((entry, index) => {
		// getValueByDataKey does not validate the output type
		const value = getValueByDataKey(entry, dataKey);
		if (layout === 'horizontal') {
			const x = getCateCoordinateOfLine({ axis: xAxis, ticks: xAxisTicks, bandSize, entry, index });
			const y =
				isNullish(value) ? null : yAxis.scale.map(value);
			return {
				x,
				y: y ?? null,
				value,
				payload: entry,
			};
		}
		const x =
			isNullish(value) ? null : xAxis.scale.map(value);
		const y = getCateCoordinateOfLine({ axis: yAxis, ticks: yAxisTicks, bandSize, entry, index });
		if (x == null || y == null) {
			return null;
		}
		return { x, y, value, payload: entry };
	}).filter(Boolean);
}

function LineFn(outsideProps) {
	const props = resolveDefaultProps(outsideProps, defaultLineProps);
	const isPanorama = useIsPanorama();
	return <RegisterGraphicalItemId id={props.id} type="line">
		{(id) => <>
			<SetLegendPayload legendPayload={computeLegendPayloadFromAreaData(props)} />
			<SetLineTooltipEntrySettings
				dataKey={props.dataKey}
				data={props.data}
				stroke={props.stroke}
				strokeWidth={props.strokeWidth}
				fill={props.fill}
				name={props.name}
				hide={props.hide}
				unit={props.unit}
				formatter={props.formatter}
				tooltipType={props.tooltipType}
				id={id}
			/>
			<SetCartesianGraphicalItem
				type="line"
				id={id}
				data={props.data}
				xAxisId={props.xAxisId}
				yAxisId={props.yAxisId}
				zAxisId={0}
				dataKey={props.dataKey}
				hide={props.hide}
				isPanorama={isPanorama}
			/>
			<LineImpl {...props} id={id} />
		</>}
	</RegisterGraphicalItemId>;
}

/**
 * @provides LabelListContext
 * @provides ErrorBarContext
 * @consumes CartesianChartContext
 */
export const Line = memo(LineFn, propsAreEqual);
Line.displayName = 'Line';
