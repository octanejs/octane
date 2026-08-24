import type { RegisteredCell } from '../context/CellsContext.ts';
import type { CellPropsFor } from '../component/Cell.ts';
import type {
	MutableRefObject,
	NativeMouseEvent,
	OctaneElement,
	OctaneNode,
} from '../util/OctaneTypes.ts';
import type { Octane } from 'octane/jsx-runtime';

type Key = Octane.Key;
import type { Series } from 'victory-vendor/d3-shape';
import type { Props as RectangleProps, RectRadius } from '../shape/Rectangle.tsrx';
import type { ErrorBarDataPointFormatter } from './ErrorBar.tsrx';
import type { CartesianLabelListEntry, ImplicitLabelListType } from '../component/LabelList.tsrx';
import type { BarPositionPosition, StackId } from '../util/ChartUtils';
import type {
	ActiveShape,
	AnimationDuration,
	CartesianLayout,
	CartesianViewBoxRequired,
	ChartOffsetInternal,
	Coordinate,
	DataConsumer,
	DataKey,
	LegendType,
	PresentationAttributesAdaptChildEvent,
	ShapeAnimationProps,
	TickItem,
	TooltipType,
	TrapezoidViewBox,
} from '../util/types';
import type { BarBackgroundRectangleProps, MinPointSize } from '../util/BarUtils.tsrx';
import type { Formatter } from '../component/DefaultTooltipContent.tsrx';
import type { TooltipPayloadConfiguration } from '../state/tooltipSlice';
import type { BaseAxisWithScale } from '../state/selectors/axisSelectors';
import type { BarSettings } from '../state/types/BarSettings';
import type { SVGPropsNoEvents } from '../util/svgPropertiesNoEvents';
import type { AnimationInterpolateFn } from '../animation/AnimatedItems.tsrx';
import type { AnimationMatchByProp } from '../animation/matchBy';
import type { EasingInput } from '../animation/easing';
import type { WithoutId } from '../util/useUniqueId';
import type { ZIndexable } from '../zIndex/ZIndexLayer.tsrx';
import type { AxisId } from '../state/cartesianAxisSlice';
import type { GraphicalItemId } from '../state/graphicalItemsSlice';
import type { ChartData } from '../state/chartDataSlice';

type BarRectangleType = {
	x: number;
	y: number;
	width: number;
	height: number;
};
export interface BarRectangleItem extends RectangleProps {
	value: number | [number, number];
	background?: BarRectangleType;
	tooltipPosition: Coordinate;
	readonly payload?: any;
	parentViewBox: CartesianViewBoxRequired;
	x: number;
	y: number;
	width: number;
	height: number;
	stackedBarStart: number | undefined;
	originalDataIndex: number;
}
export type BarShapeProps =
	BarRectangleItem & ShapeAnimationProps & {
		isActive: boolean;
		index: number;
	};
export type BarBackgroundShapeProps = Omit<BarShapeProps, 'value' | 'tooltipPosition'>;
interface BarProps<DataPointType, ValueAxisType> extends DataConsumer<
	DataPointType,
	ValueAxisType
>, ZIndexable {
	className?: string;
	index?: Key;
	xAxisId?: AxisId;
	yAxisId?: AxisId;
	stackId?: StackId;
	barSize?: string | number;
	unit?: string | number;
	name?: string | number;
	tooltipType?: TooltipType;
	formatter?: Formatter;
	legendType?: LegendType;
	minPointSize?: MinPointSize;
	maxBarSize?: number;
	hide?: boolean;
	shape?: ActiveShape<BarShapeProps, SVGPathElement>;
	activeBar?: ActiveShape<BarShapeProps, SVGPathElement>;
	background?: ActiveShape<BarBackgroundShapeProps, SVGPathElement> & ZIndexable;
	radius?: RectRadius;
	onAnimationStart?: () => void;
	onAnimationEnd?: () => void;
	isAnimationActive?: boolean | 'auto';
	animationBegin?: number;
	animationDuration?: AnimationDuration;
	animationEasing?: EasingInput;
	animationInterpolateFn?: AnimationInterpolateFn<BarRectangleItem, CartesianLayout>;
	animationMatchBy?: AnimationMatchByProp<BarRectangleItem>;
	id?: string;
	label?: ImplicitLabelListType;
	zIndex?: number;
}
type BarMouseEvent =
	(data: BarRectangleItem, index: number, event: NativeMouseEvent<SVGGElement>) => void;
