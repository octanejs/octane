import { createElement, isChildrenBlock, useRef } from 'octane';
import { useInView } from './useInView.tsrx';
import type { InViewProps, InViewRenderProps } from './types.js';

export function InView(props: InViewProps) {
	const {
		children,
		as = 'div',
		triggerOnce,
		skip,
		initialInView,
		fallbackInView,
		onChange,
		root,
		rootMargin,
		threshold,
		trackVisibility,
		delay,
		scrollMargin,
		...rest
	} = props;
	const result = useInView({
		triggerOnce,
		skip,
		initialInView,
		fallbackInView,
		onChange,
		root,
		rootMargin,
		threshold,
		trackVisibility,
		delay,
		scrollMargin,
	});
	const composedRefs = useRef<[typeof result.ref, unknown] | null>(null);
	const renderProps: InViewRenderProps = {
		ref: result.ref,
		inView: result.inView,
		entry: result.entry,
	};
	if (typeof children === 'function' && !isChildrenBlock(children)) return children(renderProps);
	const consumerRef = rest.ref;
	const { ref: _ignoredRef, ...domProps } = rest;
	let hostRef: typeof result.ref | [typeof result.ref, unknown] = result.ref;
	if (consumerRef != null) {
		const previous = composedRefs.current;
		if (previous == null || previous[0] !== result.ref || previous[1] !== consumerRef) {
			composedRefs.current = [result.ref, consumerRef];
		}
		hostRef = composedRefs.current!;
	}
	return createElement(as, { ...domProps, ref: hostRef }, children);
}
