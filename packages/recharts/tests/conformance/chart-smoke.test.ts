/**
 * Phase 1 smoke: a static BarChart and LineChart mount through the full octane
 * pipeline (store, reporters, axes, graphical items) and produce plausible SVG
 * — bars as rectangles, lines as curves, axes with ticks. Byte-parity vs real
 * recharts is asserted separately by the differential suite.
 */
import { describe, it, expect, vi } from 'vitest';
import { flushEffects, mount, nextPaint } from '../_helpers';
import {
	BarChartApp,
	CartesianChartsApp,
	ErrorBarAnimationOriginApp,
	FunnelAnimationStabilityApp,
	FunnelLegendApp,
	HiddenScatterCellsApp,
	HiddenPieTooltipApp,
	HierarchyChartsApp,
	LineChartApp,
	OverlayChartApp,
	PolarAnimationStabilityApp,
	PolarCellsApp,
	PolarChartsApp,
	ResponsiveChartApp,
	ScatterAnimationCallbacksApp,
	ScatterCellsApp,
	ZeroErrorBarApp,
} from '../_fixtures/charts.tsrx';
import { CSSTransitionReactivationApp } from '../_fixtures/css-transition-animation.tsrx';
import { HiddenFunnelRegistrationsApp } from '../_fixtures/hidden-funnel-registrations.tsrx';

