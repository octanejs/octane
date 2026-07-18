// Ported from react-aria (source: .react-spectrum/packages/react-aria/src/utils/useResizeObserver.ts).
// octane adaptations: public-hook slot threading (splitSlot/subSlot) per the binding
// convention; the explicit `[ref, box]` dependency array is kept verbatim.
import type { RefObject } from '@react-types/shared';
import { useEffect } from 'octane';
import { useEffectEvent } from './useEffectEvent';

import { S, splitSlot, subSlot } from '../internal';

function hasResizeObserver() {
	return typeof window.ResizeObserver !== 'undefined';
}

type useResizeObserverOptionsType<T> = {
	ref: RefObject<T | undefined | null> | undefined;
	box?: ResizeObserverBoxOptions;
	onResize: () => void;
};

export function useResizeObserver<T extends Element>(
	options: useResizeObserverOptionsType<T>,
): void;
// Slot-threading form: sibling ported hooks pass their derived sub-slot as the trailing arg.
export function useResizeObserver<T extends Element>(
	options: useResizeObserverOptionsType<T>,
	slot: symbol | undefined,
): void;
export function useResizeObserver(...args: any[]): void {
	const [user, slotArg] = splitSlot(args);
	const slot = slotArg ?? S('useResizeObserver');
	const options = user[0] as useResizeObserverOptionsType<Element>;

	// Only call onResize from inside the effect, otherwise we'll void our assumption that
	// useEffectEvents are safe to pass in.
	const { ref, box, onResize } = options;
	let onResizeEvent = useEffectEvent(onResize, subSlot(slot, 'onResize'));

	useEffect(
		() => {
			let element = ref?.current;
			if (!element) {
				return;
			}

			if (!hasResizeObserver()) {
				window.addEventListener('resize', onResizeEvent, false);
				return () => {
					window.removeEventListener('resize', onResizeEvent, false);
				};
			} else {
				const resizeObserverInstance = new window.ResizeObserver((entries) => {
					if (!entries.length) {
						return;
					}

					onResizeEvent();
				});
				resizeObserverInstance.observe(element, { box });

				return () => {
					if (element) {
						resizeObserverInstance.unobserve(element);
					}
				};
			}
		},
		[ref, box],
		subSlot(slot, 'observe'),
	);
}
