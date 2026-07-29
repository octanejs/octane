// @octanejs/recharts — Recharts for the octane renderer.
//
// Recharts 3 splits cleanly along the same seam as the other octane bindings:
// its chart STATE is framework-agnostic (Redux Toolkit slices + reselect
// selectors; d3 math via victory-vendor; es-toolkit utilities) and its React
// layer is components + hooks over an isolated redux store. This package
// MIRRORS upstream's file layout under src/: framework-agnostic modules are
// vendored verbatim (`.js`, marked with a "Vendored verbatim" header) and the
// React layer is re-implemented on octane (`.ts`/`.tsrx`) at the same paths —
// so upstream's relative imports resolve unchanged, vendored or ported.
// The store runs through @octanejs/redux.
//
// Port status: Phase 1 (static BarChart + LineChart pipeline) — see
// docs/recharts-port-plan.md for the phase map.
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

// Public prop contracts used by component-library wrappers. The runtime port
// accepts the same prop bags as Recharts; keep these structural while the
// generated declaration surface is expanded component by component.
export type AreaProps<DataPointType = any, ValueAxisType = any> = Record<string, any>;
export type BarProps = Record<string, any>;
export type BarShapeProps = Record<string, any>;
export type BrushProps = Record<string, any>;
export type CartesianGridProps = Record<string, any>;
export type DotProps = Record<string, any>;
export type FunnelProps = Record<string, any>;
export type LabelListProps = Record<string, any>;
export type LabelProps = Record<string, any>;
export type LineProps = Record<string, any>;
export type PieLabel = (props: Record<string, any>) => unknown;
export type PieProps<DataPointType = any, DataValueType = any> = Record<string, any>;
export type PolarAngleAxisProps = Record<string, any>;
export type PolarGridProps = Record<string, any>;
export type PolarRadiusAxisProps = Record<string, any>;
export type RadarProps = Record<string, any>;
export type RadialBarProps = Record<string, any>;
export type ReferenceLineProps = Record<string, any>;
export type SankeyProps = Record<string, any>;
export type ScatterProps = Record<string, any>;
export type SunburstChartProps = Record<string, any>;
export type TreemapProps = Record<string, any>;
export type XAxisProps = Record<string, any>;
export type YAxisProps = Record<string, any>;
export type ZAxisProps = Record<string, any>;
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
