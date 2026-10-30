import { type MutableRefObject, useCallback } from 'octane';

import { isFunction } from '../utils/helpers.ts';

// An Octane ref may also be an array of refs (`ref={[a, b]}`),
// so a combined ref assigns through every member.
type RefItem<T> =
	| ((element: T | null) => void)
	| MutableRefObject<T | null>
	| readonly RefItem<T>[]
	| null
	| undefined;

function assignRefs<T>(refs: readonly RefItem<T>[], element: T | null) {
	for (const ref of refs) {
		if (!ref) {
			continue;
		}

		if (isFunction(ref)) {
			ref(element);
		} else if ('current' in ref) {
			ref.current = element;
		} else {
			assignRefs(ref, element);
		}
	}
}

export const useCombinedRef = <T>(...refs: RefItem<T>[]) => {
	const callback = useCallback((element: T | null) => assignRefs(refs, element), refs);

	return callback;
};
