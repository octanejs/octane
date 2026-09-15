import { useCallback, useInsertionEffect, useLayoutEffect, useRef, useState } from 'octane';
import { useIntersectionObserverRef } from './useIntersectionObserverRef.tsrx';
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
	const lastInView = useRef(initialInView);
	const [state, setState] = useState<{
		inView: boolean;
		entry?: IntersectionObserverEntry;
	}>({ inView: Boolean(initialInView) });

	const observedTarget = useRef<Element | null>(null);
	const initialVisibility = useRef(initialInView);
	useInsertionEffect(() => {
		initialVisibility.current = initialInView;
	}, [initialInView]);
	const observerRef = useIntersectionObserverRef<Element>((inView, entry) => {
		const previousInView = lastInView.current;
		lastInView.current = inView;
		if (previousInView === undefined && !inView) return;
		setState({ inView, entry });
		onChange?.(inView, entry);
	}, { threshold, root, rootMargin, scrollMargin, trackVisibility, delay, fallbackInView, skip, triggerOnce });

	const refState = useRef<{ node: Element | null; reset: boolean }>({ node: null, reset: false });
	const setRef = useCallback(function setRef(node?: Element | null) {
		if (node) {
			if (observedTarget.current !== node) {
				observedTarget.current = node;
				lastInView.current = initialVisibility.current;
			}
			refState.current.node = node;
			refState.current.reset = false;
		} else if (refState.current.node) {
			refState.current.node = null;
			refState.current.reset = true;
		}
		const cleanup = observerRef(node);
		if (!cleanup) return;
		return () => {
			cleanup();
			if (refState.current.node === node) {
				refState.current.node = null;
				refState.current.reset = true;
			}
		};
	}, [observerRef]);

	// Octane suppresses layout effects during SSR. An explicit null retains the
	// upstream every-commit reset instead of compiler-inferred dependencies.
	useLayoutEffect(() => {
		if (!refState.current.reset) return;
		refState.current.reset = false;
		if (triggerOnce || skip) return;
		setState({ inView: Boolean(initialInView), entry: undefined });
		lastInView.current = initialInView;
	}, null);

	const result = [setRef, state.inView, state.entry] as InViewHookResponse;
	result.ref = setRef;
	result.inView = state.inView;
	result.entry = state.entry;
	return result;
}
