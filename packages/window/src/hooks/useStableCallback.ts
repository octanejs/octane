import { useCallback, useRef } from 'octane';
import { getSlot, subSlot } from '../internal.js';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.js';

// Forked from useEventCallback (usehooks-ts)
export function useStableCallback<Args extends unknown[], Return>(
	fn: (...args: Args) => Return,
	...rest: unknown[]
): (...args: Args) => Return;
export function useStableCallback<Args extends unknown[], Return>(
	fn: ((...args: Args) => Return) | undefined,
	...rest: unknown[]
): ((...args: Args) => Return) | undefined;
export function useStableCallback<Args extends unknown[], Return>(
	fn: ((...args: Args) => Return) | undefined,
	...rest: unknown[]
): ((...args: Args) => Return) | undefined {
	const slot = getSlot(rest);
	const ref = useRef<typeof fn>(
		() => {
			throw new Error('Cannot call an event handler while rendering.');
		},
		subSlot(slot, 'ref'),
	);

	useIsomorphicLayoutEffect(
		() => {
			ref.current = fn;
		},
		[fn],
		subSlot(slot, 'effect'),
	);

	return useCallback(
		(...args: Args) => ref.current?.(...args),
		[ref],
		subSlot(slot, 'callback'),
	) as (...args: Args) => Return;
}
