import { useSelector } from './useSelector';
import { splitSlot, subSlot } from './internal';
import type { Atom } from '@tanstack/store';
import type { UseSelectorOptions } from './useSelector';

/**
 * Returns the current atom value together with a stable setter.
 *
 * This is the writable-atom convenience hook for components that need to both
 * read and update the same atom.
 *
 * @example
 * ```tsx
 * const [count, setCount] = useAtom(countAtom)
 * ```
 */
export function useAtom<TValue>(
	atom: Atom<TValue>,
	options?: UseSelectorOptions<TValue>,
): [TValue, Atom<TValue>['set']];
export function useAtom<TValue>(
	atom: Atom<TValue>,
	...rest: [options?: UseSelectorOptions<TValue>, slot?: symbol]
): [TValue, Atom<TValue>['set']] {
	const [user, slot] = splitSlot(rest);
	const options = user[0] as UseSelectorOptions<TValue> | undefined;
	const value = (
		useSelector as (
			source: Atom<TValue>,
			selector: undefined,
			options: UseSelectorOptions<TValue> | undefined,
			slot: symbol,
		) => TValue
	)(atom, undefined, options, subSlot(slot, 'atom:value'));

	return [value, atom.set];
}
