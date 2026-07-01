// Ported from @radix-ui/react-compose-refs. Merges multiple refs (objects or callbacks,
// incl. React-19 cleanup-returning callback refs) into one callback ref. octane is
// ref-as-prop, so these compose the `ref` values a Slot/Primitive threads onto a child.
import { useCallback } from 'octane';

import { S, splitSlot, subSlot } from './internal';

type PossibleRef<T> = ((instance: T | null) => void | (() => void)) | { current: T | null } | null;

function setRef<T>(ref: PossibleRef<T>, value: T | null): void | (() => void) {
	if (typeof ref === 'function') {
		return ref(value);
	} else if (ref !== null && ref !== undefined) {
		ref.current = value;
	}
}

/**
 * Compose multiple refs into a single callback ref. Honors cleanup functions returned by
 * callback refs (React 19 semantics); falls back to calling refs with `null` on unmount.
 */
export function composeRefs<T>(...refs: PossibleRef<T>[]): (node: T | null) => void | (() => void) {
	return (node: T | null) => {
		let hasCleanup = false;
		const cleanups = refs.map((ref) => {
			const cleanup = setRef(ref, node);
			if (!hasCleanup && typeof cleanup === 'function') {
				hasCleanup = true;
			}
			return cleanup;
		});
		if (hasCleanup) {
			return () => {
				for (let i = 0; i < cleanups.length; i++) {
					const cleanup = cleanups[i];
					if (typeof cleanup === 'function') {
						cleanup();
					} else {
						setRef(refs[i], null);
					}
				}
			};
		}
	};
}

/** Hook version — a stable composed callback ref over the given refs. */
export function useComposedRefs<T>(...args: any[]): (node: T | null) => void | (() => void) {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useComposedRefs');
	const refs = user as PossibleRef<T>[];
	return useCallback(composeRefs(...refs), refs, subSlot(slot, 'cb'));
}
