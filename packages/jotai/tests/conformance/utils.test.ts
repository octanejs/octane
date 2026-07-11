/**
 * @octanejs/jotai/utils conformance — the four ported react/utils hooks
 * (useResetAtom, useAtomCallback, useHydrateAtoms, useReducerAtom) plus smoke
 * coverage that the verbatim vanilla utils (atomFamily, splitAtom,
 * atomWithReducer, atomWithStorage) compose with the ported binding inside
 * octane components.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { atom, createStore, getDefaultStore } from '@octanejs/jotai';
import {
	atomFamily,
	atomWithReducer,
	atomWithReset,
	atomWithStorage,
	splitAtom,
} from '@octanejs/jotai/utils';
import { mount, nextPaint } from '../_helpers';
import { TwoAtoms } from '../_fixtures/atoms.tsrx';
import {
	ResetApp,
	CallbackApp,
	HydrateApp,
	ReducerApp,
	WithReducerApp,
	SplitApp,
	callbackResults,
} from '../_fixtures/utils.tsrx';

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

beforeEach(() => {
	callbackResults.length = 0;
});

afterEach(() => {
	vi.restoreAllMocks();
	localStorage.clear();
});

describe('useResetAtom', () => {
	it('restores an atomWithReset to its initial value', async () => {
		const count = atomWithReset(1);
		const r = mount(ResetApp, { count });
		await flush();
		expect(r.find('#resv').textContent).toBe('v=1');

		r.click('#set5');
		await flush();
		expect(r.find('#resv').textContent).toBe('v=5');

		r.click('#reset');
		await flush();
		expect(r.find('#resv').textContent).toBe('v=1');
		r.unmount();
	});
});

describe('useAtomCallback', () => {
	it('reads and writes atoms imperatively', async () => {
		const count = atom(7);
		const r = mount(CallbackApp, { count });
		await flush();

		r.click('#read');
		expect(callbackResults).toEqual([7]);

		// The write callback sets 123 and returns the freshly-read value.
		r.click('#write');
		expect(callbackResults).toEqual([7, 123]);
		expect(getDefaultStore().get(count)).toBe(123);
		r.unmount();
	});
});

describe('useHydrateAtoms', () => {
	it('hydrates once per (store, atom) — not again on re-render', async () => {
		const count = atom(0);
		const r = mount(HydrateApp, { values: [[count, 42]], count });
		await flush();
		expect(r.find('#hy').textContent).toBe('v=42 n=0');

		getDefaultStore().set(count, 1);
		await flush();
		expect(r.find('#hy').textContent).toBe('v=1 n=0');

		// Force a re-render — the hydrate loop runs again but the (store, atom)
		// pair is already in the hydrated set, so the write is skipped.
		r.click('#rerender');
		await flush();
		expect(r.find('#hy').textContent).toBe('v=1 n=1');
		r.unmount();
	});

	it('re-hydrates on every render with dangerouslyForceHydrate', async () => {
		const count = atom(0);
		const r = mount(HydrateApp, {
			values: [[count, 42]],
			count,
			options: { dangerouslyForceHydrate: true },
		});
		await flush();
		getDefaultStore().set(count, 1);
		await flush();

		r.click('#rerender');
		await flush();
		expect(r.find('#hy').textContent).toBe('v=42 n=1');
		r.unmount();
	});

	it('hydrates again for a fresh store (options.store)', async () => {
		const count = atom(0);
		// First hydrate into the default store…
		const r1 = mount(HydrateApp, { values: [[count, 42]], count });
		await flush();
		expect(r1.find('#hy').textContent).toBe('v=42 n=0');
		r1.unmount();

		// …then the SAME atom into a fresh store — hydrated set is per store.
		const fresh = createStore();
		const r2 = mount(HydrateApp, {
			values: [[count, 43]],
			count,
			options: { store: fresh },
		});
		await flush();
		expect(r2.find('#hy').textContent).toBe('v=43 n=0');
		expect(fresh.get(count)).toBe(43);
		r2.unmount();
	});
});

describe('useReducerAtom (deprecated)', () => {
	it('dispatches through the reducer and warns once in dev', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const count = atom(0);
		const reducer = (v: number, a: { type: string }) => (a.type === 'inc' ? v + 1 : v);
		const r = mount(ReducerApp, { count, reducer });
		await flush();
		expect(r.find('#rv').textContent).toBe('v=0');

		r.click('#dispatch-inc');
		await flush();
		expect(r.find('#rv').textContent).toBe('v=1');
		expect(warn.mock.calls.some(([m]) => String(m).includes('useReducerAtom is deprecated'))).toBe(
			true,
		);
		r.unmount();
	});
});

describe('vanilla utils inside octane components', () => {
	it('atomFamily members stay independent', async () => {
		const family = atomFamily((id: number) => atom(id * 10));
		const r = mount(TwoAtoms, { a: family(0), b: family(1) });
		await flush();
		expect(r.find('#two').textContent).toBe('a=0 b=10');

		r.click('#bump-a');
		await flush();
		expect(r.find('#two').textContent).toBe('a=1 b=10');
		expect(family(0)).toBe(family(0)); // memoized member identity
		r.unmount();
	});

	it('atomWithReducer dispatches actions through the setter', async () => {
		const count = atomWithReducer(0, (v: number, a: { type: string }) =>
			a.type === 'inc' ? v + 1 : v,
		);
		const r = mount(WithReducerApp, { count });
		await flush();
		r.click('#wr-inc');
		await flush();
		expect(r.find('#wrv').textContent).toBe('v=1');
		r.unmount();
	});

	it('atomWithStorage round-trips through localStorage', async () => {
		localStorage.setItem('jotai-conformance-count', '9');
		const count = atomWithStorage('jotai-conformance-count', 0);
		const r = mount(ResetApp, { count });
		await flush();
		// Seeded value read back from storage…
		expect(r.find('#resv').textContent).toBe('v=9');

		// …and writes persist to it.
		r.click('#set5');
		await flush();
		expect(r.find('#resv').textContent).toBe('v=5');
		expect(localStorage.getItem('jotai-conformance-count')).toBe('5');
		r.unmount();
	});

	it('splitAtom adds, toggles, and removes item atoms', async () => {
		const listAtom = atom([
			{ id: 1, text: 'one', done: false },
			{ id: 2, text: 'two', done: false },
		]);
		const itemAtomsAtom = splitAtom(listAtom);
		const r = mount(SplitApp, { listAtom, itemAtomsAtom });
		await flush();
		expect(r.findAll('#list li').length).toBe(2);

		r.click('#add');
		await flush();
		expect(r.findAll('#list li').length).toBe(3);
		expect(r.find('#t-3').textContent).toBe('item3');

		// Toggle item 2 through ITS atom — the others are untouched.
		r.click('#t-2');
		await flush();
		expect(r.find('#t-2').textContent).toBe('two:done');
		expect(r.find('#t-1').textContent).toBe('one');
		expect(getDefaultStore().get(listAtom)[1].done).toBe(true);

		// Remove item 1 via the split dispatch.
		r.click('#rm-1');
		await flush();
		expect(r.findAll('#list li').length).toBe(2);
		expect(r.find('#t-2').textContent).toBe('two:done');
		expect(getDefaultStore().get(listAtom).length).toBe(2);
		r.unmount();
	});
});
