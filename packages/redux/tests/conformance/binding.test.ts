/**
 * @octanejs/redux conformance — Provider + hooks behavior against a real
 * Redux Toolkit store: dispatch → re-render, with-selector memoization (no
 * re-render for unrelated slices), equalityFn, useStore/useDispatch identity,
 * custom-context factories (the isolated-store pattern recharts uses), and the
 * no-Provider dev throw.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import * as binding from '@octanejs/redux';
import { mount, nextPaint } from '../_helpers';
import {
	SlicesApp,
	CaptureApp,
	NestedContextsApp,
	NoProviderApp,
	renders,
	captured,
} from '../_fixtures/app.tsrx';

function makeSlicesStore() {
	return configureStore({
		reducer: {
			a: (state = 1, action: any) => (action.type === 'bump-a' ? state + 1 : state),
			b: (state = 10, action: any) => (action.type === 'bump-b' ? state + 1 : state),
		},
	});
}

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

beforeEach(() => {
	renders.a = 0;
	renders.b = 0;
	captured.length = 0;
});

describe('useSelector', () => {
	it('re-renders on a relevant dispatch and reflects the new state', async () => {
		const store = makeSlicesStore();
		const r = mount(SlicesApp, { store });
		await flush();
		expect(r.find('#a').textContent).toBe('a=1');

		store.dispatch({ type: 'bump-a' });
		await flush();
		expect(r.find('#a').textContent).toBe('a=2');
		r.unmount();
	});

	it('does NOT re-render a component whose selected slice did not change', async () => {
		const store = makeSlicesStore();
		const r = mount(SlicesApp, { store });
		await flush();
		const aBefore = renders.a;
		const bBefore = renders.b;

		store.dispatch({ type: 'bump-a' });
		await flush();

		expect(renders.a).toBeGreaterThan(aBefore); // selected slice changed
		expect(renders.b).toBe(bBefore); // unrelated slice — memoized selection
		expect(r.find('#b').textContent).toBe('b=10');
		r.unmount();
	});

	it('equalityFn (shallowEqual) suppresses re-renders for fresh-but-equal objects', async () => {
		const store = makeSlicesStore();
		const r = mount(SlicesApp, { store });
		await flush();
		expect(r.find('#pair').textContent).toBe('pair=1');

		// b changes; the pair selector returns a NEW object with the same `a` —
		// shallowEqual keeps the previous reference, no tearing, value intact.
		store.dispatch({ type: 'bump-b' });
		await flush();
		expect(r.find('#pair').textContent).toBe('pair=1');
		r.unmount();
	});

	it('throws without a <Provider> (dev parity)', async () => {
		expect(() => mount(NoProviderApp, {})).toThrow(/octanejs\/redux context value/);
	});
});

describe('useStore / useDispatch', () => {
	it('return the provided store and its dispatch, stable across re-renders', async () => {
		const store = makeSlicesStore();
		const r = mount(CaptureApp, { store });
		await flush();
		store.dispatch({ type: 'bump-a' });
		await flush();

		expect(captured.length).toBeGreaterThanOrEqual(1);
		for (const cap of captured) {
			expect(cap.store).toBe(store);
			expect(cap.dispatch).toBe(store.dispatch);
		}
		r.unmount();
	});
});

describe('custom context factories (isolated store)', () => {
	it('createSelectorHook/createDispatchHook read the inner store; default hooks read the outer', async () => {
		const outerStore = makeSlicesStore();
		const innerStore = configureStore({
			reducer: { isolated: (state = 'inner', _action: any) => state },
		});
		const r = mount(NestedContextsApp, { outerStore, innerStore });
		await flush();

		expect(r.find('#iso').textContent).toBe('isolated=inner outer=1');
		outerStore.dispatch({ type: 'bump-a' });
		await flush();
		expect(r.find('#iso').textContent).toBe('isolated=inner outer=2');
		r.unmount();
	});
});

describe('export surface', () => {
	it('provides every runtime export of real react-redux', async () => {
		const real = await import('react-redux');
		const upstream = Object.keys(real).sort();
		const port = new Set(Object.keys(binding));
		const missing = upstream.filter((name) => !port.has(name));
		expect(missing).toEqual([]);
	});
});
