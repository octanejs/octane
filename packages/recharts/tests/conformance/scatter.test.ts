import { describe, expect, it } from 'vitest';
import { scaleLinear } from 'victory-vendor/d3-scale';
import { computeScatterPoints } from '../../src/cartesian/Scatter.tsrx';
import {
	implicitXAxis,
	implicitZAxis,
	type BaseAxisWithScale,
} from '../../src/state/selectors/axisSelectors';
import { rechartsScaleFactory } from '../../src/util/scale/RechartsScale';

const numericAxis = (dataKey: string): BaseAxisWithScale => ({
	...implicitXAxis,
	dataKey,
	type: 'number',
	scale: rechartsScaleFactory(scaleLinear()),
});

const scatterSettings = {
	dataKey: undefined,
	id: 'scatter-zero-z',
	name: 'Series',
	tooltipType: undefined,
};

describe('computeScatterPoints', () => {
	it('preserves a zero z value for sizing and tooltip payloads', () => {
		const entry = { x: 10, y: 20, z: 0 };
		const [point] = computeScatterPoints({
			displayedData: [entry],
			xAxis: numericAxis('x'),
			yAxis: numericAxis('y'),
			zAxis: {
				...implicitZAxis,
				dataKey: 'z',
				name: 'Depth',
				unit: 'px',
				range: [64, 64],
				scale: rechartsScaleFactory(scaleLinear()),
			},
			scatterSettings,
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

	it('normalizes a function-valued z data key to a tooltip name', () => {
		const entry = { x: 10, y: 20, z: 9 };
		const getDepth = (datum: typeof entry) => datum.z;
		const [point] = computeScatterPoints({
			displayedData: [entry],
			xAxis: numericAxis('x'),
			yAxis: numericAxis('y'),
			zAxis: { ...implicitZAxis, dataKey: getDepth, scale: rechartsScaleFactory(scaleLinear()) },
			scatterSettings,
			xAxisTicks: undefined,
			yAxisTicks: undefined,
			cells: undefined,
		});
		expect(point.tooltipPayload?.[2]).toMatchObject({
			name: String(getDepth),
			dataKey: getDepth,
			value: 9,
		});
	});

	it.each([
		{ x: undefined, y: 20 },
		{ x: 10, y: undefined },
	])('does not expose an invalid tooltip coordinate for an unresolved point %j', (entry) => {
		const [point] = computeScatterPoints({
			displayedData: [entry],
			xAxis: numericAxis('x'),
			yAxis: numericAxis('y'),
			zAxis: undefined,
			scatterSettings,
			xAxisTicks: undefined,
			yAxisTicks: undefined,
			cells: undefined,
		});
		expect(point.payload).toBe(entry);
		expect(point).toMatchObject({ cx: entry.x ?? null, cy: entry.y ?? null });
		expect(point.tooltipPosition).toBeUndefined();
	});
});
