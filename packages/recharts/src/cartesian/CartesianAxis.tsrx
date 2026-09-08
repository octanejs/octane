import type { Ref, RefObject, SVGProps } from '../util/OctaneTypes.ts';
import type { Props as TextProps, TextAnchor, TextVerticalAnchor } from '../component/Text.tsrx';
import type { ImplicitLabelType } from '../component/Label.tsrx';
import type {
	CartesianViewBoxRequired,
	PresentationAttributesAdaptChildEvent,
	CartesianTickItem,
	AxisInterval,
	TickProp,
	BaseTickContentProps,
	TickItem as TickItemType,
} from '../util/types';
import type {
	AxisId,
	XAxisOrientation,
	XAxisPadding,
	YAxisOrientation,
	YAxisPadding,
} from '../state/cartesianAxisSlice';
import type { RequiresDefaultProps } from '../util/resolveDefaultProps';
import type { ZIndexable } from '../zIndex/ZIndexLayer.tsrx';

export type Orientation = XAxisOrientation | YAxisOrientation;
export type Unit = string | number;
export type TickFormatter = (value: any, index: number) => string;
export interface CartesianAxisProps extends ZIndexable {
	className?: SVGProps<SVGElement>['className'];
	axisType?: 'xAxis' | 'yAxis';
	axisId?: AxisId;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	unit?: Unit;
	orientation?: Orientation;
	viewBox?: CartesianViewBoxRequired;
	tick?: TickProp<unknown>;
	tickTextProps?: TextProps;
	axisLine?: boolean | SVGProps<SVGLineElement>;
	tickLine?: boolean | SVGProps<SVGLineElement>;
	mirror?: boolean;
	tickMargin?: number;
	hide?: boolean;
	label?: ImplicitLabelType;
	padding?: XAxisPadding | YAxisPadding;
	minTickGap?: number;
	ticks?: ReadonlyArray<CartesianTickItem>;
	tickSize?: number;
	tickFormatter?: TickFormatter;
	interval?: AxisInterval;
	angle?: number;
	scale?: unknown;
	labelRef?: RefObject<SVGTextElement | null> | null;
	ref?: Ref<CartesianAxisRef>;
}
export interface CartesianAxisRef {
	getCalculatedWidth(): number;
}
export type Props =
	Omit<
		PresentationAttributesAdaptChildEvent<any, SVGElement>,
		'viewBox' | 'scale' | 'ref'
	> & CartesianAxisProps;
type InternalProps = RequiresDefaultProps<Props, typeof defaultCartesianAxisProps>;
type TicksProps = {
	ref?: Ref<SVGGElement>;
	axisType: 'xAxis' | 'yAxis' | undefined;
	events: Omit<PresentationAttributesAdaptChildEvent<any, SVGElement>, 'scale' | 'viewBox'>;
	fontSize: string;
	getTicksConfig: Omit<InternalProps, 'ticks' | 'ref'>;
	height: number;
	letterSpacing: string;
	mirror: boolean;
	orientation: Orientation;
	padding?: Props['padding'];
	stroke?: Props['stroke'];
	tick?: Props['tick'];
	tickFormatter?: Props['tickFormatter'];
	tickLine?: Props['tickLine'];
	tickMargin: number;
	tickSize: number;
	tickTextProps?: Props['tickTextProps'];
	ticks?: ReadonlyArray<CartesianTickItem>;
	unit?: Props['unit'];
	width: number;
	x: number;
	y: number;
	axisId: AxisId | undefined;
};
// Port of cartesian/CartesianAxis.tsx — the axis renderer: axis line, tick
// lines, tick labels (measured for font metrics via a callback ref), the
// rendered-ticks store reporter, and the imperative getCalculatedWidth handle
// YAxis auto-width uses.
import {
	useState,
	useRef,
	useCallback,
	useImperativeHandle,
	useEffect,
	isValidElement,
	cloneElement,
} from 'octane';
import { get } from 'es-toolkit/compat';
import { clsx } from 'clsx';
import { Layer } from '../container/Layer.tsrx';
import { Text, isValidTextAnchor } from '../component/Text.tsrx';
import {
	CartesianLabelContextProvider,
	CartesianLabelFromLabelProp,
} from '../component/Label.tsrx';
import { isNumber, noop } from '../util/DataUtils';
import { adaptEventsOfChild } from '../util/types.ts';
import { getTicks } from './getTicks';
import {
	svgPropertiesNoEvents,
	svgPropertiesNoEventsFromUnknown,
} from '../util/svgPropertiesNoEvents';
import { getCalculatedYAxisWidth } from '../util/YAxisUtils';
import { resolveDefaultProps } from '../util/resolveDefaultProps';
import { ZIndexLayer } from '../zIndex/ZIndexLayer.tsrx';
import { DefaultZIndexes } from '../zIndex/DefaultZIndexes';
import { getClassNameFromUnknown } from '../util/getClassNameFromUnknown';
import { removeRenderedTicks, setRenderedTicks } from '../state/renderedTicksSlice';
import { useAppDispatch } from '../state/hooks';

