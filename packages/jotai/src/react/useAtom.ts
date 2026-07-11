// useAtom — port of jotai's react/useAtom.ts: a tuple of the two base hooks.
// Each half gets its own stable sub-slot so `useAtom(a)` and `useAtom(b)` in
// one component (or the same atom twice) keep independent reducer/effect/
// callback state, exactly like distinct call sites in React.
import type {
	Atom,
	ExtractAtomArgs,
	ExtractAtomResult,
	ExtractAtomValue,
	PrimitiveAtom,
	SetStateAction,
	WritableAtom,
} from 'jotai/vanilla';
import { useAtomValue } from './useAtomValue';
import { useSetAtom } from './useSetAtom';
import { splitSlot, subSlot } from '../internal';

type SetAtom<Args extends unknown[], Result> = (...args: Args) => Result;

type Options = Parameters<typeof useAtomValue>[1];

export function useAtom<Value, Args extends unknown[], Result>(
	atom: WritableAtom<Value, Args, Result>,
	options?: Options,
): [Awaited<Value>, SetAtom<Args, Result>];

export function useAtom<Value>(
	atom: PrimitiveAtom<Value>,
	options?: Options,
): [Awaited<Value>, SetAtom<[SetStateAction<Value>], void>];

export function useAtom<Value>(atom: Atom<Value>, options?: Options): [Awaited<Value>, never];

export function useAtom<AtomType extends WritableAtom<unknown, never[], unknown>>(
	atom: AtomType,
	options?: Options,
): [
	Awaited<ExtractAtomValue<AtomType>>,
	SetAtom<ExtractAtomArgs<AtomType>, ExtractAtomResult<AtomType>>,
];

export function useAtom<AtomType extends Atom<unknown>>(
	atom: AtomType,
	options?: Options,
): [Awaited<ExtractAtomValue<AtomType>>, never];

export function useAtom<Value, Args extends unknown[], Result>(
	atom: Atom<Value> | WritableAtom<Value, Args, Result>,
	...rest: [options?: Options, slot?: symbol]
) {
	const [user, slot] = splitSlot(rest);
	const options = user[0] as Options | undefined;
	return [
		(useAtomValue as (a: unknown, o?: unknown, s?: symbol) => unknown)(
			atom,
			options,
			subSlot(slot, 'ua:v'),
		),
		// We do wrong type assertion here, which results in throwing an error.
		(useSetAtom as (a: unknown, o?: unknown, s?: symbol) => unknown)(
			atom,
			options,
			subSlot(slot, 'ua:s'),
		),
	];
}