interface BarEvents {
	onClick: BarMouseEvent;
	onMouseEnter: BarMouseEvent;
	onMouseLeave: BarMouseEvent;
	onMouseMove: BarMouseEvent;
	onMouseDown: BarMouseEvent;
	onMouseUp: BarMouseEvent;
	onMouseOver: BarMouseEvent;
	onMouseOut: BarMouseEvent;
}
type InternalBarProps = {
	layout: 'horizontal' | 'vertical';
	data: ReadonlyArray<BarRectangleItem> | undefined;
	xAxisId: string | number;
	yAxisId: string | number;
	hide: boolean;
	legendType: LegendType;
	minPointSize: MinPointSize;
	activeBar: ActiveShape<BarShapeProps, SVGPathElement>;
	isAnimationActive: boolean | 'auto';
	animationBegin: number;
	animationDuration: AnimationDuration;
	animationEasing: EasingInput;
	needClip?: boolean;
	className?: string;
	index?: Key;
	stackId?: string | number;
	barSize?: string | number;
	unit?: string | number;
	name?: string | number;
	dataKey?: DataKey<any>;
	tooltipType?: TooltipType;
	formatter?: Formatter;
	maxBarSize?: number;
	shape: ActiveShape<BarShapeProps, SVGPathElement>;
	background?: ActiveShape<BarBackgroundShapeProps, SVGPathElement>;
	radius?: number | [number, number, number, number];
	onAnimationStart?: () => void;
	onAnimationEnd?: () => void;
	animationInterpolateFn: AnimationInterpolateFn<BarRectangleItem, CartesianLayout>;
	animationMatchBy: AnimationMatchByProp<BarRectangleItem>;
	id: GraphicalItemId;
	label?: ImplicitLabelListType;
};
type BarSvgProps =
	Omit<
		PresentationAttributesAdaptChildEvent<BarRectangleItem, SVGGElement>,
		'radius' | 'name' | 'ref'
	>;
export type Props<DataPointType = any, ValueAxisType = any> =
	Partial<BarEvents> & BarProps<DataPointType, ValueAxisType> & Omit<BarSvgProps, keyof BarEvents>;
type InternalProps = BarSvgProps & InternalBarProps;
type BarBackgroundProps = {
	background?: ActiveShape<BarBackgroundShapeProps, SVGPathElement>;
	data: ReadonlyArray<BarRectangleItem> | undefined;
	dataKey: DataKey<any> | undefined;
	allOtherBarProps: InternalProps;
};
type BarRectanglesProps =
	InternalProps & {
		data: ReadonlyArray<BarRectangleItem> | undefined;
	};
type BarImplProps =
	Omit<InternalBarProps, 'layout' | 'data'> & {
		children?: OctaneNode;
	};
