/**
 * @octanejs/jotai conformance — the ported react layer (Provider + useStore +
 * useAtom/useAtomValue/useSetAtom) against the REAL jotai vanilla store:
 * force-update subscription, write-only non-re-rendering, derived-atom
 * bail-out, slot independence, Provider scoping/nesting/swap, and export
 * parity with upstream jotai's six public modules.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as binding from '@octanejs/jotai';
import { atom, createStore, getDefaultStore } from '@octanejs/jotai';
import { mount, nextPaint } from '../_helpers';
import {
	Counter,
	CounterApp,
	BailoutApp,
	TwoAtoms,
	TwinReaders,
	StoreResolutionApp,
	ScopesApp,
	SwapApp,
	renders,
	capturedStores,
} from '../_fixtures/atoms.tsrx';

// jotai notifies synchronously; octane renders in a microtask — settle both.
async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

beforeEach(() => {
	renders.count = 0;
	renders.derived = 0;
	renders.writer = 0;
	renders.two = 0;
	renders.a = 0;
	renders.b = 0;
	for (const key of Object.keys(capturedStores)) delete capturedStores[key];
});

describe('useAtom / useAtomValue / useSetAtom (default store)', () => {
	it('renders the initial value and re-renders on a write', async () => {
		const count = atom(0);
		const derived = atom((get) => get(count) * 2);
		const r = mount(CounterApp, { count, derived });
		await flush();
		expect(r.find('#count').textContent).toBe('count=0');
		expect(r.find('#derived').textContent).toBe('derived=0');

		r.click('#inc');
		await flush();
		expect(r.find('#count').textContent).toBe('count=1');
		r.unmount();
	});

	it('recomputes a derived (read-only) atom when its dependency changes', async () => {
		const count = atom(2);
		const derived = atom((get) => get(count) * 2);
		const r = mount(CounterApp, { count, derived });
		await flush();
		expect(r.find('#derived').textContent).toBe('derived=4');

		r.click('#inc');
		await flush();
		expect(r.find('#derived').textContent).toBe('derived=6');
		r.unmount();
	});

	it('does NOT re-render a write-only (useSetAtom) component on writes', async () => {
		const count = atom(0);
		const derived = atom((get) => get(count) * 2);
		const r = mount(CounterApp, { count, derived });
		await flush();
		const writerAfterMount = renders.writer;
		const countAfterMount = renders.count;

		r.click('#inc');
		await flush();
		r.click('#inc');
		await flush();
		expect(r.find('#count').textContent).toBe('count=2');
		expect(renders.count).toBeGreaterThan(countAfterMount);
		expect(renders.writer).toBe(writerAfterMount);
		r.unmount();
	});

	it('bails out when a derived atom recomputes to an Object.is-equal value', async () => {
		const count = atom(0);
		const clamped = atom((get) => Math.min(get(count), 1));
		const r = mount(BailoutApp, { count, clamped });
		await flush();

		// 0 → 1: the clamped value changes — one re-render.
		r.click('#inc');
		await flush();
		expect(r.find('#derived').textContent).toBe('derived=1');
		const afterChange = renders.derived;

		// 1 → 2: the clamped value stays 1 — the store never notifies the
		// derived reader, so its render count must not move.
		r.click('#inc');
		await flush();
		expect(r.find('#derived').textContent).toBe('derived=1');
		expect(renders.derived).toBe(afterChange);
		r.unmount();
	});

	it('keeps two useAtom calls in ONE component independent (slot forwarding)', async () => {
		const a = atom(0);
		const b = atom(10);
		const r = mount(TwoAtoms, { a, b });
		await flush();
		expect(r.find('#two').textContent).toBe('a=0 b=10');

		r.click('#bump-a');
		await flush();
		expect(r.find('#two').textContent).toBe('a=1 b=10');

		r.click('#bump-b');
		await flush();
		expect(r.find('#two').textContent).toBe('a=1 b=11');
		r.unmount();
	});

	it('updates every reader of the same atom from one write', async () => {
		const count = atom(0);
		const r = mount(TwinReaders, { count });
		await flush();

		r.click('#inc');
		await flush();
		expect(r.find('#ra').textContent).toBe('ra=1');
		expect(r.find('#rb').textContent).toBe('rb=1');
		r.unmount();
	});

	it('subscribes to the default store without a Provider (no-Provider is not an error)', async () => {
		const count = atom(0);
		const r = mount(Counter, { count });
		await flush();
		expect(r.find('#count').textContent).toBe('count=0');

		getDefaultStore().set(count, 7);
		await flush();
		expect(r.find('#count').textContent).toBe('count=7');
		r.unmount();
	});
});

describe('useStore resolution + Provider scoping', () => {
	it('resolves options.store, then the nearest Provider, then the default store', async () => {
		const providerStore = createStore();
		const optionsStore = createStore();
		const r = mount(StoreResolutionApp, { providerStore, optionsStore });
		await flush();

		expect(capturedStores.default).toBe(getDefaultStore());
		expect(capturedStores.provider).toBe(providerStore);
		expect(capturedStores.options).toBe(optionsStore);
		r.unmount();
	});

	it('scopes the same atom independently per Provider (nested Providers shadow)', async () => {
		const count = atom(0);
		const outer = createStore();
		const inner = createStore();
		getDefaultStore().set(count, 1);
		outer.set(count, 2);
		inner.set(count, 3);

		const r = mount(ScopesApp, { count, outer, inner });
		await flush();
		expect(r.find('#global').textContent).toBe('global=1');
		expect(r.find('#outer').textContent).toBe('outer=2');
		expect(r.find('#inner').textContent).toBe('inner=3');

		// A write to one scope leaves the others untouched.
		outer.set(count, 20);
		await flush();
		expect(r.find('#global').textContent).toBe('global=1');
		expect(r.find('#outer').textContent).toBe('outer=20');
		expect(r.find('#inner').textContent).toBe('inner=3');
		r.unmount();
	});

	it('re-reads and re-subscribes when the Provider store prop is swapped', async () => {
		const count = atom(0);
		const storeA = createStore();
		const storeB = createStore();
		storeA.set(count, 1);
		storeB.set(count, 42);

		const r = mount(SwapApp, { storeA, storeB, count });
		await flush();
		expect(r.find('#count').textContent).toBe('count=1');

		r.click('#swap');
		await flush();
		expect(r.find('#count').textContent).toBe('count=42');

		// Subscribed to the NEW store…
		storeB.set(count, 43);
		await flush();
		expect(r.find('#count').textContent).toBe('count=43');

		// …and detached from the old one.
		storeA.set(count, 99);
		await flush();
		expect(r.find('#count').textContent).toBe('count=43');
		r.unmount();
	});
});

describe('export surface', () => {
	it('provides every runtime export of real jotai (all six public modules)', async () => {
		const pairs: [string, object, object][] = [
			['jotai', await import('jotai'), binding],
			['jotai/vanilla', await import('jotai/vanilla'), await import('@octanejs/jotai/vanilla')],
			['jotai/react', await import('jotai/react'), await import('@octanejs/jotai/react')],
			['jotai/utils', await import('jotai/utils'), await import('@octanejs/jotai/utils')],
			[
				'jotai/vanilla/utils',
				await import('jotai/vanilla/utils'),
				await import('@octanejs/jotai/vanilla/utils'),
			],
			[
				'jotai/react/utils',
				await import('jotai/react/utils'),
				await import('@octanejs/jotai/react/utils'),
			],
		];
		for (const [name, real, port] of pairs) {
			const upstream = Object.keys(real).sort();
			const ported = new Set(Object.keys(port));
			const missing = upstream.filter((key) => !ported.has(key));
			expect(missing, `missing exports in port of ${name}`).toEqual([]);
		}
	});
});
