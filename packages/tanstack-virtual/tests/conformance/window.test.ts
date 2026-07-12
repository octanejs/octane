/**
 * useWindowVirtualizer conformance — the DEFAULT observeWindowRect path runs
 * unmocked (jsdom window is natively 1024×768); window scroll is driven by
 * redefining window.scrollY and dispatching a scroll event.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import { WindowList, captured } from '../_fixtures/list-window.tsrx';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

function setWindowScrollY(value: number) {
	Object.defineProperty(window, 'scrollY', { value, configurable: true });
}

const indices = (r: ReturnType<typeof mount>) =>
	r.findAll('.wrow').map((el) => Number(el.getAttribute('data-index')));

beforeEach(() => {
	captured.instance = undefined;
	setWindowScrollY(0);
});

afterEach(() => {
	setWindowScrollY(0);
});

describe('useWindowVirtualizer', () => {
	it('windows from the native 1024×768 jsdom viewport', async () => {
		const r = mount(WindowList, {});
		await flush();
		// 768 / 50 → rows 0–15 visible, +overscan 1 → 0–16.
		expect(indices(r)).toEqual(Array.from({ length: 17 }, (_, i) => i));
		r.unmount();
	});

	it('shifts the window on window scroll', async () => {
		const r = mount(WindowList, {});
		await flush();

		setWindowScrollY(500);
		window.dispatchEvent(new Event('scroll'));
		await flush();
		// offset 500 → visible 10–25, +overscan → 9–26.
		expect(indices(r)[0]).toBe(9);
		expect(indices(r)[indices(r).length - 1]).toBe(26);
		r.unmount();
	});

	it('honors initialOffset on mount (no scroll event needed)', async () => {
		const r = mount(WindowList, { initialOffset: 500 });
		await flush();
		expect(captured.instance.scrollOffset).toBe(500);
		expect(indices(r)[0]).toBe(9);
		r.unmount();
	});
});
