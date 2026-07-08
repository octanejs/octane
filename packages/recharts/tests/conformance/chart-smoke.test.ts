/**
 * Phase 1 smoke: a static BarChart and LineChart mount through the full octane
 * pipeline (store, reporters, axes, graphical items) and produce plausible SVG
 * — bars as rectangles, lines as curves, axes with ticks. Byte-parity vs real
 * recharts is asserted separately by the differential suite.
 */
import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { BarChartApp, LineChartApp } from '../_fixtures/charts.tsrx';

async function settle() {
	// The chart pipeline is multi-pass: size lands via effect, axes/items
	// register via layout effects, offsets recompute, then the final paint —
	// plus a rAF for the store's autoBatch notifications.
	for (let i = 0; i < 10; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('Phase 1 chart pipeline (octane side)', () => {
	it('BarChart renders bars and axes', async () => {
		const r = mount(BarChartApp);
		await settle();
		const svg = r.find('svg.recharts-surface') as SVGSVGElement;
		expect(svg).toBeTruthy();
		expect(svg.getAttribute('width')).toBe('500');
		const bars = r.container.querySelectorAll('.recharts-bar-rectangle path.recharts-rectangle');
		expect(bars.length).toBe(12); // 6 data points × 2 series
		// Tick labels portal into the zIndex label layer (outside .recharts-xAxis).
		const xTicks = r.container.querySelectorAll(
			'.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value',
		);
		expect(xTicks.length).toBe(6);
		const yTicks = r.container.querySelectorAll(
			'.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value',
		);
		expect(yTicks.length).toBeGreaterThan(0);
		r.unmount();
	});

	it('LineChart renders curves and dots', async () => {
		const r = mount(LineChartApp);
		await settle();
		const curves = r.container.querySelectorAll('path.recharts-line-curve');
		expect(curves.length).toBe(2);
		for (const curve of curves) {
			expect(curve.getAttribute('d')).toMatch(/^M/);
		}
		const dots = r.container.querySelectorAll('.recharts-line-dots circle');
		expect(dots.length).toBe(12);
		r.unmount();
	});
});
