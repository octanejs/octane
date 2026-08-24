import type { MutableRefObject, NativeMouseEvent, OctaneNode } from '../util/OctaneTypes.ts';
import * as React from 'octane';
import { useMemo, useRef } from 'octane';
import { shallowEqual } from '@octanejs/redux';
import omit from 'es-toolkit/compat/omit';

import { clsx } from 'clsx';
import { selectActiveIndex } from '../state/selectors/selectors';
import { useAppSelector } from '../state/hooks';
import { Layer } from '../container/Layer.tsrx';
import { Props as TrapezoidProps } from '../shape/Trapezoid.tsrx';
import {
	CartesianLabelListContextProvider,
	CartesianLabelListEntry,
	ImplicitLabelListType,
	LabelListFromLabelProp,
} from '../component/LabelList.tsrx';
import { getPercentValue, interpolate } from '../util/DataUtils';
import { getValueByDataKey } from '../util/ChartUtils';
import {
	ActiveShape,
	adaptEventsOfChild,
	AnimationDuration,
	EasingInput,
	CartesianViewBoxRequired,
	ChartOffsetInternal,
	Coordinate,
	DataConsumer,
	DataKey,
	DataProvider,
	LegendType,
	PresentationAttributesAdaptChildEvent,
	ShapeAnimationProps,
	TooltipType,
	TrapezoidViewBox,
	CartesianLayout,
} from '../util/types';
import {
	defaultFunnelShape,
	FunnelTrapezoid,
	FunnelTrapezoidProps,
} from '../util/FunnelUtils.tsrx';
import {
	useMouseClickItemDispatch,
	useMouseEnterItemDispatch,
	useMouseLeaveItemDispatch,
} from '../context/tooltipContext';
import { TooltipPayload, TooltipPayloadConfiguration } from '../state/tooltipSlice';
import { SetTooltipEntrySettings } from '../state/SetTooltipEntrySettings';
import { Formatter } from '../component/DefaultTooltipContent.tsrx';
import type { LegendPayload } from '../component/DefaultLegendContent.tsrx';
import { ResolvedFunnelSettings, selectFunnelTrapezoids } from '../state/selectors/funnelSelectors';
import { RequiresDefaultProps, resolveDefaultProps } from '../util/resolveDefaultProps';
import { usePlotArea } from '../hooks';
import { svgPropertiesNoEvents } from '../util/svgPropertiesNoEvents';
import {
	AnimatedItems,
	AnimationInterpolateFn,
	useAnimationCallbacks,
} from '../animation/AnimatedItems.tsrx';
import { AnimationMatchByProp, matchAppend } from '../animation/matchBy';
import { GraphicalItemId } from '../state/graphicalItemsSlice';
import { RegisterGraphicalItemId } from '../context/RegisterGraphicalItemId.tsrx';
import { WithIdRequired } from '../util/useUniqueId';
import { SetLegendPayload } from '../state/SetLegendPayload';
import { CellsContext, useCellRegistry } from '../context/CellsContext';
import { useCartesianChartLayout } from '../context/chartLayoutContext';

export type FunnelTrapezoidItem =
	TrapezoidProps & TrapezoidViewBox & {
		value?: number | string;
		payload?: any;
		tooltipPosition: Coordinate;
		name: string;
		labelViewBox: TrapezoidViewBox;
		parentViewBox: CartesianViewBoxRequired;
		val: number | ReadonlyArray<number>;
		tooltipPayload: TooltipPayload;
	};

/**
 * Internal props, combination of external props + defaultProps + private Recharts state
 */
type InternalFunnelProps =
	RequiresDefaultProps<FunnelProps, typeof defaultFunnelProps> & {
		id: GraphicalItemId;
		trapezoids: ReadonlyArray<FunnelTrapezoidItem>;
	};

/**
 * External props, intended for end users to fill in
 */
interface FunnelProps<DataPointType = any, DataValueType = any> extends DataProvider<
	DataPointType
