import { describe, expect, it, vi } from 'vitest';
import { act, mount } from './_helpers';
import {
	CallbackIdentityAcrossDeps,
	MixedSelectors,
	TwoStoreReaders,
} from './_fixtures/hoist-capture-free-hook-callbacks.tsrx';

// Lifting a capture-free callback out of a component changes its identity and
// nothing else. These run in BOTH vitest projects, so the dev compile (which
// keeps the authored form) and the production compile (which lifts) have to
// agree on every assertion here.

function makeStore(initial: number) {
	let value = initial;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set: (v: number) => {
			value = v;
			for (const l of listeners) l();
		},
		subscribe: (l: () => void) => {
			listeners.add(l);
			return () => listeners.delete(l);
		},
	};
}

describe('semantics survive capture-free callback hoisting', () => {
	it('keeps two store subscriptions in one component independent and reactive', async () => {
		const storeA = makeStore(1);
		const storeB = makeStore(10);
		const r = mount(TwoStoreReaders, { storeA, storeB });
		await act(() => {});
		expect(r.find('#readers').textContent).toBe('1/10');

		// Sharing module-scope callbacks must not collapse the two call sites onto
		// one hook cell.
		await act(() => storeA.set(2));
		expect(r.find('#readers').textContent).toBe('2/10');

		await act(() => storeB.set(20));
		expect(r.find('#readers').textContent).toBe('2/20');
		r.unmount();
	});

	it('keeps a capturing selector reading current state beside a lifted one', async () => {
		const store = makeStore(2);
		const r = mount(MixedSelectors, { store });
		await act(() => {});
		expect(r.find('#selectors').textContent).toBe('3/2');

		// Only the capturing selector may move when the captured value changes.
		r.click('#scale');
		await act(() => {});
		expect(r.find('#selectors').textContent).toBe('3/4');

		// Both still track the store itself.
		await act(() => store.set(5));
		expect(r.find('#selectors').textContent).toBe('6/10');
		r.unmount();
	});

	it('still returns a fresh useCallback identity when its deps change', async () => {
		// The exclusion of identity-owning hooks is load-bearing: a lifted
		// function could never satisfy this contract.
		const observe = vi.fn();
		const r = mount(CallbackIdentityAcrossDeps, { depKey: 'a', observe });
		await act(() => {});
		const first = observe.mock.calls.at(-1)![0];

		r.update(CallbackIdentityAcrossDeps, { depKey: 'b', observe });
		const second = observe.mock.calls.at(-1)![0];
		expect(second).not.toBe(first);

		r.update(CallbackIdentityAcrossDeps, { depKey: 'b', observe });
		const third = observe.mock.calls.at(-1)![0];
		expect(third).toBe(second);
		r.unmount();
	});
});
