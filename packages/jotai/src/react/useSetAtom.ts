// useSetAtom — port of jotai's react/useSetAtom.ts. Write-only: no reducer, no
// subscription — a component using only the setter never re-renders on atom
// writes. The setter is memoized per [store, atom].
import { useCallback } from 'octane';
import type { ExtractAtomArgs, ExtractAtomResult, WritableAtom } from 'jotai/vanilla';
import { useStore, type Store } from './store';
import { splitSlot, subSlot } from '../internal';

// The consumer's bundler substitutes the whole `process.env.NODE_ENV` expression
// below, so it must stay written out literally. Declared module-locally — never
// `declare global`, which would ship in the tarball — so this file type-checks in
// a browser app that has no `@types/node`.
declare const process: { env: { NODE_ENV?: string } };

type SetAtom<Args extends unknown[], Result> = (...args: Args) => Result;
type Options = Parameters<typeof useStore>[0];

export function useSetAtom<Value, Args extends unknown[], Result>(
	atom: WritableAtom<Value, Args, Result>,
	options?: Options,
): SetAtom<Args, Result>;

export function useSetAtom<AtomType extends WritableAtom<unknown, never[], unknown>>(
	atom: AtomType,
	options?: Options,
): SetAtom<ExtractAtomArgs<AtomType>, ExtractAtomResult<AtomType>>;

export function useSetAtom<Value, Args extends unknown[], Result>(
	atom: WritableAtom<Value, Args, Result>,
	...rest: [options?: Options, slot?: symbol]
) {
	const [user, slot] = splitSlot(rest);
	const options = user[0] as Options | undefined;
	const store = useStore(options);
	const setAtom = useCallback(
		(...args: Args) => {
			if (process.env.NODE_ENV !== 'production' && !('write' in atom)) {
				// useAtom can pass non writable atom with wrong type assertion,
				// so we should check here.
				throw new Error('not writable atom');
			}
			return store.set(atom, ...args);
		},
		[store, atom],
		subSlot(slot, 'usa:cb'),
	);
	return setAtom;
}
