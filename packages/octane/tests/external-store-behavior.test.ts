import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from './_helpers';
import { flushSync } from '../src/index.js';
import {
	makeStore,
	StoreConsumer,
	KeyedConsumer,
	ThrowBoundary,
	SiblingApp,
} from './_fixtures/external-store-behavior.tsrx';

// These consumers use inline selectors, matching common Zustand and query-store
// usage. The assertions stay at the public boundary: selected DOM state,
// subscription cleanup, error routing, and consistency during commit updates.
describe('useSyncExternalStore — live selectors and commit updates', () => {
	it('a real store change still updates the DOM', () => {
		const store = makeStore(1);
		const r = mount(StoreConsumer, { store });
		flushEffects();
		expect(r.find('.uc').textContent).toBe('1');

		flushSync(() => store.setState(42));
		flushEffects();
		expect(r.find('.uc').textContent).toBe('42');
		r.unmount();
	});

	it('uses the latest props-dependent selector when the store changes', () => {
		const store = makeStore({ a: 10, b: 10 });
		const r = mount(KeyedConsumer, { store, k: 'a' });
		flushEffects();
		expect(r.find('.kc').textContent).toBe('10');

		// Change the selector while both fields still have the same value.
		r.update(KeyedConsumer, { store, k: 'b' });
		flushEffects();
		expect(r.find('.kc').textContent).toBe('10');

		// Only the newly selected field changes. A stale selector would leave the
		// consumer showing 10 instead of the current value.
		flushSync(() => store.setState({ a: 10, b: 99 }));
		flushEffects();
		expect(r.find('.kc').textContent).toBe('99');
		r.unmount();
	});

	it('throw-after-read routes to @catch cleanly and does not loop', () => {
		const store = makeStore(5);
		const r = mount(ThrowBoundary, { store });
		flushEffects();
		expect(r.find('.tc').textContent).toBe('5');

		// A notify drives the snapshot negative → ThrowConsumer reads it then throws.
		flushSync(() => store.setState(-3));
		flushEffects();
		expect(r.find('.err').textContent).toBe('err:boom-3');
		// The throwing consumer unmounted and released its subscription.
		expect(store.listenerCount()).toBe(0);
		r.unmount();
	});

	it('a sibling layout effect mutating+notifying during commit converges without tearing', () => {
		const store = makeStore(0);
		const r = mount(SiblingApp, { store, to: 5 });
		flushEffects();
		// The consumer mounted reading 0, the sibling layout effect set the store to
		// 5 during the same commit; the consumer must converge to the final value.
		expect(r.find('.uc').textContent).toBe('5');
		r.unmount();
	});
});
