import { describe, it, expect } from 'vitest';
import { mount, nextPaint } from './_helpers';
import {
	ConditionalReader,
	makeRetainedCallbackStore,
	makeStore,
	Reader,
	RenderObservedReader,
	SwappableReader,
} from './_fixtures/sync-external-store.tsrx';

// React 18's useSyncExternalStore contract: subscribe on mount, unsubscribe
// on unmount, re-render on every notify, fresh getSnapshot() every render.
// octane implements this on top of the existing useState + useEffect
// machinery, derived from the user's compiler-injected slot.

describe('useSyncExternalStore', () => {
	it('renders the initial snapshot from the store', () => {
		const store = makeStore(7);
		const r = mount(Reader, { store });
		expect(r.find('.value').textContent).toBe('7');
		r.unmount();
	});

	it('subscribes on mount and updates the DOM when the store notifies', async () => {
		const store = makeStore(0);
		const r = mount(Reader, { store });
		await nextPaint();
		expect(store.listenerCount()).toBe(1);
		expect(r.find('.value').textContent).toBe('0');

		store.set(42);
		await nextPaint();
		expect(r.find('.value').textContent).toBe('42');

		store.set(43);
		await nextPaint();
		expect(r.find('.value').textContent).toBe('43');
		r.unmount();
	});

	it('subscribes outside render and converges when subscribe notifies synchronously', async () => {
		let value = 0;
		let rendering = false;
		let subscribeCalls = 0;
		let subscribedDuringRender = false;
		const listeners = new Set<() => void>();
		const store = {
			get: () => value,
			subscribe(notify: () => void) {
				subscribeCalls++;
				subscribedDuringRender ||= rendering;
				listeners.add(notify);
				value = 1;
				notify();
				return () => {
					listeners.delete(notify);
				};
			},
		};

		const r = mount(RenderObservedReader, {
			store,
			onRenderState(next: boolean) {
				rendering = next;
			},
		});
		await nextPaint();

		expect(subscribedDuringRender).toBe(false);
		expect(subscribeCalls).toBe(1);
		expect(listeners.size).toBe(1);
		expect(r.find('.value').textContent).toBe('1');
		r.unmount();
		await nextPaint();
		expect(listeners.size).toBe(0);
	});

	it('unsubscribes on unmount (store drops its listener)', async () => {
		const store = makeStore(1);
		const r = mount(Reader, { store });
		await nextPaint();
		expect(store.listenerCount()).toBe(1);
		r.unmount();
		await nextPaint();
		expect(store.listenerCount()).toBe(0);
	});

	it('post-unmount store mutations do NOT trigger any work', async () => {
		const store = makeStore(0);
		const r = mount(Reader, { store });
		await nextPaint();
		r.unmount();
		await nextPaint();
		// No throw, no stray DOM mutation — the unsubscribe contract is honored.
		expect(() => store.set(999)).not.toThrow();
		expect(store.listenerCount()).toBe(0);
	});

	it('unsubscribes when its conditional owner removes it', async () => {
		const store = makeStore(1);
		const r = mount(ConditionalReader, { store, show: true });
		await nextPaint();
		expect(store.listenerCount()).toBe(1);

		r.update(ConditionalReader, { store, show: false });
		await nextPaint();
		expect(store.listenerCount()).toBe(0);
		expect(r.findAll('.value')).toHaveLength(0);
		r.unmount();
	});

	it('ignores a retained stale callback after conditional removal', async () => {
		const store = makeRetainedCallbackStore(0);
		const r = mount(ConditionalReader, { store, show: true });
		await nextPaint();
		const host = r.find('#conditional-host');
		const survivor = r.find('#conditional-survivor');

		r.update(ConditionalReader, { store, show: false });
		await nextPaint();
		expect(store.listenerCount()).toBe(0);
		expect(r.findAll('.value')).toHaveLength(0);

		expect(store.notifyRetained(1)).toBe(true);
		await nextPaint();
		expect(r.find('#conditional-host')).toBe(host);
		expect(r.find('#conditional-survivor')).toBe(survivor);
		expect(r.findAll('.value')).toHaveLength(0);
		r.unmount();
	});

	it('swapping the store unsubscribes from the old and subscribes to the new', async () => {
		const a = makeStore(10);
		const b = makeStore(20);
		const r = mount(SwappableReader, { store: a, alt: b });
		await nextPaint();
		expect(a.listenerCount()).toBe(1);
		expect(b.listenerCount()).toBe(0);
		expect(r.find('.value').textContent).toBe('10');

		r.update(SwappableReader, { store: b, alt: b });
		await nextPaint();
		// Old store released, new store has the listener, snapshot reflects b.
		expect(a.listenerCount()).toBe(0);
		expect(b.listenerCount()).toBe(1);
		expect(r.find('.value').textContent).toBe('20');

		// Mutating the OLD store should NOT update the DOM — we re-subscribed.
		a.set(999);
		await nextPaint();
		expect(r.find('.value').textContent).toBe('20');

		// Mutating the NEW store should update the DOM.
		b.set(21);
		await nextPaint();
		expect(r.find('.value').textContent).toBe('21');
		r.unmount();
	});

	it('multiple components sharing one store all see the same updates', async () => {
		const store = makeStore(0);
		const r1 = mount(Reader, { store });
		const r2 = mount(Reader, { store });
		await nextPaint();
		expect(store.listenerCount()).toBe(2);

		store.set(99);
		await nextPaint();
		expect(r1.find('.value').textContent).toBe('99');
		expect(r2.find('.value').textContent).toBe('99');

		r1.unmount();
		await nextPaint();
		expect(store.listenerCount()).toBe(1);
		r2.unmount();
		await nextPaint();
		expect(store.listenerCount()).toBe(0);
	});
});
