import { useCallback, useDebugValue, useSyncExternalStore } from 'octane';
import type { Atom, ExtractAtomValue } from 'jotai/vanilla';
import { createContinuablePromise, isPromiseLike } from './continuablePromise';
import { useStore } from './store';

import { splitSlot, subSlot } from '../internal';

type Options = Parameters<typeof useStore>[0];

export function useAtomValueRawSync<Value>(atom: Atom<Value>, options?: Options): Value;

export function useAtomValueRawSync<AtomType extends Atom<unknown>>(
	atom: AtomType,
	options?: Options,
): ExtractAtomValue<AtomType>;

export function useAtomValueRawSync<Value>(
	atom: Atom<Value>,
	...rest: [options?: Options, slot?: symbol]
) {
	const [user, slot] = splitSlot(rest);
	const options = user[0] as Options | undefined;
	const store = useStore(options);
	const getSnapshot = useCallback(
		() => {
			const value = store.get(atom);
			if (isPromiseLike(value)) {
				return createContinuablePromise(store, value, () => store.get(atom));
			}
			return value;
		},
		[store, atom],
		subSlot(slot, 'sync:snapshot'),
	);
	const value = useSyncExternalStore(
		useCallback(
			(callback: () => void) => store.sub(atom, callback),
			[store, atom],
			subSlot(slot, 'sync:subscribe'),
		),
		getSnapshot,
		getSnapshot,
		subSlot(slot, 'sync:store'),
	);
	useDebugValue(value);
	return value;
}