>, Required<DataConsumer<DataPointType, DataValueType>> {
	/**
 * This component is rendered when this graphical item is activated
 * (could be by mouse hover, touch, keyboard, programmatically).
 */
	activeShape?: ActiveShape<FunnelTrapezoidItem, SVGPathElement>;
	/**
 * Specifies when the animation should begin, the unit of this option is ms.
 * @defaultValue 400
 */
	animationBegin?: number;
	/**
 * Specifies the duration of animation, the unit of this option is ms.
 * @defaultValue 1500
 */
	animationDuration?: AnimationDuration;
	/**
 * The type of easing function.
 * @defaultValue ease
 */
	animationEasing?: EasingInput;
	/**
 * Custom animation function for interpolating data items.
 * When provided, this replaces the default animation interpolation.
 *
 * @param prevItems The items from the previous animation frame, or null on first render
 * @param nextItems The target items to animate towards
 * @param animationElapsedTime A normalized time value (0 = start, 1 = end)
 * @returns The interpolated items at time animationElapsedTime
 *
 * @since 3.9
 * @see {@link https://recharts.github.io/en-US/guide/animations/ Animations guide}
 */
	animationInterpolateFn?: AnimationInterpolateFn<FunnelTrapezoidItem, CartesianLayout>;
	/**
 * Strategy for matching previous items to next items during animation.
 * Determines how Recharts pairs old data points with new data points
 * to create smooth transitions.
 *
 * - `matchAppend` (default): match sequentially by index and treat newly appended items as new
 * - `matchByIndex`: match by array position with proportional stretching
 * - `matchByDataKey('someKey')`: match by a data key from the payload
 * - Custom function `(item, index) => key`: match by the returned key
 *
 * @defaultValue append
 * @see matchByIndex
 * @see matchByDataKey
 * @see matchAppend
 *
 * @since 3.9
 * @see {@link https://recharts.github.io/en-US/guide/animations/ Animations guide}
 */
	animationMatchBy?: AnimationMatchByProp<FunnelTrapezoidItem>;
	className?: string;
	/**
 * Hides the whole graphical element when true.
 *
 * Hiding an element is different from removing it from the chart:
 * Hidden graphical elements are still visible in Legend,
 * and can be included in axis domain calculations,
 * depending on `includeHidden` props of your XAxis/YAxis.
 *
 * @defaultValue false
 */
	hide?: boolean;
	/**
 * Unique identifier of this component.
 * Used as an HTML attribute `id`, and also to identify this element internally.
 *
 * If undefined, Recharts will generate a unique ID automatically.
 */
	id?: string;
	/**
 * If set false, animation of funnel will be disabled.
 * If set "auto", the animation will be disabled in SSR and will respect the user's prefers-reduced-motion system preference for accessibility.
 * @defaultValue auto
 */
	isAnimationActive?: boolean | 'auto';
	label?: ImplicitLabelListType;
	/**
 * @defaultValue triangle
 */
	lastShapeType?: 'triangle' | 'rectangle';
	/**
 * The type of icon in legend.  If set to 'none', no legend item will be rendered.
 * @defaultValue rect
 */
	legendType?: LegendType;
	/**
 * Name represents each sector in the tooltip.
 * This allows you to extract the name from the data:
 *
 * - `string`: the name of the field in the data object;
 * - `number`: the index of the field in the data;
 * - `function`: a function that receives the data object and returns the name.
 *
 * @defaultValue name
 */
	nameKey?: DataKey<DataPointType, DataValueType>;
	/**
 * The customized event handler of animation end
 */
	onAnimationEnd?: () => void;
	/**
 * The customized event handler of animation start
 */
	onAnimationStart?: () => void;
	reversed?: boolean;
	/**
 * If set a OctaneElement, the shape of funnel can be customized.
 * If set a function, the function will be called to render customized shape.
 * During animations, the function shape also receives `animationElapsedTime`, `isAnimating`, and `isEntrance`.
 * By default, renders a trapezoid.
 */
	shape?: ActiveShape<FunnelTrapezoidItem & ShapeAnimationProps, SVGPathElement>;
	tooltipType?: TooltipType;
	/**
 * Formats the value displayed in the tooltip for this Funnel.
 * When set, takes precedence over the `formatter` prop on the Tooltip component.
 */
	formatter?: Formatter;
	/**
 * The customized event handler of click on the area in this group
 */
	onClick?: (data: FunnelTrapezoidItem, index: number, e: NativeMouseEvent<SVGGElement>) => void;
	/**
 * The customized event handler of mousedown on the area in this group
 */
	onMouseDown?: (data: FunnelTrapezoidItem, index: number, e: NativeMouseEvent<
		SVGGElement
	>) => void;
	/**
 * The customized event handler of mouseup on the area in this group
 */
	onMouseUp?: (data: FunnelTrapezoidItem, index: number, e: NativeMouseEvent<SVGGElement>) => void;
	/**
 * The customized event handler of mousemove on the area in this group
 */
	onMouseMove?: (data: FunnelTrapezoidItem, index: number, e: NativeMouseEvent<
		SVGGElement
	>) => void;
	/**
 * The customized event handler of mouseover on the area in this group
 */
	onMouseOver?: (data: FunnelTrapezoidItem, index: number, e: NativeMouseEvent<
		SVGGElement
	>) => void;
	/**
 * The customized event handler of mouseout on the area in this group
 */
	onMouseOut?: (data: FunnelTrapezoidItem, index: number, e: NativeMouseEvent<SVGGElement>) => void;
	/**
 * The customized event handler of mouseenter on the area in this group
 */
	onMouseEnter?: (data: FunnelTrapezoidItem, index: number, e: NativeMouseEvent<
		SVGGElement
	>) => void;
	/**
 * The customized event handler of mouseleave on the area in this group
 */
	onMouseLeave?: (data: FunnelTrapezoidItem, index: number, e: NativeMouseEvent<
		SVGGElement
	>) => void;
}

