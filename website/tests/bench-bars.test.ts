// The benchmark card's bar view: one horizontal bar per framework for the
// picked operation, driven the way a reader does — picking operations and
// reading the ranked bars. Route-level structure is covered by smoke.test.ts;
// here we assert the interactive behavior of a single card.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { BenchBars } from '../src/components/BenchBars.tsrx';
import { FRAMEWORK_CARDS, OCTANE_CARDS, type BenchCard } from '../src/content/benchmarks.ts';

afterEach(cleanup);

async function mountCard(card: BenchCard) {
	const utils = render(BenchBars as any, { props: { card } });
	await waitFor(() => expect(utils.container.querySelector('.bench-plot')).toBeTruthy());
	const { container } = utils;
	const barLabels = () =>
		Array.from(container.querySelectorAll('.bench-row:not(.bench-row-empty) .bench-row-label')).map(
			(el) => el.textContent!.trim(),
		);
	const barValues = () =>
		Array.from(container.querySelectorAll('.bench-row:not(.bench-row-empty) .bench-val')).map(
			(el) => parseFloat(el.textContent!.trim()),
		);
	const opButton = (op: string) =>
		Array.from(container.querySelectorAll<HTMLButtonElement>('.bench-op')).find(
			(b) => b.textContent!.trim() === op,
		)!;
	return { ...utils, container, barLabels, barValues, opButton };
}

function numericSeries(card: BenchCard, opIndex: number) {
	const row = card.rows[opIndex];
	return card.series.filter((series) => typeof row[series.key] === 'number');
}

function fastestSeries(card: BenchCard, opIndex: number) {
	const row = card.rows[opIndex];
	return numericSeries(card, opIndex).reduce((best, series) =>
		(row[series.key] as number) < (row[best.key] as number) ? series : best,
	);
}

