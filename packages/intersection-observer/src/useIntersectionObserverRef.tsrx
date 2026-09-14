import { useCallback, useInsertionEffect, useRef } from 'octane';
import { observe } from './observe.js';
import type { IntersectionObserverInitWithOptions } from './types.js';

type ObserverCallback<TElement extends Element> =
	(inView: boolean, entry: IntersectionObserverEntry & {
		target: TElement;
	}, previousInView: boolean | undefined) => void;

type ObserverRefOptions =
	IntersectionObserverInitWithOptions & {
		fallbackInView?: boolean;
		skip?: boolean;
		triggerOnce?: boolean;
	};

type ObserverRefCallback<TElement extends Element> =
	(element: TElement | undefined | null) => (() => void) | undefined;

type ObserverState<TElement extends Element> = {
	node: TElement | null;
	stop: (() => void) | undefined;
	owner: ObserverRefCallback<TElement> | null;
};

export function useIntersectionObserverRef<TElement extends Element>(
	onIntersectionChange: ObserverCallback<TElement>,
	{
		threshold,
		root,
		rootMargin,
		scrollMargin,
		trackVisibility,
		delay,
		fallbackInView,
		skip,
		triggerOnce,
	}: ObserverRefOptions,
): ObserverRefCallback<TElement> {
	const onIntersectionChangeRef = useRef(onIntersectionChange);
	const observerStateRef = useRef<ObserverState<TElement>>({
		node: null,
		stop: undefined,
		owner: null,
	});

	useInsertionEffect(() => {
		onIntersectionChangeRef.current = onIntersectionChange;
	}, [onIntersectionChange]);

	return useCallback(function setRef(element: TElement | undefined | null) {
		const observerState = observerStateRef.current;
		if (!element && observerState.owner !== setRef) return;
		if (element === observerState.node) {
			observerState.owner = setRef;
			return observerState.stop;
		}

		const cleanup = observerState.stop;
		observerState.stop = undefined;
		cleanup?.();
		if (!element || skip) {
			observerState.node = null;
			observerState.owner = element ? setRef : null;
			return;
		}

		observerState.node = element;
		observerState.owner = setRef;
		let destroyObserver: (() => void) | undefined;
		let previousInView: boolean | undefined;

		function stopObserving() {
			destroyObserver?.();
			if (observerState.stop === stopObserving) {
				observerState.node = null;
				observerState.stop = undefined;
			}
		}

		observerState.stop = stopObserving;
		destroyObserver = observe(
			element,
			(inView, entry) => {
				onIntersectionChangeRef.current(
					inView,
					entry as IntersectionObserverEntry & { target: TElement },
					previousInView,
				);
				previousInView = inView;
				if (triggerOnce && inView) stopObserving();
			},
			{ threshold, root, rootMargin, scrollMargin, trackVisibility, delay },
			fallbackInView,
		);

		// A synchronous fallback may stop observation before observe returns.
		if (observerState.stop !== stopObserving) destroyObserver();
		return observerState.stop;
	}, [Array.isArray(threshold) ? threshold.toString() : threshold, root, rootMargin, scrollMargin, trackVisibility, delay, fallbackInView, skip, triggerOnce]);
}
