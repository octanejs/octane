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
// autoBatched notifications) — settle before comparing. A fixed round count
// flaked on slow CI runners (the diff-assert ran mid-settle), so this settles
// CONDITIONALLY: at least 12 rounds, then until both sides' DOM has been
// stable for 3 consecutive rounds, bounded by a deadline (on timeout the
// step's diff-assert reports whatever state was reached).
async function settleCharts(
	i: { container: HTMLElement },
	r: { container: HTMLElement },
): Promise<void> {
	const deadline = Date.now() + 20_000;
	let previousOctane = '';
	let previousReact = '';
	let stableRounds = 0;
	for (let round = 0; round < 12 || stableRounds < 3; round++) {
		await new Promise((res) => setTimeout(res, 0));
		await new Promise((res) => requestAnimationFrame(() => res(undefined)));
		const octane = i.container.innerHTML;
		const react = r.container.innerHTML;
		stableRounds = octane === previousOctane && react === previousReact ? stableRounds + 1 : 0;
		previousOctane = octane;
		previousReact = react;
		if (Date.now() > deadline) break;
	}
}

// Both chart implementations use Redux Toolkit's rAF auto-batching. Unmounting
// unregisters chart state and queues one final notification; let that frame run
// before Vitest tears down jsdom and removes the animation-frame globals.
async function unmountCharts(d: { unmount(): void }): Promise<void> {
	d.unmount();
	await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

describe('differential: @octanejs/recharts vs real recharts (Phase 1 charts)', () => {
	it('static BarChart with axes renders byte-identical SVG', async () => {
		const d = await mountDifferential(CHARTS_FIXTURE, 'BarChartApp', undefined, CACHE);
		await d.step('settled', settleCharts);
		await unmountCharts(d);
	});

	it('static LineChart with axes renders byte-identical SVG', async () => {
		const d = await mountDifferential(CHARTS_FIXTURE, 'LineChartApp', undefined, CACHE);
		await d.step('settled', settleCharts);
		await unmountCharts(d);
	});
});
