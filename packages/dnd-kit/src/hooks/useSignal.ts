import { flushSync, useRef } from 'octane';
import { effect, type Signal } from '@dnd-kit/state';
import { subSlot } from '../internal';
import { useForceUpdate } from './useForceUpdate';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

export function useSignal<T = any>(
	signal: Signal<T>,
	synchronousOrSlot: boolean | symbol = false,
	maybeSlot?: symbol,
): { readonly value: T } {
	const slot = typeof synchronousOrSlot === 'symbol' ? synchronousOrSlot : maybeSlot;
	const synchronous = typeof synchronousOrSlot === 'boolean' ? synchronousOrSlot : false;
	const previous = useRef(signal.peek(), subSlot(slot, 'previous'));
	const read = useRef(false, subSlot(slot, 'read'));
	const forceUpdate = useForceUpdate(subSlot(slot, 'force'));

	useIsomorphicLayoutEffect(
		() =>
			effect(() => {
				const previousValue = previous.current;
				const currentValue = signal.value;
				if (previousValue !== currentValue) {
					previous.current = currentValue;
					if (!read.current) return;
					if (synchronous) flushSync(forceUpdate);
					else forceUpdate();
				}
			}),
		[signal, synchronous, forceUpdate],
		subSlot(slot, 'effect'),
	);

	return {
		get value() {
			read.current = true;
			return signal.peek();
		},
	};
}
