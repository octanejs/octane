import { Platform } from '../platform/Platform.ts';
import { getContentSize } from '../state/getContentSize.ts';
import type { StateContext } from '../state/state.ts';
import type { ScrollTarget } from '../types.internal.ts';

export function clampScrollOffset(
	ctx: StateContext,
	offset: number,
	scrollTarget?: Partial<ScrollTarget>,
) {
	const state = ctx.state;
	const contentSize = getContentSize(ctx);
	let clampedOffset = offset;
	if (
		Number.isFinite(contentSize) &&
		Number.isFinite(state.scrollLength) &&
		(Platform.OS !== 'android' || state.lastLayout)
	) {
		const baseMaxOffset = Math.max(0, contentSize - state.scrollLength);
		const viewOffset = scrollTarget?.viewOffset;
		const extraEndOffset = typeof viewOffset === 'number' && viewOffset < 0 ? -viewOffset : 0;
		const maxOffset = baseMaxOffset + extraEndOffset;
		clampedOffset = Math.min(offset, maxOffset);
	}
	clampedOffset = Math.max(0, clampedOffset);
	return clampedOffset;
}
