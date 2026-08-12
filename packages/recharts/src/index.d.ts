import type { OctaneNode } from 'octane';

export type NameType = string | number;
export type ValueType = string | number | Array<string | number>;
type Render = OctaneNode | ((...args: any[]) => OctaneNode);
type Handler = (...args: any[]) => void;

export interface RechartsProps {
	accessibilityLayer?: boolean;
	allowDecimals?: boolean;
	activeBar?: Render | Record<string, unknown>;
	activeDot?: Render;
	activeIndex?: number;
	activeShape?: Render | Record<string, unknown>;
	angle?: number;
	animationBegin?: number;
	animationDuration?: number;
	animationEasing?: string;
	aspect?: number;
	axisLine?: boolean | Record<string, unknown>;
	barCategoryGap?: number | string;
	barGap?: number | string;
	barSize?: number | string;
	baseValue?: number | 'dataMin' | 'dataMax';
	background?: Render | Record<string, unknown>;
	children?: OctaneNode;
	className?: string;
	color?: string;
	connectNulls?: boolean;
	content?: Render | Record<string, unknown>;
	cursor?: Render | Record<string, unknown>;
	cx?: number | string;
	cy?: number | string;
	data?: readonly unknown[];
	dataKey?: string | number | ((entry: unknown) => unknown);
	debounce?: number;
	domain?: readonly unknown[];
	dot?: Render | Record<string, unknown>;
	dy?: number | string;
	endAngle?: number;
	fill?: string;
	fillOpacity?: number;
	fontFamily?: string;
	fontSize?: number | string;
	formatter?: (...args: any[]) => OctaneNode;
	height?: number | string;
	hide?: boolean;
	horizontal?: boolean;
	id?: string;
	innerRadius?: number | string;
	interval?: number | string;
	isAnimationActive?: boolean;
	label?: Render | Record<string, unknown>;
	labelLine?: boolean | Record<string, unknown>;
	labelFormatter?: (...args: any[]) => OctaneNode;
	layout?: 'horizontal' | 'vertical' | 'centric' | 'radial';
	legendType?: string;
	line?: boolean | Record<string, unknown>;
	link?: Render | Record<string, unknown>;
	linkCurvature?: number;
	margin?: number | { top?: number; right?: number; bottom?: number; left?: number };
	maxBarSize?: number;
	maxHeight?: number;
	minTickGap?: number;
	minHeight?: number | string;
	minPointSize?: number | ((value: unknown) => number);
	minWidth?: number | string;
	name?: string | number;
	nameKey?: string | number | ((entry: unknown) => unknown);
	node?: Render | Record<string, unknown>;
	nodePadding?: number;
	nodeWidth?: number;
	onAnimationEnd?: Handler;
	onAnimationStart?: Handler;
	onClick?: Handler;
	onMouseEnter?: Handler;
	onMouseLeave?: Handler;
	onResize?: (width: number, height: number) => void;
	orientation?: string;
	outerRadius?: number | string;
	offset?: number;
	paddingAngle?: number;
	padding?: number | { top?: number; right?: number; bottom?: number; left?: number };
	payload?: Record<string, any> | readonly Record<string, any>[];
	position?: string | { x?: number; y?: number };
	radius?: number | readonly number[];
	range?: readonly number[];
	ref?: unknown;
	reversed?: boolean;
	ringPadding?: number;
	scale?: string | ((value: unknown) => unknown);
	shape?: Render | Record<string, unknown>;
	stackId?: string | number;
	stackOffset?: string;
	startAngle?: number;
	stroke?: string;
	strokeDasharray?: string | number;
	strokeOpacity?: number;
	strokeWidth?: number;
	style?: object;
	syncId?: string | number;
	textAnchor?: string;
	textOptions?: Record<string, unknown>;
	tick?: Render | Record<string, unknown>;
	tickCount?: number;
	tickFormatter?: (value: any, index: number) => string;
	tickLine?: boolean | Record<string, unknown>;
	ticks?: readonly unknown[];
	tooltipType?: string;
	type?: string;
	unit?: string | number;
	valueKey?: string | number | ((entry: unknown) => unknown);
	vertical?: boolean;
	verticalAlign?: 'top' | 'middle' | 'bottom';
	iterations?: number;
	width?: number | string;
	xAxisId?: string | number;
	yAxisId?: string | number;
	zAxisId?: string | number;
}

type Component<Props> = (props: Props) => OctaneNode;
type ChartProps = Pick<
	RechartsProps,
	| 'accessibilityLayer'
	| 'barCategoryGap'
	| 'barGap'
	| 'barSize'
	| 'children'
	| 'className'
	| 'cx'
	| 'cy'
	| 'data'
	| 'endAngle'
	| 'height'
	| 'innerRadius'
	| 'layout'
	| 'margin'
	| 'maxBarSize'
	| 'outerRadius'
	| 'stackOffset'
	| 'startAngle'
	| 'style'
	| 'syncId'
	| 'width'
>;

