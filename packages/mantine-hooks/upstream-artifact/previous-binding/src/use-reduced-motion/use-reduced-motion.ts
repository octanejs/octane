import { useMediaQuery } from '../use-media-query/use-media-query';
import type { UseMediaQueryOptions } from '../use-media-query/use-media-query';

export function useReducedMotion(initialValue?: boolean, options?: UseMediaQueryOptions) {
	return useMediaQuery('(prefers-reduced-motion: reduce)', initialValue, options);
}
