import type { RegisteredCell } from '../../context/CellsContext';
import { createSelector } from 'reselect';

import { computeFunnelTrapezoids, FunnelTrapezoidItem } from '../../cartesian/Funnel.tsrx';
import { ChartData } from '../chartDataSlice';
import { RechartsRootState } from '../store';
import { selectChartOffsetInternal } from './selectChartOffsetInternal';
import { selectChartDataAndAlwaysIgnoreIndexes } from './dataSelectors';
import { ChartOffsetInternal, DataKey, TooltipType } from '../../util/types';
import { GraphicalItemId } from '../graphicalItemsSlice';

export type ResolvedFunnelSettings = {
	dataKey: DataKey<any>;
	data: ChartData | undefined;
	nameKey: DataKey<any>;
	tooltipType?: TooltipType;
	lastShapeType?: 'triangle' | 'rectangle';
	reversed?: boolean;
	customWidth?: string | number;
	cells: ReadonlyArray<RegisteredCell> | undefined;
	presentationProps: Record<string, any> | null;
	id: GraphicalItemId;
};

const pickFunnelSettings = (
	_state: RechartsRootState,
	funnelSettings: ResolvedFunnelSettings,
): ResolvedFunnelSettings => funnelSettings;

export const selectFunnelTrapezoids: (
	state: RechartsRootState,
	funnelSettings: ResolvedFunnelSettings,
) => ReadonlyArray<FunnelTrapezoidItem> = createSelector(
	[selectChartOffsetInternal, pickFunnelSettings, selectChartDataAndAlwaysIgnoreIndexes],
	(
		offset: ChartOffsetInternal,
		{
			data,
			dataKey,
			nameKey,
			tooltipType,
			lastShapeType,
			reversed,
			customWidth,
			cells,
			presentationProps,
			id: graphicalItemId,
		},
		{ chartData },
	): ReadonlyArray<FunnelTrapezoidItem> => {
		let displayedData: ChartData | undefined;
		if (data != null && data.length > 0) {
			displayedData = data;
		} else if (chartData != null && chartData.length > 0) {
			displayedData = chartData;
		}

		if (displayedData && displayedData.length) {
			displayedData = displayedData.map((entry: any, index: number) => ({
				payload: entry,
				...presentationProps,
				...entry,
				...(cells && cells[index] && cells[index].props),
			}));
		} else if (cells && cells.length) {
			displayedData = cells.map((cell: RegisteredCell) => ({
				...presentationProps,
				...cell.props,
			}));
		} else {
			return [];
		}

		return computeFunnelTrapezoids({
			dataKey,
			nameKey,
			displayedData,
			tooltipType,
			lastShapeType,
			reversed,
			offset,
			customWidth,
			graphicalItemId,
		});
	},
);
