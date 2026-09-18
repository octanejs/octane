// Adapted from recharts@3.9.2, commit b3451050c027a23957ffa50a2665c9119df21e47.
import type { BaseValue } from '../../cartesian/Area.tsrx';
import type { DataKey } from '../../util/types';
import type { ChartData } from '../chartDataSlice';
import type { MaybeStackedGraphicalItem } from './StackedGraphicalItem';
import type { BaseCartesianGraphicalItemSettings } from '../graphicalItemsSlice';

export type AreaSettings = BaseCartesianGraphicalItemSettings &
	MaybeStackedGraphicalItem & {
		type: 'area';
		connectNulls: boolean;
		baseValue: BaseValue | undefined;
		dataKey: DataKey<any>;
		data: ChartData | undefined;
	};