// Port of cartesian/Bar.tsx — the bar graphical item: redux registration
// (graphical item, legend, tooltip settings), store-computed rectangles,
// background bars, active-bar highlight, stack clipping, labels, animation.
// ONE structural divergence: Cells are collected by REGISTRATION (see
// context/CellsContext) instead of children introspection — octane's compiled
// children are opaque. `computeBarRectangles` stays here (vendored
// barSelectors imports it through cartesian/Bar.ts).
import { memo, useCallback, useEffect, useRef, useState } from 'octane';
import { clsx } from 'clsx';
import { Layer } from '../container/Layer.tsrx';
import {
	CartesianLabelListContextProvider,
	LabelListFromLabelProp,
} from '../component/LabelList.tsrx';
import { interpolate, isNan, mathSign, noop } from '../util/DataUtils';
import {
	getBaseValueOfBar,
	getCateCoordinateOfBar,
	getTooltipNameProp,
	getValueByDataKey,
	truncateByDomain,
} from '../util/ChartUtils';
import { adaptEventsOfChild } from '../util/types.ts';
import {
	BarRectangle,
	BarBackgroundRectangle,
	defaultBarShape,
	minPointSizeCallback,
} from '../util/BarUtils.tsrx';
import {
	useMouseClickItemDispatch,
	useMouseEnterItemDispatch,
	useMouseLeaveItemDispatch,
} from '../context/tooltipContext';
import { SetTooltipEntrySettings } from '../state/SetTooltipEntrySettings';
import { SetErrorBarContext } from '../context/ErrorBarContext.tsrx';
import { GraphicalItemClipPath, useNeedsClip } from './GraphicalItemClipPath.tsrx';
import { useChartLayout } from '../context/chartLayoutContext.ts';
import { selectBarRectangles } from '../state/selectors/barSelectors';
import { useAppSelector } from '../state/hooks';
import { useIsPanorama } from '../context/PanoramaContext.ts';
import {
	selectActiveTooltipDataKey,
	selectActiveTooltipIndex,
} from '../state/selectors/tooltipSelectors';
import { SetLegendPayload } from '../state/SetLegendPayload';
import { resolveDefaultProps } from '../util/resolveDefaultProps';
import { RegisterGraphicalItemId } from '../context/RegisterGraphicalItemId.tsrx';
import { SetCartesianGraphicalItem } from '../state/SetGraphicalItem';
import {
	svgPropertiesNoEvents,
	svgPropertiesNoEventsFromUnknown,
} from '../util/svgPropertiesNoEvents';
import { AnimatedItems, useAnimationCallbacks } from '../animation/AnimatedItems.tsrx';
import { matchAppend } from '../animation/matchBy';
import { ZIndexLayer } from '../zIndex/ZIndexLayer.tsrx';
import { DefaultZIndexes } from '../zIndex/DefaultZIndexes';
import { getZIndexFromUnknown } from '../zIndex/getZIndexFromUnknown';
import { propsAreEqual } from '../util/propsAreEqual';
import { BarStackClipLayer, useStackId } from './BarStack.tsrx';
import { CellsContext, useCellRegistry } from '../context/CellsContext';

const computeLegendPayloadFromBarData = (props: Props) => {
	const { dataKey, name, fill, legendType, hide } = props;
	return [
		{
			inactive: hide,
			dataKey,
			type: legendType,
			color: fill,
			value: getTooltipNameProp(name, dataKey),
			payload: props,
		},
	];
};

const SetBarTooltipEntrySettings = memo((
	props: Pick<
		InternalProps,
		| 'dataKey'
		| 'stroke'
		| 'strokeWidth'
		| 'fill'
		| 'name'
		| 'hide'
		| 'unit'
		| 'formatter'
		| 'tooltipType'
		| 'id'
	>,
) => {
	const {
		dataKey,
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
	const tooltipEntrySettings: TooltipPayloadConfiguration = {
		dataDefinedOnItem: undefined,
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
			color: fill,
			unit,
			formatter,
			graphicalItemId: id,
		},
	};
	return <SetTooltipEntrySettings tooltipEntrySettings={tooltipEntrySettings} />;
});

function BarBackground(props: BarBackgroundProps) {
	const activeIndex = useAppSelector(selectActiveTooltipIndex);
	const { data, dataKey, background: backgroundFromProps, allOtherBarProps } = props;
	const {
		onMouseEnter: onMouseEnterFromProps,
		onMouseLeave: onMouseLeaveFromProps,
		onClick: onItemClickFromProps,
		...restOfAllOtherProps
	} = allOtherBarProps;
	const onMouseEnterFromContext = useMouseEnterItemDispatch(
		onMouseEnterFromProps,
		dataKey,
		allOtherBarProps.id,
	);
	const onMouseLeaveFromContext = useMouseLeaveItemDispatch(onMouseLeaveFromProps);
	const onClickFromContext = useMouseClickItemDispatch(
		onItemClickFromProps,
		dataKey,
		allOtherBarProps.id,
	);
	if (!backgroundFromProps || data == null) {
		return null;
	}
	const backgroundProps = svgPropertiesNoEventsFromUnknown(backgroundFromProps);
	return <ZIndexLayer
		zIndex={getZIndexFromUnknown(backgroundFromProps, DefaultZIndexes.barBackground)}
	>{data.map((entry, i) => {
		const { value, background: backgroundFromDataEntry, tooltipPosition, ...rest } = entry;
		if (!backgroundFromDataEntry) {
			return null;
		}
		const onMouseEnter = onMouseEnterFromContext(entry, entry.originalDataIndex);
		const onMouseLeave = onMouseLeaveFromContext(entry, entry.originalDataIndex);
		const onClick = onClickFromContext(entry, entry.originalDataIndex);
		const barRectangleProps: BarBackgroundRectangleProps = {
			option: backgroundFromProps,
			isActive: String(entry.originalDataIndex) === activeIndex,
			...rest,
			fill: '#eee',
			...backgroundFromDataEntry,
			...backgroundProps,
			...adaptEventsOfChild(restOfAllOtherProps, entry, i),
			onMouseEnter,
			onMouseLeave,
			onClick,
			dataKey,
			index: i,
			className: 'recharts-bar-background-rectangle',
		};
		return <BarBackgroundRectangle key={'background-bar-' + i} {...barRectangleProps} />;
	})}</ZIndexLayer>;
}

