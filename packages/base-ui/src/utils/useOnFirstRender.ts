// Ported from @base-ui/utils/useOnFirstRender: runs `fn` exactly once, during the first render.
// octane: the ref threads an explicit slot.
import { useRef } from 'octane';

export function useOnFirstRender(fn: () => void, slot: symbol | undefined): void {
	const ref = useRef(true, slot);
	if (ref.current) {
		ref.current = false;
		fn();
	}
}
