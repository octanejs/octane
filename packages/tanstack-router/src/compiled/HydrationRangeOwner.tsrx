'use strong';

import { HYDRATION_RANGE_BOUNDARY } from 'octane';
import type { BodyProps } from '../Body';

// This boundary returns the authored children directly, as the ordinary Body
// owner does. Adding a template frame here changes the SSR range it claims.
export function HydrationRangeOwner(props: Pick<BodyProps, 'children'>) {
	return props.children;
}

(
	HydrationRangeOwner as typeof HydrationRangeOwner & {
		[HYDRATION_RANGE_BOUNDARY]: 'owner';
	}
)[HYDRATION_RANGE_BOUNDARY] = 'owner';
