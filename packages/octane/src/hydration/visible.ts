import type { HydrationPrefetchStrategy } from './types.js';

const visibleType = 'visible';

export type VisibleHydrationOptions = {
	rootMargin?: string;
	threshold?: number | Array<number>;
};

type VisibleObserverEntry = {
	key: string;
	observer: IntersectionObserver;
	elements: Map<Element, Set<() => void>>;
};

const observerRegistry = /* @__PURE__ */ new Map<string, VisibleObserverEntry>();

function cleanupObserverEntry(entry: VisibleObserverEntry): void {
	if (entry.elements.size > 0) return;
	entry.observer.disconnect();
	if (observerRegistry.get(entry.key) === entry) {
		observerRegistry.delete(entry.key);
	}
}

/* @__NO_SIDE_EFFECTS__ */
export function visible(
	options: VisibleHydrationOptions = {},
): HydrationPrefetchStrategy<typeof visibleType> {
	const rootMargin = options.rootMargin ?? '600px';
	const threshold = options.threshold ?? 0;

	return {
		_t: visibleType,
		_s: ({ element, gate, prefetch }) => {
			const callback = prefetch ?? gate?.resolve;
			if (!callback) return;

			if (!element) {
				callback();
				return;
			}

			const key = `${rootMargin}|${
				Array.isArray(threshold) ? threshold.join(',') : String(threshold)
			}`;
			let entry = observerRegistry.get(key);

			if (!entry) {
				const nextEntry: VisibleObserverEntry = {
					key,
					elements: new Map<Element, Set<() => void>>(),
					observer: new IntersectionObserver(
						(entries) => {
							for (const observerEntry of entries) {
								if (!observerEntry.isIntersecting) continue;
								const callbacks = nextEntry.elements.get(observerEntry.target);
								if (!callbacks) continue;

								callbacks.forEach((registeredCallback) => registeredCallback());
								nextEntry.elements.delete(observerEntry.target);
								nextEntry.observer.unobserve(observerEntry.target);
								cleanupObserverEntry(nextEntry);
							}
						},
						{ rootMargin, threshold },
					),
				};
				observerRegistry.set(key, nextEntry);
				entry = nextEntry;
			}

			let callbacks = entry.elements.get(element);
			if (!callbacks) {
				callbacks = new Set();
				entry.elements.set(element, callbacks);
				entry.observer.observe(element);
			}
			callbacks.add(callback);

			return () => {
				const currentCallbacks = entry.elements.get(element);
				currentCallbacks?.delete(callback);
				if (currentCallbacks?.size === 0) {
					entry.elements.delete(element);
					entry.observer.unobserve(element);
				}
				cleanupObserverEntry(entry);
			};
		},
	};
}