function BarLabelListProvider(props: {
	showLabels: boolean;
	children: OctaneNode;
	rects: ReadonlyArray<BarRectangleItem> | undefined;
}) @{
	const { showLabels, children, rects } = props;
	const labelListEntries: ReadonlyArray<CartesianLabelListEntry> | undefined = rects?.map((
		entry: BarRectangleItem,
	) => {
		const viewBox: TrapezoidViewBox = {
			x: entry.x,
			y: entry.y,
			width: entry.width,
			lowerWidth: entry.width,
			upperWidth: entry.width,
			height: entry.height,
		};
		return {
			...viewBox,
			value: entry.value,
			payload: entry.payload,
			parentViewBox: entry.parentViewBox,
			viewBox,
			fill: entry.fill,
		};
	});
	<CartesianLabelListContextProvider
		value={showLabels ? labelListEntries : undefined}
	>{children}</CartesianLabelListContextProvider>
}

function BarRectangleWithActiveState(props: ShapeAnimationProps & {
	shape: ActiveShape<BarShapeProps, SVGPathElement>;
	activeBar: ActiveShape<BarShapeProps, SVGPathElement>;
	baseProps: WithoutId<SVGPropsNoEvents<BarRectanglesProps>>;
	entry: BarRectangleItem;
	index: number;
	dataKey: DataKey<any> | undefined;
}) {
	const { shape, activeBar, baseProps, entry, index, dataKey } = props;
	const activeIndex = useAppSelector(selectActiveTooltipIndex);
	const activeDataKey = useAppSelector(selectActiveTooltipDataKey);
	// Only highlight this bar when it matches the active index AND (for
	// non-shared tooltips) the active dataKey. originalDataIndex matches
	// against the pre-filter data slice.
	const isActive: boolean =
		activeBar && String(entry.originalDataIndex) === activeIndex &&
			(activeDataKey == null || dataKey === activeDataKey);
	const [stayInLayer, setStayInLayer] = useState(false);
	const [hasMountedActive, setHasMountedActive] = useState(false);
	useEffect(() => {
		let rafId: number;
		if (isActive) {
			// 1. Enter the layer immediately
			setStayInLayer(true);
			// 2. After the browser paints the inactive state in the new layer,
			// flip to active to trigger the CSS transition.
			rafId = requestAnimationFrame(() => {
				setHasMountedActive(true);
			});
		} else {
			setHasMountedActive(false);
		}
		return () => {
			cancelAnimationFrame(rafId);
		};
	}, [isActive]);
	const handleTransitionEnd = useCallback(() => {
		// 4. Leave the layer only when the exit transition finishes
		if (!isActive) {
			setStayInLayer(false);
		}
	}, [isActive]);
	const isVisuallyActive = isActive && hasMountedActive;
	const shouldRenderInLayer = isActive || stayInLayer;
	let option: ActiveShape<BarShapeProps, SVGPathElement>;
	if (isActive) {
		if (activeBar === true) {
			option = shape;
		} else {
			option = activeBar;
		}
	} else {
		option = shape;
	}
	const content = <BarRectangle
		{...baseProps}
		name={String(baseProps.name)}
		{...entry}
		isActive={isVisuallyActive}
		option={option}
		index={index}
		dataKey={dataKey}
		animationElapsedTime={props.animationElapsedTime}
		isAnimating={props.isAnimating}
		isEntrance={props.isEntrance}
		onTransitionEnd={handleTransitionEnd}
	/>;
	if (shouldRenderInLayer) {
		return <ZIndexLayer zIndex={DefaultZIndexes.activeBar}>
			<BarStackClipLayer index={entry.originalDataIndex}>{content}</BarStackClipLayer>
		</ZIndexLayer>;
	}
	return content;
}

