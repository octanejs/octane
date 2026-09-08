import { useRef } from 'octane';
import { subSlot } from '../internal';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

export function useStableObject<Type extends object>(value: Type, slot?: symbol): Type {
	const ref = useRef<Type>({ ...value }, subSlot(slot, 'ref'));
	useIsomorphicLayoutEffect(
		() => {
			Object.assign(ref.current, value);
		},
		[value],
		subSlot(slot, 'effect'),
	);
	return ref.current;
}
