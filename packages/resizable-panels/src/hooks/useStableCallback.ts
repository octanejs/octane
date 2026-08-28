import { useCallback, useRef } from 'octane';
import { subSlot } from '../internal';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

export function useStableCallback<Args extends readonly unknown[], Result>(
	fn: (...args: Args) => Result,
	slot?: symbol,
): (...args: Args) => Result {
	const ref = useRef(fn, subSlot(slot, 'ref'));
	useIsomorphicLayoutEffect(
		() => {
			ref.current = fn;
		},
		[fn],
		subSlot(slot, 'effect'),
	);
	return useCallback((...args: Args) => ref.current(...args), [], subSlot(slot, 'callback'));
}
