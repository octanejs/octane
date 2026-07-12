/**
 * Dynamic measurement + directDomUpdates conformance. Sizes flow through the
 * PUBLIC measureElement option (upstream's own harness technique); the default
 * measureElement codepath is covered once via a getBoundingClientRect
 * prototype swap (motion precedent, save/restore).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import {
	DynamicList,
	DefaultMeasureList,
	DirectList,
	renders,
	captured,
} from '../_fixtures/list-dynamic.tsrx';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

const origGetRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
	renders.direct = 0;
	captured.instance = undefined;
});

afterEach(() => {
	Element.prototype.getBoundingClientRect = origGetRect;
});

describe('measureElement option', () => {
	it('measures rendered items via data-size (refs attach before _willUpdate)', async () => {
		// Also pins the commit ordering: measureElement refs must be attached
		// before the layout-effect pass reads the elementsCache — the FIRST
		// settled frame already shows measured (not estimated) sizes.
		const r = mount(DynamicList, {});
		await flush();
		const items = captured.instance.getVirtualItems();
		// Sizes cycle 20/30/40 by index.
		expect(items[0].size).toBe(20);
		expect(items[1].size).toBe(30);
		expect(items[2].size).toBe(40);
		// Positions are prefix sums of the MEASURED sizes.
		expect(items[1].start).toBe(20);
		expect(items[2].start).toBe(50);
		expect(items[3].start).toBe(90);
		// Rendered transform matches.
		const row2 = r.findAll('.drow')[2] as HTMLElement;
		expect(row2.style.transform).toBe('translateY(50px)');
		r.unmount();
	});

	it('resizeItem shifts downstream starts and the total size', async () => {
		const r = mount(DynamicList, {});
		await flush();
		const before = captured.instance.getVirtualItems();
		const start4Before = before.find((i: any) => i.index === 4)!.start;
		const totalBefore = captured.instance.getTotalSize();

		r.click('#resize-3'); // item 3: measured 20 → 100 (+80)
		await flush();
		const after = captured.instance.getVirtualItems();
		expect(after.find((i: any) => i.index === 4)!.start).toBe(start4Before + 80);
		expect(captured.instance.getTotalSize()).toBe(totalBefore + 80);
		r.unmount();
	});

	it('measure() drops the cache back to estimates', async () => {
		const r = mount(DynamicList, {});
		await flush();
		r.click('#resize-3');
		await flush();
		expect(captured.instance.getTotalSize()).toBeGreaterThan(1000);

		// measure() clears the measurement cache; with the no-op RO and refs
		// already attached nothing re-measures, so sizes fall back to the
		// estimate (20 × 50 = 1000) — same on React (differential F3 pins it).
		r.click('#measure-all');
		await flush();
		expect(captured.instance.getTotalSize()).toBe(1000);
		r.unmount();
	});

	it('measures newly revealed items on a programmatic scroll', async () => {
		// scrollToOffset sets core's scrollState, so items revealed by the
		// scroll measure IMMEDIATELY at ref time. (A natural scroll defers
		// measurement while isScrolling and relies on ResizeObserver to land it
		// afterwards — inert under the no-op RO stub, identically on React.)
		const r = mount(DynamicList, {});
		await flush();

		r.click('#scroll-200');
		// Measurement cascades: each measured item shifts positions and can
		// reveal another tail item — flush until stable (bounded).
		for (let i = 0; i < 6; i++) await flush();
		const items = captured.instance.getVirtualItems();
		for (const item of items) {
			expect(item.size).toBe(20 + (item.index % 3) * 10);
		}
		r.unmount();
	});
});

describe('default measureElement codepath', () => {
	it('reads element offsetHeight when no measureElement option is given', async () => {
		// virtual-core 3.17.3's default measureElement falls back to
		// offsetWidth/offsetHeight (no RO entry in jsdom) — stub the prototype
		// getter for the duration of this test (motion save/restore precedent).
		const orig = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
		Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
			configurable: true,
			get: () => 35,
		});
		try {
			const r = mount(DefaultMeasureList, {});
			await flush();
			const items = captured.instance.getVirtualItems();
			expect(items[0].size).toBe(35);
			expect(items[1].start).toBe(35);
			r.unmount();
		} finally {
			if (orig) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', orig);
			else delete (HTMLElement.prototype as any).offsetHeight;
		}
	});
});

describe('directDomUpdates', () => {
	it('writes container size + item transforms directly; skips re-renders for range-stable scrolls', async () => {
		const r = mount(DirectList, {});
		await flush();
		// Container size written by containerRef/applyDirectStyles, not JSX.
		expect((r.find('#dd-sizer') as HTMLElement).style.height).toBe('2500px'); // 50 × 50
		// Item transforms written directly (translate3d form).
		const row1 = r.findAll('.ddrow')[1] as HTMLElement;
		expect(row1.style.transform).toBe('translate3d(0, 50px, 0)');

		r.click('#dd-scroll-30'); // range 0–4 → 0–5 + isScrolling flip → re-render
		await flush();
		const afterFirst = renders.direct;

		r.click('#dd-scroll-40'); // same range, still scrolling → BAIL, no re-render
		await flush();
		expect(renders.direct).toBe(afterFirst);

		r.click('#dd-scroll-500'); // range change → re-render, new items positioned
		await flush();
		expect(renders.direct).toBeGreaterThan(afterFirst);
		const row10 = r
			.findAll('.ddrow')
			.find((el) => el.getAttribute('data-index') === '10') as HTMLElement;
		expect(row10.style.transform).toBe('translate3d(0, 500px, 0)');
		r.unmount();
	});
});
