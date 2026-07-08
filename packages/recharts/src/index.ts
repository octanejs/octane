// @octanejs/recharts — Recharts for the octane renderer.
//
// Recharts 3 splits cleanly along the same seam as the other octane bindings:
// its chart STATE is framework-agnostic (Redux Toolkit slices + reselect
// selectors; d3 math via victory-vendor; es-toolkit utilities) and its React
// layer is components + hooks over an isolated redux store. This package
// vendors the framework-agnostic modules verbatim (src/vendor/), runs the
// store through @octanejs/redux, and re-implements the component layer on
// octane.
//
// Port status: Phase 0 (redux plumbing + Surface/Layer/Cell + shapes) — see
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
