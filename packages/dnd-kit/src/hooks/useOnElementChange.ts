import { useRef } from 'octane';
import { currentValue, type RefOrValue } from '../utilities/currentValue';
import { subSlot } from '../internal';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

export function useOnElementChange(
	value: RefOrValue<Element>,
	onChange: (value: Element | undefined) => void,
	slot?: symbol,
): void {
	const previous = useRef(currentValue(value), subSlot(slot, 'previous'));
	useIsomorphicLayoutEffect(
		() => {
			const current = currentValue(value);
			if (current !== previous.current) {
				previous.current = current;
				onChange(current);
			}
		},
		undefined,
		subSlot(slot, 'effect'),
	);
}
