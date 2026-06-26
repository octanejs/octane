/**
 * Conformance for the surface beyond the core binding: `useShallow` (`/shallow`),
 * middleware (`/middleware`), store-swap re-subscription, and the unstable-selector
 * divergence from React. Driven by the review of the port (find → verify).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from '@octanejs/zustand';
import { subscribeWithSelector } from '@octanejs/zustand/middleware';
import { shallow } from '@octanejs/zustand/shallow';
import { mount, nextPaint } from '../_helpers';
import { useObj, RawObject, ShallowObject } from '../_fixtures/shallow.tsrx';
import { useCombined, CombinedView } from '../_fixtures/middleware.tsrx';
import { Reader } from '../_fixtures/stores.tsrx';

beforeEach(() => {
	useObj.setState({ a: 0, b: 0 });
	useCombined.setState({ count: 0 });
});

describe('useShallow (object-slice selection)', () => {
	it('does NOT re-render when the shallow-equal slice is unchanged', async () => {
		let renders = 0;
		const r = mount(ShallowObject, { onRender: () => renders++ });
		const afterMount = renders;
		expect(r.find('#a').textContent).toBe('0');

		// Bump an unrelated field → selected slice `{a:0}` is shallow-equal → no render.
		useObj.getState().bumpB();
		await nextPaint();
		expect(renders).toBe(afterMount);

		// Bump `a` → slice changes → exactly one more render.
		useObj.getState().bumpA();
		await nextPaint();
		expect(r.find('#a').textContent).toBe('1');
		expect(renders).toBe(afterMount + 1);
		r.unmount();
	});

	it('shallow comparator is the verbatim zustand one', () => {
		expect(shallow({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
		expect(shallow({ a: 1 }, { a: 2 })).toBe(false);
	});
});

describe('unstable selector — divergence from React', () => {
	it('a fresh-object selector does NOT infinite-loop (octane settles; React would loop + warn)', async () => {
		let renders = 0;
		const r = mount(RawObject, { onRender: () => renders++ });
		await nextPaint();
		// React's useSyncExternalStore would loop forever + console.error
		// "The result of getSnapshot should be cached". Octane renders a BOUNDED
		// number of times and settles — no loop, no crash.
		expect(renders).toBeLessThan(10);
		expect(r.find('#a').textContent).toBe('0');
		useObj.getState().bumpB();
		await nextPaint();
		expect(r.find('#a').textContent).toBe('0');
		r.unmount();
	});
});

describe('middleware (re-exported verbatim)', () => {
	it('combine() composes with create()/useStore()', async () => {
		const r = mount(CombinedView);
		expect(r.find('#c').textContent).toBe('0');
		r.click('#c');
		await nextPaint();
		expect(r.find('#c').textContent).toBe('1');
		r.unmount();
	});

	it('subscribeWithSelector() enhances the vanilla store', () => {
		const api = createStore(subscribeWithSelector(() => ({ count: 0, name: 'x' })));
		const seen: number[] = [];
		const unsub = api.subscribe(
			(s) => s.count,
			(count) => seen.push(count),
		);
		api.setState({ name: 'y' }); // unrelated → selector listener NOT called
		api.setState({ count: 5 }); // selected → called with 5
		api.setState({ count: 5 }); // unchanged → not called again
		unsub();
		expect(seen).toEqual([5]);
	});
});

describe('store-swap re-subscription', () => {
	it('unsubscribes the old store and subscribes the new on prop change', async () => {
		const instrument = (initial: number) => {
			let live = 0;
			const api = createStore(() => ({ n: initial }));
			const realSub = api.subscribe.bind(api);
			api.subscribe = (l: () => void) => {
				live++;
				const un = realSub(l);
				return () => {
					live--;
					un();
				};
			};
			return { api, live: () => live };
		};
		const a = instrument(1);
		const b = instrument(2);

		const r = mount(Reader, { api: a.api });
		await nextPaint();
		expect(r.find('#n').textContent).toBe('1');
		expect([a.live(), b.live()]).toEqual([1, 0]);

		r.update(Reader, { api: b.api });
		await nextPaint();
		expect(r.find('#n').textContent).toBe('2');
		expect([a.live(), b.live()]).toEqual([0, 1]);
		r.unmount();
		await nextPaint();
		expect([a.live(), b.live()]).toEqual([0, 0]);
	});
});