export const defaultCartesianAxisProps = {
	x: 0,
	y: 0,
	width: 0,
	height: 0,
	viewBox: { x: 0, y: 0, width: 0, height: 0 },
	// The orientation of axis
	orientation: 'bottom',
	// The ticks
	ticks: [],
	stroke: '#666',
	tickLine: true,
	axisLine: true,
	tick: true,
	mirror: false,
	minTickGap: 5,
	// The width or height of tick
	tickSize: 6,
	tickMargin: 2,
	interval: 'preserveEnd',
	zIndex: DefaultZIndexes.axis,
} as const satisfies Partial<Props>;

function AxisLine(axisLineProps: {
	x: number;
	y: number;
	width: number;
	height: number;
	orientation: Orientation;
	mirror: boolean;
	axisLine: boolean | SVGProps<SVGLineElement>;
	otherSvgProps: SVGProps<SVGLineElement> | null;
}) {
	const { x, y, width, height, orientation, mirror, axisLine, otherSvgProps } = axisLineProps;
	if (!axisLine) {
		return null;
	}
	let props = { ...otherSvgProps, ...svgPropertiesNoEvents(axisLine), fill: 'none' };
	if (orientation === 'top' || orientation === 'bottom') {
		const needHeight = +(orientation === 'top' && !mirror || orientation === 'bottom' && mirror);
		props = {
			...props,
			x1: x,
			y1: y + needHeight * height,
			x2: x + width,
			y2: y + needHeight * height,
		};
	} else {
		const needWidth = +(orientation === 'left' && !mirror || orientation === 'right' && mirror);
		props = {
			...props,
			x1: x + needWidth * width,
			y1: y,
			x2: x + needWidth * width,
			y2: y + height,
		};
	}
	return <line
		{...props}
		className={clsx('recharts-cartesian-axis-line', get(axisLine, 'className'))}
	/>;
}

/**
 * Calculate the coordinates of endpoints in ticks: `line` for the tick line,
 * `tick` for the tick text.
 */
function getTickLineCoord(
	data: CartesianTickItem,
	x: number,
	y: number,
	width: number,
	height: number,
	orientation: Orientation,
	tickSize: number,
	mirror: boolean,
	tickMargin: number,
) {
	let x1, x2, y1, y2, tx, ty;
	const sign = mirror ? -1 : 1;
	const finalTickSize = data.tickSize || tickSize;
	const tickCoord = isNumber(data.tickCoord) ? data.tickCoord : data.coordinate;
	switch (orientation) {
		case 'top':
			x1 = x2 = data.coordinate;
			y2 = y + +!mirror * height;
			y1 = y2 - sign * finalTickSize;
			ty = y1 - sign * tickMargin;
			tx = tickCoord;
			break;
		case 'left':
			y1 = y2 = data.coordinate;
			x2 = x + +!mirror * width;
			x1 = x2 - sign * finalTickSize;
			tx = x1 - sign * tickMargin;
			ty = tickCoord;
			break;
		case 'right':
			y1 = y2 = data.coordinate;
			x2 = x + +mirror * width;
			x1 = x2 + sign * finalTickSize;
			tx = x1 + sign * tickMargin;
			ty = tickCoord;
			break;
		default:
			x1 = x2 = data.coordinate;
			y2 = y + +mirror * height;
			y1 = y2 + sign * finalTickSize;
			ty = y1 + sign * tickMargin;
			tx = tickCoord;
			break;
	}
	return {
		line: { x1, y1, x2, y2 },
		tick: { x: tx, y: ty },
	};
}

function getTickTextAnchor(orientation: Orientation, mirror: boolean) {
	switch (orientation) {
		case 'left':
			return mirror ? 'start' : 'end';
		case 'right':
			return mirror ? 'end' : 'start';
		default:
			return 'middle';
	}
}

function getTickVerticalAnchor(orientation: Orientation, mirror: boolean) {
	switch (orientation) {
		case 'left':
		case 'right':
			return 'middle';
		case 'top':
			return mirror ? 'start' : 'end';
		default:
			return mirror ? 'end' : 'start';
	}
}

