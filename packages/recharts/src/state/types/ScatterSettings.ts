// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import type { ChartData } from '../chartDataSlice';
import type { DataKey } from '../../util/types';
import type { TooltipType } from '../../component/DefaultTooltipContent.tsrx';
import type { BaseCartesianGraphicalItemSettings } from '../graphicalItemsSlice';

export type ScatterSettings = BaseCartesianGraphicalItemSettings & {
	type: 'scatter';
	data: ChartData | undefined;
	dataKey: DataKey<any> | undefined;
	tooltipType: TooltipType | undefined;
	name: string | number | undefined;
};
