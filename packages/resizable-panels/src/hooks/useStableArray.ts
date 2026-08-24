import { useRef } from 'octane';
import { subSlot } from '../internal';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

export function useStableArray<Type>(value: Type[], slot?: symbol): Type[] {
	const ref = useRef<Type[]>([...value], subSlot(slot, 'ref'));
	useIsomorphicLayoutEffect(
		() => {
			ref.current.splice(0, ref.current.length, ...value);
		},
		[value],
		subSlot(slot, 'effect'),
	);
	return ref.current;
}