export type AreaProps<DataPointType = unknown, ValueAxisType = unknown> = RechartsProps & {
	data?: readonly DataPointType[];
	baseValue?: number | 'dataMin' | 'dataMax' | ValueAxisType;
};
export type BarProps = RechartsProps;
export type BarShapeProps = Omit<RechartsProps, 'payload'> & {
	payload?: Record<string, any>;
};
export type BrushProps = RechartsProps;
export type CartesianGridProps = RechartsProps;
export type DefaultLegendContentProps = RechartsProps;
export type DefaultTooltipContentProps = RechartsProps;
export type DotProps = RechartsProps;
export type ErrorBarProps = RechartsProps;
export type FunnelProps = RechartsProps;
export type LabelListProps = RechartsProps;
export type LabelProps = RechartsProps;
export type LegendProps = RechartsProps;
export type LineProps = RechartsProps;
export interface PieLabelRenderProps {
	cx: number;
	cy: number;
	x: number;
	y: number;
	midAngle: number;
	innerRadius: number;
	outerRadius: number;
	percent: number;
	value: number;
	name: NameType;
}
export type PieLabel = boolean | ((props: PieLabelRenderProps) => OctaneNode);
export type PieProps<DataPointType = unknown, DataValueType = unknown> = RechartsProps & {
	data?: readonly DataPointType[];
	valueKey?: keyof DataPointType | ((entry: DataPointType) => DataValueType);
};
export type PolarAngleAxisProps = RechartsProps;
export type PolarGridProps = RechartsProps;
export type PolarRadiusAxisProps = RechartsProps;
export type RadarProps = RechartsProps;
export type RadialBarProps = RechartsProps;
export type ReferenceLineProps = RechartsProps;
export type ResponsiveContainerProps = RechartsProps;
export type SankeyProps = RechartsProps;
export type ScatterProps = RechartsProps;
export type SunburstChartProps = RechartsProps;
export type TooltipProps<
	TValue extends ValueType = ValueType,
	TName extends NameType = NameType,
> = RechartsProps & {
	formatter?: (value: TValue, name: TName, ...rest: any[]) => OctaneNode;
};
export type TooltipFormatter<
	TValue extends ValueType = ValueType,
	TName extends NameType = NameType,
> = NonNullable<TooltipProps<TValue, TName>['formatter']>;
export type TreemapProps = RechartsProps;
export type XAxisProps = RechartsProps;
export type YAxisProps = RechartsProps;
export type ZAxisProps = RechartsProps;

export declare const Area: Component<AreaProps>;
export declare const AreaChart: Component<ChartProps>;
export declare const Bar: Component<BarProps>;
export declare const BarChart: Component<ChartProps>;
export declare const BarStack: Component<RechartsProps>;
export declare const CartesianGrid: Component<CartesianGridProps>;
export declare const CartesianAxis: Component<RechartsProps>;
export declare const CartesianChart: Component<ChartProps>;
export declare const Cell: Component<Record<string, unknown>>;
export declare const ComposedChart: Component<ChartProps>;
export declare const Cross: Component<RechartsProps>;
export declare const Curve: Component<RechartsProps>;
export declare const DefaultLegendContent: Component<DefaultLegendContentProps>;
export declare const DefaultTooltipContent: Component<DefaultTooltipContentProps>;
export declare const Dot: Component<DotProps>;
export declare const ErrorBar: Component<ErrorBarProps>;
export declare const Funnel: Component<FunnelProps>;
export declare const FunnelChart: Component<ChartProps>;
export declare const Layer: Component<RechartsProps>;
export declare const Label: Component<LabelProps>;
export declare const LabelList: Component<LabelListProps>;
export declare const Legend: Component<LegendProps>;
export declare const Line: Component<LineProps>;
export declare const LineChart: Component<ChartProps>;
export declare const LineDrawShape: Component<RechartsProps>;
export declare const Pie: Component<PieProps>;
export declare const PieChart: Component<ChartProps>;
export declare const Polygon: Component<RechartsProps>;
export declare const PolarAngleAxis: Component<PolarAngleAxisProps>;
export declare const PolarGrid: Component<PolarGridProps>;
export declare const PolarRadiusAxis: Component<PolarRadiusAxisProps>;
export declare const Radar: Component<RadarProps>;
export declare const RadarChart: Component<ChartProps>;
export declare const RadialBar: Component<RadialBarProps>;
export declare const RadialBarChart: Component<ChartProps>;
export declare const Rectangle: Component<BarShapeProps>;
export declare const ReferenceLine: Component<ReferenceLineProps>;
export declare const ResponsiveContainer: Component<ResponsiveContainerProps>;
export declare const Sankey: Component<SankeyProps>;
export declare const Scatter: Component<ScatterProps>;
export declare const ScatterChart: Component<ChartProps>;
export declare const Sector: Component<RechartsProps>;
export declare const SunburstChart: Component<SunburstChartProps>;
export declare const Surface: Component<RechartsProps>;
export declare const Symbols: Component<RechartsProps>;
export declare const Text: Component<RechartsProps>;
export declare const Tooltip: Component<TooltipProps>;
export declare const Trapezoid: Component<RechartsProps>;
export declare const XAxis: Component<XAxisProps>;
export declare const YAxis: Component<YAxisProps>;
export declare const ZAxis: Component<ZAxisProps>;
export declare const ZIndexLayer: Component<RechartsProps>;

export declare const AnimationControllerProvider: Component<{ children?: OctaneNode }>;

export declare function useChartWidth(): number | undefined;
export declare function useChartHeight(): number | undefined;
export declare function useMargin(): unknown;
export declare function useChartLayout(): RechartsProps['layout'] | undefined;
export declare function useCartesianChartLayout(): 'horizontal' | 'vertical' | undefined;
export declare function usePolarChartLayout(): 'centric' | 'radial' | undefined;
export declare function useIsInChartContext(): boolean;
export declare function useViewBox(): unknown;
export declare function useXAxis(xAxisId?: string | number): unknown;
export declare function useYAxis(yAxisId?: string | number): unknown;
export declare function useXAxisScale(xAxisId?: string | number): unknown;
export declare function useYAxisScale(yAxisId?: string | number): unknown;
export declare function useXAxisInverseScale(xAxisId?: string | number): unknown;
export declare function useYAxisInverseScale(yAxisId?: string | number): unknown;
export declare function useOffset(): unknown;
export declare function usePlotArea(): unknown;
export declare function useActiveTooltipLabel(): unknown;
export declare function useActiveTooltipDataPoints(): unknown;
