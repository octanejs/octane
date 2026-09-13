import { useDebugValue, useEffect, useReducer } from 'octane';
import type { Atom, ExtractAtomValue } from 'jotai/vanilla';
import { createContinuablePromise, isPromiseLike } from './continuablePromise';
import { useStore } from './store';

import { splitSlot, subSlot } from '../internal';

type Store = ReturnType<typeof useStore>;

type Options = Parameters<typeof useStore>[0];

export function useAtomValueRaw<Value>(atom: Atom<Value>, options?: Options): Value;

export function useAtomValueRaw<AtomType extends Atom<unknown>>(
	atom: AtomType,
	options?: Options,
): ExtractAtomValue<AtomType>;

export function useAtomValueRaw<Value>(
	atom: Atom<Value>,
	...rest: [options?: Options, slot?: symbol]
) {
	const [user, slot] = splitSlot(rest);
	const options = user[0] as Options | undefined;
	const store = useStore(options);
	const [[valueFromReducer, storeFromReducer, atomFromReducer], rerender] = useReducer<
		readonly [Value, Store, typeof atom],
		void,
		undefined
	>(
		(prev) => {
			const nextValue = store.get(atom);
			if (Object.is(prev[0], nextValue) && prev[1] === store && prev[2] === atom) {
				return prev;
			}
			return [nextValue, store, atom];
		},
		undefined,
		() => [store.get(atom), store, atom],
		subSlot(slot, 'raw:reducer'),
	);
	let value = valueFromReducer;
	if (storeFromReducer !== store || atomFromReducer !== atom) {
		rerender();
		value = store.get(atom);
	}
	useEffect(() => store.sub(atom, rerender), [store, atom], subSlot(slot, 'raw:effect'));
	useDebugValue(value);
	if (isPromiseLike(value)) {
		return createContinuablePromise(store, value, () => store.get(atom));
	}
	return value;
}
