// Vendored verbatim from recharts@3.9.2 es6/state/selectors/selectActivePropsFromChartPointer.js (framework-agnostic).
// Do not edit — update by re-vendoring when the recharts devDependency moves.
import { createSelector } from 'reselect';
import { selectChartLayout } from '../../context/chartLayoutContext';
import { selectTooltipAxisRangeWithReverse, selectTooltipAxisTicks } from './tooltipSelectors';
import { selectChartOffsetInternal } from './selectChartOffsetInternal';
import { combineActiveProps, selectOrderedTooltipTicks } from './selectors';
import { selectPolarViewBox } from './polarAxisSelectors';
import { selectTooltipAxisType } from './selectTooltipAxisType';
var pickChartPointer = (_state, chartPointer) => chartPointer;
export var selectActivePropsFromChartPointer = createSelector(
	[
		pickChartPointer,
		selectChartLayout,
		selectPolarViewBox,
		selectTooltipAxisType,
		selectTooltipAxisRangeWithReverse,
		selectTooltipAxisTicks,
		selectOrderedTooltipTicks,
		selectChartOffsetInternal,
	],
	combineActiveProps,
);
