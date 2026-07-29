import { describe, expect, it } from 'vitest';
import { computeFunnelTrapezoids } from '../../src/cartesian/Funnel.tsrx';

describe('computeFunnelTrapezoids', () => {
	it('normalizes a ranged value followed by a numeric value', () => {
		const trapezoids = computeFunnelTrapezoids({
			dataKey: 'value',
			nameKey: 'name',
			displayedData: [
				{ name: 'Range', value: [100, 80] },
				{ name: 'Number', value: 60 },
			],
			lastShapeType: 'triangle',
			reversed: false,
			offset: { left: 0, top: 0, width: 200, height: 100 } as never,
			customWidth: undefined,
			graphicalItemId: 'funnel-regression',
		});

		expect(trapezoids[0]).toMatchObject({
			value: 100,
			val: 100,
			upperWidth: 200,
			lowerWidth: 160,
		});
		expect(trapezoids[0].tooltipPayload[0].value).toBe(100);
		expect(trapezoids[1]).toMatchObject({
			value: 60,
			val: 60,
			upperWidth: 120,
			lowerWidth: 0,
		});
		for (const trapezoid of trapezoids) {
			expect([trapezoid.x, trapezoid.upperWidth, trapezoid.lowerWidth].every(Number.isFinite)).toBe(
				true,
			);
		}
	});

	it('normalizes non-finite scalar and ranged values without poisoning geometry', () => {
		const trapezoids = computeFunnelTrapezoids({
			dataKey: 'value',
			nameKey: 'name',
			displayedData: [
				{ name: 'Invalid scalar', value: Number.NaN },
				{ name: 'Invalid range end', value: [80, Number.NaN] },
				{ name: 'Valid', value: 40 },
			],
			lastShapeType: 'triangle',
			reversed: false,
			offset: { left: 0, top: 0, width: 200, height: 150 } as never,
			customWidth: undefined,
			graphicalItemId: 'funnel-non-finite-regression',
		});

		expect(trapezoids.map((trapezoid) => trapezoid.value)).toEqual([0, 80, 40]);
		expect(trapezoids[1].lowerWidth).toBe(100);
		for (const trapezoid of trapezoids) {
			expect(
				[
					trapezoid.x,
					trapezoid.y,
					trapezoid.upperWidth,
					trapezoid.lowerWidth,
					trapezoid.tooltipPosition.x,
					trapezoid.tooltipPosition.y,
				].every(Number.isFinite),
			).toBe(true);
		}
	});

	it('exposes the normalized public value when dataKey uses another field', () => {
		const [trapezoid] = computeFunnelTrapezoids({
			dataKey: 'amount',
			nameKey: 'name',
			displayedData: [{ name: 'A', amount: 40 }],
			lastShapeType: 'rectangle',
			reversed: false,
			offset: { left: 0, top: 0, width: 200, height: 100 } as never,
			customWidth: undefined,
			graphicalItemId: 'funnel-public-value',
		});

		expect(trapezoid.value).toBe(40);
	});

	it('keeps computed geometry and metadata authoritative over colliding data props', () => {
		const entry = {
			label: 'Computed name',
			value: 100,
			fill: 'tomato',
			x: 999,
			y: 999,
			width: 999,
			height: 999,
			upperWidth: 999,
			lowerWidth: 999,
			name: 'Clobbered name',
			val: -1,
			tooltipPayload: [],
			tooltipPosition: { x: 999, y: 999 },
			payload: 'clobbered payload',
			parentViewBox: { x: 999, y: 999, width: 999, height: 999 },
			labelViewBox: { x: 999, y: 999, width: 999, height: 999 },
		};

		const [trapezoid] = computeFunnelTrapezoids({
			dataKey: 'value',
			nameKey: 'label',
			displayedData: [entry],
			lastShapeType: 'rectangle',
			reversed: false,
			offset: { left: 10, top: 20, width: 200, height: 100 } as never,
			customWidth: undefined,
			graphicalItemId: 'funnel-collision-regression',
		});

		expect(trapezoid).toMatchObject({
			fill: 'tomato',
			x: 10,
			y: 20,
			width: 200,
			height: 100,
			upperWidth: 200,
			lowerWidth: 200,
			name: 'Computed name',
			val: 100,
			tooltipPosition: { x: 110, y: 70 },
			parentViewBox: { x: 10, y: 20, width: 200, height: 100 },
			labelViewBox: {
				x: 10,
				y: 20,
				width: 200,
				height: 100,
				upperWidth: 200,
				lowerWidth: 200,
			},
		});
		expect(trapezoid.payload).toBe(entry);
		expect(trapezoid.tooltipPayload).toEqual([
			{
				name: 'Computed name',
				value: 100,
				payload: entry,
				dataKey: 'value',
				type: undefined,
				graphicalItemId: 'funnel-collision-regression',
			},
		]);
	});
});
