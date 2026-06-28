// Ported from @floating-ui/react useMergeRefs. Merges an array of refs (objects or
// callbacks) into a single callback ref. React hooks → octane hooks + sub-slots.
import { useCallback, useMemo, useRef } from 'octane';

import { splitSlot, subSlot } from './internal';

export function useMergeRefs(...args: any[]): any {
	const [user, slot] = splitSlot(args);
	const refs = (user[0] as any[]) ?? [];

	const cleanupRef = useRef<any>(undefined, subSlot(slot, 'cleanup'));

	const refEffect = useCallback(
		(instance: any) => {
			const cleanups = refs.map((ref) => {
				if (ref == null) {
					return;
				}
				if (typeof ref === 'function') {
					const refCallback = ref;
					const refCleanup = refCallback(instance);
					return typeof refCleanup === 'function'
						? refCleanup
						: () => {
								refCallback(null);
							};
				}
				ref.current = instance;
				return () => {
					ref.current = null;
				};
			});
			return () => {
				cleanups.forEach((refCleanup) => (refCleanup == null ? void 0 : refCleanup()));
			};
		},
		refs,
		subSlot(slot, 'effect'),
	);

	return useMemo(
		() => {
			if (refs.every((ref) => ref == null)) {
				return null;
			}
			return (value: any) => {
				if (cleanupRef.current) {
					cleanupRef.current();
					cleanupRef.current = undefined;
				}
				if (value != null) {
					cleanupRef.current = refEffect(value);
				}
			};
		},
		refs,
		subSlot(slot, 'memo'),
	);
}
