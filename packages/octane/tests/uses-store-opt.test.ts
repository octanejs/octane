import { describe, it, expect } from 'vitest';
import { mount, flushEffects } from './_helpers';
import { flushSync } from '../src/index.js';
import {
	makeStore,
	UnstableParent,
	KeyedConsumer,
	ThrowBoundary,
	SiblingApp,
} from './_fixtures/uses-store-opt.tsrx';

// Pins the store-sync commit-queue optimization (drainStoreSyncs + render-phase
// getSnapshot) in packages/octane/src/runtime.ts. The consumers here all use an
// UNSTABLE inline getSnapshot (a fresh closure every render — the zustand/query
// pattern), so these tests exercise the enqueue-elimination gate directly.

describe('useSyncExternalStore — store-sync queue optimization', () => {
	it('an unchanged-snapshot update render does NOT re-read getSnapshot at commit', () => {
		const store = makeStore(0);
		let snapshots = 0;
		let renders = 0;
		const r = mount(UnstableParent, {
			store,
			onSnapshot: () => snapshots++,
			onRender: () => renders++,
		});
		flushEffects();
		// Mount reads getSnapshot 3× (render read + commit tear-check + passive
		// pre-subscribe check) — this is baseline for old AND new code, so we scope
		// the "exactly 1 per render" assertion to UPDATE renders (required change #3).
		expect(store.listenerCount()).toBe(1);
		expect(r.find('.uc').textContent).toBe('0');

		// Drive several props-driven re-renders with an UNCHANGED snapshot.
		snapshots = 0;
		renders = 0;
		r.click('#bump'); // tick 1
		r.click('#bump'); // tick 2
		r.click('#bump'); // tick 3
		flushEffects();

		// Each update render read the snapshot exactly ONCE (the render read) — no
		// commit-phase re-read, because the unchanged snapshot enqueued nothing.
		expect(renders).toBe(3);
		expect(snapshots).toBe(3);
		// The child did re-render (tick advanced) but the store value is unchanged.
		expect(r.find('.uc').getAttribute('data-tick')).toBe('3');
		expect(r.find('.uc').textContent).toBe('0');
		r.unmount();
	});

	it('a real store change still updates the DOM', () => {
		const store = makeStore(1);
		const r = mount(UnstableParent, { store, onSnapshot: () => {}, onRender: () => {} });
		flushEffects();
		expect(r.find('.uc').textContent).toBe('1');

		flushSync(() => store.setState(42));
		flushEffects();
		expect(r.find('.uc').textContent).toBe('42');
		r.unmount();
	});

	it('dedups an unchanged notify across intervening unrelated re-renders (no extra renders)', () => {
		const store = makeStore(7);
		let renders = 0;
		const r = mount(UnstableParent, {
			store,
			onSnapshot: () => {},
			onRender: () => renders++,
		});
		flushEffects();
		renders = 0;

		// A props re-render, then a same-value notify, then another props re-render.
		r.click('#bump');
		flushSync(() => store.setState(7)); // Object.is-equal -> onStoreChange dedups -> NO extra render
		flushEffects();
		r.click('#bump');
		flushEffects();

		// Only the two tick-driven renders; the idempotent notify added none.
		expect(renders).toBe(2);
		expect(r.find('.uc').textContent).toBe('7');
		r.unmount();
	});

	it('props-dependent selector: onStoreChange uses the render-updated getSnapshot, not a stale closure', () => {
		const store = makeStore({ a: 10, b: 10 });
		const r = mount(KeyedConsumer, { store, k: 'a' });
		flushEffects();
		expect(r.find('.kc').textContent).toBe('10');

		// Change the SELECTOR key while the store stays silent. The newly-selected
		// value (state.b === 10) is Object.is-equal to the committed value, so this
		// render enqueues NO commit-sync — but getSnapshot IS advanced in render.
		r.update(KeyedConsumer, { store, k: 'b' });
		flushEffects();
		expect(r.find('.kc').textContent).toBe('10');

		// Now mutate the store so the value is visible ONLY through the NEW key.
		// If onStoreChange still used the stale k='a' closure it would read 10 and
		// dedup; the component MUST re-render with the fresh selection (b === 99).
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
		// The throwing consumer unmounted (its subscription was torn down) — no
		// leaked listener, no infinite loop (the test simply completing proves it).
		expect(store.listenerCount()).toBe(0);
		r.unmount();
	});

	it('a sibling layout effect mutating+notifying during commit converges without tearing', () => {
		const store = makeStore(0);
		const r = mount(SiblingApp, { store, to: 5, onSnapshot: () => {}, onRender: () => {} });
		flushEffects();
		// The consumer mounted reading 0, the sibling layout effect set the store to
		// 5 during the same commit; the consumer must converge to the final value.
		expect(r.find('.uc').textContent).toBe('5');
		r.unmount();
	});
});
