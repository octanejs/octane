/**
 * @octanejs/zustand conformance — the binding (`create` + `useStore`) layered on
 * octane's `useSyncExternalStore`, exercised against the REAL zustand vanilla
 * store. Mirrors the observable behaviors of zustand's React binding: selectors
 * subscribe, the snapshot bails out on Object.is-equal slices, multiple
 * selectors / stores stay independent, and unmount unsubscribes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from '@octanejs/zustand';
import { mount, nextPaint } from '../_helpers';
import {
	useCounter,
	useFish,
	CountOnly,
	Whole,
	Doubled,
	Both,
	Reader,
} from '../_fixtures/stores.tsrx';

beforeEach(() => {
	// Reset module-level stores between tests (merge — keeps the actions).
	useCounter.setState({ count: 0, other: 0 });
	useFish.setState({ n: 100 });
});

describe('basic selection + updates', () => {
	it('renders the initial selected slice', () => {
		const r = mount(CountOnly, { onRender: () => {} });
		expect(r.find('#count').textContent).toBe('0');
		r.unmount();
	});

	it('re-renders when the selected slice changes (function updater)', async () => {
		const r = mount(CountOnly, { onRender: () => {} });
		r.click('#inc');
		await nextPaint();
		expect(r.find('#count').textContent).toBe('1');
		r.unmount();
	});

	it('reflects imperative setState (partial merge)', async () => {
		const r = mount(CountOnly, { onRender: () => {} });
		useCounter.setState({ count: 5 });
		await nextPaint();
		expect(r.find('#count').textContent).toBe('5');
		r.unmount();
	});
});

describe('selector snapshot bail-out (useSyncExternalStore contract)', () => {
	it('does NOT re-render when an unrelated slice changes', async () => {
		let renders = 0;
		const r = mount(CountOnly, { onRender: () => renders++ });
		const afterMount = renders;
		expect(afterMount).toBeGreaterThan(0);

		// `other` changes; CountOnly selects only `count` (+ stable actions) → all
		// snapshots Object.is-equal → no re-render.
		r.click('#incOther');
		await nextPaint();
		expect(r.find('#count').textContent).toBe('0');
		expect(renders).toBe(afterMount);

		// `count` changes → exactly one more render.
		r.click('#inc');
		await nextPaint();
		expect(r.find('#count').textContent).toBe('1');
		expect(renders).toBe(afterMount + 1);
		r.unmount();
	});
});

describe('no-selector (whole state) subscription', () => {
	it('subscribes to the whole state and updates on any change', async () => {
		const r = mount(Whole);
		expect(r.find('#whole').textContent).toBe('0/0');
		useCounter.getState().inc();
		await nextPaint();
		expect(r.find('#whole').textContent).toBe('1/0');
		useCounter.getState().incOther();
		await nextPaint();
		expect(r.find('#whole').textContent).toBe('1/1');
		r.unmount();
	});
});

describe('derived selector', () => {
	it('renders a computed slice and tracks it', async () => {
		const r = mount(Doubled);
		expect(r.find('#double').textContent).toBe('0');
		useCounter.setState({ count: 3 });
		await nextPaint();
		expect(r.find('#double').textContent).toBe('6');
		r.unmount();
	});
});

describe('multiple independent stores in one component', () => {
	it('keeps two distinct stores from cross-talking', async () => {
		const r = mount(Both);
		expect([r.find('#c').textContent, r.find('#f').textContent]).toEqual(['0', '100']);
		r.click('#c');
		await nextPaint();
		expect([r.find('#c').textContent, r.find('#f').textContent]).toEqual(['1', '100']);
		r.click('#f');
		r.click('#f');
		await nextPaint();
		expect([r.find('#c').textContent, r.find('#f').textContent]).toEqual(['1', '102']);
		r.unmount();
	});
});

describe('unsubscribe on unmount', () => {
	it('adds a store listener on mount and removes it on unmount', async () => {
		// Wrap a vanilla store's `subscribe` to track the live listener count.
		let live = 0;
		const api = createStore(() => ({ n: 0 }));
		const realSubscribe = api.subscribe.bind(api);
		api.subscribe = (listener: () => void) => {
			live++;
			const unsub = realSubscribe(listener);
			return () => {
				live--;
				unsub();
			};
		};

		const r = mount(Reader, { api });
		await nextPaint();
		expect(r.find('#n').textContent).toBe('0');
		expect(live).toBe(1);

		r.unmount();
		await nextPaint();
		expect(live).toBe(0);
	});
});
