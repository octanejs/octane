import { describe, expect, it } from 'vitest';
import { act, mount } from './_helpers';
import { OffsetReader, OffsetReaderKeyed } from './_fixtures/data-callback-hooks.tsrx';

// Dep-keying a callback changes when its identity moves, never what it computes.
// These run in BOTH vitest projects, so the dev compile (which never keys) and
// the production compile must agree on every assertion.

function makeStore(base: number) {
	let value = { base };
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set: (b: number) => {
			value = { base: b };
			for (const l of listeners) l();
		},
		subscribe: (l: () => void) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
	};
}

describe.each([
	['authored form', OffsetReader],
	['dep-keyed form', OffsetReaderKeyed],
])('dep-keyed callbacks preserve semantics (%s)', (_label, Component) => {
	it('tracks the store, the captured prop, and unrelated state independently', async () => {
		const store = makeStore(10);
		let setTick!: (n: number) => void;
		const r = mount(Component, { store, offset: 1, bind: (fn: any) => (setTick = fn) });
		await act(() => {});
		expect(r.find('#total').textContent).toBe('11');

		// Unrelated local state moves; the selection must not go stale or change.
		await act(() => setTick(1));
		expect(r.find('#tick').textContent).toBe('1');
		expect(r.find('#total').textContent).toBe('11');

		// The store moves.
		await act(() => store.set(20));
		expect(r.find('#total').textContent).toBe('21');

		// The CAPTURED prop moves — the whole point of keying on captures rather
		// than on the callback's identity.
		await act(() => r.update(Component, { store, offset: 5, bind: (fn: any) => (setTick = fn) }));
		expect(r.find('#total').textContent).toBe('25');

		// And the store still moves after the prop change.
		await act(() => store.set(30));
		expect(r.find('#total').textContent).toBe('35');
		r.unmount();
	});
});
