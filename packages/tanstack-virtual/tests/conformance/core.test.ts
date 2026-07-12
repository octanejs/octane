/**
 * @octanejs/tanstack-virtual core conformance — the useVirtualizer wiring
 * through octane's render path, against the REAL @tanstack/virtual-core.
 * Ports upstream react-virtual's tests/index.test.tsx behaviors (should
 * render / overscan / rangeExtractor / count change / height change) and adds
 * the octane-specific matrix (instance stability, flushSync degradation,
 * getVirtualItems identity, unmount detach).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { BasicList, HorizontalList, renders, captured } from '../_fixtures/list-basic.tsrx';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

const indices = (r: ReturnType<typeof mount>) =>
	r.findAll('.row').map((el) => Number(el.getAttribute('data-index')));

beforeEach(() => {
	renders.list = 0;
	captured.instance = undefined;
	captured.rectCb = undefined;
	captured.scrollEl = undefined;
	captured.onChangeArgs.length = 0;
});

describe('core (ports of upstream index.test.tsx)', () => {
	it('renders the initial window from initialRect + rect observer + estimateSize', async () => {
		// Per react-virtual tests/index.test.tsx "should render": viewport 200,
		// size 50, default overscan 1 → rows 0–4, row 5 absent.
		const r = mount(BasicList, {});
		await flush();
		expect(indices(r)).toEqual([0, 1, 2, 3, 4]);
		expect(r.findAll('.row')[0].textContent).toBe('Row 0');
		r.unmount();
	});

	it('mounts with exactly two renders (initial + rect-notify)', async () => {
		// Per upstream's render-count pin (renderer called 2x).
		const r = mount(BasicList, {});
		await flush();
		expect(renders.list).toBe(2);
		r.unmount();
	});

	it('honors overscan: 0', async () => {
		// Per upstream "should render with overscan".
		const r = mount(BasicList, { overscan: 0 });
		await flush();
		expect(indices(r)).toEqual([0, 1, 2, 3]);
		r.unmount();
	});

	it('honors a custom rangeExtractor', async () => {
		// Per upstream "should use rangeExtractor".
		const r = mount(BasicList, { rangeExtractor: () => [0, 1] });
		await flush();
		expect(indices(r)).toEqual([0, 1]);
		r.unmount();
	});

	it('re-windows on count change', async () => {
		// Per upstream "should handle count change" (10 ⇄ 200 via #count-swap).
		const r = mount(BasicList, { count: 10 });
		await flush();
		expect(captured.instance.getTotalSize()).toBe(500);

		r.click('#count-swap');
		await flush();
		expect(captured.instance.options.count).toBe(200);
		expect(captured.instance.getTotalSize()).toBe(10000);
		r.unmount();
	});

	it('re-windows on viewport size change (captured rect-cb re-invoke)', async () => {
		// Per upstream "should handle height change".
		const r = mount(BasicList, {});
		await flush();
		expect(indices(r)).toEqual([0, 1, 2, 3, 4]);

		captured.rectCb!({ width: 200, height: 400 });
		await flush();
		expect(indices(r)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]); // 8 visible + overscan

		captured.rectCb!({ width: 200, height: 200 });
		await flush();
		expect(indices(r)).toEqual([0, 1, 2, 3, 4]);
		r.unmount();
	});
});

describe('state wiring + scrolling', () => {
	it('keeps the virtualizer instance stable across unrelated re-renders', async () => {
		const r = mount(BasicList, {});
		await flush();
		const first = captured.instance;

		r.click('#bump');
		await flush();
		expect(captured.instance).toBe(first);
		r.unmount();
	});

	it('getTotalSize() = count × estimateSize', async () => {
		const r = mount(BasicList, {});
		await flush();
		expect(captured.instance.getTotalSize()).toBe(200 * 50);
		r.unmount();
	});

	it('scroll shifts the window at both edges and back', async () => {
		const r = mount(BasicList, {});
		await flush();

		r.click('#scroll-500');
		await flush();
		// offset 500 / size 50 → visible 10–13, +overscan 1 → 9–14.
		expect(indices(r)).toEqual([9, 10, 11, 12, 13, 14]);

		r.click('#scroll-0');
		await flush();
		expect(indices(r)).toEqual([0, 1, 2, 3, 4]);
		r.unmount();
	});

	it('positions items at start = index × size (API and rendered transform)', async () => {
		const r = mount(BasicList, {});
		await flush();
		const items = captured.instance.getVirtualItems();
		for (const item of items) expect(item.start).toBe(item.index * 50);

		const rows = r.findAll('.row') as HTMLElement[];
		expect(rows[2].style.transform).toBe('translateY(100px)');
		r.unmount();
	});

	it('scrollToOffset lands via the scrollTo shim', async () => {
		const r = mount(BasicList, {});
		await flush();

		captured.instance.scrollToOffset(500);
		await flush();
		expect((r.find('#scroller') as HTMLElement).scrollTop).toBe(500);
		expect(captured.instance.scrollOffset).toBe(500);
		expect(indices(r)).toEqual([9, 10, 11, 12, 13, 14]);
		r.unmount();
	});

	it('scrollToIndex aligns start and center', async () => {
		const r = mount(BasicList, {});
		await flush();
		const scroller = r.find('#scroller') as HTMLElement;

		captured.instance.scrollToIndex(40, { align: 'start' });
		await settle(60); // rAF reconcile pass
		await flush();
		expect(scroller.scrollTop).toBe(40 * 50);
		expect(indices(r)).toContain(40);

		const [centerOffset] = captured.instance.getOffsetForIndex(80, 'center');
		captured.instance.scrollToIndex(80, { align: 'center' });
		await settle(60);
		await flush();
		expect(scroller.scrollTop).toBe(centerOffset);
		expect(indices(r)).toContain(80);
		r.unmount();
	});

	it('preserves getVirtualItems() identity across unrelated re-renders', async () => {
		const r = mount(BasicList, {});
		await flush();
		const before = captured.instance.getVirtualItems();

		r.click('#bump');
		await flush();
		// Unrelated re-render: setOptions re-ran but no memo key changed.
		expect(captured.instance.getVirtualItems()).toBe(before);

		r.click('#scroll-500');
		await flush();
		// Range changed → fresh array.
		expect(captured.instance.getVirtualItems()).not.toBe(before);
		r.unmount();
	});

	it('passes (instance, sync) through to the user onChange', async () => {
		const r = mount(BasicList, { isScrollingResetDelay: 5 });
		await flush();
		captured.onChangeArgs.length = 0;

		r.click('#scroll-500');
		await settle(50); // past the isScrolling reset
		await flush();
		// Scroll notify is sync; the isScrolling reset after the delay is not.
		expect(captured.onChangeArgs[0]).toEqual({ sync: true });
		expect(captured.onChangeArgs[captured.onChangeArgs.length - 1]).toEqual({ sync: false });
		r.unmount();
	});

	it('sync scroll update inside a discrete-event flush still lands (flushSync degradation)', async () => {
		// #scroll-500's onClick dispatches the scroll event synchronously INSIDE
		// octane's click flush → core notifies sync=true → the adapter's
		// flushSync(rerender) hits octane's re-entrancy guard and degrades to a
		// plain dispatch drained by the ambient flush. The window must still be
		// updated once the click settles.
		const r = mount(BasicList, {});
		await flush();

		r.click('#scroll-500'); // r.click itself wraps in flushSync
		expect(indices(r)).toEqual([9, 10, 11, 12, 13, 14]); // already landed, pre-settle
		r.unmount();
	});

	it('flips isScrolling true, then resets after isScrollingResetDelay', async () => {
		const r = mount(BasicList, { isScrollingResetDelay: 5 });
		await flush();

		r.click('#scroll-500');
		expect(captured.instance.isScrolling).toBe(true);
		await settle(50);
		expect(captured.instance.isScrolling).toBe(false);
		r.unmount();
	});

	it('detaches listeners on unmount (no onChange, no throw)', async () => {
		const r = mount(BasicList, {});
		await flush();
		const el = r.find('#scroller');
		r.unmount();

		// Drain isScrolling-reset timers from EARLIER tests (default 150ms —
		// they can outlive their test's unmount and push into the shared
		// captured log) before asserting silence.
		await settle(200);
		captured.onChangeArgs.length = 0;
		el.scrollTop = 300;
		el.dispatchEvent(new Event('scroll'));
		await flush();
		expect(captured.onChangeArgs).toEqual([]);
	});
});

describe('horizontal', () => {
	it('windows by width and shifts on scrollLeft', async () => {
		const r = mount(HorizontalList, {});
		await flush();
		const cols = () => r.findAll('.hcol').map((el) => Number(el.getAttribute('data-index')));
		// viewport width 200 / size 50 → cols 0–4 (overscan 1).
		expect(cols()).toEqual([0, 1, 2, 3, 4]);
		expect((r.findAll('.hcol')[1] as HTMLElement).style.transform).toBe('translateX(50px)');

		r.click('#hscroll-300');
		await flush();
		// offset 300 / 50 → visible 6–9, +overscan → 5–10.
		expect(cols()).toEqual([5, 6, 7, 8, 9, 10]);
		r.unmount();
	});
});
