import { useEffect, useRef, useState } from 'octane';
import { observe } from './observe.js';
import type { InViewHookResponse, IntersectionOptions } from './types.js';

export function useInView(options: IntersectionOptions | symbol = {}): InViewHookResponse {
	options = typeof options === 'symbol' ? {} : options;
	const {
		threshold,
		delay,
		trackVisibility,
		rootMargin,
		root,
		triggerOnce,
		skip,
		initialInView,
		fallbackInView,
		onChange,
		scrollMargin,
	} = options;
	const [ref, setRef] = useState<Element | null>(null);
	const callback = useRef(onChange);
	callback.current = onChange;
	const lastInView = useRef(initialInView);
	const observedTarget = useRef<Element | null>(null);
	const [state, setState] = useState<{
		inView: boolean;
		entry?: IntersectionObserverEntry;
	}>({ inView: Boolean(initialInView) });

	useEffect(() => {
		if (observedTarget.current !== ref) {
			observedTarget.current = ref;
			lastInView.current = initialInView;
		} else if (lastInView.current === undefined) {
			lastInView.current = initialInView;
		}
		if (skip || !ref) return;
		let unobserve: (() => void) | undefined;
		unobserve = observe(
			ref,
			(inView, entry) => {
				const previousInView = lastInView.current;
				lastInView.current = inView;
				if (previousInView === undefined && !inView) return;
				setState({ inView, entry });
				callback.current?.(inView, entry);
				if (inView && triggerOnce && unobserve) {
					unobserve();
					unobserve = undefined;
				}
			},
			{ root, rootMargin, threshold, trackVisibility, delay, scrollMargin },
			fallbackInView,
		);
		return () => unobserve?.();
	}, [Array.isArray(threshold) ? threshold.toString() : threshold, ref, root, rootMargin, triggerOnce, skip, trackVisibility, fallbackInView, delay, scrollMargin]);

	const entryTarget = state.entry?.target;
	const previousTarget = useRef<Element | undefined>(undefined);
	if (!ref && entryTarget && !triggerOnce && !skip && previousTarget.current !== entryTarget) {
		previousTarget.current = entryTarget;
		setState({
			inView: Boolean(initialInView),
			entry: undefined,
		});
		lastInView.current = initialInView;
	}

	const result = [setRef, state.inView, state.entry] as InViewHookResponse;
	result.ref = setRef;
	result.inView = state.inView;
	result.entry = state.entry;
	return result;
}