function BarRectangleNeverActive(props: ShapeAnimationProps & {
	shape: ActiveShape<BarShapeProps, SVGPathElement>;
	baseProps: WithoutId<SVGPropsNoEvents<BarRectanglesProps>>;
	entry: BarRectangleItem;
	index: number;
	dataKey: DataKey<any> | undefined;
}) {
	const { shape, baseProps, entry, index, dataKey } = props;
	return <BarRectangle
		{...baseProps}
		name={String(baseProps.name)}
		{...entry}
		isActive={false}
		option={shape}
		index={index}
		dataKey={dataKey}
		animationElapsedTime={props.animationElapsedTime}
		isAnimating={props.isAnimating}
		isEntrance={props.isEntrance}
	/>;
}

function BarRectangles(rectanglesProps: ShapeAnimationProps & {
	data: ReadonlyArray<BarRectangleItem> | undefined;
	props: BarRectanglesProps;
}) {
	const { data, props, animationElapsedTime, isAnimating, isEntrance } = rectanglesProps;
	const { id, ...baseProps } = svgPropertiesNoEvents(props) ?? {};
	const { shape, dataKey, activeBar } = props;
	const {
		onMouseEnter: onMouseEnterFromProps,
		onClick: onItemClickFromProps,
		onMouseLeave: onMouseLeaveFromProps,
		...restOfAllOtherProps
	} = props;
	const onMouseEnterFromContext = useMouseEnterItemDispatch(onMouseEnterFromProps, dataKey, id);
	const onMouseLeaveFromContext = useMouseLeaveItemDispatch(onMouseLeaveFromProps);
	const onClickFromContext = useMouseClickItemDispatch(onItemClickFromProps, dataKey, id);
	if (!data) {
		return null;
	}
	return <>
		{data.map((entry, i) => {
			return <BarStackClipLayer
				index={entry.originalDataIndex}
				key={'rectangle-' + entry?.x + '-' + entry?.y + '-' + entry?.value + '-' + i}
				className="recharts-bar-rectangle"
				{...adaptEventsOfChild(restOfAllOtherProps, entry, i)}
				onMouseEnter={onMouseEnterFromContext(entry, entry.originalDataIndex)}
				onMouseLeave={onMouseLeaveFromContext(entry, entry.originalDataIndex)}
				onClick={onClickFromContext(entry, entry.originalDataIndex)}
			>
				{activeBar
					? <BarRectangleWithActiveState
							shape={shape}
							activeBar={activeBar}
							baseProps={baseProps}
							entry={entry}
							index={i}
							dataKey={dataKey}
							animationElapsedTime={animationElapsedTime}
							isAnimating={isAnimating}
							isEntrance={isEntrance}
						/>
					: // activeBar falsy: the hook-free variant (skips the active-index
						// selectors entirely — they'd never be used).
						<BarRectangleNeverActive
							shape={shape}
							baseProps={baseProps}
							entry={entry}
							index={i}
							dataKey={dataKey}
							animationElapsedTime={animationElapsedTime}
							isAnimating={isAnimating}
							isEntrance={isEntrance}
						/>}
			</BarStackClipLayer>;
		})}
	</>;
}

const defaultBarAnimateItems: AnimationInterpolateFn<BarRectangleItem, CartesianLayout> = (
	items,
	animationElapsedTime,
	layout,
) => {
	if (items == null) return [];
	if (animationElapsedTime === 1) {
		return items.flatMap((item) => (item.status === 'removed' ? [] : [item.next]));
	}
	return items.flatMap((item) => {
		if (item.status === 'removed') {
			// animate removed items to 0 height/width respective of layout
			if (layout === 'horizontal') {
				return [
					{
						...item.prev,
						height: interpolate(item.prev.height, 0, animationElapsedTime),
						y: interpolate(item.prev.y, item.prev.y + item.prev.height, animationElapsedTime),
					},
				];
			}
			return [
				{ ...item.prev, width: interpolate(item.prev.width, 0, animationElapsedTime) },
			];
		}
		if (item.status === 'matched') {
			return [
				{
					...item.next,
					x: interpolate(item.prev.x, item.next.x, animationElapsedTime),
					y: interpolate(item.prev.y, item.next.y, animationElapsedTime),
					width: interpolate(item.prev.width, item.next.width, animationElapsedTime),
					height: interpolate(item.prev.height, item.next.height, animationElapsedTime),
				},
			];
		}
		// added
		const { next } = item;
		if (layout === 'horizontal') {
			return [
				{
					...next,
					height: interpolate(0, next.height, animationElapsedTime),
					y: interpolate(next.stackedBarStart, next.y, animationElapsedTime),
				},
			];
		}
		return [
			{
				...next,
				width: interpolate(0, next.width, animationElapsedTime),
				x: interpolate(next.stackedBarStart, next.x, animationElapsedTime),
			},
		];
	});
};

