import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from '../_helpers';
import {
	createExternalStore,
	makeRefChurnStore,
	Consumer,
	TripleConsumer,
	CachedMirror,
	ChurnConsumer,
} from '../_fixtures/sync-store-tearing.tsrx';

// Ported from React's useSyncExternalStore-test.js. Octane is a synchronous
// reconciler (no concurrent yielding), so the React tests that hinge on
// interleaving a store mutation *between* yielded children mid-render (:144)
// can't be reproduced literally. We instead assert the observable invariant
// those tests guarantee: after a store mutation + flush, every consumer of the
// same store agrees on the value (no tearing), the cached snapshot updates so
// returning to a previously-seen value still re-renders (:244), and a store
// that hands back a fresh reference for unchanged data settles without an
// infinite render loop (:355).

describe('useSyncExternalStore consistency / tearing', () => {
	// Per useSyncExternalStore-test.js:144 'detects interleaved mutations during
	// a concurrent read before layout effects fire' — observable invariant:
	// after a synchronous mutate + flush, all consumers of one store agree.
	it('all consumers of a shared store agree after a synchronous mutate (no tearing)', async () => {
		const store = createExternalStore(0);
		const r = mount(TripleConsumer, { store });
		await nextPaint();
		expect(store.getSubscriberCount()).toBe(3);
		expect(r.find('.a').textContent).toBe('0');
		expect(r.find('.b').textContent).toBe('0');
		expect(r.find('.c').textContent).toBe('0');

		store.set(1);
		await nextPaint();
		const a = r.find('.a').textContent;
		const b = r.find('.b').textContent;
		const c = r.find('.c').textContent;
		// All three observed the SAME snapshot through the one notify cycle.
		expect(a).toBe('1');
		expect(b).toBe('1');
		expect(c).toBe('1');
		expect(a === b && b === c).toBe(true);

		store.set(2);
		await nextPaint();
		expect(r.find('.a').textContent).toBe('2');
		expect(r.find('.b').textContent).toBe('2');
		expect(r.find('.c').textContent).toBe('2');
		r.unmount();
	});

	// Per useSyncExternalStore-test.js:144 — two independently-mounted roots
	// sharing one store also stay consistent (cross-root, no tearing), even when
	// a fresh consumer mounts AFTER the mutation but before a flush: it must read
	// the already-mutated value, not a stale one.
	it('two independent roots sharing a store both reflect the same value (no stale read)', async () => {
		const store = createExternalStore(5);
		const r1 = mount(Consumer, { store, cls: 'a' });
		await nextPaint();
		expect(r1.find('.a').textContent).toBe('5');

		// Mutate, then synchronously mount a second consumer before any flush.
		store.set(8);
		const r2 = mount(Consumer, { store, cls: 'a' });
		// Neither consumer may tear: both show the post-mutation value 8, even
		// though r2's subscription (a passive effect) hasn't been flushed yet —
		// the consistent value comes from the render-phase getState() read.
		expect(r1.find('.a').textContent).toBe('8');
		expect(r2.find('.a').textContent).toBe('8');

		await nextPaint();
		expect(r1.find('.a').textContent).toBe('8');
		expect(r2.find('.a').textContent).toBe('8');
		// After the passive phase flushes, both consumers are subscribed.
		expect(store.getSubscriberCount()).toBe(2);

		r1.unmount();
		await nextPaint();
		expect(store.getSubscriberCount()).toBe(1);
		r2.unmount();
		await nextPaint();
		expect(store.getSubscriberCount()).toBe(0);
	});

	// Per useSyncExternalStore-test.js:244 'next value is correctly cached when
	// state is dispatched in render phase' — store goes initial -> changed ->
	// initial; the render-phase mirror must converge each time, and returning to
	// a previously-seen value must still re-render (the cached snapshot updates).
	it('caches the snapshot correctly when a setter is dispatched in render phase', async () => {
		const store = createExternalStore('value:initial');
		const r = mount(CachedMirror, { store });
		await nextPaint();
		// value and mirror converge to the initial snapshot.
		expect(r.find('#mirror').textContent).toBe('value:initial|value:initial');

		store.set('value:changed');
		await nextPaint();
		expect(r.find('#mirror').textContent).toBe('value:changed|value:changed');

		// Set back to a previously-seen value — must still re-render and converge,
		// proving the cached snapshot was updated on the prior commit (not stuck
		// at 'value:initial' which would suppress this re-render).
		store.set('value:initial');
		await nextPaint();
		expect(r.find('#mirror').textContent).toBe('value:initial|value:initial');
		r.unmount();
	});

	// Per useSyncExternalStore-test.js:244 — setting the store to a value that is
	// Object.is-equal to the current snapshot must NOT churn the DOM text node
	// (the snapshot dedup short-circuits the re-render).
	it('an idempotent store set (same value) does not churn the committed DOM node', async () => {
		const store = createExternalStore(7);
		const r = mount(Consumer, { store, cls: 'a' });
		await nextPaint();
		const node = r.find('.a').firstChild;
		expect(r.find('.a').textContent).toBe('7');

		store.set(7); // identical value — should dedup
		await nextPaint();
		expect(r.find('.a').textContent).toBe('7');
		// Same text node survived: no re-render churn for an equal snapshot.
		expect(r.find('.a').firstChild === node).toBe(true);
		r.unmount();
	});

	// Per useSyncExternalStore-test.js:355 'regression: does not infinite loop
	// for only changing store reference in render'. A store mutated on mount (via
	// useMemo with empty deps) must converge to the new value without looping.
	it('a value set during mount via the ref-churn store settles without infinite loop', async () => {
		const store = makeRefChurnStore();
		const r = mount(ChurnConsumer, { store });
		await nextPaint();
		// On mount useMemo dispatches store.set('B'); after the notify flushes
		// the consumer shows 'B' and rendering halts.
		const text = r.find('#churn').textContent;
		r.unmount();
		expect(text).toBe('B');
	});

	// Per useSyncExternalStore-test.js:355 — the rule-breaking core of the
	// regression: a store that returns a FRESH reference for UNCHANGED data on
	// every getSnapshot read. This defeats a naive Object.is dedup, yet must NOT
	// spin forever. Repeated touch() (new outer ref, identical inner text) keeps
	// the committed value stable and the subscription intact.
	it('repeated reference churn (new ref, same value) settles and never loops', async () => {
		const store = makeRefChurnStore();
		const r = mount(ChurnConsumer, { store });
		await nextPaint();
		expect(r.find('#churn').textContent).toBe('B');

		// touch() swaps the outer reference but the inner {text:'B'} is unchanged.
		// Several rounds must converge each time (a loop would hang the test).
		for (let i = 0; i < 4; i++) {
			store.touch();
			await nextPaint();
			expect(r.find('#churn').textContent).toBe('B');
		}
		// Subscription is still single and live (no leaked re-subscribes).
		expect(store.getSubscriberCount()).toBe(1);
		r.unmount();
		await nextPaint();
		expect(store.getSubscriberCount()).toBe(0);
	});
});
