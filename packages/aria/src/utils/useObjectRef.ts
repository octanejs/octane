// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useObjectRef.ts).
// React's `forwardRef` becomes octane's ref-as-prop; this hook adapts whatever ref shape a
// caller passed (callback ref with optional cleanup, or object ref) into an object ref the
// aria hooks can read, updating the original on assignment.
import { useCallback, useMemo, useRef } from 'octane';

import { S, splitSlot, subSlot } from '../internal';

type MutableRefObject<T> = { current: T };

/**
 * Offers an object ref for a given callback ref or an object ref. Especially
 * helpful when passing forwarded refs to aria hooks.
 *
 * @param ref The original ref intended to be used.
 * @returns An object ref that updates the given ref.
 */
export function useObjectRef<T>(
	ref?: ((instance: T | null) => (() => void) | void) | MutableRefObject<T | null> | null,
): MutableRefObject<T | null>;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useObjectRef<T>(
	ref:
		| ((instance: T | null) => (() => void) | void)
		| MutableRefObject<T | null>
		| null
		| undefined,
	slot: symbol | undefined,
): MutableRefObject<T | null>;
export function useObjectRef(...args: any[]): any {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useObjectRef');
	const ref = user[0] as
		| ((instance: any) => (() => void) | void)
		| MutableRefObject<any>
		| null
		| undefined;

	const objRef: MutableRefObject<any> = useRef(null, subSlot(slot, 'obj'));
	const cleanupRef: MutableRefObject<(() => void) | void> = useRef(
		undefined,
		subSlot(slot, 'cleanup'),
	);

	const refEffect = useCallback(
		(instance: any) => {
			if (typeof ref === 'function') {
				const refCallback = ref;
				const refCleanup = refCallback(instance);
				return () => {
					if (typeof refCleanup === 'function') {
						refCleanup();
					} else {
						refCallback(null);
					}
				};
			} else if (ref) {
				ref.current = instance;
				return () => {
					ref.current = null;
				};
			}
		},
		[ref],
		subSlot(slot, 'refEffect'),
	);

	return useMemo(
		() => ({
			get current() {
				return objRef.current;
			},
			set current(value) {
				objRef.current = value;
				if (cleanupRef.current) {
					cleanupRef.current();
					cleanupRef.current = undefined;
				}

				if (value != null) {
					cleanupRef.current = refEffect(value);
				}
			},
		}),
		[refEffect],
		subSlot(slot, 'result'),
	);
}