function RectanglesWithAnimation(rectanglesWithAnimationProps: {
	props: InternalProps;
	previousRectanglesRef: MutableRefObject<null | ReadonlyArray<BarRectangleItem>>;
}) {
	const { props, previousRectanglesRef } = rectanglesWithAnimationProps;
	const {
		data,
		isAnimationActive,
		animationBegin,
		animationDuration,
		animationEasing,
		animationInterpolateFn,
		layout,
	} = props;
	const { isAnimating, handleAnimationStart, handleAnimationEnd } = useAnimationCallbacks(
		props.onAnimationStart,
		props.onAnimationEnd,
	);
	return <BarLabelListProvider showLabels={!isAnimating} rects={data}>
		<AnimatedItems
			animationInput={data}
			animationIdPrefix="recharts-bar-"
			items={data}
			previousItemsRef={previousRectanglesRef}
			isAnimationActive={isAnimationActive}
			animationBegin={animationBegin}
			animationDuration={animationDuration}
			animationEasing={animationEasing}
			onAnimationStart={handleAnimationStart}
			onAnimationEnd={handleAnimationEnd}
			animationInterpolateFn={animationInterpolateFn}
			animationMatchBy={props.animationMatchBy}
			layout={layout}
		>
			{(stepData, animationElapsedTime, isEntrance) => <Layer>
				<BarRectangles
					props={props}
					data={stepData}
					animationElapsedTime={animationElapsedTime}
					isAnimating={isAnimating || animationElapsedTime < 1}
					isEntrance={isEntrance}
				/>
			</Layer>}
		</AnimatedItems>
		<LabelListFromLabelProp label={props.label} />
		{props.children}
	</BarLabelListProvider>;
}

function RenderRectangles(props: InternalProps) {
	const previousRectanglesRef = useRef<ReadonlyArray<BarRectangleItem> | null>(null);
	return <RectanglesWithAnimation previousRectanglesRef={previousRectanglesRef} props={props} />;
}

const defaultMinPointSize: number = 0;

const errorBarDataPointFormatter: ErrorBarDataPointFormatter<BarRectangleItem> = (
	dataPoint: BarRectangleItem,
	dataKey,
) => {
	// A value array means a stacked bar: arr[1] is the bar's end value.
	const value = Array.isArray(dataPoint.value) ? dataPoint.value[1] : dataPoint.value;
	return {
		x: dataPoint.x,
		y: dataPoint.y,
		value,
		// getValueByDataKey does not validate the output type
		errorVal: getValueByDataKey(dataPoint, dataKey),
	};
};

function BarWithState(props: InternalProps) @{
	const { hide, data, dataKey, className, xAxisId, yAxisId, needClip, background, id } = props;
	if (hide || data == null) {
		return null;
	}
	const layerClass = clsx('recharts-bar', className);
	const clipPathId = id;
	<Layer className={layerClass} id={id}>
		@if (needClip) {
			<defs>
				<GraphicalItemClipPath clipPathId={clipPathId} xAxisId={xAxisId} yAxisId={yAxisId} />
			</defs>
		}
		<Layer
			className="recharts-bar-rectangles"
			clipPath={needClip ? 'url(#clipPath-' + clipPathId + ')' : undefined}
		>
			<BarBackground
				data={data}
				dataKey={dataKey}
				background={background}
				allOtherBarProps={props}
			/>
			<RenderRectangles {...props} />
		</Layer>
	</Layer>
}

export const defaultBarProps = {
	activeBar: false,
	animationBegin: 0,
	animationDuration: 400,
	animationEasing: 'ease',
	animationInterpolateFn: defaultBarAnimateItems,
	animationMatchBy: matchAppend,
	background: false,
	hide: false,
	isAnimationActive: 'auto',
	label: false,
	legendType: 'rect',
	minPointSize: defaultMinPointSize,
	shape: defaultBarShape,
	xAxisId: 0,
	yAxisId: 0,
	zIndex: DefaultZIndexes.bar,
} as const satisfies Partial<Props>;

