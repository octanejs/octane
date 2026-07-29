import { describe, expect, it } from 'vitest';
import { computeScatterPoints } from '../../src/cartesian/Scatter.tsrx';

describe('computeScatterPoints', () => {
	it('preserves a zero z value for sizing and tooltip payloads', () => {
		const entry = { x: 10, y: 20, z: 0 };
		const numericAxis = (dataKey: string) =>
			({
				dataKey,
				type: 'number',
				scale: {
					map: (value: number) => value,
					bandwidth: () => 0,
				},
			}) as never;

		const [point] = computeScatterPoints({
			displayedData: [entry],
			xAxis: numericAxis('x'),
			yAxis: numericAxis('y'),
			zAxis: {
				dataKey: 'z',
				name: 'Depth',
				unit: 'px',
				range: [64, 64],
				scale: {
					map: (value: number) => value,
				},
			} as never,
			scatterSettings: {
				dataKey: undefined,
				id: 'scatter-zero-z',
				name: 'Series',
				tooltipType: undefined,
			},
			xAxisTicks: undefined,
			yAxisTicks: undefined,
			cells: undefined,
		});

		expect(point).toMatchObject({
			cx: 10,
			cy: 20,
			size: 0,
			width: 0,
			height: 0,
			node: { x: 10, y: 20, z: 0 },
		});
		expect(point.tooltipPayload).toContainEqual({
			name: 'Depth',
			unit: 'px',
			value: 0,
			payload: entry,
			dataKey: 'z',
			type: undefined,
			graphicalItemId: 'scatter-zero-z',
		});
	});
});
