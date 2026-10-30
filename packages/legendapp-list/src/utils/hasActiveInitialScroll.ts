import type { InternalState } from '../types.internal.ts';

export function hasActiveInitialScroll(state: InternalState | null | undefined) {
	return !!state?.initialScroll && !state.didFinishInitialScroll;
}