describe('benchmark card bars', () => {
	// js-framework: every framework measured on every operation.
	const card = FRAMEWORK_CARDS[0];

	it('keeps DOM-node census operations out of js-framework benchmark charts', async () => {
		const nodeOperations = [
			'nodes_1k',
			'elements_1k',
			'text_1k',
			'comments_1k',
			'empty_text_1k',
			'whitespace_text_1k',
		];
		const deoptCard = OCTANE_CARDS.find((candidate) => candidate.id === 'js-framework-deopt')!;

		for (const benchmark of [card, deoptCard]) {
			const { container, unmount } = await mountCard(benchmark);
			const operations = Array.from(container.querySelectorAll('.bench-op'), (button) =>
				button.textContent!.trim(),
			);

			expect(operations).toContain('run');
			for (const operation of nodeOperations) expect(operations).not.toContain(operation);
			unmount();
		}
	});

	it('opens on the overall summary: one ranked geomean bar per framework', async () => {
		const { container, barLabels, barValues, opButton } = await mountCard(card);

		expect(opButton('overall').getAttribute('aria-pressed')).toBe('true');
		// js-framework measures every framework on every operation, so every
		// series earns an overall bar, charted as a ×-vs-Octane ratio.
		expect(barLabels()).toHaveLength(card.series.length);
		const valueTexts = Array.from(container.querySelectorAll('.bench-val'), (el) =>
			el.textContent!.trim(),
		);
		valueTexts.forEach((text) => expect(text).toMatch(/×$/));
		const values = barValues();
		expect(values.length).toBeGreaterThan(1);
		expect(values).toEqual([...values].sort((a, b) => a - b));
	});

	it('keeps Octane-only diagnostics out of the cross-framework operation picker', async () => {
		const { container } = await mountCard(card);
		const operations = Array.from(container.querySelectorAll('.bench-op'), (button) =>
			button.textContent?.trim(),
		);

		expect(operations).toContain('run');
		expect(operations).toContain('clear');
		for (const diagnostic of ['live_inserts_1k', 'fragment_commits_1k', 'production_calls_1k']) {
			expect(operations).not.toContain(diagnostic);
		}
	});

	it('identifies compiled React in both the chart and its accessible data table', async () => {
		const { container, barLabels } = await mountCard(card);

		expect(barLabels()).toContain('React + Compiler');
		expect(
			Array.from(container.querySelectorAll('thead th'), (header) => header.textContent?.trim()),
		).toContain('React 19 + Compiler');
	});

	it('distinguishes compiled React from the memo-wall uncompiled control', async () => {
		const memoWall = FRAMEWORK_CARDS.find((candidate) => candidate.id === 'memo-wall')!;
		const { container, barLabels } = await mountCard(memoWall);

		expect(barLabels()).toContain('React + Compiler');
		expect(barLabels()).toContain('React (uncompiled)');
		expect(
			Array.from(container.querySelectorAll('thead th'), (header) => header.textContent?.trim()),
		).toContain('React 19 (uncompiled control)');
	});

	it('re-charts the bars when an operation is picked', async () => {
		const target = 1;
		const targetOp = card.rows[target].op as string;
		const { barLabels, barValues, opButton } = await mountCard(card);

		expect(opButton(targetOp).getAttribute('aria-pressed')).toBe('false');
		fireEvent.click(opButton(targetOp));

		await waitFor(() => expect(opButton(targetOp).getAttribute('aria-pressed')).toBe('true'));
		expect(opButton('overall').getAttribute('aria-pressed')).toBe('false');
		expect(barLabels()).toHaveLength(numericSeries(card, target).length);
		expect(fastestSeries(card, target).label.startsWith(barLabels()[0])).toBe(true);
		const values = barValues();
		expect(values).toEqual([...values].sort((a, b) => a - b));
	});

	it('renders unmeasured frameworks as muted "—" rows, not bars', async () => {
		// bundle-size contains both Vue target keys because the weather fixture
		// uses `vue` while the other fixture bundles use `vue-vapor`. Each row
		// therefore has one deliberately unmeasured Vue series.
		const bundleSize = FRAMEWORK_CARDS.find((c) => c.id === 'bundle-size')!;
		const gapIndex = bundleSize.rows.findIndex((row) =>
			bundleSize.series.some((series) => typeof row[series.key] !== 'number'),
		);
		expect(gapIndex).toBeGreaterThanOrEqual(0);
		const gapOp = bundleSize.rows[gapIndex].op as string;
		const { container, barLabels, opButton } = await mountCard(bundleSize);

		fireEvent.click(opButton(gapOp));

		await waitFor(() => expect(opButton(gapOp).getAttribute('aria-pressed')).toBe('true'));
		expect(barLabels()).toHaveLength(numericSeries(bundleSize, gapIndex).length);
		const empty = container.querySelectorAll('.bench-row-empty');
		expect(empty).toHaveLength(
			bundleSize.series.length - numericSeries(bundleSize, gapIndex).length,
		);
		empty.forEach((row) => expect(row.querySelector('.bench-val')!.textContent!.trim()).toBe('—'));
	});

	it('extends a bundle-size bar to its whole-API ceiling only where tree-shaking leaves a gap', async () => {
		const bundleSize = FRAMEWORK_CARDS.find((c) => c.id === 'bundle-size')!;
		const { container, opButton } = await mountCard(bundleSize);
		const bar = (key: string) =>
			container.querySelector(`.bench-row:not(.bench-row-empty)[data-series="${key}"]`)!;

		// React and Inferno ship their whole runtime in every fixture, so a
		// separately built ceiling only differs by build noise (sometimes below the
		// fixture, as in weather) and must never draw a range.
		const ranged = new Set<string>();
		for (const [index, row] of bundleSize.rows.entries()) {
			fireEvent.click(opButton(row.op as string));
			await waitFor(() =>
				expect(opButton(row.op as string).getAttribute('aria-pressed')).toBe('true'),
			);
			for (const series of numericSeries(bundleSize, index)) {
				const label = bar(series.key).querySelector('.bench-val')!.textContent!;
				const range = bar(series.key).querySelector<HTMLElement>('.bench-fill-range');
				if (range) {
					ranged.add(series.key);
					expect(parseFloat(range.style.width), `${row.op}/${series.key}`).toBeGreaterThan(0);
					const [low, high] = label.split('–').map((part) => parseFloat(part));
					expect(high, `${row.op}/${series.key}`).toBeGreaterThan(low);
				} else {
					expect(label, `${row.op}/${series.key}`).not.toContain('–');
				}
			}
		}
		expect(ranged.has('react')).toBe(false);
		expect(ranged.has('inferno')).toBe(false);
		for (const key of ['octane-tsrx', 'preact', 'solid', 'svelte']) {
			expect(ranged.has(key), key).toBe(true);
		}
		// The exact ceilings stay readable without the hatching.
		const tableRows = Array.from(container.querySelectorAll('tbody th'), (th) =>
			th.textContent!.trim(),
		);
		expect(tableRows).toContain(bundleSize.rows[0].op + ', whole client API');
	});

	it('charts a single-series card as one bar per operation, with no picker', async () => {
		const single = OCTANE_CARDS.find((c) => c.series.length === 1)!;
		const { container, barLabels } = await mountCard(single);

		expect(container.querySelector('.bench-op')).toBeNull();
		expect(barLabels()).toEqual(
			single.rows
				.filter((row) => typeof row[single.series[0].key] === 'number')
				.map((row) => row.op as string)
				.sort(
					(a, b) =>
						(single.rows.find((r) => r.op === a)![single.series[0].key] as number) -
						(single.rows.find((r) => r.op === b)![single.series[0].key] as number),
				),
		);
	});
});
