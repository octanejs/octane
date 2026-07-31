import { useCallback, useEffect, useRef } from 'octane';
import { splitSlot, subSlot } from './internal';

export function useUnmount(...runtime: [func: () => void, slot?: symbol]): void {
	const { slot } = splitSlot(runtime);
	const func = runtime[0];
	const ref = useRef(func, subSlot(slot, 'ref'));
	ref.current = func;
	useEffect(() => () => ref.current(), [], subSlot(slot, 'effect'));
}

export function useIsMounted(...runtime: [slot?: symbol]): () => boolean {
	const { slot } = splitSlot(runtime);
	const mounted = useRef(false, subSlot(slot, 'ref'));
	useEffect(
		() => {
			mounted.current = true;
			return () => {
				mounted.current = false;
			};
		},
		[],
		subSlot(slot, 'effect'),
	);
	return useCallback(() => mounted.current, [], subSlot(slot, 'callback'));
}
