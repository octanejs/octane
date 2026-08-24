// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { BaseCartesianAxis } from '../../cartesianAxisSlice';
import { AxisRange } from '../axisSelectors';

export const combineAxisRangeWithReverse = (
	axisSettings: BaseCartesianAxis | undefined,
	axisRange: AxisRange | undefined,
): AxisRange | undefined => {
	if (!axisSettings || !axisRange) {
		return undefined;
	}
	if (axisSettings?.reversed) {
		return [axisRange[1], axisRange[0]];
	}
	return axisRange;
};
