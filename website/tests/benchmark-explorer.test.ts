// The benchmark explorer's two linked views over the checked-in ×-vs-Octane
// matrix (HOME_SUMMARY). These drive the interactive views the way a
// reader does: choosing frameworks and a suite for the bar chart, re-baselining
// the heatmap, and hovering for the custom tooltip. SSR parity is covered by
// the real-browser suite; here we assert the client behavior.
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@octanejs/testing-library';
import { BenchmarkExplorer } from '../src/components/BenchmarkExplorer.tsrx';
import { HOME_SUMMARY } from '../src/content/home-benchmark.ts';

afterEach(cleanup);

async function mountExplorer() {
	const utils = render(BenchmarkExplorer as any, { props: { card: HOME_SUMMARY } });
	// The plot is present from the first render; waitFor also flushes the test
	// renderer before the interaction assertions below.
	await waitFor(() => expect(utils.container.querySelector('.bx-plot')).toBeTruthy());
	const { container } = utils;
	const barLabels = () =>
		Array.from(container.querySelectorAll('.bx-row-label')).map((el) => el.textContent!.trim());
	const chip = (label: string) =>
		Array.from(container.querySelectorAll<HTMLButtonElement>('.bx-chip')).find((b) =>
			b.textContent!.includes(label),
		)!;
	const seg = (label: string) =>
		Array.from(container.querySelectorAll<HTMLButtonElement>('.bx-seg-btn')).find(
			(b) => b.textContent!.trim() === label,
		)!;
	return { ...utils, container, barLabels, chip, seg };
}

describe('benchmark explorer — bar chart', () => {
	it('sorts bars fastest-first, so Octane (1×) leads the default suite', async () => {
		const { barLabels } = await mountExplorer();
		// js-framework (the first suite) has every framework present; Octane is 1×,
		// the lowest, so it sorts to the top.
		expect(barLabels()[0]).toBe('Octane (.tsrx)');
		expect(barLabels()).toContain('React 19');
	});

	it('drops a framework from the chart when its chip is toggled off', async () => {
		const { barLabels, chip } = await mountExplorer();
		expect(barLabels()).toContain('React 19');
		const before = barLabels().length;

		fireEvent.click(chip('React 19'));

		await waitFor(() => expect(barLabels()).not.toContain('React 19'));
		expect(barLabels().length).toBe(before - 1);
	});
});

describe('benchmark explorer — heatmap', () => {
	it('excludes null cells from the grid, rendering them as "—"', async () => {
		const { container } = await mountExplorer();
		// HOME_SUMMARY has three gaps: async-waterfall/Vue, streaming-ssr/Svelte,
		// streaming-ssr/Vue. They render as neutral "—" cells, not colored ones.
		const nullCells = container.querySelectorAll('.bx-cell-null');
		expect(nullCells.length).toBe(3);
		nullCells.forEach((cell) => expect(cell.textContent!.trim()).toBe('—'));
	});

	it('re-baselines each row to its fastest framework in "vs fastest" mode', async () => {
		const { container, seg } = await mountExplorer();
		// Mode A: no per-row winner is outlined.
		expect(container.querySelectorAll('.bx-cell-fastest').length).toBe(0);

		fireEvent.click(seg('vs fastest'));

		// Mode B: every suite row now has exactly one outlined 1× winner.
		await waitFor(() => expect(container.querySelectorAll('.bx-cell-fastest').length).toBe(15));
		container
			.querySelectorAll('.bx-cell-fastest')
			.forEach((cell) => expect(cell.textContent!.trim()).toBe('1×'));
	});
});

describe('benchmark explorer — custom tooltip', () => {
	it('shows framework, suite and value on hover of a heatmap cell', async () => {
		const { container } = await mountExplorer();
		expect(container.querySelector('.bx-tip')).toBeNull();

		const cell = container.querySelector('.bx-cell:not(.bx-cell-null):not(.bx-cell-ref)')!;
		fireEvent.mouseEnter(cell);

		const tip = await waitFor(() => {
			const el = container.querySelector('.bx-tip');
			expect(el).toBeTruthy();
			return el!;
		});
		// The custom tooltip names the framework and reports a ×-vs-Octane value —
		// never a native title attribute.
		expect(tip.querySelector('.bx-tip-fw')!.textContent!.length).toBeGreaterThan(0);
		expect(tip.textContent).toContain('vs Octane');
		expect(cell.hasAttribute('title')).toBe(false);
	});
});
