// Ported verbatim from .base-ui/packages/react/src/floating-ui-react/utils/enqueueFocus.ts.
// Focuses an element on the next frame (or synchronously), superseding any pending focus.
import { NOOP } from '../empty';
import type { FocusableElement } from './tabbable';

interface Options {
	preventScroll?: boolean | undefined;
	sync?: boolean | undefined;
	shouldFocus?: (() => boolean) | undefined;
}

let rafId = 0;
export function enqueueFocus(el: FocusableElement | null, options: Options = {}): () => void {
	const { preventScroll = false, sync = false, shouldFocus } = options;

	cancelAnimationFrame(rafId);

	function exec() {
		if (shouldFocus && !shouldFocus()) {
			return;
		}
		el?.focus({ preventScroll });
	}

	if (sync) {
		exec();
		return NOOP;
	}

	const currentRafId = requestAnimationFrame(exec);
	rafId = currentRafId;
	return () => {
		if (rafId === currentRafId) {
			cancelAnimationFrame(currentRafId);
			rafId = 0;
		}
	};
}