type FunnelSvgProps =
	Omit<PresentationAttributesAdaptChildEvent<FunnelTrapezoidItem, SVGPathElement>, 'ref'>;

type InternalProps = FunnelSvgProps & InternalFunnelProps;

export type Props<DataPointType = any, DataValueType = any> =
	FunnelSvgProps & FunnelProps<DataPointType, DataValueType>;

type RealFunnelData = unknown;

type FunnelTrapezoidsProps =
	ShapeAnimationProps & {
		trapezoids: ReadonlyArray<FunnelTrapezoidItem>;
		allOtherFunnelProps: InternalProps;
	};

const SetFunnelTooltipEntrySettings = React.memo(({
	dataKey,
	nameKey,
	stroke,
	strokeWidth,
	fill,
	name,
	hide,
	tooltipType,
	formatter,
	data,
	trapezoids,
	id,
}: Pick<
	InternalProps,
	| 'dataKey'
	| 'nameKey'
	| 'stroke'
	| 'strokeWidth'
	| 'fill'
	| 'name'
	| 'hide'
	| 'tooltipType'
	| 'formatter'
	| 'data'
	| 'id'
> & {
	trapezoids: ReadonlyArray<FunnelTrapezoidItem> | undefined;
}) => {
	const tooltipEntrySettings: TooltipPayloadConfiguration = {
		dataDefinedOnItem: data,
		getPosition: (index) => trapezoids?.[Number(index)]?.tooltipPosition,
		settings: {
			stroke,
			strokeWidth,
			fill,
			dataKey,
			name,
			nameKey,
			hide,
			type: tooltipType,
			color: fill,
			unit: '', // Funnel does not have unit, why?
			formatter,
			graphicalItemId: id,
		},
	};
	return <SetTooltipEntrySettings tooltipEntrySettings={tooltipEntrySettings} />;
});

