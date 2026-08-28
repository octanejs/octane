// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { RechartsRootState } from '../store';
import { Margin } from '../../util/types';

export const selectChartWidth = (state: RechartsRootState): number => state.layout.width;

export const selectChartHeight = (state: RechartsRootState): number => state.layout.height;

export const selectContainerScale: (state: RechartsRootState) => number = (state) =>
	state.layout.scale;

export const selectMargin = (state: RechartsRootState): Margin => state.layout.margin;
