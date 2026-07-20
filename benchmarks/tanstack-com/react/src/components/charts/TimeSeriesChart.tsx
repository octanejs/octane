import * as React from 'react';
import * as Plot from '@observablehq/plot';
import { type BinType, binTimeSeriesData } from '~/utils/chart';
import { PlotContainer } from '~/components/charts/PlotContainer';

export type ChartVariant = 'area' | 'bar' | 'cumulative';

type TimeSeriesChartProps = {
	data: Array<{ date: string; count: number }>;
	binType: BinType;
	variant?: ChartVariant;
	color?: string;
	height?: number;
	yLabel?: string;
};

export function TimeSeriesChart({
	data,
	binType,
	variant = 'area',
	color = '#3b82f6',
	height = 200,
	yLabel,
}: TimeSeriesChartProps) {
	const options = React.useCallback(
		(_width: number) => {
			const binnedData = binTimeSeriesData(data, binType);
			if (binnedData.length === 0) return { marks: [] };

			const marks = getMarksForVariant(variant, binnedData, color, binType);

			return {
				marginLeft: 60,
				marginRight: 20,
				marginTop: 20,
				marginBottom: 40,
				x: { label: 'Date', type: 'utc' as const, grid: true },
				y: { label: yLabel ?? getDefaultYLabel(variant), grid: true },
				marks,
				style: { background: 'transparent', fontSize: '12px' },
			};
		},
		[data, binType, variant, color, yLabel],
	);

	if (data.length === 0) {
		return (
			<div className="text-center py-8 text-gray-600 dark:text-gray-400">No data available</div>
		);
	}

	return <PlotContainer options={options} height={height} />;
}

function getDefaultYLabel(variant: ChartVariant): string {
	switch (variant) {
		case 'cumulative':
			return 'Total';
		default:
			return 'Count';
	}
}

function getMarksForVariant(
	variant: ChartVariant,
	data: Array<{ date: Date; count: number }>,
	color: string,
	binType: BinType,
): Plot.Markish[] {
	switch (variant) {
		case 'bar':
			return [
				Plot.rectY(data, {
					x: 'date',
					y: 'count',
					fill: color,
					fillOpacity: 0.8,
					interval: getBinInterval(binType),
				}),
				Plot.tip(
					data,
					Plot.pointerX({
						x: 'date',
						y: 'count',
						title: (d) => `${formatDateForTooltip(d.date)}\n${d.count.toLocaleString()}`,
					}),
				),
			];

		case 'cumulative':
			return [
				Plot.areaY(
					data,
					Plot.mapY('cumsum', {
						x: 'date',
						y: 'count',
						fill: color,
						fillOpacity: 0.2,
						curve: 'monotone-x',
					}),
				),
				Plot.lineY(
					data,
					Plot.mapY('cumsum', {
						x: 'date',
						y: 'count',
						stroke: color,
						strokeWidth: 2,
						curve: 'monotone-x',
					}),
				),
				Plot.dot(
					data,
					Plot.mapY('cumsum', {
						x: 'date',
						y: 'count',
						fill: color,
						r: 3,
					}),
				),
				Plot.tip(
					data,
					Plot.pointerX(
						Plot.mapY('cumsum', {
							x: 'date',
							y: 'count',
							title: (d, i) => {
								let cumSum = 0;
								for (let j = 0; j <= i; j++) {
									cumSum += data[j].count;
								}
								return `${formatDateForTooltip(d.date)}\n${cumSum.toLocaleString()} total`;
							},
						}),
					),
				),
			];

		case 'area':
		default:
			return [
				Plot.areaY(data, {
					x: 'date',
					y: 'count',
					fill: color,
					fillOpacity: 0.2,
					curve: 'monotone-x',
				}),
				Plot.lineY(data, {
					x: 'date',
					y: 'count',
					stroke: color,
					strokeWidth: 2,
					curve: 'monotone-x',
				}),
				Plot.dot(data, {
					x: 'date',
					y: 'count',
					fill: color,
					r: 3,
				}),
				Plot.tip(
					data,
					Plot.pointerX({
						x: 'date',
						y: 'count',
						title: (d) => `${formatDateForTooltip(d.date)}\n${d.count.toLocaleString()}`,
					}),
				),
			];
	}
}

function getBinInterval(binType: BinType): 'year' | 'month' | 'week' | 'day' {
	switch (binType) {
		case 'yearly':
			return 'year';
		case 'monthly':
			return 'month';
		case 'weekly':
			return 'week';
		case 'daily':
		default:
			return 'day';
	}
}

function formatDateForTooltip(date: Date): string {
	return date.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
	});
}