function FunnelLabelListProvider({
	showLabels,
	trapezoids,
	children,
}: {
	showLabels: boolean;
	trapezoids: ReadonlyArray<FunnelTrapezoidItem> | undefined;
	children: OctaneNode;
}) {
	const labelListEntries: ReadonlyArray<CartesianLabelListEntry> | undefined = useMemo(() => {
		if (!showLabels) {
			return undefined;
		}
		return trapezoids?.map((entry): CartesianLabelListEntry => {
			const viewBox: TrapezoidViewBox = entry.labelViewBox;

			return {
				...viewBox,
				value: entry.name,
				payload: entry.payload,
				parentViewBox: entry.parentViewBox,
				viewBox,
				fill: entry.fill,
			};
		});
	}, [showLabels, trapezoids]);

	return <CartesianLabelListContextProvider
		value={labelListEntries}
	>{children}</CartesianLabelListContextProvider>;
}

function FunnelTrapezoids(props: FunnelTrapezoidsProps) {
	const { trapezoids, allOtherFunnelProps, animationElapsedTime, isAnimating, isEntrance } = props;
	const activeItemIndex = useAppSelector(
		(state) => selectActiveIndex(state, 'item', state.tooltip.settings.trigger, undefined),
	);
	const {
		onMouseEnter: onMouseEnterFromProps,
		onClick: onItemClickFromProps,
		onMouseLeave: onMouseLeaveFromProps,
		shape,
		activeShape,
		...restOfAllOtherProps
	} = allOtherFunnelProps;

	const onMouseEnterFromContext = useMouseEnterItemDispatch(
		onMouseEnterFromProps,
		allOtherFunnelProps.dataKey,
		allOtherFunnelProps.id,
	);
	const onMouseLeaveFromContext = useMouseLeaveItemDispatch(onMouseLeaveFromProps);
	const onClickFromContext = useMouseClickItemDispatch(
		onItemClickFromProps,
		allOtherFunnelProps.dataKey,
		allOtherFunnelProps.id,
	);

	return <>
		{trapezoids.map((entry: FunnelTrapezoidItem, i: number) => {
			const isActiveIndex = Boolean(activeShape) && activeItemIndex === String(i);
			const trapezoidOptions = isActiveIndex ? activeShape : shape;
			const { id, ...trapezoidProps }: FunnelTrapezoidProps = {
				...entry,
				option: trapezoidOptions,
				isActive: isActiveIndex,
				stroke: entry.stroke,
				animationElapsedTime,
				isAnimating,
				isEntrance,
			};

			return <Layer
				key={`trapezoid-${entry?.x}-${entry?.y}-${entry?.name}-${entry?.value}`}
				className="recharts-funnel-trapezoid"
				{...adaptEventsOfChild(restOfAllOtherProps, entry, i)}
				onMouseEnter={onMouseEnterFromContext(entry, i)}
				onMouseLeave={onMouseLeaveFromContext(entry, i)}
				onClick={onClickFromContext(entry, i)}
			>
				<FunnelTrapezoid {...trapezoidProps} />
			</Layer>;
		})}
	</>;
}

const defaultFunnelAnimateItems: AnimationInterpolateFn<FunnelTrapezoidItem, CartesianLayout> = (
	items,
	animationElapsedTime,
) => {
	if (items == null) return [];
	if (animationElapsedTime === 1) {
		return items.flatMap((item) => (item.status === 'removed' ? [] : [item.next]));
	}
	return items.flatMap((item) => {
		if (item.status === 'removed') return [];
		if (item.status === 'matched') {
			return [
				{
					...item.next,
					x: interpolate(item.prev.x, item.next.x, animationElapsedTime),
					y: interpolate(item.prev.y, item.next.y, animationElapsedTime),
					upperWidth: interpolate(item.prev.upperWidth, item.next.upperWidth, animationElapsedTime),
					lowerWidth: interpolate(item.prev.lowerWidth, item.next.lowerWidth, animationElapsedTime),
					height: interpolate(item.prev.height, item.next.height, animationElapsedTime),
				},
			];
		}
		// added
		const { next } = item;
		return [
			{
				...next,
				x: interpolate(next.x + next.upperWidth / 2, next.x, animationElapsedTime),
				y: interpolate(next.y + next.height / 2, next.y, animationElapsedTime),
				upperWidth: interpolate(0, next.upperWidth, animationElapsedTime),
				lowerWidth: interpolate(0, next.lowerWidth, animationElapsedTime),
				height: interpolate(0, next.height, animationElapsedTime),
			},
		];
	});
};

