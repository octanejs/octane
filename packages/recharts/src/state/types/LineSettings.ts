// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import { ChartData } from '../chartDataSlice';
import { DataKey } from '../../util/types';
import { BaseCartesianGraphicalItemSettings } from '../graphicalItemsSlice';

export type LineSettings = BaseCartesianGraphicalItemSettings & {
	type: 'line';
	data: ChartData | undefined;
	dataKey: DataKey<any> | undefined;
};