async function settle() {
	// The chart pipeline is multi-pass: size lands via effect, axes/items
	// register via layout effects, offsets recompute, then the final paint —
	// plus a rAF for the store's autoBatch notifications.
	for (let i = 0; i < 10; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

function controlAnimationFrames() {
	let frameTime = performance.now();
	let nextHandle = 1;
	const pending = new Map<number, FrameRequestCallback>();
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
		const handle = nextHandle++;
		pending.set(handle, callback);
		return handle;
	});
	vi.stubGlobal('cancelAnimationFrame', (handle: number) => pending.delete(handle));

	async function flush() {
		for (let frame = 0; frame < 100; frame++) {
			await nextPaint();
			const callbacks = Array.from(pending.values());
			pending.clear();
			if (callbacks.length === 0) return;
			frameTime = Math.max(frameTime, performance.now()) + 16;
			for (const callback of callbacks) callback(frameTime);
		}
		throw new Error('chart animation did not settle within 100 controlled frames');
	}

	return {
		flush,
		async restore() {
			try {
				// Redux Toolkit can batch one final store notification during chart
				// unmount. Let that queued frame cancel its fallback timer before the
				// animation-frame globals disappear.
				await flush();
			} finally {
				pending.clear();
				vi.unstubAllGlobals();
			}
		},
	};
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

	it('provides fixed responsive dimensions without a measurement pass', async () => {
		const result = mount(ResponsiveChartApp, {});
		await settle();
		const surface = result.container.querySelector('.recharts-surface');
		expect(surface?.getAttribute('width')).toBe('420');
		expect(surface?.getAttribute('height')).toBe('240');
		result.unmount();
	});

	it('renders registered legend and active tooltip content through chart portals', async () => {
		const result = mount(OverlayChartApp, {});
		await settle();
		expect(result.container.querySelector('.recharts-legend-wrapper')).toBeTruthy();
		expect(result.container.querySelector('.recharts-default-legend')).toBeTruthy();
		expect(result.container.querySelector('.recharts-tooltip-wrapper')).toBeTruthy();
		expect(result.container.textContent).toContain('UV');
		result.unmount();
	});

	it('renders area, composed, scatter, funnel, grid, and reference primitives', async () => {
		const result = mount(CartesianChartsApp, {});
		await settle();
		expect(result.container.querySelectorAll('path.recharts-area-area').length).toBe(2);
		expect(result.container.querySelector('path.recharts-line-curve')).toBeTruthy();
		expect(result.container.querySelectorAll('.recharts-scatter-symbol').length).toBe(2);
		expect(result.container.querySelectorAll('.recharts-funnel-trapezoid').length).toBe(2);
		expect(result.container.querySelector('.recharts-cartesian-grid')).toBeTruthy();
		expect(result.container.querySelector('.recharts-reference-line')).toBeTruthy();
		result.unmount();
	});

	it('applies registered Cell presentation props to Scatter points', async () => {
		const result = mount(ScatterCellsApp, {});
		await settle();
		const symbols = result.container.querySelectorAll(
			'.recharts-scatter-symbol path.recharts-symbols',
		);
		expect(symbols).toHaveLength(2);
		expect(Array.from(symbols, (symbol) => symbol.getAttribute('fill'))).toEqual([
			'#ff0000',
			'#0000ff',
		]);
		result.unmount();
	});

	it('keeps hidden Scatter cells registered for the first visible commit', async () => {
		const result = mount(HiddenScatterCellsApp, { hide: true });
		await settle();
		expect(result.container.querySelectorAll('.recharts-scatter-symbol')).toHaveLength(0);

		result.update(HiddenScatterCellsApp, { hide: false });
		const symbols = result.container.querySelectorAll(
			'.recharts-scatter-symbol path.recharts-symbols',
		);
		const fills = Array.from(symbols, (symbol) => symbol.getAttribute('fill'));
		result.unmount();
		expect(fills).toEqual(['#ff0000', '#0000ff']);
	});

	it('renders a zero-valued ErrorBar', async () => {
		const result = mount(ZeroErrorBarApp, {});
		await settle();
		expect(result.container.querySelectorAll('.recharts-errorBar line')).toHaveLength(3);
		result.unmount();
	});

	it('pivots ErrorBar animation around the rendered whisker center', async () => {
		const result = mount(ErrorBarAnimationOriginApp, {});
		await settle();
		const lines = result.container.querySelectorAll<SVGLineElement>('.recharts-errorBar line');
		expect(lines).toHaveLength(3);
		const middleLine = lines[1];
		const x = Number(middleLine.getAttribute('x1'));
		const y = (Number(middleLine.getAttribute('y1')) + Number(middleLine.getAttribute('y2'))) / 2;
		const [originX, originY] = middleLine.style.transformOrigin
			.split(/\s+/)
			.map((value) => Number.parseFloat(value));
		expect(originX).toBeCloseTo(x);
		expect(originY).toBeCloseTo(y);
		result.unmount();
	});

	it.each([
		['isActive', { isActive: false, canBegin: true }],
		['canBegin', { isActive: true, canBegin: false }],
	])(
		'restarts CSS transitions without animating backwards after %s is disabled',
		(_, disabledProps) => {
			const activeProps = { isActive: true, canBegin: true };
			const result = mount(CSSTransitionReactivationApp, activeProps);
			flushEffects();

			result.update(CSSTransitionReactivationApp, disabledProps);
			result.update(CSSTransitionReactivationApp, activeProps);
			const target = result.find('.css-transition-target') as HTMLElement;
			const transition = target.style.transition;
			result.unmount();

			expect(transition).toBe('');
		},
	);

	it('registers Funnel segments in the legend with their names and colors', async () => {
		const result = mount(FunnelLegendApp, {});
		await settle();
		const items = result.container.querySelectorAll('.recharts-legend-item');
		expect(items).toHaveLength(2);
		expect(result.container.textContent).toContain('Visitors');
		expect(result.container.textContent).toContain('Customers');
		expect(result.container.innerHTML).toContain('#ff0000');
		expect(result.container.innerHTML).toContain('#0000ff');
		result.unmount();
	});

	it('keeps hidden Funnel cells and tooltip settings registered without rendering shapes', async () => {
		let tooltipSettings: ReadonlyArray<any> = [];
		const hidden = mount(HiddenFunnelRegistrationsApp, {
			onTooltipSettings(settings: ReadonlyArray<any>) {
				tooltipSettings = settings;
			},
		});
		await settle();
		expect(hidden.container.textContent).toContain('Visitors');
		expect(hidden.container.textContent).toContain('Customers');
		expect(hidden.container.querySelectorAll('.recharts-funnel-trapezoid')).toHaveLength(0);
		expect(hidden.container.querySelector('.funnel-legend-payload')?.textContent).toBe(
			'#0000ff:Customers|#ff0000:Visitors',
		);
		expect(tooltipSettings).toHaveLength(1);
		expect(tooltipSettings[0].settings).toMatchObject({
			dataKey: 'value',
			hide: true,
			graphicalItemId: expect.any(String),
		});
		hidden.unmount();

		const none = mount(FunnelLegendApp, { legendType: 'none' });
		await settle();
		expect(none.container.querySelectorAll('.recharts-legend-item')).toHaveLength(0);
		none.unmount();
	});

	it('forwards Scatter animation lifecycle callbacks', async () => {
		const animationFrames = controlAnimationFrames();
		const starts: string[] = [];
		const ends: string[] = [];
		let result: ReturnType<typeof mount> | undefined;
		try {
			result = mount(ScatterAnimationCallbacksApp, {
				onAnimationStart: () => starts.push('start'),
				onAnimationEnd: () => ends.push('end'),
			});
			await animationFrames.flush();
			expect(starts).toEqual(['start']);
			expect(ends).toEqual(['end']);
		} finally {
			try {
				result?.unmount();
			} finally {
				await animationFrames.restore();
			}
		}
	});

	it('does not restart Funnel animation for equivalent props but propagates presentation changes', async () => {
		const animationFrames = controlAnimationFrames();
		const starts: string[] = [];
		const ends: string[] = [];
		const props = {
			fill: '#8884d8',
			onAnimationStart: () => starts.push('start'),
			onAnimationEnd: () => ends.push('end'),
		};
		let result: ReturnType<typeof mount> | undefined;
		try {
			result = mount(FunnelAnimationStabilityApp, props);
			await animationFrames.flush();
			expect(starts).toEqual(['start']);
			expect(ends).toEqual(['end']);

			result.update(FunnelAnimationStabilityApp, { ...props });
			await animationFrames.flush();
			expect(starts).toEqual(['start']);
			expect(ends).toEqual(['end']);

			result.update(FunnelAnimationStabilityApp, { ...props, fill: '#82ca9d' });
			await animationFrames.flush();
			expect(starts).toEqual(['start', 'start']);
			expect(ends).toEqual(['end', 'end']);
			expect(
				result.container.querySelector('.recharts-funnel-trapezoid path')?.getAttribute('fill'),
			).toBe('#82ca9d');
		} finally {
			try {
				result?.unmount();
			} finally {
				await animationFrames.restore();
			}
		}
	});

	it('renders pie, radar, radial bar, and polar axes', async () => {
		const result = mount(PolarChartsApp, {});
		await settle();
		expect(result.container.querySelectorAll('.recharts-pie-sector').length).toBe(2);
		expect(result.container.querySelector('.recharts-radar-polygon')).toBeTruthy();
		expect(result.container.querySelectorAll('.recharts-radial-bar-sector').length).toBe(2);
		expect(result.container.querySelector('.recharts-polar-grid')).toBeTruthy();
		expect(result.container.querySelector('.recharts-polar-angle-axis')).toBeTruthy();
		expect(result.container.querySelector('.recharts-polar-radius-axis')).toBeTruthy();
		result.unmount();
	});

	it('applies registered Cell presentation props to polar sectors', async () => {
		const result = mount(PolarCellsApp, {});
		await settle();
		const pieSectors = result.container.querySelectorAll(
			'.recharts-pie-sector path.recharts-sector',
		);
		const radialBarSectors = result.container.querySelectorAll('.recharts-radial-bar-sector');
		const pieFills = Array.from(pieSectors, (sector) => sector.getAttribute('fill'));
		const radialBarFills = Array.from(radialBarSectors, (sector) => sector.getAttribute('fill'));
		result.unmount();
		expect(pieFills).toEqual(['#ff0000', '#0000ff']);
		expect(radialBarFills).toEqual(['#ff0000', '#0000ff']);
	});

	it('restarts polar animations only when their geometry changes', async () => {
		const animationFrames = controlAnimationFrames();
		const starts: string[] = [];
		const ends: string[] = [];
		const props = {
			changed: false,
			onAnimationStart: () => starts.push('start'),
			onAnimationEnd: () => ends.push('end'),
		};
		let result: ReturnType<typeof mount> | undefined;
		try {
			result = mount(PolarAnimationStabilityApp, props);
			await animationFrames.flush();
			expect(starts).toHaveLength(3);
			expect(ends).toHaveLength(3);

			result.update(PolarAnimationStabilityApp, { ...props });
			await animationFrames.flush();
			expect(starts).toHaveLength(3);
			expect(ends).toHaveLength(3);

			result.update(PolarAnimationStabilityApp, { ...props, changed: true });
			await animationFrames.flush();
			expect(starts).toHaveLength(6);
			expect(ends).toHaveLength(6);
		} finally {
			try {
				result?.unmount();
			} finally {
				await animationFrames.restore();
			}
		}
	});

	it('registers hidden Pie tooltip data without rendering sectors', async () => {
		const result = mount(HiddenPieTooltipApp, {});
		await settle();
		expect(result.container.querySelectorAll('.recharts-pie-sector')).toHaveLength(0);
		expect(result.container.querySelector('.recharts-tooltip-wrapper')).toBeTruthy();
		expect(result.container.textContent).toContain('Hidden slice');
		expect(result.container.textContent).toContain('100');
		result.unmount();
	});

	it('renders sankey and sunburst hierarchy charts', async () => {
		const result = mount(HierarchyChartsApp, {});
		await settle();
		expect(result.container.querySelectorAll('.recharts-sankey-node').length).toBe(3);
		expect(result.container.querySelectorAll('.recharts-sankey-link').length).toBe(2);
		expect(
			result.container.querySelectorAll('.recharts-sunburst path.recharts-sector').length,
		).toBe(2);
		result.unmount();
	});
});