function TrapezoidsWithAnimation({
	previousTrapezoidsRef,
	props,
}: {
	props: InternalProps;
	previousTrapezoidsRef: MutableRefObject<ReadonlyArray<FunnelTrapezoidItem> | undefined>;
}) {
	const {
		trapezoids,
		isAnimationActive,
		animationBegin,
		animationDuration,
		animationEasing,
		animationInterpolateFn,
	} = props;
	const layout = useCartesianChartLayout();

	const { isAnimating, handleAnimationStart, handleAnimationEnd } = useAnimationCallbacks(
		props.onAnimationStart,
		props.onAnimationEnd,
	);

	if (layout == null) return null;

	return <FunnelLabelListProvider showLabels={!isAnimating} trapezoids={trapezoids}>
		<AnimatedItems
			animationInput={trapezoids}
			animationIdPrefix="recharts-funnel-"
			items={trapezoids}
			previousItemsRef={previousTrapezoidsRef}
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
				<FunnelTrapezoids
					trapezoids={stepData}
					allOtherFunnelProps={props}
					animationElapsedTime={animationElapsedTime}
					isAnimating={isAnimating || animationElapsedTime < 1}
					isEntrance={isEntrance}
				/>
			</Layer>}
		</AnimatedItems>
		<LabelListFromLabelProp label={props.label} />
		{props.children}
	</FunnelLabelListProvider>;
}

function RenderTrapezoids(props: InternalProps) {
	const previousTrapezoidsRef = useRef<ReadonlyArray<FunnelTrapezoidItem> | undefined>(undefined);

	return <TrapezoidsWithAnimation props={props} previousTrapezoidsRef={previousTrapezoidsRef} />;
}

const getRealWidthHeight = (
	customWidth: number | string | undefined,
	offset: ChartOffsetInternal,
) => {
	const { width, height, left, top } = offset;

	const realWidth: number = getPercentValue(customWidth, width, width);

	return {
		realWidth,
		realHeight: height,
		offsetX: left,
		offsetY: top,
	};
};

export const defaultFunnelProps = {
	animationBegin: 400,
	animationDuration: 1500,
	animationEasing: 'ease',
	animationInterpolateFn: defaultFunnelAnimateItems,
	animationMatchBy: matchAppend,
	fill: '#808080',
	hide: false,
	isAnimationActive: 'auto',
	lastShapeType: 'triangle',
	legendType: 'rect',
	nameKey: 'name',
	reversed: false,
	shape: defaultFunnelShape,
	stroke: '#fff',
} as const satisfies Partial<Props>;

