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
export { XAxis } from './cartesian/XAxis.tsrx';
export { YAxis } from './cartesian/YAxis.tsrx';
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
