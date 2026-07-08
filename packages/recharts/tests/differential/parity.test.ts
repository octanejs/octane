/**
 * Differential parity: the SAME `.tsrx` fixture runs through @octanejs/recharts
 * (octane) AND real recharts (the setup rewrites the import specifiers). The
 * emitted SVG — Surface/Layer structure, every shape's path data, attributes —
 * must be byte-identical. Charts are pure markup, which makes recharts the
 * ideal subject for this rig.
 */
import { describe, it } from 'vitest';
import { resolve } from 'node:path';
import { mountDifferential } from '../../../octane/tests/differential/_rig.js';

const FIXTURE = resolve(__dirname, '../_fixtures/shapes.tsrx');
const CACHE = resolve(__dirname, '.react-cache');

describe('differential: @octanejs/recharts vs real recharts (Phase 0 shapes)', () => {
	it('Surface + Layer + Rectangle/Dot/Cross/Polygon render byte-identical SVG', async () => {
		const d = await mountDifferential(FIXTURE, 'ShapesApp', undefined, CACHE);
		await d.step('mount', () => {});
		d.unmount();
	});
});

const CHARTS_FIXTURE = resolve(__dirname, '../_fixtures/charts.tsrx');

// The chart pipeline is multi-pass on BOTH sides (size effect → axis/item
// registration → offset selectors → final paint, plus a rAF for the store's
// autoBatched notifications) — settle generously before comparing.
async function settleCharts() {
	for (let i = 0; i < 12; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => requestAnimationFrame(() => r(undefined)));
	}
}

describe('differential: @octanejs/recharts vs real recharts (Phase 1 charts)', () => {
	it('static BarChart with axes renders byte-identical SVG', async () => {
		const d = await mountDifferential(CHARTS_FIXTURE, 'BarChartApp', undefined, CACHE);
		await d.step('settled', settleCharts);
		d.unmount();
	});

	it('static LineChart with axes renders byte-identical SVG', async () => {
		const d = await mountDifferential(CHARTS_FIXTURE, 'LineChartApp', undefined, CACHE);
		await d.step('settled', settleCharts);
		d.unmount();
	});
});