function FunnelImpl(props: WithIdRequired<RequiresDefaultProps<Props, typeof defaultFunnelProps>>) {
	const plotArea = usePlotArea();

	const {
		stroke,
		fill,
		legendType,
		hide,
		isAnimationActive,
		animationBegin,
		animationDuration,
		animationEasing,
		nameKey,
		lastShapeType,
		id,
		...everythingElse
	} = props;

	const nextPresentationProps = svgPropertiesNoEvents(props);
	const presentationPropsRef = useRef(nextPresentationProps);
	if (!shallowEqual(presentationPropsRef.current, nextPresentationProps)) {
		presentationPropsRef.current = nextPresentationProps;
	}
	const presentationProps = presentationPropsRef.current;
	const [cells, cellRegistry] = useCellRegistry();

	const funnelSettings: ResolvedFunnelSettings = useMemo(
		() => ({
			dataKey: props.dataKey,
			nameKey,
			data: props.data,
			tooltipType: props.tooltipType,
			lastShapeType,
			reversed: props.reversed,
			customWidth: props.width,
			cells,
			presentationProps,
			id,
		}),
		[
			props.dataKey,
			nameKey,
			props.data,
			props.tooltipType,
			lastShapeType,
			props.reversed,
			props.width,
			cells,
			presentationProps,
			id,
		],
	);

	const trapezoids = useAppSelector((state) => selectFunnelTrapezoids(state, funnelSettings));
	const legendPayload = useMemo<ReadonlyArray<LegendPayload>>(() => {
		if (legendType === 'none' || !trapezoids) {
			return [];
		}
		return trapezoids.map(
			(entry) => ({
				inactive: hide,
				value: entry.name,
				dataKey: props.dataKey,
				color: typeof entry.fill === 'string' ? entry.fill : fill,
				type: legendType,
				payload: entry.payload != null && typeof entry.payload === 'object' ? entry.payload : entry,
			}),
		);
	}, [fill, hide, legendType, props.dataKey, trapezoids]);

	if (hide || !trapezoids || !trapezoids.length || !plotArea) {
		return <CellsContext.Provider value={cellRegistry}>
			<SetLegendPayload legendPayload={legendPayload} />
			<SetFunnelTooltipEntrySettings
				dataKey={props.dataKey}
				nameKey={props.nameKey}
				stroke={props.stroke}
				strokeWidth={props.strokeWidth}
				fill={props.fill}
				name={props.name}
				hide={props.hide}
				tooltipType={props.tooltipType}
				formatter={props.formatter}
				data={props.data}
				trapezoids={trapezoids}
				id={id}
			/>
			{props.children}
		</CellsContext.Provider>;
	}
	const { height, width } = plotArea;

	const layerClass = clsx('recharts-trapezoids', props.className);

	return <CellsContext.Provider value={cellRegistry}>
		<SetLegendPayload legendPayload={legendPayload} />
		<SetFunnelTooltipEntrySettings
			dataKey={props.dataKey}
			nameKey={props.nameKey}
			stroke={props.stroke}
			strokeWidth={props.strokeWidth}
			fill={props.fill}
			name={props.name}
			hide={props.hide}
			tooltipType={props.tooltipType}
			formatter={props.formatter}
			data={props.data}
			trapezoids={trapezoids}
			id={id}
		/>
		<Layer className={layerClass}>
			<RenderTrapezoids
				{...everythingElse}
				id={id}
				stroke={stroke}
				fill={fill}
				nameKey={nameKey}
				lastShapeType={lastShapeType}
				animationBegin={animationBegin}
				animationDuration={animationDuration}
				animationEasing={animationEasing}
				isAnimationActive={isAnimationActive}
				hide={hide}
				legendType={legendType}
				height={height}
				width={width}
				trapezoids={trapezoids}
			/>
		</Layer>
	</CellsContext.Provider>;
}

function normalizeFunnelValue(value: unknown): {
	value: number;
	rangedNextValue: number | undefined;
} {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return { value, rangedNextValue: undefined };
	}
	if (Array.isArray(value)) {
		const currentValue = value[0];
		const nextValue = value[1];
		return {
			value: typeof currentValue === 'number' && Number.isFinite(currentValue) ? currentValue : 0,
			rangedNextValue: typeof nextValue === 'number' && Number.isFinite(nextValue)
				? nextValue
				: undefined,
		};
	}
	return { value: 0, rangedNextValue: undefined };
}

