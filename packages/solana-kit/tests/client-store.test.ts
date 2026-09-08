import { describe, expect, it, vi } from 'vitest';
import { createClientStore } from '../src/client-store';

function client() {
	let notify = () => {};
	const unsubscribe = vi.fn();
	return {
		subscribe(listener: () => void) {
			notify = listener;
			return unsubscribe;
		},
		notify: () => notify(),
		unsubscribe,
	};
}

describe('client store', () => {
	it('binds reactive clients only while the store has consumers', () => {
		const reactive = client();
		const store = createClientStore(reactive);
		expect(reactive.unsubscribe).not.toHaveBeenCalled();

		const unsubscribe = store.subscribe(() => {});
		expect(reactive.unsubscribe).not.toHaveBeenCalled();
		unsubscribe();
		expect(reactive.unsubscribe).toHaveBeenCalledOnce();
	});

	it('replaces a client, cleans up the old subscription, and ignores its generation', () => {
		const first = client();
		const second = client();
		const store = createClientStore(first);
		const listener = vi.fn();
		store.subscribe(listener);
		expect(store.getSnapshot()).toBe(first);
		expect(store.getVersion()).toBe(0);

		first.notify();
		expect(store.getSnapshot()).toBe(first);
		expect(store.getVersion()).toBe(1);
		expect(listener).toHaveBeenCalledOnce();

		store.setClient(second);
		expect(first.unsubscribe).toHaveBeenCalledOnce();
		expect(store.getSnapshot()).toBe(second);
		expect(store.getVersion()).toBe(2);
		expect(listener).toHaveBeenCalledTimes(2);
		first.notify();
		expect(store.getVersion()).toBe(2);
		expect(listener).toHaveBeenCalledTimes(2);
		second.notify();
		expect(store.getVersion()).toBe(3);
		expect(listener).toHaveBeenCalledTimes(3);
		store.dispose();
		expect(second.unsubscribe).toHaveBeenCalledOnce();
	});
});