function BarImpl(props: BarImplProps) {
	const {
		xAxisId,
		yAxisId,
		hide,
		legendType,
		minPointSize,
		activeBar,
		animationBegin,
		animationDuration,
		animationEasing,
		isAnimationActive,
	} = props;
	const { needClip } = useNeedsClip(xAxisId, yAxisId);
	const layout = useChartLayout();
	const isPanorama = useIsPanorama();
	// octane divergence: cells arrive via registration (children render inside
	// the CellsContext provider below), not children introspection.
	const [cells, cellRegistry] = useCellRegistry();
	const rects: ReadonlyArray<BarRectangleItem> | undefined = useAppSelector(
		(state) => selectBarRectangles(state, props.id, isPanorama, cells),
	);
	if (layout !== 'vertical' && layout !== 'horizontal') {
		return null;
	}
	let errorBarOffset: number;
	const firstDataPoint = rects?.[0];
	if (firstDataPoint == null || firstDataPoint.height == null || firstDataPoint.width == null) {
		errorBarOffset = 0;
	} else {
		errorBarOffset = layout === 'vertical' ? firstDataPoint.height / 2 : firstDataPoint.width / 2;
	}
	return <SetErrorBarContext
		xAxisId={xAxisId}
		yAxisId={yAxisId}
		data={rects}
		dataPointFormatter={errorBarDataPointFormatter}
		errorBarOffset={errorBarOffset}
	>
		<CellsContext.Provider value={cellRegistry}>
			<BarWithState
				{...props}
				layout={layout}
				needClip={needClip}
				data={rects}
				xAxisId={xAxisId}
				yAxisId={yAxisId}
				hide={hide}
				legendType={legendType}
				minPointSize={minPointSize}
				activeBar={activeBar}
				animationBegin={animationBegin}
				animationDuration={animationDuration}
				animationEasing={animationEasing}
				isAnimationActive={isAnimationActive}
			/>
		</CellsContext.Provider>
	</SetErrorBarContext>;
}

