import { useRef } from 'octane';
import { subSlot } from '../internal';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

export function useLatest<T>(value: T, slot?: symbol): { current: T | undefined } {
	const valueRef = useRef<T | undefined>(value, subSlot(slot, 'ref'));
	useIsomorphicLayoutEffect(
		() => {
			valueRef.current = value;
		},
		undefined,
		subSlot(slot, 'effect'),
	);
	return valueRef;
}
