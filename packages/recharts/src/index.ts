// @octanejs/recharts — Recharts for the octane renderer.
//
// Recharts 3 splits cleanly along the same seam as the other octane bindings:
// its chart STATE is framework-agnostic (Redux Toolkit slices + reselect
// selectors + immer; d3 math via victory-vendor; es-toolkit utilities) and its
// React layer is components + hooks over react-redux. This package reuses the
// framework-agnostic modules verbatim and re-implements the React layer on
// octane's hooks (a minimal react-redux equivalent on useSyncExternalStore +
// context, and the component tree in .tsrx).
//
// Port status: Phase 0 scaffolding — see docs/recharts-port-plan.md.
export {};