function TickItem(props: {
	option: Props['tick'];
	tickProps: TextProps;
	value: string;
}) {
	const { option, tickProps, value } = props;
	let tickItem;
	const combinedClassName = clsx(tickProps.className, 'recharts-cartesian-axis-tick-value');
	if (isValidElement(option)) {
		tickItem = cloneElement(option, { ...tickProps, className: combinedClassName });
	} else if (typeof option === 'function') {
		tickItem = option({ ...tickProps, className: combinedClassName });
	} else {
		let className = 'recharts-cartesian-axis-tick-value';
		if (typeof option !== 'boolean') {
			className = clsx(className, getClassNameFromUnknown(option));
		}
		tickItem = <Text {...tickProps} className={className}>{value}</Text>;
	}
	return tickItem;
}

function RenderedTicksReporter(props: {
	ticks: ReadonlyArray<TickItemType>;
	axisType: 'xAxis' | 'yAxis' | undefined;
	axisId: AxisId | undefined;
}) {
	const { ticks, axisType, axisId } = props;
	const dispatch = useAppDispatch();
	useEffect(() => {
		if (axisId == null || axisType == null) {
			return noop;
		}
		// Filter out irrelevant internal properties before exposing externally
		const tickItems = ticks.map(
			(tick) => ({
				value: tick.value,
				coordinate: tick.coordinate,
				offset: tick.offset,
				index: tick.index,
			}),
		);
		dispatch(setRenderedTicks({ ticks: tickItems, axisId, axisType }));
		return () => {
			dispatch(removeRenderedTicks({ axisId, axisType }));
		};
	}, [dispatch, ticks, axisId, axisType]);
	return null;
}

function Ticks(props: TicksProps) {
	const {
		ticks = [],
		tick,
		tickLine,
		stroke,
		tickFormatter,
		unit,
		padding,
		tickTextProps,
		orientation,
		mirror,
		x,
		y,
		width,
		height,
		tickSize,
		tickMargin,
		fontSize,
		letterSpacing,
		getTicksConfig,
		events,
		axisType,
		axisId,
		ref,
	} = props;
	const finalTicks = getTicks({ ...getTicksConfig, ticks }, fontSize, letterSpacing);
	const axisProps = svgPropertiesNoEvents(getTicksConfig);
	const customTickProps = svgPropertiesNoEventsFromUnknown(tick);
	// Use user-provided textAnchor if available, otherwise calculate from orientation/mirror
	const textAnchor: TextAnchor =
		isValidTextAnchor(axisProps.textAnchor)
			? axisProps.textAnchor
			: getTickTextAnchor(orientation, mirror);
	const verticalAnchor: TextVerticalAnchor = getTickVerticalAnchor(orientation, mirror);
	let tickLinePropsObject: SVGProps<SVGLineElement> = {};
	if (typeof tickLine === 'object') {
		tickLinePropsObject = tickLine;
	}
	const tickLineProps: SVGProps<SVGLineElement> = {
		...axisProps,
		fill: 'none',
		...tickLinePropsObject,
	};
	const tickLineCoords = finalTicks.map(
		(entry: CartesianTickItem) => ({
			entry,
			...getTickLineCoord(entry, x, y, width, height, orientation, tickSize, mirror, tickMargin),
		}),
	);
	const tickLines = tickLineCoords.map(({ entry, line: lineCoord }) => {
		return <Layer
			className="recharts-cartesian-axis-tick"
			key={'tick-' + entry.value + '-' + entry.coordinate + '-' + entry.tickCoord}
		>
			{tickLine &&
				<line
					{...tickLineProps}
					{...lineCoord}
					className={clsx('recharts-cartesian-axis-tick-line', get(tickLine, 'className'))}
				/>}
		</Layer>;
	});
	const tickLabels = tickLineCoords.map(({ entry, tick: tickCoord }, i) => {
		const tickProps = {
			verticalAnchor,
			...axisProps,
			textAnchor,
			stroke: 'none',
			fill: stroke,
			...tickCoord,
			index: i,
			payload: entry,
			visibleTicksCount: finalTicks.length,
			tickFormatter,
			padding,
			...tickTextProps,
			angle: tickTextProps?.angle ?? axisProps.angle ?? 0,
		};
		const finalTickProps: BaseTickContentProps = { ...tickProps, ...customTickProps };
		return <Layer
			className="recharts-cartesian-axis-tick-label"
			key={'tick-label-' + entry.value + '-' + entry.coordinate + '-' + entry.tickCoord}
			{...adaptEventsOfChild(events, entry, i)}
		>
			{tick &&
				<TickItem
					option={tick}
					tickProps={finalTickProps}
					value={String(
						typeof tickFormatter === 'function' ? tickFormatter(entry.value, i) : entry.value,
					) +
						(unit || '')}
				/>}
		</Layer>;
	});
	return <g className={'recharts-cartesian-axis-ticks recharts-' + axisType + '-ticks'}>
		<RenderedTicksReporter ticks={finalTicks} axisId={axisId} axisType={axisType} />
		{tickLabels.length > 0 &&
			<ZIndexLayer zIndex={DefaultZIndexes.label}>
				<g
					className={'recharts-cartesian-axis-tick-labels recharts-' + axisType + '-tick-labels'}
					ref={ref}
				>{tickLabels}</g>
			</ZIndexLayer>}
		{tickLines.length > 0 &&
			<g
				className={'recharts-cartesian-axis-tick-lines recharts-' + axisType + '-tick-lines'}
			>{tickLines}</g>}
	</g>;
}

