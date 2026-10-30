import type { NativeScrollEvent, NativeSyntheticEvent } from './platform-types.ts';
import type { StateContext } from '../state/state.ts';

export function useStickyScrollHandler(
	_stickyHeaderIndices: number[] | undefined,
	_horizontal: boolean | undefined | null,
	_ctx: StateContext,
	onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void,
) {
	return onScroll;
}