export function computeBarRectangles({
	layout,
	barSettings: { dataKey, minPointSize: minPointSizeProp, hasCustomShape },
	pos,
	bandSize,
	xAxis,
	yAxis,
	xAxisTicks,
	yAxisTicks,
	stackedData,
	displayedData,
	offset,
	cells,
	parentViewBox,
	dataStartIndex,
}: {
	layout: 'horizontal' | 'vertical';
	barSettings: BarSettings;
	pos: BarPositionPosition;
	bandSize: number;
	xAxis: BaseAxisWithScale;
	yAxis: BaseAxisWithScale;
	xAxisTicks: TickItem[];
	yAxisTicks: TickItem[];
	stackedData: Series<Record<number, number>, DataKey<any>> | undefined;
	offset: ChartOffsetInternal;
	displayedData: ChartData;
	cells: ReadonlyArray<RegisteredCell> | undefined;
	parentViewBox: CartesianViewBoxRequired;
	dataStartIndex: number;
}) {
	const numericAxis =
		layout === 'horizontal' ? yAxis : xAxis;
	const stackedDomain = stackedData ? numericAxis.scale.domain() as readonly number[] : null;
	const baseValue = getBaseValueOfBar({ numericAxis });
	const stackedBarStart: number | undefined = numericAxis.scale.map(baseValue);
	const rectangles = displayedData.map((entry, index) => {
		let value, x: number | null, y, width, height, background: Omit<BarRectangleType, 'x' | 'y'> & {
			x: number | null;
			y: number | null;
		};
		if (stackedData) {
			// Use dataStartIndex to access the correct element in the full stackedData array
			const untruncatedValue = stackedData[index + dataStartIndex];
			if (untruncatedValue == null) {
				return null;
			}
			value = truncateByDomain(untruncatedValue, stackedDomain!);
		} else {
			value = getValueByDataKey(entry, dataKey);
			if (!Array.isArray(value)) {
				value = [baseValue, value];
			}
		}
		const minPointSize = minPointSizeCallback(minPointSizeProp, defaultMinPointSize)(
			value[1],
			index,
		);
		if (layout === 'horizontal') {
			const baseValueScale = yAxis.scale.map(value[0]);
			const currentValueScale = yAxis.scale.map(value[1]);
			if (baseValueScale == null || currentValueScale == null) {
				return null;
			}
			x = getCateCoordinateOfBar({
				axis: xAxis,
				ticks: xAxisTicks,
				bandSize,
				offset: pos.offset,
				entry,
				index,
			});
			y = currentValueScale ?? baseValueScale ?? undefined;
			width = pos.size;
			const computedHeight = baseValueScale - currentValueScale;
			height = isNan(computedHeight) ? 0 : computedHeight;
			background = { x, y: offset.top, width, height: offset.height };
			if (Math.abs(minPointSize) > 0 && Math.abs(height) < Math.abs(minPointSize)) {
				const delta =
					mathSign(height || minPointSize) * (Math.abs(minPointSize) - Math.abs(height));
				y -= delta;
				height += delta;
			}
		} else {
			const baseValueScale = xAxis.scale.map(value[0]);
			const currentValueScale = xAxis.scale.map(value[1]);
			if (baseValueScale == null || currentValueScale == null) {
				return null;
			}
			x = baseValueScale;
			y = getCateCoordinateOfBar({
				axis: yAxis,
				ticks: yAxisTicks,
				bandSize,
				offset: pos.offset,
				entry,
				index,
			});
			width = currentValueScale - baseValueScale;
			height = pos.size;
			background = { x: offset.left, y, width: offset.width, height };
			if (Math.abs(minPointSize) > 0 && Math.abs(width) < Math.abs(minPointSize)) {
				const delta = mathSign(width || minPointSize) * (Math.abs(minPointSize) - Math.abs(width));
				width += delta;
			}
		}
		// Filter out 0-dimension rectangles early (unless a custom shape may
		// still draw something there). Sparse arrays stay index-stable via
		// originalDataIndex.
		if (
			x == null || y == null || width == null || height == null ||
				!hasCustomShape && (width === 0 || height === 0)
		) {
			return null;
		}
		return {
			...entry as Record<string, unknown>,
			stackedBarStart,
			x,
			y,
			width,
			height,
			value: stackedData ? value : value[1],
			payload: entry,
			// Background origins come from x/y or chart offsets; the guard above
			// has removed every entry with unresolved x/y coordinates.
			background: background as BarRectangleType,
			tooltipPosition: { x: x + width / 2, y: y + height / 2 },
			parentViewBox,
			originalDataIndex: index,
			...cells && cells[index] && cells[index].props as CellPropsFor<SVGPathElement>,
		};
	});
	// This map returns only objects or null, so Boolean removes exactly the nulls.
	return rectangles.filter(
		Boolean as BooleanConstructor & ((rectangle: (typeof rectangles)[number]) => rectangle is NonNullable<
			typeof rectangle
		>),
	);
}

function BarFn<DataPointType = any, ValueAxisType = any>(
	outsideProps: Props<DataPointType, ValueAxisType>,
) {
	const props = resolveDefaultProps(outsideProps, defaultBarProps);
	// stackId may arrive from props or from BarStack context
	const stackId = useStackId(props.stackId);
	const isPanorama = useIsPanorama();
	// Report all props to the store first, before any other hooks, to avoid
	// circular dependencies.
	return <RegisterGraphicalItemId id={props.id} type="bar">
		{(id) => <>
			<SetLegendPayload legendPayload={computeLegendPayloadFromBarData(props)} />
			<SetBarTooltipEntrySettings
				dataKey={props.dataKey}
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
				type="bar"
				id={id}
				data={undefined}
				xAxisId={props.xAxisId}
				yAxisId={props.yAxisId}
				zAxisId={0}
				dataKey={props.dataKey}
				stackId={stackId}
				hide={props.hide}
				barSize={props.barSize}
				minPointSize={props.minPointSize}
				maxBarSize={props.maxBarSize}
				isPanorama={isPanorama}
				hasCustomShape={props.shape != null && props.shape !== defaultBarShape}
			/>
			<ZIndexLayer zIndex={props.zIndex}>
				<BarImpl {...props} id={id} />
			</ZIndexLayer>
		</>}
	</RegisterGraphicalItemId>;
}

/**
 * @provides ErrorBarContext
 * @provides LabelListContext
 * @provides CellReader
 * @consumes CartesianChartContext
 * @consumes BarStackContext
 */
export const Bar = memo(BarFn, propsAreEqual) as typeof BarFn & { displayName?: string };
Bar.displayName = 'Bar';
