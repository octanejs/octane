// Vendored verbatim from recharts@3.9.2 es6/state/selectors/selectChartOffset.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
import { createSelector } from 'reselect';
import { selectChartOffsetInternal } from './selectChartOffsetInternal';
export var selectChartOffset = createSelector([selectChartOffsetInternal], (offsetInternal) => {
	return {
		top: offsetInternal.top,
		bottom: offsetInternal.bottom,
		left: offsetInternal.left,
		right: offsetInternal.right,
	};
});