export function computeFunnelTrapezoids({
	dataKey,
	nameKey,
	displayedData,
	tooltipType,
	lastShapeType,
	reversed,
	offset,
	customWidth,
	graphicalItemId,
}: {
	dataKey: Props['dataKey'];
	nameKey: Props['nameKey'];
	offset: ChartOffsetInternal;
	displayedData: ReadonlyArray<RealFunnelData>;
	tooltipType?: TooltipType;
	lastShapeType?: Props['lastShapeType'];
	reversed?: boolean;
	customWidth: number | string | undefined;
	graphicalItemId: GraphicalItemId;
}): ReadonlyArray<FunnelTrapezoidItem> {
	const { realHeight, realWidth, offsetX, offsetY } = getRealWidthHeight(customWidth, offset);
	const values = displayedData.map(
		(entry: unknown) => normalizeFunnelValue(getValueByDataKey(entry, dataKey, 0)),
	);
	const maxValue = Math.max.apply(null, values.map((entry) => entry.value));
	const len = displayedData.length;
	const rowHeight = realHeight / len;
	const parentViewBox = {
		x: offset.left,
		y: offset.top,
		width: offset.width,
		height: offset.height,
	};

	let trapezoids: ReadonlyArray<FunnelTrapezoidItem> = displayedData.map((
		entry: unknown,
		i: number,
	): FunnelTrapezoidItem => {
		const name: string = String(getValueByDataKey(entry, nameKey, i));
		const normalizedValue = values[i];
		const val = normalizedValue.value;
		let nextVal: number;

		if (normalizedValue.rangedNextValue !== undefined) {
			nextVal = normalizedValue.rangedNextValue;
		} else if (i !== len - 1) {
			nextVal = values[i + 1].value;
		} else if (lastShapeType === 'rectangle') {
			nextVal = val;
		} else {
			nextVal = 0;
		}

		const x =
			maxValue === 0 ? offsetX : ((maxValue - val) * realWidth) / (2 * maxValue) + offsetX;
		const y = rowHeight * i + offsetY;
		const upperWidth =
			maxValue === 0 ? 0 : (val / maxValue) * realWidth;
		const lowerWidth =
			maxValue === 0 ? 0 : (nextVal / maxValue) * realWidth;

		const tooltipPayload: TooltipPayload = [
			{ name, value: val, payload: entry, dataKey, type: tooltipType, graphicalItemId },
		];
		const tooltipPosition: Coordinate = {
			x: x + upperWidth / 2,
			y: y + rowHeight / 2,
		};

		const trapezoidViewBox: TrapezoidViewBox = {
			x,
			y,
			upperWidth,
			lowerWidth,
			width: Math.max(upperWidth, lowerWidth),
			height: rowHeight,
		};

		return {
			...(entry != null && typeof entry === 'object' ? omit(entry, ['width']) : {}),
			...trapezoidViewBox,
			name,
			val,
			value: val,
			tooltipPayload,
			tooltipPosition,
			payload: entry,
			parentViewBox,
			labelViewBox: trapezoidViewBox,
		};
	});

	if (reversed) {
		trapezoids = trapezoids.map((
			entry: FunnelTrapezoidItem,
			index: number,
		): FunnelTrapezoidItem => {
			const reversedViewBox: TrapezoidViewBox = {
				x: entry.x - (entry.lowerWidth - entry.upperWidth) / 2,
				y: entry.y - index * rowHeight + (len - 1 - index) * rowHeight,
				upperWidth: entry.lowerWidth,
				lowerWidth: entry.upperWidth,
				width: Math.max(entry.lowerWidth, entry.upperWidth),
				height: rowHeight,
			};

			return {
				...entry,
				...reversedViewBox,
				tooltipPosition: {
					...entry.tooltipPosition,
					y: entry.y - index * rowHeight + (len - 1 - index) * rowHeight + rowHeight / 2,
				},
				labelViewBox: reversedViewBox,
			};
		});
	}

	return trapezoids;
}

/**
 * @consumes CartesianViewBoxContext
 * @provides LabelListContext
 * @provides CellReader
 */
function FunnelFn<DataPointType = any, DataValueType = any>(
	outsideProps: Props<DataPointType, DataValueType>,
) {
	// Internal chart data also supports the built-in 'name' key when no nameKey is supplied.
	const { id: externalId, ...props } = resolveDefaultProps<Props, typeof defaultFunnelProps>(
		outsideProps,
		defaultFunnelProps,
	);
	return <RegisterGraphicalItemId id={externalId} type="funnel">
		{(id) => <FunnelImpl {...props} id={id} />}
	</RegisterGraphicalItemId>;
}

export const Funnel = FunnelFn as typeof FunnelFn & { displayName?: string };
Funnel.displayName = 'Funnel';
