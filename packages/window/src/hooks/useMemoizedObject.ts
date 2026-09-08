import { useMemo } from 'octane';
import { getSlot, subSlot } from '../internal.js';

export function useMemoizedObject<Type extends object>(
	unstableObject: Type,
	...rest: unknown[]
): Type {
	const slot = getSlot(rest);
	const dependencies: unknown[] = Object.keys(unstableObject);
	const keyCount = dependencies.length;
	// The count must be first: memo compares only common prefixes when lengths
	// change, and an old value can equal a newly inserted key.
	for (let index = 0; index < keyCount; index++) {
		dependencies.push(unstableObject[dependencies[index] as keyof Type]);
	}
	dependencies.unshift(keyCount);
	return useMemo(() => unstableObject, dependencies, subSlot(slot, 'memoized-object'));
}
