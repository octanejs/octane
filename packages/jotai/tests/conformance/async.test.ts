/**
 * @octanejs/jotai async conformance — async atoms suspend through octane's
 * use() on the binding's continuable promise: pending fallback → resolved
 * value, re-suspension when a write installs a new pending promise, async
 * derived chains, the loadable/unwrap escape hatches (no boundary), and
 * rejection routing to the boundary's catch.
 */
import { describe, it, expect } from 'vitest';
import { atom, getDefaultStore } from '@octanejs/jotai';
import { loadable, unwrap } from '@octanejs/jotai/utils';
import { mount, nextPaint } from '../_helpers';
import { AsyncApp, LoadableApp, UnwrapApp } from '../_fixtures/async.tsrx';

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function flush() {
	for (let i = 0; i < 4; i++) {
		await new Promise((r) => setTimeout(r, 0));
		await nextPaint();
	}
}

describe('async atoms + suspense', () => {
	it('suspends to the pending fallback, then renders the resolved value', async () => {
		const d = deferred<number>();
		const asyncAtom = atom(d.promise);
		const r = mount(AsyncApp, { asyncAtom });
		await flush();
		expect(r.find('#fallback').textContent).toBe('loading');

		d.resolve(5);
		await flush();
		expect(r.find('#async').textContent).toBe('v=5');
		r.unmount();
	});

	it('re-suspends when a write installs a new pending promise', async () => {
		const d1 = deferred<number>();
		const asyncAtom = atom(d1.promise);
		const r = mount(AsyncApp, { asyncAtom });
		d1.resolve(1);
		await flush();
		expect(r.find('#async').textContent).toBe('v=1');

		const d2 = deferred<number>();
		getDefaultStore().set(asyncAtom, d2.promise);
		await flush();
		expect(r.find('#fallback').textContent).toBe('loading');

		d2.resolve(2);
		await flush();
		expect(r.find('#async').textContent).toBe('v=2');
		r.unmount();
	});

	it('resolves an async DERIVED atom through its async dependency', async () => {
		const d = deferred<number>();
		const base = atom(d.promise);
		const doubled = atom(async (get) => (await get(base)) * 2);
		const r = mount(AsyncApp, { asyncAtom: doubled });
		await flush();
		expect(r.find('#fallback').textContent).toBe('loading');

		d.resolve(21);
		await flush();
		expect(r.find('#async').textContent).toBe('v=42');
		r.unmount();
	});

	it('routes a rejected async atom to the boundary catch', async () => {
		const d = deferred<number>();
		const asyncAtom = atom(d.promise);
		const r = mount(AsyncApp, { asyncAtom });
		await flush();
		expect(r.find('#fallback').textContent).toBe('loading');

		d.reject(new Error('boom'));
		await flush();
		expect(r.find('#error').textContent).toBe('error:boom');
		r.unmount();
	});
});

describe('loadable / unwrap (no suspense boundary)', () => {
	it('loadable renders loading → hasData without suspending', async () => {
		const d = deferred<number>();
		const asyncAtom = atom(d.promise);
		const r = mount(LoadableApp, { loadableAtom: loadable(asyncAtom) });
		await flush();
		expect(r.find('#loadable').textContent).toBe('loading');

		d.resolve(3);
		await flush();
		expect(r.find('#loadable').textContent).toBe('hasData:3');
		r.unmount();
	});

	it('loadable surfaces a rejection as hasError', async () => {
		const d = deferred<number>();
		const asyncAtom = atom(d.promise);
		const r = mount(LoadableApp, { loadableAtom: loadable(asyncAtom) });
		await flush();

		d.reject(new Error('nope'));
		await flush();
		expect(r.find('#loadable').textContent).toBe('hasError:nope');
		r.unmount();
	});

	it('unwrap renders the fallback, then the settled value', async () => {
		const d = deferred<number>();
		const asyncAtom = atom(d.promise);
		const unwrapped = unwrap(asyncAtom, () => -1);
		const r = mount(UnwrapApp, { unwrapped });
		await flush();
		expect(r.find('#unwrap').textContent).toBe('v=-1');

		d.resolve(8);
		await flush();
		expect(r.find('#unwrap').textContent).toBe('v=8');
		r.unmount();
	});
});
