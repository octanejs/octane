import { useCallback } from 'octane';
import type { Octane } from 'octane/jsx-runtime';

type RefCallback<T> = (instance: T | null) => void | (() => void);
type PossibleRef<T> = Octane.Ref<T> | undefined;

type RefCleanup<T> = ReturnType<RefCallback<T>>;

export function assignRef<T>(ref: PossibleRef<T>, value: T): RefCleanup<T> {
	if (Array.isArray(ref)) {
		const cleanups = ref.map((item) => assignRef(item, value)).filter(Boolean);
		return cleanups.length > 0
			? () => {
					cleanups.forEach((cleanup) => cleanup?.());
				}
			: undefined;
	} else if (typeof ref === 'function') {
		return ref(value);
	} else if (typeof ref === 'object' && ref !== null && 'current' in ref) {
		ref.current = value;
	}
}

export function mergeRefs<T>(...refs: PossibleRef<T>[]): RefCallback<T> {
	const cleanupMap = new Map<PossibleRef<T>, Exclude<RefCleanup<T>, void>>();

	return (node: T | null) => {
		refs.forEach((ref) => {
			const cleanup = assignRef(ref, node);
			if (cleanup) {
				cleanupMap.set(ref, cleanup);
			}
		});

		if (cleanupMap.size > 0) {
			return () => {
				refs.forEach((ref) => {
					const cleanup = cleanupMap.get(ref);
					if (cleanup && typeof cleanup === 'function') {
						cleanup();
					} else {
						assignRef(ref, null);
					}
				});
				cleanupMap.clear();
			};
		}
	};
}

export function useMergedRef<T>(...refs: PossibleRef<T>[]) {
	return useCallback(mergeRefs(...refs), refs);
}