function CartesianAxisComponent(props: InternalProps) {
	// This ref receives the imperative axis handle, never an SVG line or tick.
	const { ref, ...propsWithoutRef } = props;
	const {
		axisLine,
		width,
		height,
		className,
		hide,
		ticks,
		axisType,
		axisId,
		...rest
	} = propsWithoutRef;
	const [fontSize, setFontSize] = useState('');
	const [letterSpacing, setLetterSpacing] = useState('');
	const tickRefs = useRef<HTMLCollectionOf<Element> | null>(null);
	useImperativeHandle(
		ref,
		() => ({
			getCalculatedWidth: () => {
				return getCalculatedYAxisWidth({
					ticks: tickRefs.current,
					label: props.labelRef?.current,
					labelGapWithTick: 5,
					tickSize: props.tickSize,
					tickMargin: props.tickMargin,
				});
			},
		}),
	);
	const layerRef = useCallback((el: SVGElement | null) => {
		if (el) {
			const tickNodes = el.getElementsByClassName('recharts-cartesian-axis-tick-value');
			tickRefs.current = tickNodes;
			const tick: Element | undefined = tickNodes[0];
			if (tick) {
				const computedStyle = window.getComputedStyle(tick);
				const calculatedFontSize = computedStyle.fontSize;
				const calculatedLetterSpacing = computedStyle.letterSpacing;
				if (calculatedFontSize !== fontSize || calculatedLetterSpacing !== letterSpacing) {
					setFontSize(calculatedFontSize);
					setLetterSpacing(calculatedLetterSpacing);
				}
			}
		}
	}, [fontSize, letterSpacing]);
	if (hide) {
		return null;
	}
	// CartesianAxis allows width or height to be undefined (unlike
	// validateWidthHeight).
	if (width != null && width <= 0 || height != null && height <= 0) {
		return null;
	}
	return <ZIndexLayer zIndex={props.zIndex}>
		<Layer className={clsx('recharts-cartesian-axis', className)}>
			<AxisLine
				x={props.x}
				y={props.y}
				width={width}
				height={height}
				orientation={props.orientation}
				mirror={props.mirror}
				axisLine={axisLine}
				otherSvgProps={svgPropertiesNoEvents(propsWithoutRef)}
			/>
			<Ticks
				ref={layerRef}
				axisType={axisType}
				events={rest}
				fontSize={fontSize}
				getTicksConfig={propsWithoutRef}
				height={props.height}
				letterSpacing={letterSpacing}
				mirror={props.mirror}
				orientation={props.orientation}
				padding={props.padding}
				stroke={props.stroke}
				tick={props.tick}
				tickFormatter={props.tickFormatter}
				tickLine={props.tickLine}
				tickMargin={props.tickMargin}
				tickSize={props.tickSize}
				tickTextProps={props.tickTextProps}
				ticks={ticks}
				unit={props.unit}
				width={props.width}
				x={props.x}
				y={props.y}
				axisId={axisId}
			/>
			<CartesianLabelContextProvider
				x={props.x}
				y={props.y}
				width={props.width}
				height={props.height}
				lowerWidth={props.width}
				upperWidth={props.width}
			>
				<CartesianLabelFromLabelProp label={props.label} labelRef={props.labelRef} />
				{props.children}
			</CartesianLabelContextProvider>
		</Layer>
	</ZIndexLayer>;
}

/**
 * @deprecated not meant to be used directly in app code — use XAxis or YAxis.
 */
export function CartesianAxis(outsideProps: Props) {
	const { ref, ...rest } = outsideProps;
	const props = resolveDefaultProps(rest, defaultCartesianAxisProps);
	return <CartesianAxisComponent {...props} ref={ref} />;
}

CartesianAxis.displayName = 'CartesianAxis';
