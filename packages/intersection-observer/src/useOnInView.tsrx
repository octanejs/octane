import { useCallback, useRef } from 'octane';
import { observe } from './observe.js';
import type { IntersectionChangeEffect, IntersectionEffectOptions } from './types.js';

export function useOnInView(
	onChange: IntersectionChangeEffect,
	options: IntersectionEffectOptions | symbol = {},
) {
	options = typeof options === 'symbol' ? {} : options;
	const callback = useRef(onChange);
	callback.current = onChange;
	const observedElement = useRef<Element | null>(null);
	const observerCleanup = useRef<void | (() => void)>(undefined);
	const lastInView = useRef<boolean | undefined>(undefined);

	return useCallback((node: Element | null) => {
		function cleanupExisting() {
			if (!observerCleanup.current) return;
			const cleanup = observerCleanup.current;
			observerCleanup.current = undefined;
			cleanup();
		}

		if (node === observedElement.current) {
			return observerCleanup.current;
		}

		if (!node || options.skip) {
			cleanupExisting();
			observedElement.current = null;
			lastInView.current = undefined;
			return;
		}

		cleanupExisting();
		observedElement.current = node;
		let destroyed = false;
		// `let` (not `const`) so a synchronous observe callback from
		// defaultFallbackInView can call stopObserving without hitting TDZ.
		let destroyObserver: (() => void) | undefined;

		function stopObserving() {
			if (destroyed) return;
			destroyed = true;
			destroyObserver?.();
			destroyObserver = undefined;
			observedElement.current = null;
			observerCleanup.current = undefined;
			lastInView.current = undefined;
		}

		destroyObserver = observe(node, (inView, entry) => {
			const previousInView = lastInView.current;
			lastInView.current = inView;
			if (previousInView === undefined && !inView) return;
			callback.current(inView, entry);
			if (inView && options.triggerOnce) {
				stopObserving();
			}
		}, {
			root: options.root,
			rootMargin: options.rootMargin,
			threshold: options.threshold,
			trackVisibility: options.trackVisibility,
			delay: options.delay,
			scrollMargin: options.scrollMargin,
		});

		if (destroyed) {
			// Sync triggerOnce already requested stop before observe returned.
			destroyObserver();
			destroyObserver = undefined;
			return;
		}

		observerCleanup.current = stopObserving;
		return stopObserving;
	}, [Array.isArray(options.threshold) ? options.threshold.toString() : options.threshold, options.root, options.rootMargin, options.triggerOnce, options.skip, options.trackVisibility, options.delay, options.scrollMargin]);
}
