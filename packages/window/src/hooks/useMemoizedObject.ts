import { useMemo } from 'octane';
import { getSlot, subSlot } from '../internal.js';

export function useMemoizedObject<Type extends object>(
	unstableObject: Type,
	...rest: unknown[]
): Type {
	const slot = getSlot(rest);
	return useMemo(
		() => unstableObject,
		Object.values(unstableObject),
		subSlot(slot, 'memoized-object'),
	);
}
