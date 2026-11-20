import { describe, it, expect } from 'vitest';
import { createRoot, flushSync } from '../src/index.js';
import { mount, nextPaint } from './_helpers';
import {
	ClickMountedReader,
	ConditionalReader,
	LayoutCascadeReader,
	NativeListenerMountedReader,
	TwoClickMountedReaders,
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

	it('subscribes a click-mounted reader during the commit, before passive effects', () => {
		// #3095: a store change between the commit and the next paint must reach a
		// reader that a discrete event just mounted.
		const store = makeStore(0);
		const r = mount(ClickMountedReader, { store });
		r.click('button');
		expect(store.listenerCount()).toBe(1);

		store.set(5);
		flushSync(() => {});
		expect(r.find('.value').textContent).toBe('5');
		r.unmount();
		expect(store.listenerCount()).toBe(0);
	});

	it('subscribes during the microtask commit of a dispatched click', async () => {
		const store = makeStore(0);
		const r = mount(ClickMountedReader, { store });
		(r.find('button') as HTMLElement).click();
		expect(store.listenerCount()).toBe(0);
		await Promise.resolve();
		expect(r.find('.value').textContent).toBe('0');
		expect(store.listenerCount()).toBe(1);
		r.unmount();
		expect(store.listenerCount()).toBe(0);
	});

	it('subscribes during the commit of an update from a native click listener', async () => {
		const store = makeStore(0);
		const r = mount(NativeListenerMountedReader, { store, type: 'click' });
		// A user event arrives in its own task, after the mount's flush.
		await nextPaint();
		r.find('button').dispatchEvent(new MouseEvent('click'));
		await Promise.resolve();
		expect(r.find('.value').textContent).toBe('0');
		expect(store.listenerCount()).toBe(1);
		r.unmount();
		expect(store.listenerCount()).toBe(0);
	});

	it('keeps an update from a native non-discrete listener subscribing in its passive effect', async () => {
		const store = makeStore(0);
		const r = mount(NativeListenerMountedReader, { store, type: 'mousemove' });
		// A user event arrives in its own task, after the mount's flush.
		await nextPaint();
		r.find('button').dispatchEvent(new MouseEvent('mousemove'));
		await Promise.resolve();
		expect(r.find('.value').textContent).toBe('0');
		expect(store.listenerCount()).toBe(0);
		await nextPaint();
		expect(store.listenerCount()).toBe(1);
		r.unmount();
	});

	it('keeps a non-discrete mount subscribing in its passive effect', async () => {
		const store = makeStore(0);
		const r = mount(ConditionalReader, { store, show: false });
		r.root.render(ConditionalReader, { store, show: true });
		await Promise.resolve();
		expect(r.find('.value').textContent).toBe('0');
		expect(store.listenerCount()).toBe(0);
		await nextPaint();
		expect(store.listenerCount()).toBe(1);
		r.unmount();
	});

	it('subscribes a swapped store during the commit and releases the old one after it', async () => {
		const a = makeStore(10);
		const b = makeStore(20);
		const r = mount(SwappableReader, { store: a, alt: b });
		r.update(SwappableReader, { store: b, alt: b });
		expect(b.listenerCount()).toBe(1);
		b.set(21);
		flushSync(() => {});
		expect(r.find('.value').textContent).toBe('21');

		await nextPaint();
		expect(a.listenerCount()).toBe(0);
		expect(b.listenerCount()).toBe(1);
		r.unmount();
		expect(b.listenerCount()).toBe(0);
	});

	it('releases a click-mounted subscription when the root unmounts before paint', () => {
		const store = makeStore(0);
		const r = mount(ClickMountedReader, { store });
		r.click('button');
		r.unmount();
		expect(store.listenerCount()).toBe(0);
	});

	it('releases a commit-time subscription that a layout cascade swaps before paint', async () => {
		const a = makeStore(1);
		const b = makeStore(2);
		const r = mount(LayoutCascadeReader, { store: a, next: b, mode: 'swap' });
		r.click('button');
		await nextPaint();
		expect(r.find('.value').textContent).toBe('2');
		expect(a.listenerCount()).toBe(0);
		expect(b.listenerCount()).toBe(1);
		r.unmount();
		expect(b.listenerCount()).toBe(0);
	});

	it('disconnects a commit-time subscription that a layout cascade hides before paint', async () => {
		const a = makeStore(1);
		const r = mount(LayoutCascadeReader, { store: a, next: a, mode: 'hide' });
		r.click('button');
		await nextPaint();
		expect(a.listenerCount()).toBe(0);
		r.unmount();
		expect(a.listenerCount()).toBe(0);
	});

	it('keeps subscribing later readers when an earlier subscribe throws', async () => {
		const failing = makeStore(0);
		const failure = new Error('subscribe failed');
		failing.subscribe = () => {
			throw failure;
		};
		const second = makeStore(0);
		const errors: unknown[] = [];
		const container = document.createElement('div');
		document.body.appendChild(container);
		const root = createRoot(container, { onUncaughtError: (error) => errors.push(error) });
		root.render(TwoClickMountedReaders, { first: failing, second });
		flushSync(() => {});
		flushSync(() => (container.querySelector('button') as HTMLElement).click());
		expect(second.listenerCount()).toBe(1);
		await nextPaint();
		expect(errors).toContain(failure);
		root.unmount();
		container.remove();
		expect(second.listenerCount()).toBe(0);
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
