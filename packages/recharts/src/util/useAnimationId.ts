// Port of util/useAnimationId.ts — a unique id that regenerates whenever the
// input's reference identity changes (drives re-animation on data change).
import { useRef } from 'octane';
import { uniqueId } from './DataUtils';

export function useAnimationId(input: unknown, prefix = 'animation-'): string {
	const animationId = useRef(uniqueId(prefix));
	const prevProps = useRef(input);
	if (prevProps.current !== input) {
		animationId.current = uniqueId(prefix);
		prevProps.current = input;
	}
	return animationId.current;
}
