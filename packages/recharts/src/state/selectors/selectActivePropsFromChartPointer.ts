// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { createSelector } from 'reselect';
import { RechartsRootState } from '../store';
import { ActiveTooltipProps } from '../tooltipSlice';
import { selectChartLayout } from '../../context/chartLayoutContext';
import { selectTooltipAxisRangeWithReverse, selectTooltipAxisTicks } from './tooltipSelectors';
import { selectChartOffsetInternal } from './selectChartOffsetInternal';
import { combineActiveProps, selectOrderedTooltipTicks } from './selectors';
import { selectPolarViewBox } from './polarAxisSelectors';
import { RelativePointer } from '../../util/types';
import { selectTooltipAxisType } from './selectTooltipAxisType';

const pickChartPointer = (_state: RechartsRootState, chartPointer: RelativePointer) => chartPointer;

export const selectActivePropsFromChartPointer: (
	state: RechartsRootState,
	chartPointer: RelativePointer,
) => ActiveTooltipProps | undefined = createSelector(
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
