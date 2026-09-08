import { describe, it, expect, vi } from 'vitest';
import { act, mount, flushEffects } from './_helpers';
import { flushSync, setIsOctaneActEnvironment, startTransition } from '../src/index.js';
import {
	CrossComponentStoreApp,
	makeStore,
	PairedStoreConsumer,
	RenderPhaseStoreConsumer,
	StoreConsumer,
	StorePriorityBoundary,
	KeyedConsumer,
	ThrowBoundary,
	SiblingApp,
} from './_fixtures/external-store-behavior.tsrx';

function deferred(): { promise: Promise<void>; resolve: () => void } {
	let resolve!: () => void;
	const promise = new Promise<void>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

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

	it('reads the latest values from both stores when their notifications share a render', () => {
		const first = makeStore(0);
		const second = makeStore(10);
		const r = mount(PairedStoreConsumer, { first, second });
		flushEffects();
		const output = r.find('#paired-store-value');
		expect(output.textContent).toBe('0:10');

		flushSync(() => {
			first.setState(1);
			second.setState(11);
			first.setState(2);
			second.setState(12);
		});
		expect(r.find('#paired-store-value')).toBe(output);
		expect(output.textContent).toBe('2:12');

		flushSync(() => {
			second.setState(13);
			first.setState(0);
		});
		expect(output.textContent).toBe('0:13');
		r.unmount();
		flushEffects();
		expect(first.listenerCount()).toBe(0);
		expect(second.listenerCount()).toBe(0);
	});

	it('replays a store change made after its snapshot was read during render', () => {
		const store = makeStore(0);
		const observations: Array<{ snapshot: number; current: number }> = [];
		const r = mount(RenderPhaseStoreConsumer, {
			store,
			observeCommit: (snapshot: number, current: number) => {
				observations.push({ snapshot, current });
			},
		});
		flushEffects();
		observations.length = 0;

		flushSync(() => store.setState(1));
		expect(r.find('#render-phase-store-value').textContent).toBe('value:2');
		expect(observations).toContainEqual({ snapshot: 2, current: 2 });
		// A layout effect must not observe the abandoned render's stale snapshot.
		expect(observations.every(({ snapshot, current }) => snapshot === current)).toBe(true);
		r.unmount();
	});

	it('external-store changes remain urgent inside transitions', async () => {
		const store = makeStore(0);
		const first = deferred();
		const next = deferred();
		const r = mount(StorePriorityBoundary, {
			store,
			firstPending: first.promise,
			nextPending: next.promise,
		});
		flushEffects();
		try {
			flushSync(() => startTransition(() => store.setState(1)));
			expect(r.find('#store-priority-value').textContent).toBe('value:0');
			expect(r.find('#store-priority-fallback').textContent).toBe('loading');

			await act(() => first.resolve());
			expect(r.find('#store-priority-value').textContent).toBe('value:1');
			expect(r.container.querySelector('#store-priority-fallback')).toBeNull();

			flushSync(() => {
				startTransition(() => store.setState(2));
				store.setState(3);
			});
			// The second notification is urgent before the transition gets to render.
			// It must show the fallback, not begin holding the previous screen.
			expect(r.find('#store-priority-fallback').textContent).toBe('loading');

			await act(() => next.resolve());
			expect(r.find('#store-priority-value').textContent).toBe('value:3');
			expect(r.container.querySelector('#store-priority-fallback')).toBeNull();
		} finally {
			r.unmount();
			flushEffects();
		}
	});

	it('warns when another rendering component notifies an already-pending store reader', () => {
		const store = makeStore(0);
		const r = mount(CrossComponentStoreApp, { store, next: null });
		flushEffects();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			flushSync(() => {
				store.setState(1);
				r.root.render(CrossComponentStoreApp, { store, next: 2 });
			});
			expect(r.find('#pending-store-value').textContent).toBe('value:2');
			expect(
				error.mock.calls.some(([message]) =>
					String(message).includes('while rendering a different component'),
				),
			).toBe(process.env.NODE_ENV !== 'production');
		} finally {
			error.mockRestore();
			r.unmount();
			flushEffects();
		}
	});

	it('keeps the outside-act diagnostic for a changed store whose reader is already pending', () => {
		const store = makeStore(0);
		const r = mount(StoreConsumer, { store });
		flushEffects();
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			setIsOctaneActEnvironment(false);
			store.setState(1);
			error.mockClear();
			setIsOctaneActEnvironment(true);
			store.setState(2);
			expect(
				error.mock.calls.some(([message]) => String(message).includes('not wrapped in act')),
			).toBe(process.env.NODE_ENV !== 'production');

			setIsOctaneActEnvironment(false);
			flushSync(() => {});
			expect(r.find('.uc').textContent).toBe('2');
		} finally {
			setIsOctaneActEnvironment(false);
			error.mockRestore();
			r.unmount();
			flushEffects();
		}
	});
});
