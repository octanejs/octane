// @octanejs/recharts — Recharts for the octane renderer.
//
// Recharts 3 splits cleanly along the same seam as the other octane bindings:
// its chart STATE is framework-agnostic (Redux Toolkit slices + reselect
// selectors; d3 math via victory-vendor; es-toolkit utilities) and its React
// layer is components + hooks over an isolated redux store. The authored
// TypeScript modules retain the reviewed upstream layout and native Octane
// component contracts. The store runs through @octanejs/redux, and consumers
// typecheck and compile the same .ts/.tsrx source that is executed.
import type { Props as NativeAreaProps } from './cartesian/Area.tsrx';
import type { Props as NativePieProps } from './polar/Pie.tsrx';
export { Surface } from './container/Surface.tsrx';
export { Layer } from './container/Layer.tsrx';
export { Cell } from './component/Cell';
export { ResponsiveContainer } from './component/ResponsiveContainer.tsrx';
export type { Props as ResponsiveContainerProps } from './component/ResponsiveContainer.tsrx';
export { Tooltip } from './component/Tooltip.tsrx';
export type { TooltipProps } from './component/Tooltip.tsrx';
export { DefaultTooltipContent } from './component/DefaultTooltipContent.tsrx';
export type {
	Props as DefaultTooltipContentProps,
	Formatter as TooltipFormatter,
	NameType,
	ValueType,
} from './component/DefaultTooltipContent.tsrx';
export { Legend } from './component/Legend.tsrx';
export type { Props as LegendProps } from './component/Legend.tsrx';
export { DefaultLegendContent } from './component/DefaultLegendContent.tsrx';
export type { Props as DefaultLegendContentProps } from './component/DefaultLegendContent.tsrx';
export { Rectangle } from './shape/Rectangle.tsrx';
export { Dot } from './shape/Dot.tsrx';
export { Cross } from './shape/Cross.tsrx';
export { Polygon } from './shape/Polygon.tsrx';
export { Curve } from './shape/Curve.tsrx';
export { Sector } from './shape/Sector.tsrx';
export { Symbols } from './shape/Symbols.tsrx';
export { Trapezoid } from './shape/Trapezoid.tsrx';

// Phase 1 — the static cartesian pipeline.
export { BarChart } from './chart/BarChart.tsrx';
export { LineChart } from './chart/LineChart.tsrx';
export { CartesianChart } from './chart/CartesianChart.tsrx';
export { Bar } from './cartesian/Bar.tsrx';
export { Line } from './cartesian/Line.tsrx';
export { Area } from './cartesian/Area.tsrx';
export { Scatter } from './cartesian/Scatter.tsrx';
export { Funnel } from './cartesian/Funnel.tsrx';
export { CartesianGrid } from './cartesian/CartesianGrid.tsrx';
export { ReferenceLine } from './cartesian/ReferenceLine.tsrx';
export { ErrorBar } from './cartesian/ErrorBar.tsrx';
export type { Props as ErrorBarProps } from './cartesian/ErrorBar.tsrx';
export { ZAxis } from './cartesian/ZAxis.tsrx';
export { XAxis } from './cartesian/XAxis.tsrx';
export { YAxis } from './cartesian/YAxis.tsrx';
export { AreaChart } from './chart/AreaChart.tsrx';
export { ComposedChart } from './chart/ComposedChart.tsrx';
export { ScatterChart } from './chart/ScatterChart.tsrx';
export { FunnelChart } from './chart/FunnelChart.tsrx';
export { PieChart } from './chart/PieChart.tsrx';
export { RadarChart } from './chart/RadarChart.tsrx';
export { RadialBarChart } from './chart/RadialBarChart.tsrx';
export { Pie } from './polar/Pie.tsrx';
export { Radar } from './polar/Radar.tsrx';
export { RadialBar } from './polar/RadialBar.tsrx';
export { PolarGrid } from './polar/PolarGrid.tsrx';
export { PolarAngleAxis } from './polar/PolarAngleAxis.tsrx';
export { PolarRadiusAxis } from './polar/PolarRadiusAxis.tsrx';
export { Sankey } from './chart/Sankey.tsrx';
export { SunburstChart } from './chart/SunburstChart.tsrx';

// Public aliases come from each component's implementation, not a parallel
// declaration facade. Keep the previously defaulted Area/Pie generic aliases.
export type AreaProps<DataPointType = unknown, ValueAxisType = unknown> = NativeAreaProps<
	DataPointType,
	ValueAxisType
>;
export type PieProps<DataPointType = unknown, DataValueType = unknown> = NativePieProps<
	DataPointType,
	DataValueType
>;
export type { Props as BarProps, BarShapeProps } from './cartesian/Bar.tsrx';
export type { Props as CartesianGridProps } from './cartesian/CartesianGrid.tsrx';
export type { Props as DotProps } from './shape/Dot.tsrx';
export type { Props as FunnelProps } from './cartesian/Funnel.tsrx';
export type { Props as LabelListProps } from './component/LabelList.tsrx';
export type { Props as LabelProps } from './component/Label.tsrx';
export type { Props as LineProps } from './cartesian/Line.tsrx';
export type { PieLabel, PieLabelRenderProps } from './polar/Pie.tsrx';
export type { Props as PolarAngleAxisProps } from './polar/PolarAngleAxis.tsrx';
export type { Props as PolarGridProps } from './polar/PolarGrid.tsrx';
export type { Props as PolarRadiusAxisProps } from './polar/PolarRadiusAxis.tsrx';
export type { Props as RadarProps } from './polar/Radar.tsrx';
export type { RadialBarProps } from './polar/RadialBar.tsrx';
export type { Props as ReferenceLineProps } from './cartesian/ReferenceLine.tsrx';
export type { Props as SankeyProps } from './chart/Sankey.tsrx';
export type { Props as ScatterProps } from './cartesian/Scatter.tsrx';
export type { SunburstChartProps } from './chart/SunburstChart.tsrx';
export type { Props as XAxisProps } from './cartesian/XAxis.tsrx';
export type { Props as YAxisProps } from './cartesian/YAxis.tsrx';
export type { Props as ZAxisProps } from './cartesian/ZAxis.tsrx';
export type { RechartsProps, BrushProps, TreemapProps } from './legacy-props';
export { CartesianAxis } from './cartesian/CartesianAxis.tsrx';
export { BarStack } from './cartesian/BarStack.tsrx';
export { LineDrawShape } from './cartesian/LineDrawShape.tsrx';
export { Text } from './component/Text.tsrx';
export { Label } from './component/Label.tsrx';
export { LabelList } from './component/LabelList.tsrx';
export { ZIndexLayer } from './zIndex/ZIndexLayer.tsrx';
export { AnimationControllerProvider } from './animation/useAnimationController';
export {
	useChartWidth,
	useChartHeight,
	useMargin,
	useChartLayout,
	useCartesianChartLayout,
	usePolarChartLayout,
	useIsInChartContext,
	useViewBox,
} from './context/chartLayoutContext';
export {
	useXAxis,
	useYAxis,
	useXAxisScale,
	useYAxisScale,
	useXAxisInverseScale,
	useYAxisInverseScale,
	useOffset,
	usePlotArea,
	useActiveTooltipLabel,
	useActiveTooltipDataPoints,
} from './hooks';
