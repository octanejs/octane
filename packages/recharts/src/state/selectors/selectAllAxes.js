// Vendored verbatim from recharts@3.9.2 es6/state/selectors/selectAllAxes.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
import { createSelector } from 'reselect';
export var selectAllXAxes = createSelector(
	(state) => state.cartesianAxis.xAxis,
	(xAxisMap) => {
		return Object.values(xAxisMap);
	},
);
export var selectAllYAxes = createSelector(
	(state) => state.cartesianAxis.yAxis,
	(yAxisMap) => {
		return Object.values(yAxisMap);
	},
);
