// Ported from .base-ui/packages/react/src/utils/resolveRef.ts. Returns a ref object's
// `.current`, or the value itself if it's already an element.
export function resolveRef<T extends HTMLElement | null | undefined>(
	maybeRef: T | { current: T },
): T {
	if (maybeRef == null) {
		return maybeRef as T;
	}
	return 'current' in maybeRef ? maybeRef.current : maybeRef;
}
