// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { createSelector } from 'reselect';
import { selectChartOffsetInternal } from './selectChartOffsetInternal';
import { ChartOffsetInternal } from '../../util/types';
import { ChartOffset } from '../../types';

export const selectChartOffset = createSelector(
	[selectChartOffsetInternal],
	(offsetInternal: ChartOffsetInternal): ChartOffset => {
		return {
			top: offsetInternal.top,
			bottom: offsetInternal.bottom,
			left: offsetInternal.left,
			right: offsetInternal.right,
		};
	},
);
