// Partial hydration surface — `Hydrate` + the strategy factories from
// `@octanejs/tanstack-start/hydration`. These are fresh client mounts (not
// server-HTML adoption): `useHydrated()` reads `true`, so non-deferred
// strategies resolve their gate immediately while `visible` waits for its
// IntersectionObserver and `never` suspends forever.
import { createElement, createRoot, drainPassiveEffects, flushSync } from 'octane';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Hydrate } from '@octanejs/tanstack-start';
import { idle, load, never, visible } from '@octanejs/tanstack-start/hydration';

type ObserverRecord = {
	callback: IntersectionObserverCallback;
	observed: Array<Element>;
	disconnected: boolean;
};

const observers: Array<ObserverRecord> = [];

class MockIntersectionObserver {
	record: ObserverRecord;

	constructor(callback: IntersectionObserverCallback) {
		this.record = { callback, observed: [], disconnected: false };
		observers.push(this.record);
	}

	observe(element: Element) {
		this.record.observed.push(element);
	}

	disconnect() {
		this.record.disconnected = true;
	}

	unobserve() {}
	takeRecords(): Array<IntersectionObserverEntry> {
		return [];
	}
}

async function settle() {
	// Let gate promises resolve and the suspended boundary replay, then flush.
	await Promise.resolve();
	await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	flushSync(() => {});
	drainPassiveEffects();
}

beforeEach(() => {
	observers.length = 0;
	vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('Hydrate + hydration strategies (client mount)', () => {
	it('load() renders children immediately and reports onHydrated', () => {
		const container = document.createElement('div');
		const root = createRoot(container);
		const onHydrated = vi.fn();

		try {
			root.render(
				createElement(Hydrate, {
					when: load(),
					onHydrated,
					children: createElement('span', { id: 'loaded' }, 'ready'),
				}),
			);
			flushSync(() => {});

			expect(container.querySelector('#loaded')?.textContent).toBe('ready');

			drainPassiveEffects();
			expect(onHydrated).toHaveBeenCalledOnce();
		} finally {
			root.unmount();
		}
	});

	it('idle() (via GenericHydrate) emits the hydration marker and does not defer a fresh client mount', () => {
		const container = document.createElement('div');
		const root = createRoot(container);

		try {
			root.render(
				createElement(Hydrate, {
					when: idle(),
					children: createElement('span', { id: 'idle-child' }, 'idle content'),
				}),
			);
			flushSync(() => {});
			drainPassiveEffects();

			const marker = container.querySelector('[data-ts-hydrate-id]');
			expect(marker).not.toBeNull();
			expect(container.querySelector('#idle-child')?.textContent).toBe('idle content');
		} finally {
			root.unmount();
		}
	});

	it('visible() suspends behind the IntersectionObserver gate until intersection', async () => {
		const container = document.createElement('div');
		const root = createRoot(container);
		const onHydrated = vi.fn();

		try {
			root.render(
				createElement(Hydrate, {
					when: visible(),
					fallback: createElement('span', { id: 'placeholder' }, 'waiting'),
					onHydrated,
					children: createElement('span', { id: 'visible-child' }, 'revealed'),
				}),
			);
			flushSync(() => {});
			// The observer subscription is a passive effect.
			drainPassiveEffects();

			expect(container.querySelector('#visible-child')).toBeNull();
			expect(container.querySelector('#placeholder')?.textContent).toBe('waiting');
			expect(observers).toHaveLength(1);
			expect(observers[0]!.observed).toHaveLength(1);

			observers[0]!.callback(
				[{ isIntersecting: true } as IntersectionObserverEntry],
				observers[0] as unknown as IntersectionObserver,
			);
			await settle();

			expect(container.querySelector('#visible-child')?.textContent).toBe('revealed');
			expect(observers[0]!.disconnected).toBe(true);
			expect(onHydrated).toHaveBeenCalledOnce();
		} finally {
			root.unmount();
		}
	});

	it('never() renders an empty marker on a fresh client mount', async () => {
		// Upstream parity: with no preserved server HTML the marker ref calls
		// `element.replaceChildren()` after commit, so nothing (children OR
		// fallback) remains inside the never-hydrate marker.
		const container = document.createElement('div');
		const root = createRoot(container);

		try {
			root.render(
				createElement(Hydrate, {
					when: never(),
					fallback: createElement('span', { id: 'static-fallback' }, 'static'),
					children: createElement('span', { id: 'never-child' }, 'never shown'),
				}),
			);
			flushSync(() => {});
			drainPassiveEffects();
			await settle();

			const marker = container.querySelector('[data-ts-hydrate-when="never"]');
			expect(marker).not.toBeNull();
			expect(container.querySelector('#never-child')).toBeNull();
			expect(marker!.innerHTML).toBe('');
		} finally {
			root.unmount();
		}
	});
});
