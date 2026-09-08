// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { RechartsRootState } from '../store';
import { selectChartLayout } from '../../context/chartLayoutContext';

/**
 * angle, radius, X, Y, and Z axes all have domain and range and scale and associated settings
 */
export type AllAxisTypes = 'xAxis' | 'yAxis' | 'zAxis' | 'radiusAxis' | 'angleAxis';

/**
 * Z axis is never displayed and so it lacks ticks and tick settings.
 */
export type RenderableAxisType = 'xAxis' | 'yAxis' | 'angleAxis' | 'radiusAxis';

export const selectTooltipAxisType = (state: RechartsRootState): RenderableAxisType => {
	const layout = selectChartLayout(state);

	if (layout === 'horizontal') {
		return 'xAxis';
	}

	if (layout === 'vertical') {
		return 'yAxis';
	}

	if (layout === 'centric') {
		return 'angleAxis';
	}

	return 'radiusAxis';
};
