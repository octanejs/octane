import { describe, expect, it, vi } from 'vitest';
import { generateChartDescription } from '@octanejs/visx/a11y';
import {
	getAxisTickCount,
	getPaddedDomain,
	getVisibleTickValues,
	getZeroBaselineDomain,
} from '@octanejs/visx/chart';
import { curveBasis, curveLinear, curveNatural } from '@octanejs/visx/curve';
import { localPoint } from '@octanejs/visx/event';
import {
	appleStock,
	genPhyllotaxis,
	getSeededRandom,
	letterFrequency,
} from '@octanejs/visx/mock-data';
import { Point, subtractPoints, sumPoints } from '@octanejs/visx/point';
import { computeStats } from '@octanejs/visx/stats';
import {
	buildFloatingTooltipMiddleware,
	getTooltipAnchorReference,
} from '@octanejs/visx/tooltip/floating';
import { normalizeBrushStartEnd } from '../../src/brush/utils';
import getSplitLineSegments from '../../src/shape/util/getSplitLineSegments';

describe('@octanejs/visx framework-neutral utilities', () => {
	it('preserves point arithmetic and native event coordinates', () => {
		const first = new Point({ x: 8, y: 13 });
		const second = new Point({ x: 3, y: 5 });
		expect(sumPoints(first, second).value()).toEqual({ x: 11, y: 18 });
		expect(subtractPoints(first, second).toArray()).toEqual([5, 8]);

		const node = document.createElement('div');
		vi.spyOn(node, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 100, 80));
		const point = localPoint(node, new MouseEvent('pointermove', { clientX: 25, clientY: 47 }));
		expect(point?.value()).toEqual({ x: 15, y: 27 });
	});

	it('normalizes brush endpoints across reversed x and y extents', () => {
		const start = { x: 0, y: 0 };
		const end = { x: 0, y: 0 };

		normalizeBrushStartEnd(start, end, {
			x0: 80,
			x1: 20,
			y0: 70,
			y1: 10,
		});

		expect(start).toEqual({ x: 20, y: 10 });
		expect(end).toEqual({ x: 80, y: 70 });
	});

	it('re-exports the upstream D3 curves and deterministic mock-data generators', () => {
		expect(
			[curveBasis, curveLinear, curveNatural].every((curve) => typeof curve === 'function'),
		).toBe(true);
		const firstRandom = getSeededRandom(0.42);
		const secondRandom = getSeededRandom(0.42);
		expect(Array.from({ length: 5 }, firstRandom)).toEqual(Array.from({ length: 5 }, secondRandom));
		expect(genPhyllotaxis({ radius: 10, width: 100, height: 80 })(0)).toEqual({ x: 50, y: 40 });
		expect(appleStock.length).toBeGreaterThan(100);
		expect(letterFrequency.some(({ letter }) => letter === 'A')).toBe(true);
	});

	it('computes statistical, domain, tick, and accessibility summaries', () => {
		const stats = computeStats([1, 2, 3, 4, 5, 30]);
		expect(stats.boxPlot).toMatchObject({ firstQuartile: 2, median: 3.5, thirdQuartile: 5 });
		expect(stats.boxPlot.outliers).toEqual([30]);
		expect(getZeroBaselineDomain([2, 8])).toEqual([0, 8]);
		expect(getPaddedDomain([10, 20], 0.1)).toEqual([9, 21]);
		expect(getAxisTickCount({ axisLength: 220, minTickSpacing: 50 })).toBe(4);
		expect(
			getVisibleTickValues([0, 1, 2, 3, 4, 5], {
				axisLength: 150,
				minTickSpacing: 50,
			}),
		).toEqual([0, 3, 5]);
		expect(
			generateChartDescription({
				title: 'Revenue',
				chartType: 'line',
				data: [
					{ quarter: 'Q1', value: 2 },
					{ quarter: 'Q2', value: 5 },
				],
				x: (datum) => datum.quarter,
				y: (datum) => datum.value,
			}),
		).toContain('Values start at 2 for Q1, end at 5 for Q2');
	});

	it('builds floating references and middleware without React runtime objects', () => {
		const reference = getTooltipAnchorReference({ type: 'point', x: 14, y: 26 });
		expect(reference?.getBoundingClientRect()).toMatchObject({ left: 14, top: 26 });
		expect(
			buildFloatingTooltipMiddleware({ offset: 4, flip: true, shift: true }).map(
				(middleware) => middleware.name,
			),
		).toEqual(['offset', 'flip', 'shift']);
		const replacement = [{ name: 'custom', fn: () => ({}) }];
		expect(
			buildFloatingTooltipMiddleware({ middleware: replacement, middlewareMode: 'replace' }),
		).toBe(replacement);
	});

	it('samples and segments SVG paths deterministically by x, y, and length', () => {
		const xSegments = getSplitLineSegments({
			path: 'M0,0Q10,20,20,0',
			pointsInSegments: [
				[
					{ x: 0, y: 0 },
					{ x: 5, y: 7.5 },
				],
				[
					{ x: 10, y: 10 },
					{ x: 20, y: 0 },
				],
			],
			segmentation: 'x',
			sampleRate: 2,
		});
		expect(xSegments).toHaveLength(2);
		expect(xSegments[0].length + xSegments[1].length).toBeGreaterThan(10);
		expect(xSegments[0].every(({ x }) => x < 10)).toBe(true);
		expect(xSegments[1].every(({ x }) => x >= 10)).toBe(true);
		expect(xSegments.flat().some(({ y }) => y > 5)).toBe(true);

		const ySegments = getSplitLineSegments({
			path: 'M0,20L0,0',
			pointsInSegments: [[{ x: 0, y: 20 }], [{ x: 0, y: 10 }]],
			segmentation: 'y',
			sampleRate: 5,
		});
		expect(ySegments.map((segment) => segment.map(({ y }) => y))).toEqual([
			[20, 15],
			[10, 5, 0],
		]);

		const lengthSegments = getSplitLineSegments({
			path: 'M0,0L20,0',
			pointsInSegments: [
				[
					{ x: 0, y: 0 },
					{ x: 5, y: 0 },
				],
				[{ x: 20, y: 0 }],
			],
			segmentation: 'length',
			sampleRate: 5,
		});
		expect(lengthSegments.map((segment) => segment.map(({ x }) => x))).toEqual([
			[0, 5, 10, 15],
			[20],
		]);
	});
});
