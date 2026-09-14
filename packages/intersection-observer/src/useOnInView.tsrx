import { useIntersectionObserverRef } from './useIntersectionObserverRef.tsrx';
import type { IntersectionChangeEffect, IntersectionEffectOptions } from './types.js';

export function useOnInView<TElement extends Element = Element>(
	onChange: IntersectionChangeEffect<TElement>,
	options: IntersectionEffectOptions | symbol = {},
): (element: TElement | undefined | null) => (() => void) | undefined {
	options = typeof options === 'symbol' ? {} : options;
	return useIntersectionObserverRef<TElement>((inView, entry, previousInView) => {
		if (previousInView === undefined && !inView) return;
		onChange(inView, entry);
	}, options);
}
